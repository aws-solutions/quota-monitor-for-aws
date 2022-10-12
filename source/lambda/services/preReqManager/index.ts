// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { PreReqManager } from "./lib/preReqManager";
import {
  LambdaTriggers,
  logger,
  sendAnonymousMetric,
  UnsupportedEventException,
} from "solutions-utils";

const moduleName = <string>__filename.split("/").pop();

/**
 * @description Lambda event handler for pre-requisite manager
 * @param event - invoking event
 */
export const handler = async (event: Record<string, any>) => {
  logger.debug({
    label: moduleName,
    message: `prereq-manager triggering event: ${JSON.stringify(event)}`,
  });
  logger.info({
    label: moduleName,
    message: `initiating organization feature check`,
  });
  if (LambdaTriggers.isCfnEvent(event)) {
    if (event.RequestType === "Create" || event.RequestType === "Update")
      await handleCreateOrUpdate(event.ResourceProperties);
    return;
  }
  throw new UnsupportedEventException("this event type is not supported");
};

/**
 * @description handle create/update on prereq manager custom resource
 * @param properties
 */
async function handleCreateOrUpdate(properties: Record<string, string>) {
  try {
    const preReqManager = new PreReqManager(properties.AccountId);
    await preReqManager.throwIfOrgMisconfigured();
    await preReqManager.enableTrustedAccess();
    await preReqManager.registerDelegatedAdministrator(
      properties.QMMonitoringAccountId
    );
    logger.info({
      label: moduleName,
      message: `All pre-requisites validated & installed`,
    });
    await _sendMetrics(properties, "PreReqsInstalled");
  } catch (error) {
    logger.error({
      label: moduleName,
      message: `Pre-requisites failed: ${JSON.stringify(error)}`,
    });
    await _sendMetrics(properties, "PreReqsFailed");
    throw `${error.name}-${error.message}. Check cloudwatch logs for more details`; // NOSONAR Return more readable cloudformation error
  }
}

/**
 * @description send metrics to aws-solutions endpoint
 * @param properties
 * @param event
 */
async function _sendMetrics(properties: Record<string, string>, event: string) {
  if (process.env.SEND_METRIC === "Yes") {
    const metric = {
      Solution: <string>process.env.SOLUTION_ID,
      UUID: properties.SolutionUuid,
      TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""),
      Data: {
        Event: event,
        Stack: "PreReqStack",
        Version: <string>process.env.VERSION,
      },
    };
    await sendAnonymousMetric(<string>process.env.METRICS_ENDPOINT, metric);
  }
}
