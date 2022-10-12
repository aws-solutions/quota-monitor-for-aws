// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IAspect, CfnResource, Resource, CfnCondition } from "aws-cdk-lib";
import { IConstruct } from "constructs";

/**
 * @description cdk aspect to apply conditions
 */
export class ConditionAspect implements IAspect {
  /**
   * @description condition to apply to cfn resource
   */
  readonly condition: CfnCondition;

  /**
   * @description aspect constructor
   * @param condition
   */
  constructor(condition: CfnCondition) {
    this.condition = condition;
  }

  /**
   * @description method to apply while visiting each node
   * @param node
   */
  public visit(node: IConstruct) {
    if (node instanceof CfnResource) {
      applyCondition(node, this.condition);
    }
  }
}

/**
 * @description applies condition on resources
 * @param resource - resource on which to apply condition,
 * @param condition - condition to apply
 */
function applyCondition(
  resource: Resource | CfnResource,
  condition: CfnCondition
) {
  if (resource) {
    if (resource instanceof Resource)
      resource = resource.node.defaultChild as CfnResource;
    resource.cfnOptions.condition = condition;
  }
}
