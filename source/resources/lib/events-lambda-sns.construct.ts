// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IRuleToTarget, LambdaProps, QuotaMonitorEvent, RuleTargetProps } from "./exports";
import { aws_events as events, aws_iam as iam, aws_lambda as lambda, aws_sns as sns, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EventsToLambda } from "./events-lambda.construct";
import { Key } from "aws-cdk-lib/aws-kms";

/**
 * @description construct for events rule to lambda to sns
 */
export class EventsToLambdaToSNS<T extends QuotaMonitorEvent>
  extends Construct
  implements IRuleToTarget<lambda.Function>
{
  readonly rule: events.Rule;
  /**
   * @description target lambda function
   */
  readonly target: lambda.Function;
  readonly snsTopic: sns.Topic;

  /**
   * @description constructor
   * @param {Stack} scope - construct will be created in stack
   * @param {string} id - unique id for the construct
   * @param {RuleTargetProps<T> & LambdaProps} props - constructor props
   */
  constructor(scope: Stack, id: string, props: RuleTargetProps<T> & LambdaProps) {
    /**
     * @description sns topic
     */
    super(scope, id);
    this.snsTopic = new sns.Topic(this, `${id}-SNSTopic`, {
      masterKey: props.encryptionKey,
    });
    const eventsToLambda = new EventsToLambda<events.EventPattern>(scope, `${id}Function`, {
      assetLocation: props.assetLocation,
      environment: {
        ...props.environment,
        TOPIC_ARN: this.snsTopic.topicArn,
      },
      layers: props.layers,
      eventRule: <events.EventPattern>props.eventRule,
      ...(props.encryptionKey instanceof Key && { encryptionKey: props.encryptionKey }),
      eventBus: props.eventBus,
    });
    this.target = eventsToLambda.target;
    this.rule = eventsToLambda.rule;

    const snsPublisherPolicy = new iam.PolicyStatement({
      actions: ["SNS:Publish"],
      effect: iam.Effect.ALLOW,
      resources: [this.snsTopic.topicArn],
    });
    this.target.addToRolePolicy(snsPublisherPolicy);
    if (props.encryptionKey) {
      const kmsGenerateDataKeyPolicy = new iam.PolicyStatement({
        actions: ["kms:GenerateDataKey"],
        resources: [props?.encryptionKey.keyArn],
        effect: iam.Effect.ALLOW,
      });
      this.target.addToRolePolicy(kmsGenerateDataKeyPolicy);
    }
  }
}
