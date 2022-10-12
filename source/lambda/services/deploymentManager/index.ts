// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger, IParameterChangeEvent } from "solutions-utils";
import { DeploymentManager } from "./lib/deployment-manager";

/**
 * @description executing module name
 */
const MODULE_NAME = __filename.split("/").pop();

/**
 * @description entry point for microservice
 */
export const handler = async (event: IParameterChangeEvent) => {
  logger.debug({
    label: `${MODULE_NAME}/handler`,
    message: JSON.stringify(event),
  });
  const deploymentMananger = new DeploymentManager();
  await deploymentMananger.manageDeployments();
};
