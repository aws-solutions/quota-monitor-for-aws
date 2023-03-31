// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_events as events,
  aws_events_targets as targets,
  aws_sqs as sqs,
  Duration,
  Stack,
} from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import { enforceSSL } from "./enforce-SSL.utils";
import { IRuleToTarget, QuotaMonitorEvent, RuleTargetProps } from "./exports";

/**
 * @description construct for events rule to sqs to lambda as target
 */
export class EventsToSQS<T extends QuotaMonitorEvent>
  extends Construct
  implements IRuleToTarget<sqs.Queue>
{
  readonly rule: events.Rule;
  /**
   * @description target sqs queue
   */
  readonly target: sqs.Queue;

  /**
   * @param {Stack} scope - construct will be created in stack
   * @param {string} id - unique id for the construct
   * @param {RuleTargetProps<T>} props - constructor props
   */
  constructor(scope: Stack, id: string, props: RuleTargetProps<T>) {
    super(scope, id);
    this.rule = new events.Rule(this, `${id}-EventsRule`, {
      description: `${this.node.tryGetContext(
        "SOLUTION_ID"
      )} ${this.node.tryGetContext("SOLUTION_NAME")} - ${id}-EventsRule`,
      schedule:
        props.eventRule instanceof events.Schedule
          ? props.eventRule
          : undefined,
      eventPattern: !(props.eventRule instanceof events.Schedule)
        ? props.eventRule
        : undefined,
      eventBus: props.eventBus,
    });

    this.target = new sqs.Queue(this, `${id}-Queue`, {
      encryption: props.encryptionKey
        ? sqs.QueueEncryption.KMS
        : sqs.QueueEncryption.KMS_MANAGED,
      encryptionMasterKey: props.encryptionKey,
      visibilityTimeout: Duration.seconds(60),
    });

    enforceSSL(this.target);
    this.rule.addTarget(new targets.SqsQueue(this.target));

    NagSuppressions.addResourceSuppressions(
      this.target,
      [
        {
          id: "AwsSolutions-SQS3",
          reason:
            "dlq not implemented on sqs, will evaluate in future if there is need",
        },
      ],
      false
    );
  }
}
