// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { v4 as uuidv4 } from "uuid";
import {
  logger,
  sendAnonymousMetric,
  stringEqualsIgnoreCase
} from "solutions-utils";

/**
 * @description interface for cloudformation events
 */
export interface IEvent {
  RequestType: string;
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  ResourceProperties: { [key: string]: string };
  OldResourceProperties?: { [key: string]: string };
  PhysicalResourceId?: string;
}

/**
 * @description executing module name
 */
const MODULE_NAME = __filename.split("/").pop();

export const handler = async (
  event: IEvent,
  context: { [key: string]: string }
) => {
  logger.debug({
    label: `${MODULE_NAME}/handler`,
    message: `received event: ${JSON.stringify(event)}`,
  });

  let responseData: { [key: string]: string } = {
    Data: "NOV",
  };

  const status = "SUCCESS";
  const properties = event.ResourceProperties;

  // Generate UUID
  if (
    event.ResourceType === "Custom::CreateUUID" &&
    event.RequestType === "Create"
  ) {
    responseData = {
      UUID: uuidv4(),
    };
    logger.info({
      label: `${MODULE_NAME}/handler`,
      message: `uuid create: ${responseData.UUID}`,
    });
  }

  // Send launch metric
  else if (
    event.ResourceType === "Custom::LaunchData" &&
    stringEqualsIgnoreCase(<string>process.env.SEND_METRIC, "Yes")
  ) {
    const metric = {
      Solution: <string>process.env.SOLUTION_ID,
      UUID: properties.SOLUTION_UUID,
      TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format,
      Data: {
        Event: `Solution${event.RequestType}`,
        Version: <string>process.env.VERSION,
        Region: <string>process.env.AWS_REGION,
        Stack: <string>process.env.QM_STACK_ID,
        SlackNotification: <string>process.env.QM_SLACK_NOTIFICATION,
        EmailNotification: <string>process.env.QM_EMAIL_NOTIFICATION,
      },
    };
    try {
      await sendAnonymousMetric(<string>process.env.METRICS_ENDPOINT, metric);
      logger.info({
        label: `${MODULE_NAME}/handler`,
        message: `launch data sent successfully`,
      });
    } catch (error) {
      logger.warn({
        label: `${MODULE_NAME}/handler`,
        message: `sending launch data failed ${error}`,
      });
    }
  }

  /**
   * Send response back to custom resource
   */
  return sendResponse(event, context.logStreamName, status, responseData);
};

/**
 * Sends a response to custom resource
 * for Create/Update/Delete
 * @param event - Custom Resource event
 * @param logStreamName - CloudWatch logs stream
 * @param responseStatus - response status
 * @param responseData - response data
 */
async function sendResponse(
  event: IEvent,
  logStreamName: string,
  responseStatus: string,
  responseData: { [key: string]: string }
) {
  const responseBody = {
    Status: responseStatus,
    Reason: `${JSON.stringify(responseData)}`,
    PhysicalResourceId: event.PhysicalResourceId
      ? event.PhysicalResourceId
      : logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData,
  };

  logger.debug({
    label: `${MODULE_NAME}/sendResponse`,
    message: `Response Body: ${JSON.stringify(responseBody)}`,
  });
  return responseBody;
}
