// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { CfnResource, Resource } from "aws-cdk-lib";

/**
 * @description applies depends on cloudformation resources
 * @param dependee
 * @param parent
 */
export function applyDependsOn(
  dependee: Resource | CfnResource,
  parent: Resource
) {
  if (dependee) {
    if (dependee instanceof Resource)
      dependee = dependee.node.defaultChild as CfnResource;
    dependee.addDependency(parent.node.defaultChild as CfnResource);
  }
}
