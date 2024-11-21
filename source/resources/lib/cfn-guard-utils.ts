// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CfnResource, Stack } from "aws-cdk-lib";
import { IConstruct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export function addCfnGuardSuppression(construct: IConstruct, suppressions: string[]) {
  let cfnResource: CfnResource | undefined;

  if (construct instanceof CfnResource) {
    cfnResource = construct;
  } else {
    cfnResource = construct.node.defaultChild as CfnResource;
  }

  if (!cfnResource || !cfnResource.cfnOptions) {
    console.warn(`Unable to add cfn-guard suppression for ${construct.node.id}: not a CFN resource or no cfnOptions`);
    return;
  }

  const existingSuppressions: string[] = cfnResource.cfnOptions.metadata?.guard?.SuppressedRules || [];
  cfnResource.cfnOptions.metadata = {
    ...cfnResource.cfnOptions.metadata,
    guard: {
      SuppressedRules: [...existingSuppressions, ...suppressions],
    },
  };
}

export function addCfnGuardSuppressionToNestedResources(construct: IConstruct, suppressions: string[]) {
  const stack = Stack.of(construct);
  stack.node.findAll().forEach((child) => {
    if (child instanceof CfnResource && child.cfnResourceType === "AWS::Lambda::Function") {
      addCfnGuardSuppression(child, suppressions);
    }
  });
}

export function addDynamoDbSuppressions(table: dynamodb.Table) {
  const cfnTable = table.node.defaultChild as CfnResource;
  if (cfnTable && cfnTable.cfnOptions) {
    addCfnGuardSuppression(cfnTable, ["DYNAMODB_TABLE_ENCRYPTED_KMS"]);
  } else {
    console.warn(`Unable to add cfn-guard suppression for DynamoDB table: ${table.tableName}`);
  }
}
