// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { aws_iam as iam } from "aws-cdk-lib";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Queue } from "aws-cdk-lib/aws-sqs";

/**
 * @description enforce SSL for data in transit
 * @param resource
 */
export function enforceSSL(resource: Queue | Topic) {
  resource.addToResourcePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: [resource instanceof Queue ? "sqs:*" : "sns:Publish"],
      resources: [
        resource instanceof Queue ? resource.queueArn : resource.topicArn,
      ],
      conditions: {
        Bool: { "aws:SecureTransport": "false" },
      },
    })
  );
}
