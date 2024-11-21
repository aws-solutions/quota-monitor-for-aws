// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Aws, aws_iam as iam, aws_kms as kms, Stack } from "aws-cdk-lib";

import { Construct } from "constructs";

export class KMS extends Construct {
  /**
   * @description custom resource provider
   */
  readonly key: kms.Key;
  constructor(scope: Stack, id: string) {
    super(scope, id);
    /**
     * @description kms key policy so resource-based policies can give permissions on the key
     * https://docs.aws.amazon.com/kms/latest/developerguide/key-policy-default.html#key-policy-default-allow-root-enable-iam
     */
    const encryptionKeyPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ["kms:*"],
          resources: ["*"],
          effect: iam.Effect.ALLOW,
          principals: [new iam.ArnPrincipal(`arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:root`)],
        }),
      ],
    });

    /**
     * @description kms key for encryption in quota monitor resources
     */
    this.key = new kms.Key(this, "QM-EncryptionKey", {
      description: "CMK for AWS resources provisioned by Quota Monitor in this account",
      enabled: true,
      enableKeyRotation: true,
      policy: encryptionKeyPolicy,
      alias: `CMK-${id}`,
    });
  }

  /**
   * @desription IAM Policy Statements needed to access given KMS key
   * @param keyArn
   * @returns
   */
  static getIAMPolicyStatementsToAccessKey(keyArn: string) {
    return [
      new iam.PolicyStatement({
        actions: ["kms:Encrypt", "kms:Decrypt", "kms:CreateGrant"],
        resources: [keyArn],
        effect: iam.Effect.ALLOW,
      }),
      new iam.PolicyStatement({
        actions: ["kms:ListAliases"],
        resources: ["*"], // does not allow resource-level permissions
        effect: iam.Effect.ALLOW,
      }),
    ];
  }
}
