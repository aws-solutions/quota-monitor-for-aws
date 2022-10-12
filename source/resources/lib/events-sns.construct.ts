// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_events as events,
  aws_events_targets as targets,
  aws_sns as sns,
  Stack,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { enforceSSL } from "./enforce-SSL.utils";
import { IRuleToTarget, QuotaMonitorEvent, RuleTargetProps } from "./exports";

/**
 * @description construct for events rule to lambda as target
 */
export class EventsToSNS<T extends QuotaMonitorEvent>
  extends Construct
  implements IRuleToTarget<sns.Topic>
{
  readonly rule: events.Rule;
  /**
   * @description target sns topic
   */
  readonly target: sns.Topic;

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

    this.target = new sns.Topic(this, `${id}-SNSTopic`, {
      masterKey: props.encryptionKey,
    });

    enforceSSL(this.target);
    this.rule.addTarget(new targets.SnsTopic(this.target));
  }
}
