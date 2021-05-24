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
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import { CfnOutput } from '@aws-cdk/core';
import { EventsRuleToLambdaProps, EventsRuleToLambda } from '@aws-solutions-constructs/aws-events-rule-lambda';
import { LimitMonitorStackProps } from '../bin/limit-monitor';
import { Effect } from '@aws-cdk/aws-iam';


export class ServiceQuotasChecksStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props: LimitMonitorStackProps) {
    super(scope, id, props);

    const thresholdPercentage = new cdk.CfnParameter(this, 'ThresholdPercentage', {
      description: 'This value is used to set the threshold for WARN messages. For example set this to 0.8 if the threshold percentage is 80%.',
      type: "Number",
      default: 0.8
    });

    const metricsMapping = new cdk.CfnMapping(this, "MetricsMap")
    metricsMapping.setValue("Send-Data", "SendAnonymousData", "Yes")

    const refreshRateMapping = new cdk.CfnMapping(this, "RefreshRate")
    refreshRateMapping.setValue("CronSchedule", "Default", "rate(5 minutes)")

    const sourceCodeMapping = new cdk.CfnMapping(this, "SourceCode")
    sourceCodeMapping.setValue("General", "S3Bucket", props.solutionBucket)
    sourceCodeMapping.setValue("General", "KeyPrefix", props.solutionName + '/' + props.solutionVersion)

    const solutionSourceCodeBucket = s3.Bucket.fromBucketAttributes(this, 'SolutionSourceCodeBucket', {
      bucketName: cdk.Fn.join("-", [cdk.Fn.findInMap('SourceCode', 'General', 'S3Bucket'), cdk.Aws.REGION])
    });

    const limitMonitorLambdaSourceCodeS3Key = cdk.Fn.join("/", [cdk.Fn.findInMap('SourceCode', 'General', 'KeyPrefix'), 'service-quotas-checks-service.zip'])

    const refreshRateCronSchedule = cdk.Fn.findInMap('RefreshRate', 'CronSchedule', 'Default')

    const limitMonitorEventsRuleToLambdaProps: EventsRuleToLambdaProps = {
      lambdaFunctionProps: {
        description: 'This function checks for vCPU limits and sends notifiction on WARN and ERROR status',
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromBucket(solutionSourceCodeBucket, limitMonitorLambdaSourceCodeS3Key),
        handler: 'index.handler',
        //role: limitMonitorLambdaRole,
        timeout: cdk.Duration.seconds(300)
      },
      eventRuleProps: {
        description: 'Limit Monitor Solution - Rule to perform limit checks',
        schedule: events.Schedule.expression(refreshRateCronSchedule),
        enabled: true
      }
    };

    const limitMonitorEventRuleToLambdaConstruct = new EventsRuleToLambda(this, 'LimitCheckSchedule', limitMonitorEventsRuleToLambdaProps);

    limitMonitorEventRuleToLambdaConstruct.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "servicequotas:GetServiceQuota",
        "servicequotas:GetAWSDefaultServiceQuota",
        "servicequotas:ListServiceQuotas",
        "cloudwatch:GetMetricData",
        "events:PutEvents",
        "ec2:DescribeRegions"
      ],
      resources: [
        '*'
      ]
    }))

    limitMonitorEventRuleToLambdaConstruct.lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: [
        "logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"
      ],
      resources: [
        `arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/*`
      ],
      sid: 'default'
    }))

    const lambdaRolePolicy_cfn_ref = limitMonitorEventRuleToLambdaConstruct.lambdaFunction.role?.node.tryFindChild('DefaultPolicy')?.node.findChild('Resource') as iam.CfnPolicy;
    lambdaRolePolicy_cfn_ref.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [{
          id: 'W11',
          reason: 'The actions servicequotas:GetServiceQuota, cloudwatch:GetMetricsData, events:PutEvents REQUIRE * resource.'
        },
        {
          id: 'W12',
          reason: "Lambda needs the following minimum required permissions to send trace data to X-Ray."
        }
        ]
      }
    }

    const lambdaLimitMonitor_cfn_ref = limitMonitorEventRuleToLambdaConstruct.lambdaFunction.node.defaultChild as lambda.CfnFunction
    lambdaLimitMonitor_cfn_ref.cfnOptions.metadata = {
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
    lambdaLimitMonitor_cfn_ref.overrideLogicalId('LimitMonitorFunction')
    lambdaLimitMonitor_cfn_ref.addPropertyOverride('Environment', {
      Variables: {
        LOG_LEVEL: "INFO",
        LIMIT_THRESHOLD: thresholdPercentage.valueAsNumber
      }
    })

    const lambdaLimitMonitor_cfn_permission = limitMonitorEventRuleToLambdaConstruct.lambdaFunction.permissionsNode.tryFindChild('LambdaInvokePermission') as lambda.CfnPermission
    if (lambdaLimitMonitor_cfn_permission != undefined) {
      lambdaLimitMonitor_cfn_permission.overrideLogicalId('LimitCheckInvokePermission')
    }

    const limitMonitorrule_cfn_ref = limitMonitorEventRuleToLambdaConstruct.eventsRule.node.defaultChild as events.CfnRule
    limitMonitorrule_cfn_ref.overrideLogicalId('LimitCheckSchedule')

    new CfnOutput(this, 'ServiceChecks', {
      value: 'vCPU',
      description: 'service limit checks monitored in the account'
    })

    const stack = cdk.Stack.of(this)

    stack.templateOptions.templateFormatVersion = "2010-09-09"
  }
}