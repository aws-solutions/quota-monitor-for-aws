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

import * as cdk from "@aws-cdk/core";
import * as eventLambda from "@aws-solutions-constructs/aws-events-rule-lambda";
import * as lambda from "@aws-cdk/aws-lambda";
import * as s3 from "@aws-cdk/aws-s3";
import * as iam from "@aws-cdk/aws-iam";
import * as events from "@aws-cdk/aws-events";
import { PolicyDocument, PolicyStatement, Effect } from "@aws-cdk/aws-iam";
import { Aws, CfnResource, CfnStack } from "@aws-cdk/core";
import { LimitMonitorStackProps } from '../bin/limit-monitor';
export class LimitMonitorSpokeStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: LimitMonitorStackProps) {
        super(scope, id, props)

        const primaryAccount = new cdk.CfnParameter(this, 'MasterAccount', {
            description: 'Account Id for the master account, eg. 111111111111',
            type: 'String',
            allowedPattern: '^\\d{12}$'
        })

        const metricsMap = new cdk.CfnMapping(this, 'MetricsMap')
        metricsMap.setValue('Send-Data', 'SendAnonymousData', 'Yes')

        const refreshRate = new cdk.CfnMapping(this, 'RefreshRate')
        refreshRate.setValue('CronSchedule', 'Default', 'rate(1 day)')

        const eventsMap = new cdk.CfnMapping(this, 'EventsMap')
        eventsMap.setValue('Checks', 'Services', '"AutoScaling","CloudFormation","DynamoDB","EBS","EC2","ELB","IAM","Kinesis","RDS","Route53","SES","VPC"')

        const eventBusTarget = `arn:${cdk.Aws.PARTITION}:events:us-east-1:${primaryAccount.valueAsString}:event-bus/default`

        const eventOkTarget: events.IRuleTarget = {
            bind: () => ({
                id: 'SpokeOkTarget',
                arn: eventBusTarget
            })
        }

        const eventOkRule = new events.Rule(this, 'TAOkRule', {
            description: 'Limit Monitor Solution - Spoke - Rule for TA OK events',
            enabled: true,
            schedule: events.Schedule.expression('rate(24 hours)'),
            targets: [eventOkTarget]
        })
        const eventOKRule_cfn_ref = eventOkRule.node.defaultChild as events.CfnRule
        eventOKRule_cfn_ref.overrideLogicalId('TAOkRule')
        eventOKRule_cfn_ref.addOverride('Properties.EventPattern', {
            "Fn::Join": [
                "",
                [
                    "{\"account\":[\"",
                    {
                        "Ref": "AWS::AccountId"
                    },
                    "\"],",
                    "\"source\":[\"aws.trustedadvisor\", \"limit-monitor-solution\"],",
                    "\"detail-type\":[\"Trusted Advisor Check Item Refresh Notification\", \"Limit Monitor Checks\"],",
                    "\"detail\":{",
                    "\"status\":[",
                    "\"OK\"",
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
        eventOKRule_cfn_ref.addPropertyDeletionOverride('ScheduleExpression')

        const eventWarnTarget: events.IRuleTarget = {
            bind: () => ({
                id: 'SpokeWarnTarget',
                arn: eventBusTarget
            })
        }

        const eventWarnRule = new events.Rule(this, 'TAWarnRule', {
            description: 'Limit Monitor Solution - Spoke - Rule for TA WARN events',
            enabled: true,
            schedule: events.Schedule.expression('rate(24 hours)'),
            targets: [eventWarnTarget]
        })

        const eventWarnRule_cfn_ref = eventWarnRule.node.defaultChild as events.CfnRule
        eventWarnRule_cfn_ref.overrideLogicalId('TAWarnRule')
        eventWarnRule_cfn_ref.addOverride('Properties.EventPattern', {
            "Fn::Join": [
                "",
                [
                    "{\"account\":[\"",
                    {
                        "Ref": "AWS::AccountId"
                    },
                    "\"],",
                    "\"source\":[\"aws.trustedadvisor\", \"limit-monitor-solution\"],",
                    "\"detail-type\":[\"Trusted Advisor Check Item Refresh Notification\", \"Limit Monitor Checks\"],",
                    "\"detail\":{",
                    "\"status\":[",
                    "\"WARN\"",
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
        eventWarnRule_cfn_ref.addPropertyDeletionOverride('ScheduleExpression')

        const eventErrorTarget: events.IRuleTarget = {
            bind: () => ({
                id: 'SpokeErrorTarget',
                arn: eventBusTarget
            })
        }

        const eventErrorRule = new events.Rule(this, 'TASErrorRule', {
            description: 'Limit Monitor Solution - Spoke - Rule for TA ERROR events',
            enabled: true,
            schedule: events.Schedule.expression('rate(24 hours)'),
            targets: [eventErrorTarget]
        })

        const eventErrorRule_cfn_ref = eventErrorRule.node.defaultChild as events.CfnRule
        eventErrorRule_cfn_ref.overrideLogicalId('TASErrorRule')
        eventErrorRule_cfn_ref.addOverride('Properties.EventPattern', {
            "Fn::Join": [
                "",
                [
                    "{\"account\":[\"",
                    {
                        "Ref": "AWS::AccountId"
                    },
                    "\"],",
                    "\"source\":[\"aws.trustedadvisor\", \"limit-monitor-solution\"],",
                    "\"detail-type\":[\"Trusted Advisor Check Item Refresh Notification\", \"Limit Monitor Checks\"],",
                    "\"detail\":{",
                    "\"status\":[",
                    "\"ERROR\"",
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
        eventErrorRule_cfn_ref.addPropertyDeletionOverride('ScheduleExpression')



        const solutionsLambdaCodeBucket = s3.Bucket.fromBucketAttributes(this, 'SolutionsBucket', {
            bucketName: props.solutionBucket + '-' + Aws.REGION
        });

        const eventRuleLambda = new eventLambda.EventsRuleToLambda(this, 'TARefreshSchedule', {
            eventRuleProps: {
                description: 'Schedule to refresh TA checks',
                schedule: events.Schedule.expression(refreshRate.findInMap('CronSchedule', 'Default')),
                enabled: true,
            },
            lambdaFunctionProps: {
                runtime: lambda.Runtime.NODEJS_12_X,
                code: lambda.Code.fromBucket(solutionsLambdaCodeBucket, props.solutionName + '/' + props.solutionVersion + '/limtr-refresh-service.zip'),
                description: 'Serverless Limit Monitor - Lambda function to summarize service limits',
                timeout: cdk.Duration.seconds(300),
                handler: 'index.handler',
                environment: {
                    LOG_LEVEL: 'INFO',
                    AWS_SERVICES: eventsMap.findInMap('Checks', 'Services')
                }
            }
        })

        const logsPolicy: PolicyStatement = new PolicyStatement({
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents'
            ],
            effect: Effect.ALLOW,
            resources: [
                `arn:${cdk.Aws.PARTITION}:logs:${this.region}:${this.account}:log-group:/aws/lambda/*`
            ]
        })

        const supportPolicy: PolicyStatement = new PolicyStatement({
            actions: [
                'support:*'
            ],
            effect: Effect.ALLOW,
            resources: [
                '*'
            ]
        })

        const serviceQuotasPolicy: PolicyStatement = new PolicyStatement({
            actions: [
                'servicequotas:GetAWSDefaultServiceQuota'
            ],
            effect: Effect.ALLOW,
            resources: ['*']
        })

        eventRuleLambda.lambdaFunction.addToRolePolicy(logsPolicy)
        eventRuleLambda.lambdaFunction.addToRolePolicy(supportPolicy)
        eventRuleLambda.lambdaFunction.addToRolePolicy(serviceQuotasPolicy)

        const cfnLambdaFunctionDefPolicy = eventRuleLambda.lambdaFunction.role?.node.tryFindChild('DefaultPolicy')?.node.findChild('Resource') as iam.CfnPolicy;
        const cfnLambdaFunction = eventRuleLambda.lambdaFunction.node.findChild("Resource") as CfnResource;
        // Add the CFN NAG suppress to allow for "Resource": "*" for AWS X-Ray and support * actions.
        cfnLambdaFunctionDefPolicy.cfnOptions.metadata = {
            cfn_nag: {
                rules_to_suppress: [{
                    id: 'W12',
                    reason: `Lambda needs the following minimum required permissions to send trace data to X-Ray.`
                }, {
                    id: 'F4',
                    reason: `Lambda needs the support * to perform the functions for monitoring resources.`
                }
            ]}};
            cfnLambdaFunction.cfnOptions.metadata = {
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


        //End TARefresherLambda and Event Rule Resource.

        //START Limit Monitor Helper Lambda and Role.

        const limtrHelperRole = new iam.Role(this, 'LimtrHelperRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            path: '/',
            inlinePolicies: {
                'Custom_Limtr_Helper_Permissions': new PolicyDocument({
                    statements: [
                        logsPolicy
                    ]
                })
            }
        })

        const cfn_ref_limtrHelperRole = limtrHelperRole.node.defaultChild as iam.CfnRole
        cfn_ref_limtrHelperRole.overrideLogicalId('LimtrHelperRole')

        const limtrHelperFunction = new lambda.Function(this, 'LimtrHelperFunction', {
                    runtime: lambda.Runtime.NODEJS_12_X,
                    description: 'This function generates UUID, establishes cross account trust on CloudWatch Event Bus and sends anonymous metric',
                    handler: 'index.handler',
                    code: lambda.Code.fromBucket(solutionsLambdaCodeBucket, props.solutionName + '/' + props.solutionVersion + '/limtr-helper-service.zip'),
                    timeout: cdk.Duration.seconds(300),
                    environment: {
                        LOG_LEVEL: 'INFO'
                    },
                    role: limtrHelperRole
                })
        //END Limit Monitor Helper Lambda and Role

        const cfn_ref_limtrFunction = limtrHelperFunction.node.defaultChild as lambda.CfnFunction
        cfn_ref_limtrFunction.overrideLogicalId('LimtrHelperFunction')
        cfn_ref_limtrFunction.cfnOptions.metadata = {
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



        const customUUID = new cdk.CustomResource(this, 'CreateUUID', {
                    resourceType: 'Custom::UUID',
                    serviceToken: limtrHelperFunction.functionArn
                })

        new cdk.CustomResource(this, 'DeploymentData', {
                    resourceType: 'Custom::DeploymentData',
                    serviceToken: limtrHelperFunction.functionArn,
                    properties: {
                        SOLUTION: props.solutionId + 's',
                        UUID: customUUID.getAtt('UUID'),
                        VERSION: props.solutionVersion,
                        ANONYMOUS_DATA: metricsMap.findInMap('Send-Data', 'SendAnonymousData')
                    }
                })

        new CfnStack(this, 'limitCheckStack', {
                    templateUrl: 'https://s3.amazonaws.com/' + props.solutionTemplateBucket + '/' + props.solutionName + '/' + props.solutionVersion + '/' + 'service-quotas-checks.template'
                })

        //stack outputs
        new cdk.CfnOutput(this, 'ServiceChecks', {
                    value: eventsMap.findInMap('Checks', 'Services'),
                    description: 'service limit checks monitored in the account'
                })

            }
        }