// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Construct } from "constructs";
import { aws_lambda as lambda, Stack } from "aws-cdk-lib";
import { LAMBDA_RUNTIME_NODE } from "./exports";

/**
 * @description construct for deploying lambda layer
 */
export class Layer extends Construct {
  readonly layer: lambda.LayerVersion;
  /**
   * @description constructor
   * @param {Stack} scope - construct will be created in stack
   * @param {string} id - unique id for the construct
   * @param {string} location - code binary local location
   */
  constructor(scope: Stack, id: string, location: string) {
    super(scope, id);
    this.layer = new lambda.LayerVersion(this, `${id}-Layer`, {
      layerVersionName: id,
      code: lambda.Code.fromAsset(location),
      compatibleRuntimes: [LAMBDA_RUNTIME_NODE],
    });
  }
}
