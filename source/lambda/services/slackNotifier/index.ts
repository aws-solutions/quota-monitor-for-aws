// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SlackNotifier } from "./lib/slack-notify";
import { logger } from "solutions-utils";

export const handler = async (event: any) => {
  // Load the message passed into the Lambda function into a JSON object
  const eventText = JSON.stringify(event, null, 2);

  // Log a message to the console, you can view this text in the Monitoring tab in the Lambda console
  // or in the CloudWatch Logs console
  logger.debug(`Received event: ${eventText}`);

  const slackNotifier = new SlackNotifier();

  try {
    return await slackNotifier.sendNotification(event);
  } catch (error) {
    logger.error(error);
    return error;
  }
};
