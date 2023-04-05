// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SlackNotifier } from "./lib/slack-notify";
import {
  getNotificationMutingStatus,
  logger,
  SSMHelper,
} from "solutions-utils";

export const handler = async (event: any) => {
  // Log a message to the console, you can view this text in the Monitoring tab in the Lambda console
  // or in the CloudWatch Logs console
  logger.debug(`Received event: ${JSON.stringify(event)}`);

  const ssm = new SSMHelper();
  const ssmNotificationMutingConfigParamName = <string>(
    process.env.QM_NOTIFICATION_MUTING_CONFIG_PARAMETER
  );
  const mutingConfiguration: string[] = await ssm.getParameter(
    ssmNotificationMutingConfigParamName
  );
  logger.debug(`mutingConfiguration ${JSON.stringify(mutingConfiguration)}`);
  const service = event["detail"]["check-item-detail"]["Service"];
  const limitName = event["detail"]["check-item-detail"]["Limit Name"];
  const limitCode = event["detail"]["check-item-detail"]["Limit Code"];
  const resource = event["detail"]["check-item-detail"]["Resource"];
  const notificationMutingStatus = getNotificationMutingStatus(
    mutingConfiguration,
    {
      service: service,
      quotaName: limitName,
      quotaCode: limitCode,
      resource: resource,
    }
  );
  if (!notificationMutingStatus.muted) {
    const slackNotifier = new SlackNotifier();
    try {
      return await slackNotifier.sendNotification(event);
    } catch (error) {
      logger.error(error);
      return error;
    }
  } else {
    logger.debug(notificationMutingStatus.message);
    return {
      message: "Processed event, notification not sent",
      reason: notificationMutingStatus.message,
    };
  }
};
