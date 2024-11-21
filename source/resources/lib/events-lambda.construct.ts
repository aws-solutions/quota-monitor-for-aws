// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda as lambda,
  aws_sqs as sqs,
  Duration,
  Stack,
} from "aws-cdk-lib";
import { QueueEncryption } from "aws-cdk-lib/aws-sqs";
import { NagSuppressions } from "cdk-nag";
import { Construct, IConstruct } from "constructs";
import { enforceSSL } from "./enforce-SSL.utils";
import {
  IRuleToTarget,
  LAMBDA_RUNTIME_NODE,
  LambdaProps,
  LOG_LEVEL,
  QuotaMonitorEvent,
  RuleTargetProps,
} from "./exports";
import { KMS } from "./kms.construct";

/**
 * @description construct for events rule to lambda as target
 */
export class EventsToLambda<T extends QuotaMonitorEvent> extends Construct implements IRuleToTarget<lambda.Function> {
  readonly rule: events.Rule;
  /**
   * @description target lambda function
   */
  readonly target: lambda.Function;

  /**
   * @description constructor
   * @param {Stack} scope - construct will be created in stack
   * @param {string} id - unique id for the construct
   * @param {RuleTargetProps<T> & LambdaProps} props - constructor props
   */
  constructor(scope: Stack, id: string, props: RuleTargetProps<T> & LambdaProps) {
    super(scope, id);
    this.rule = new events.Rule(this, `${id}-EventsRule`, {
      description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
        "SOLUTION_NAME"
      )} - ${id}-EventsRule`,
      schedule: props.eventRule instanceof events.Schedule ? props.eventRule : undefined,
      eventPattern: !(props.eventRule instanceof events.Schedule) ? props.eventRule : undefined,
      eventBus: props.eventBus,
    });

    const deadLetterQueue = new sqs.Queue(this, `${id}-Lambda-Dead-Letter-Queue`, {
      encryption: props.encryptionKey ? QueueEncryption.KMS : QueueEncryption.KMS_MANAGED,
      encryptionMasterKey: props.encryptionKey,
    });
    enforceSSL(deadLetterQueue);

    this.target = new lambda.Function(this, `${id}-Lambda`, {
      description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
        "SOLUTION_NAME"
      )} - ${id}-Lambda`,
      runtime: LAMBDA_RUNTIME_NODE,
      code: lambda.Code.fromAsset(<string>props.assetLocation),
      handler: "index.handler",
      environment: {
        ...props.environment,
        LOG_LEVEL: this.node.tryGetContext("LOG_LEVEL") || LOG_LEVEL.INFO, //change as needed
        CUSTOM_SDK_USER_AGENT: `AwsSolution/${this.node.tryGetContext("SOLUTION_ID")}/${this.node.tryGetContext(
          "SOLUTION_VERSION"
        )}`,
        VERSION: this.node.tryGetContext("SOLUTION_VERSION"),
        SOLUTION_ID: this.node.tryGetContext("SOLUTION_ID"),
      },
      timeout: props.timeout ? props.timeout : Duration.seconds(60),
      memorySize: props.memorySize ? props.memorySize : 128,
      deadLetterQueueEnabled: true,
      deadLetterQueue: deadLetterQueue,
      environmentEncryption: props.encryptionKey,
      layers: props.layers,
      maxEventAge: Duration.hours(4),
    });

    this.rule.addTarget(new targets.LambdaFunction(this.target));

    // permissions to access KMS key
    if (props.encryptionKey) {
      KMS.getIAMPolicyStatementsToAccessKey(props.encryptionKey.keyArn).forEach((policyStatement) => {
        this.target.addToRolePolicy(policyStatement);
      });
    }

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(
      <IConstruct>this.target.role,
      [
        {
          id: "AwsSolutions-IAM4",
          reason: "AWSLambdaBasicExecutionRole added by cdk only gives write permissions for CW logs",
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Actions restricted on kms key ARN. Only actions that do not support resource-level permissions have * in resource",
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      <IConstruct>this.target,
      [
        {
          id: "AwsSolutions-L1",
          reason: "GovCloud regions support only up to nodejs 16, risk is tolerable",
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(deadLetterQueue, [
      {
        id: "AwsSolutions-SQS3",
        reason: "Queue itself is dead-letter queue",
      },
    ]);
  }
}
