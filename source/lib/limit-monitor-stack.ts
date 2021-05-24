#!/usr/bin/env node
/*****************************************************************************
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.   *
 *                                                                            *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may   *
 *  not use this file except in compliance with the License. A copy of the    *
 *  License is located at                                                     *
 *                                                                            *
 *      http://www.apache.org/licenses/LICENSE-2.0                            *
 *                                                                            *
 *  or in the 'license' file accompanying this file. This file is distributed *
 *  on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,        *
 *  express or implied. See the License for the specific language governing   *
 *  permissions and limitations under the License.                            *
 *****************************************************************************/

import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as events from '@aws-cdk/aws-events';
import * as sqs from '@aws-cdk/aws-sqs';
import { CfnOutput } from '@aws-cdk/core';
import { LambdaToDynamoDBProps, LambdaToDynamoDB } from '@aws-solutions-constructs/aws-lambda-dynamodb';
import { EventsRuleToLambdaProps, EventsRuleToLambda } from '@aws-solutions-constructs/aws-events-rule-lambda';
import { EventsRuleToSns, EventsRuleToSnsProps } from '@aws-solutions-constructs/aws-events-rule-sns';
import { EventsRuleToSqs, EventsRuleToSqsProps } from '@aws-solutions-constructs/aws-events-rule-sqs';
import { LimitMonitorStackProps } from '../bin/limit-monitor';
import { ArnPrincipal, Effect } from '@aws-cdk/aws-iam';

export class LimitMonitorStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props: LimitMonitorStackProps) {
    super(scope, id, props);

    new cdk.CfnParameter(this, 'SNSEmail', {
      description: 'The email address to subscribe for SNS limit alert messages, leave blank if SNS alerts not needed.',
      type: "String"
    });

    const accountList = new cdk.CfnParameter(this, 'AccountList', {
      description: 'List of comma-separated and double-quoted account numbers to monitor. If you leave this parameter blank, ' +
        'the solution will only monitor limits in the primary account. If you enter multiple secondary account IDs, you must also provide the primary account ID in this parameter.',
      type: "String",
      allowedPattern: '^"\\d{12}"(,"\\d{12}")*$|(^\\s*)$'
    });

    const snsEvents = new cdk.CfnParameter(this, 'SNSEvents', {
      description: 'List of alert levels to send email notifications. Must be double-quoted and comma separated. To disable email notifications, leave this blank.',
      type: "String",
      default: '"WARN","ERROR"'
    });

    const slackEvents = new cdk.CfnParameter(this, 'SlackEvents', {
      description: 'List of alert levels to send Slack notifications. Must be double-quoted and comma separated. To disable slack notifications, leave this blank.',
      type: "String",
      default: '"WARN","ERROR"'
    });

    new cdk.CfnParameter(this, 'SlackHookURL', {
      description: 'SSM parameter key for incoming Slack web hook URL. Leave blank if you do not wish to receive Slack notifications.',
      type: "String"
    });

    new cdk.CfnParameter(this, 'SlackChannel', {
      description: 'SSM parameter key for the Slack channel. Leave blank if you do not wish to receive Slack notifications.',
      type: "String"
    });

    const metricsMapping = new cdk.CfnMapping(this, "MetricsMap")
    metricsMapping.setValue("Send-Data", "SendAnonymousData", "Yes")

    const refreshRateMapping = new cdk.CfnMapping(this, "RefreshRate")
    refreshRateMapping.setValue("CronSchedule", "Default", "rate(1 day)")

    const sourceCodeMapping = new cdk.CfnMapping(this, "SourceCode")
    sourceCodeMapping.setValue("General", "S3Bucket", props.solutionBucket)
    sourceCodeMapping.setValue("General", "KeyPrefix", props.solutionName + '/' + props.solutionVersion)
    sourceCodeMapping.setValue("General", "TemplateBucket", props.solutionTemplateBucket)

    const eventsMapping = new cdk.CfnMapping(this, "EventsMap")
    eventsMapping.setValue("Checks", "Services", '"AutoScaling","CloudFormation","DynamoDB","EBS","EC2","ELB","IAM","Kinesis","RDS","Route53","SES","VPC"')

    new cdk.CfnCondition(this, 'SingleAccnt', {
      expression: cdk.Fn.conditionEquals('', accountList),
    });

    new cdk.CfnCondition(this, 'SNSTrue', {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals('', snsEvents)),
    });

    const slackTrue = new cdk.CfnCondition(this, 'SlackTrue', {
      expression: cdk.Fn.conditionNot(cdk.Fn.conditionEquals('', slackEvents)),
    });

    new cdk.CfnCondition(this, 'AnonymousMetric', {
      expression: cdk.Fn.conditionEquals('Yes', cdk.Fn.findInMap('MetricsMap', 'Send-Data', 'SendAnonymousData')),
    });

    const slackNotifierPolicyName = 'Limit-Monitor-Policy-' + cdk.Aws.STACK_NAME + '-' + cdk.Aws.REGION

    const cwLogsPS = new iam.PolicyStatement({
      actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      effect: Effect.ALLOW,
      resources: [`arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/*`],
      sid: 'default'
    })

    const slackNotifierLambdaRole = new iam.Role(this, 'SlackNotifierRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        [slackNotifierPolicyName]: new iam.PolicyDocument({
          statements: [
            cwLogsPS,
            new iam.PolicyStatement({
              actions: ['ssm:GetParameter'],
              effect: Effect.ALLOW,
              resources: [`arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:*`]
            })
          ]
        })
      }
    });

    const cfn_nag_w11 = {
      "cfn_nag": {
        "rules_to_suppress": [
          {
            "id": "W11",
            "reason": "Override the IAM role to allow support:* for logs:PutLogEvents resource on its permissions policy"
          }
        ]
      }
    }

    const slackNotifierLambdaRole_cfn_ref = slackNotifierLambdaRole.node.defaultChild as iam.CfnRole
    slackNotifierLambdaRole_cfn_ref.overrideLogicalId('SlackNotifierRole')
    slackNotifierLambdaRole_cfn_ref.addOverride('Condition', 'SlackTrue')
    slackNotifierLambdaRole_cfn_ref.cfnOptions.metadata = cfn_nag_w11

    const solutionSourceCodeBucket = s3.Bucket.fromBucketAttributes(this, 'SolutionSourceCodeBucket', {
      bucketName: cdk.Fn.findInMap('SourceCode', 'General', 'S3Bucket') + '-' + cdk.Aws.REGION
    });

    const slackNotifierLambdaSourceCodeS3Key = cdk.Fn.findInMap('SourceCode', "General", "KeyPrefix") + '/' + 'limtr-slack-service.zip'

    const taSlackEventsRuleToLambdaProps: EventsRuleToLambdaProps = {
      lambdaFunctionProps: {
        description: 'Serverless Limit Monitor - Lambda function to send notifications on slack',
        environment: {
          SLACK_HOOK: cdk.Fn.sub('SlackHookURL'),
          SLACK_CHANNEL: cdk.Fn.sub('SlackChannel'),
          LOG_LEVEL: 'INFO'
        },
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromBucket(solutionSourceCodeBucket, slackNotifierLambdaSourceCodeS3Key),
        handler: 'index.handler',
        role: slackNotifierLambdaRole,
        timeout: cdk.Duration.seconds(300)
      },
      eventRuleProps: {
        description: 'Limit Monitor Solution - Rule for TA Slack events',
        schedule: events.Schedule.expression('rate(24 hours)'),
        enabled: true
      }
    };

    const taSlackEventRuleToLambdaConstruct = new EventsRuleToLambda(this, 'TASlackEventRule', taSlackEventsRuleToLambdaProps);

    const cfn_nag_w89_w92 = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: "W89",
            reason: "Not a valid use case to deploy in VPC",
          },
          {
            id: "W92",
            reason: "ReservedConcurrentExecutions not needed",
          }
        ],
      },
    };
    const lambdaSlackNotifier_cfn_ref = taSlackEventRuleToLambdaConstruct.lambdaFunction.node.defaultChild as lambda.CfnFunction
    lambdaSlackNotifier_cfn_ref.overrideLogicalId('SlackNotifier')
    lambdaSlackNotifier_cfn_ref.addOverride('Condition', 'SlackTrue')

    const lambdaSlackNotifier_cfn_permission = taSlackEventRuleToLambdaConstruct.lambdaFunction.permissionsNode.tryFindChild('LambdaInvokePermission') as lambda.CfnPermission
    if (lambdaSlackNotifier_cfn_permission != undefined) {
      lambdaSlackNotifier_cfn_permission.overrideLogicalId('SlackNotifierInvokePermission')
      lambdaSlackNotifier_cfn_permission.addOverride('Condition', 'SlackTrue')
    }
    lambdaSlackNotifier_cfn_ref.cfnOptions.metadata = cfn_nag_w89_w92

    const taslackrule_cfn_ref = taSlackEventRuleToLambdaConstruct.eventsRule.node.defaultChild as events.CfnRule
    taslackrule_cfn_ref.overrideLogicalId('TASlackRule')
    taslackrule_cfn_ref.addOverride('Condition', 'SlackTrue')
    taslackrule_cfn_ref.addOverride('Properties.Targets.0.Id', 'LimitMonitorSlackTarget')
    taslackrule_cfn_ref.addOverride('Properties.EventPattern', {
      "Fn::Join": [
        "",
        [
          "{\"account\":[",
          {
            "Fn::If": [
              "SingleAccnt",
              {
                "Fn::Join": [
                  "",
                  [
                    "\"",
                    {
                      "Ref": "AWS::AccountId"
                    },
                    "\""
                  ]
                ]
              },
              {
                "Ref": "AccountList"
              }
            ]
          },
          "],",
          "\"source\":[\"aws.trustedadvisor\", \"limit-monitor-solution\"],",
          "\"detail-type\":[\"Trusted Advisor Check Item Refresh Notification\", \"Limit Monitor Checks\"],",
          "\"detail\":{",
          "\"status\":[",
          {
            "Ref": "SlackEvents"
          },
          "],",
          "\"check-item-detail\":{",
          "\"Service\":[",
          {
            "Fn::FindInMap": [
              "EventsMap",
              "Checks",
              "Services"
            ]
          },
          "]",
          "}",
          "}",
          "}"
        ]
      ]
    })
    taslackrule_cfn_ref.addPropertyDeletionOverride('ScheduleExpression')

    /*
    * Create cloudformation resources for email notifications
    * [key policy, kms key, key alias, sns topic, cw event rule]
    */
    const LimitMonitorEncrypKeyPS = new iam.PolicyStatement({
      actions: [
        "kms:Encrypt",
        "kms:Decrypt"
      ],
      sid: 'default',
      resources: ['*'],
      effect: Effect.ALLOW,
      principals: [new ArnPrincipal(`arn:${this.partition}:iam::${this.account}:root`)]
    });

    const limitMonitorEncrypKeyPD = new iam.PolicyDocument()
    limitMonitorEncrypKeyPD.addStatements(LimitMonitorEncrypKeyPS)

    const limitMonitorEncryptionKey = new kms.Key(this, "LimitMonitorEncryptionKey", {
      description: 'Key for SNS and SQS',
      enabled: true,
      enableKeyRotation: true,
      policy: limitMonitorEncrypKeyPD
    })

    /*
    * Create cloudformation resources for TA SQS Event Rule to SQS using aws-events-rule-sqs construct pattern
    */
    const taSQSRuleEventsRuleToSqsProps: EventsRuleToSqsProps = {
      queueProps: {
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: limitMonitorEncryptionKey,
        visibilityTimeout: cdk.Duration.seconds(60),
        retentionPeriod: cdk.Duration.seconds(86400) //1 day retention
      },
      deadLetterQueueProps: {
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: limitMonitorEncryptionKey,
        retentionPeriod: cdk.Duration.seconds(604800)  //7 day retention
      },
      deployDeadLetterQueue: true,
      enableEncryptionWithCustomerManagedKey: false,
      maxReceiveCount: 3,
      eventRuleProps: {
        description: 'Limit Monitor Solution - Rule for TA SQS events',
        schedule: events.Schedule.expression('rate(24 hours)'),
        enabled: true
      }
    };

    const taSQSRuleEventsRuleToSqsConstruct = new EventsRuleToSqs(this, 'TASQSRule', taSQSRuleEventsRuleToSqsProps);

    const taevent_queue_cfn_ref = taSQSRuleEventsRuleToSqsConstruct.sqsQueue.node.defaultChild as sqs.CfnQueue
    taevent_queue_cfn_ref.overrideLogicalId('EventQueue')

    if (taSQSRuleEventsRuleToSqsConstruct.deadLetterQueue != undefined) {
      const taevent_deadletterqueue_cfn_ref = taSQSRuleEventsRuleToSqsConstruct.deadLetterQueue.queue.node.defaultChild as sqs.CfnQueue
      taevent_deadletterqueue_cfn_ref.overrideLogicalId('DeadLetterQueue')
    }

    const tasqsrule_cfn_ref = taSQSRuleEventsRuleToSqsConstruct.eventsRule.node.defaultChild as events.CfnRule
    tasqsrule_cfn_ref.overrideLogicalId('TASQSRule')
    tasqsrule_cfn_ref.addOverride('Properties.EventPattern', {
      "Fn::Join": [
        "",
        [
          "{\"account\":[",
          {
            "Fn::If": [
              "SingleAccnt",
              {
                "Fn::Join": [
                  "",
                  [
                    "\"",
                    {
                      "Ref": "AWS::AccountId"
                    },
                    "\""
                  ]
                ]
              },
              {
                "Ref": "AccountList"
              }
            ]
          },
          "],",
          "\"source\":[\"aws.trustedadvisor\", \"limit-monitor-solution\"],",
          "\"detail-type\":[\"Trusted Advisor Check Item Refresh Notification\", \"Limit Monitor Checks\"],",
          "\"detail\":{",
          "\"status\":[",
          "\"OK\",\"WARN\",\"ERROR\"",
          "],",
          "\"check-item-detail\":{",
          "\"Service\":[",
          {
            "Fn::FindInMap": [
              "EventsMap",
              "Checks",
              "Services"
            ]
          },
          "]",
          "}",
          "}",
          "}"
        ]
      ]
    })
    tasqsrule_cfn_ref.addPropertyDeletionOverride('ScheduleExpression')
    tasqsrule_cfn_ref.addOverride('Properties.Targets.0.Id', 'LimitMonitorSQSTarget')

    //Start QueuePollSchedule event rule to Limit Summarizer Lambda construct
    const limitSummarizerRoleSQSPS = new iam.PolicyStatement({
      actions: ["sqs:DeleteMessage", "sqs:ReceiveMessage"],
      effect: Effect.ALLOW,
      resources: [taSQSRuleEventsRuleToSqsConstruct.sqsQueue.queueArn]
    })

    const limitSummarizerRoleDynamoDBPS = new iam.PolicyStatement({
      actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
      effect: Effect.ALLOW,
      resources: [`arn:${cdk.Aws.PARTITION}:dynamodb:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/*`]
    })

    const limitSummarizerRoleKMSPS = new iam.PolicyStatement({
      actions: ["kms:GenerateDataKey*", "kms:Decrypt", "kms:Encrypt"],
      resources: [limitMonitorEncryptionKey.keyArn],
      effect: Effect.ALLOW
    })

    const limitSummarizerPolicyName = 'Limit-Monitor-Policy-' + cdk.Aws.STACK_NAME + '-' + cdk.Aws.REGION

    const limitSummarizerLambdaRole = new iam.Role(this, 'LimitSummarizerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        [limitSummarizerPolicyName]: new iam.PolicyDocument({
          statements: [
            cwLogsPS,
            limitSummarizerRoleSQSPS,
            limitSummarizerRoleDynamoDBPS,
            limitSummarizerRoleKMSPS
          ]
        })
      }
    });

    const limitSummarizerLambdaRole_cfn_ref = limitSummarizerLambdaRole.node.defaultChild as iam.CfnRole
    limitSummarizerLambdaRole_cfn_ref.overrideLogicalId('LimitSummarizerRole')
    limitSummarizerLambdaRole_cfn_ref.cfnOptions.metadata = cfn_nag_w11

    const limitSummarizerLambdaSourceCodeS3Key = cdk.Fn.join("/", [cdk.Fn.findInMap('SourceCode', 'General', 'KeyPrefix'), 'limtr-report-service.zip'])

    const sendAnonymousData = cdk.Fn.findInMap('MetricsMap', 'Send-Data', 'SendAnonymousData')

    const queuePollScheduleEventsRuleToLambdaProps: EventsRuleToLambdaProps = {
      lambdaFunctionProps: {
        description: 'Serverless Limit Monitor - Lambda function to summarize service limit usage',
        environment: {
          //LIMIT_REPORT_TBL: limitSummarizerLambdaToDynamoDb.dynamoTable.tableName,
          SQS_URL: taSQSRuleEventsRuleToSqsConstruct.sqsQueue.queueUrl,
          MAX_MESSAGES: '10', //100 messages can be read with each invocation, change as needed
          MAX_LOOPS: '10',
          ANONYMOUS_DATA: sendAnonymousData,
          SOLUTION: props.solutionId, //'SO0005'
          LOG_LEVEL: 'INFO'  //change to WARN, ERROR or DEBUG as needed
        },
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromBucket(solutionSourceCodeBucket, limitSummarizerLambdaSourceCodeS3Key),
        handler: 'index.handler',
        role: limitSummarizerLambdaRole,
        timeout: cdk.Duration.seconds(300)
      },
      eventRuleProps: {
        description: 'Limit Monitor Solution - Schedule to poll SQS queue',
        schedule: events.Schedule.expression('rate(5 minutes)'),
        enabled: true
      }
    };

    const queuePollScheduleEventsRuleToLambdaConstruct = new EventsRuleToLambda(this, 'QueuePollSchedule', queuePollScheduleEventsRuleToLambdaProps);

    const lambdaLimitSummarizer_cfn_ref = queuePollScheduleEventsRuleToLambdaConstruct.lambdaFunction.node.defaultChild as lambda.CfnFunction
    lambdaLimitSummarizer_cfn_ref.cfnOptions.metadata = cfn_nag_w89_w92
    lambdaLimitSummarizer_cfn_ref.overrideLogicalId('LimitSummarizer')

    const lambdaLimitSummarizer_cfn_permission = queuePollScheduleEventsRuleToLambdaConstruct.lambdaFunction.permissionsNode.tryFindChild('LambdaInvokePermission') as lambda.CfnPermission
    if (lambdaLimitSummarizer_cfn_permission != undefined) {
      lambdaLimitSummarizer_cfn_permission.overrideLogicalId('SummarizerInvokePermission')
    }

    const queuepollschedulerule_cfn_ref = queuePollScheduleEventsRuleToLambdaConstruct.eventsRule.node.defaultChild as events.CfnRule
    queuepollschedulerule_cfn_ref.overrideLogicalId('QueuePollSchedule')

    // Start creating TARefresher (Trust Advisor Refresher) Cloudformation Resources
    // TA Refresher policy documents
    const taRefresherRoleSupportPS = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['support:*'],
      resources: ['*']
    })

    const taRefresherRoleServiceQuotasPS = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['servicequotas:GetAWSDefaultServiceQuota'],
      resources: ['*']
    })

    const taRefresherPolicyName = 'Limit-Monitor-Refresher-Policy-' + cdk.Aws.STACK_NAME

    // TA Refresher iam role
    const taRefresherLambdaRole = new iam.Role(this, 'TARefresherRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        [taRefresherPolicyName]: new iam.PolicyDocument({
          statements: [
            cwLogsPS,
            taRefresherRoleSupportPS,
            taRefresherRoleServiceQuotasPS
          ]
        })
      }
    });

    const cfn_nag_f3_w11 = {
      "cfn_nag": {
        "rules_to_suppress": [
          {
            "id": "F3",
            "reason": "Override the IAM role to allow support:* resource on its permissions policy"
          },
          {
            "id": "W11",
            "reason": "Override the IAM role to allow Resource:* for logs:PutLogEvents, resource on its permissions policy"
          }
        ]
      }
    }

    const taRefresherLambdaRole_cfn_ref = taRefresherLambdaRole.node.defaultChild as iam.CfnRole
    taRefresherLambdaRole_cfn_ref.overrideLogicalId('TARefresherRole')
    taRefresherLambdaRole_cfn_ref.cfnOptions.metadata = cfn_nag_f3_w11

    const taRefresherLambdaSourceCodeS3Key = cdk.Fn.join("/", [cdk.Fn.findInMap('SourceCode', 'General', 'KeyPrefix'), 'limtr-refresh-service.zip'])

    const refreshRateCronSchedule = cdk.Fn.findInMap('RefreshRate', 'CronSchedule', 'Default')

    // TA Refresher event rule to lambda construct
    const taRefresherEventsRuleToLambdaProps: EventsRuleToLambdaProps = {
      lambdaFunctionProps: {
        description: 'Serverless Limit Monitor - Lambda function to summarize service limits',
        environment: {
          AWS_SERVICES: cdk.Fn.findInMap('EventsMap', 'Checks', 'Services'),
          LOG_LEVEL: 'INFO'  //change to WARN, ERROR or DEBUG as needed
        },
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromBucket(solutionSourceCodeBucket, taRefresherLambdaSourceCodeS3Key),
        handler: 'index.handler',
        role: taRefresherLambdaRole,
        timeout: cdk.Duration.seconds(300)
      },
      eventRuleProps: {
        description: 'Limit Monitor Solution - Schedule to refresh TA checks',
        schedule: events.Schedule.expression(refreshRateCronSchedule),
        enabled: true
      }
    };

    const taRefresherEventsRuleToLambdaConstruct = new EventsRuleToLambda(this, 'TARefreshSchedule', taRefresherEventsRuleToLambdaProps);

    const lambdaTaRefresher_cfn_ref = taRefresherEventsRuleToLambdaConstruct.lambdaFunction.node.defaultChild as lambda.CfnFunction
    lambdaTaRefresher_cfn_ref.cfnOptions.metadata = cfn_nag_w89_w92
    lambdaTaRefresher_cfn_ref.overrideLogicalId('TARefresher')

    const lambdaTaRefresher_cfn_permission = taRefresherEventsRuleToLambdaConstruct.lambdaFunction.permissionsNode.tryFindChild('LambdaInvokePermission') as lambda.CfnPermission
    if (lambdaTaRefresher_cfn_permission != undefined) {
      lambdaTaRefresher_cfn_permission.overrideLogicalId('TARefresherInvokePermission')
    }

    const taRefresherrule_cfn_ref = taRefresherEventsRuleToLambdaConstruct.eventsRule.node.defaultChild as events.CfnRule
    taRefresherrule_cfn_ref.overrideLogicalId('TARefreshSchedule')

    //Start aws-lambda-dynamoDB construct reference. 
    const limitSummarizerLambdaToDynamoDBProps: LambdaToDynamoDBProps = {
      existingLambdaObj: queuePollScheduleEventsRuleToLambdaConstruct.lambdaFunction,
      dynamoTableProps: {
        partitionKey: {
          name: 'MessageId',
          type: dynamodb.AttributeType.STRING
        },
        sortKey: {
          name: 'TimeStamp',
          type: dynamodb.AttributeType.STRING
        },
        billingMode: dynamodb.BillingMode.PROVISIONED,
        readCapacity: 2,
        writeCapacity: 2,
        timeToLiveAttribute: 'ExpiryTime'
      },
      tablePermissions: "ReadWrite"
    };

    const limitSummarizerLambdaToDynamoDb = new LambdaToDynamoDB(this, 'SummaryDDB', limitSummarizerLambdaToDynamoDBProps);

    const summaryDDB_cfn_ref = limitSummarizerLambdaToDynamoDb.dynamoTable.node.defaultChild as dynamodb.CfnTable
    summaryDDB_cfn_ref.overrideLogicalId('SummaryDDB')
    summaryDDB_cfn_ref.addPropertyOverride("SSESpecification", {
      "SSEEnabled": true
    })

    queuePollScheduleEventsRuleToLambdaConstruct.lambdaFunction.addEnvironment("LIMIT_REPORT_TBL", limitSummarizerLambdaToDynamoDb.dynamoTable.tableName)

    /*
    *Start LimtrHelper lambda function
    */
    const limtrHelperRoleEventsPS = new iam.PolicyStatement()
    limtrHelperRoleEventsPS.effect = iam.Effect.ALLOW
    limtrHelperRoleEventsPS.addActions("events:PutPermission", "events:RemovePermission")
    limtrHelperRoleEventsPS.addResources(`arn:${cdk.Aws.PARTITION}:events:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:event-bus/default`)

    const limtrHelperRoleSSMPS = new iam.PolicyStatement()
    limtrHelperRoleSSMPS.effect = iam.Effect.ALLOW
    limtrHelperRoleSSMPS.addActions("ssm:GetParameters", "ssm:PutParameter")
    limtrHelperRoleSSMPS.addResources(`arn:${cdk.Aws.PARTITION}:ssm:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:parameter/*`)

    const limtrHelperPolicy = new iam.PolicyDocument();
    limtrHelperPolicy.addStatements(cwLogsPS)
    limtrHelperPolicy.addStatements(limtrHelperRoleEventsPS)
    limtrHelperPolicy.addStatements(limtrHelperRoleSSMPS)

    const limtrHelperPolicyPolicyName = 'Custom_Limtr_Helper_Permissions'

    const limtrHelperLambdaRole = new iam.Role(this, 'LimtrHelperRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      path: '/',
      inlinePolicies: {
        [limtrHelperPolicyPolicyName]: limtrHelperPolicy
      }
    });

    const limtrHelperLambdaRole_cfn_ref = limtrHelperLambdaRole.node.defaultChild as iam.CfnRole
    limtrHelperLambdaRole_cfn_ref.overrideLogicalId('LimtrHelperRole')
    limtrHelperLambdaRole_cfn_ref.cfnOptions.metadata = cfn_nag_w11

    const LimtrHelperLambdaSourceCodeS3Key = cdk.Fn.join("/", [cdk.Fn.findInMap('SourceCode', 'General', 'KeyPrefix'), 'limtr-helper-service.zip'])

    const LimtrHelperFunction = new lambda.Function(this, 'LimtrHelperFunction', {
      description: 'This function generates UUID, establishes cross account trust on CloudWatch Event Bus and sends anonymous metric',
      environment: {
        LOG_LEVEL: 'INFO'
      },
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromBucket(solutionSourceCodeBucket, LimtrHelperLambdaSourceCodeS3Key),
      handler: 'index.handler',
      role: limtrHelperLambdaRole,
      timeout: cdk.Duration.seconds(300)
    })

    const limtrhelperlambda_cfn_ref = LimtrHelperFunction.node.defaultChild as lambda.CfnFunction
    limtrhelperlambda_cfn_ref.cfnOptions.metadata = cfn_nag_w89_w92
    limtrhelperlambda_cfn_ref.overrideLogicalId('LimtrHelperFunction')



    const lm_encrypkey_cfn_ref = limitMonitorEncryptionKey.node.defaultChild as cdk.CfnResource
    lm_encrypkey_cfn_ref.overrideLogicalId('LimitMonitorEncryptionKey')

    const limitMonitorEncryptionKeyAlias = new kms.Alias(this, "LimitMonitorEncryptionKeyAlias", {
      aliasName: "alias/limit-monitor-encryption-key",
      targetKey: limitMonitorEncryptionKey
    })

    const lm_encrypkeyalias_cfn_ref = limitMonitorEncryptionKeyAlias.node.defaultChild as cdk.CfnResource
    lm_encrypkeyalias_cfn_ref.overrideLogicalId('LimitMonitorEncryptionKeyAlias')

    const snsTopic = new sns.Topic(this, 'SNSTopic', {
      masterKey: limitMonitorEncryptionKey
    })

    const sns_topic_cfn_ref = snsTopic.node.defaultChild as sns.CfnTopic
    sns_topic_cfn_ref.overrideLogicalId('SNSTopic')
    sns_topic_cfn_ref.addOverride('Condition', 'SNSTrue')
    sns_topic_cfn_ref.addOverride('Properties.Subscription', [{
      "Protocol": "email",
      "Endpoint": {
        "Fn::Sub": "${SNSEmail}"
      }
    }])


    /*
    * Use aws-events-rule-sns construct
    */
    const taSNSEventsRuleToSnsProps: EventsRuleToSnsProps = {
      existingTopicObj: snsTopic,
      enableEncryptionWithCustomerManagedKey: false,
      eventRuleProps: {
        description: 'Limit Monitor Solution - Rule for TA SNS events',
        enabled: true,
        schedule: events.Schedule.expression('rate(24 hours)'),
      },
      encryptionKey: limitMonitorEncryptionKey
    };

    const taSNSEventsRuleToSnsTopicConstruct = new EventsRuleToSns(this, 'TASNSRule', taSNSEventsRuleToSnsProps);

    const tasnsrule_cfn_ref = taSNSEventsRuleToSnsTopicConstruct.eventsRule.node.defaultChild as events.CfnRule
    tasnsrule_cfn_ref.overrideLogicalId('TASNSRule')
    tasnsrule_cfn_ref.addOverride('Condition', 'SlackTrue')
    //add additional details to the event rule target created by default by the construct
    tasnsrule_cfn_ref.addOverride('Properties.Targets.0.Id', 'LimitMonitorSNSTarget')
    tasnsrule_cfn_ref.addOverride('Properties.Targets.0.InputTransformer', {
      "InputPathsMap": {
        "limitdetails": "$.detail.check-item-detail",
        "time": "$.time",
        "account": "$.account"
      },
      "InputTemplate": "\"AWS-Account : <account> || Timestamp : <time> || Limit-Details : <limitdetails>\""
    })
    tasnsrule_cfn_ref.addOverride("Properties.EventPattern", {
      "Fn::Join": [
        "",
        [
          "{\"account\":[",
          {
            "Fn::If": [
              "SingleAccnt",
              {
                "Fn::Join": [
                  "",
                  [
                    "\"",
                    {
                      "Ref": "AWS::AccountId"
                    },
                    "\""
                  ]
                ]
              },
              {
                "Ref": "AccountList"
              }
            ]
          },
          "],",
          "\"source\":[\"aws.trustedadvisor\", \"limit-monitor-solution\"],",
          "\"detail-type\":[\"Trusted Advisor Check Item Refresh Notification\", \"Limit Monitor Checks\"],",
          "\"detail\":{",
          "\"status\":[",
          {
            "Ref": "SNSEvents"
          },
          "],",
          "\"check-item-detail\":{",
          "\"Service\":[",
          {
            "Fn::FindInMap": [
              "EventsMap",
              "Checks",
              "Services"
            ]
          },
          "]",
          "}",
          "}",
          "}"
        ]
      ]
    })
    tasnsrule_cfn_ref.addPropertyDeletionOverride('ScheduleExpression')

    /*
    * Custom resource: CreateUUID
    */
    const createUUID = new cdk.CustomResource(this, 'CreateUUID', {
      resourceType: 'Custom::UUID',
      serviceToken: LimtrHelperFunction.functionArn
    })

    queuePollScheduleEventsRuleToLambdaConstruct.lambdaFunction.addEnvironment('UUID', createUUID.getAttString('UUID'))
    /*
    * Custom resource: EstablishTrust
    */
    let customServiceEstablishTrust = new cdk.CustomResource(this, 'EstablishTrust', {
      resourceType: 'Custom::CrossAccntTrust',
      serviceToken: LimtrHelperFunction.functionArn
    })
    const custom_service_establishtrust_cfn_ref = customServiceEstablishTrust.node.defaultChild as cdk.CfnCustomResource
    custom_service_establishtrust_cfn_ref.addPropertyOverride('SUB_ACCOUNTS', accountList.valueAsString)

    /*
    * Custom resource: SSMParameter
    */
    let customServiceSSMParameter = new cdk.CustomResource(this, 'SSMParameter', {
      resourceType: 'Custom::SSMParameter',
      serviceToken: LimtrHelperFunction.functionArn
    })
    const custom_service_ssmparameter = customServiceSSMParameter.node.defaultChild as cdk.CfnCustomResource
    custom_service_ssmparameter.addOverride('Condition', 'SlackTrue')
    custom_service_ssmparameter.addPropertyOverride('SLACK_HOOK_KEY', cdk.Fn.sub('SlackHookURL'))
    custom_service_ssmparameter.addPropertyOverride('SLACK_CHANNEL_KEY', cdk.Fn.sub('SlackChannel'))

    /*
    * Custom resource: AccountAnonymousData
    */
    let customServiceAcctAnonymousData = new cdk.CustomResource(this, 'AccountAnonymousData', {
      resourceType: 'Custom::AnonymousData',
      serviceToken: LimtrHelperFunction.functionArn
    })
    const custom_service_acct_anonymous_Data = customServiceAcctAnonymousData.node.defaultChild as cdk.CfnCustomResource
    custom_service_acct_anonymous_Data.addOverride('Condition', 'AnonymousMetric'),
      custom_service_acct_anonymous_Data.addPropertyOverride('SOLUTION', 'SO0005')
    custom_service_acct_anonymous_Data.addPropertyOverride('UUID', createUUID.getAttString('UUID'))
    custom_service_acct_anonymous_Data.addPropertyOverride('SNS_EVENTS', [cdk.Fn.conditionIf('SNSTrue', 'true', 'false')])
    custom_service_acct_anonymous_Data.addPropertyOverride('SLACK_EVENTS', [cdk.Fn.conditionIf('SlackTrue', 'true', 'false')])
    custom_service_acct_anonymous_Data.addPropertyOverride('SUB_ACCOUNTS', accountList.valueAsString)
    custom_service_acct_anonymous_Data.addPropertyOverride('VERSION', props.solutionVersion)
    custom_service_acct_anonymous_Data.addPropertyOverride('TA_REFRESH_RATE', refreshRateCronSchedule)

    /*
    * Custom resource: DeploymentData
    */
    let customServiceDeploymentData = new cdk.CustomResource(this, 'DeploymentData', {
      resourceType: 'Custom::DeploymentData',
      serviceToken: LimtrHelperFunction.functionArn
    })
    const custom_service_deployment_data = customServiceDeploymentData.node.defaultChild as cdk.CfnCustomResource
    custom_service_deployment_data.addPropertyOverride('SOLUTION', 'SO0005')
    custom_service_deployment_data.addPropertyOverride('UUID', createUUID.getAttString('UUID'))
    custom_service_deployment_data.addPropertyOverride('VERSION', props.solutionVersion)
    custom_service_deployment_data.addPropertyOverride('ANONYMOUS_DATA', sendAnonymousData)

    /*
    * CFN Stack: invoke limit check cfn stack 
    */
    const templateS3Bucket = cdk.Fn.findInMap("SourceCode", "General", "TemplateBucket")
    const limitCheckStackS3Key = cdk.Fn.findInMap("SourceCode", "General", "KeyPrefix") + "/service-quotas-checks.template"
    new cdk.CfnStack(this, "limitCheckStack", {
      templateUrl: "https://s3.amazonaws.com/" + templateS3Bucket + "/" + limitCheckStackS3Key
    })

    /*
    * CFN Outputs
    */
    new CfnOutput(this, 'ServiceChecks', {
      value: cdk.Fn.findInMap('EventsMap', 'Checks', 'Services'),
      description: 'Service limits monitored in the account'
    })

    new CfnOutput(this, 'Accounts', {
      value: accountList.valueAsString,
      description: 'Accounts to be monitored for service limits'
    })

    new CfnOutput(this, 'SlackChannelKey', {
      condition: slackTrue,
      value: cdk.Fn.sub('SlackChannel'),
      description: 'SSM parameter for Slack Channel, change the value for your slack workspace'
    })

    new CfnOutput(this, 'SlackHookKey', {
      condition: slackTrue,
      value: cdk.Fn.sub('SlackHookURL'),
      description: 'SSM parameter for Slack Web Hook, change the value for your slack workspace'
    })

    new CfnOutput(this, 'UUID', {
      value: createUUID.getAttString('UUID'),
      description: 'UUID for the deployment'
    })

    const stack = cdk.Stack.of(this)

    stack.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        "ParameterGroups": [
          {
            "Label": {
              "default": "Account Configuration"
            },
            "Parameters": [
              "AccountList"
            ]
          },
          {
            "Label": {
              "default": "Notification Configuration"
            },
            "Parameters": [
              "SNSEvents",
              "SNSEmail",
              "SlackEvents",
              "SlackHookURL",
              "SlackChannel"
            ]
          }
        ],
        "ParameterLabels": {
          "SNSEmail": {
            "default": "Email Address"
          },
          "AccountList": {
            "default": "Account List"
          },
          "SNSEvents": {
            "default": "Email Notification Level"
          },
          "SlackEvents": {
            "default": "Slack Notification Level"
          },
          "SlackHookURL": {
            "default": "Slack Hook Url Key Name"
          },
          "SlackChannel": {
            "default": "Slack Channel Key Name"
          }
        }
      }
    }

    stack.templateOptions.templateFormatVersion = "2010-09-09"
  }
}