// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * DDB Table Schemas
 *
 * <Service Table>
 * PartitionKey: ServiceCode: SUPPORTED_SERVICES
 * Attributes: { Monitored: Bool}
 *
 * <Quota Table>
 * PartitionKey: ServiceCode: SUPPORTED_SERVICES
 * SortKey: QuotaCode: string
 * Attributes: {
 *  LastMonitored: timestamp
 *  LastMonitoredUtilization(in percentage): number%
 *  CWDimensions: {}
 *  ExpiryTime: LastMonitored > 7 days
 * }
 *
 */

import {
  logger,
  UnsupportedEventException,
  LambdaTriggers,
  sleep,
} from "solutions-utils";
import {
  putServiceMonitoringStatus,
  handleDynamoDBStreamEvent,
} from "./exports";

/**
 * @description executing module name
 */
const MODULE_NAME = __filename.split("/").pop();

/**
 * @description entry point for microservice
 */
export const handler = async (event: any) => {
  logger.debug({
    label: `${MODULE_NAME}/handler`,
    message: JSON.stringify(event),
  });

  if (LambdaTriggers.isCfnEvent(event)) {
    if (event.RequestType === "Create" || event.RequestType === "Update") {
      // we had a bug where the quota table was sometimes not populated
      // it was not populated because the stream change events from the services table weren't firing
      // this happened only in this function right after the stack is deployed
      // waiting on the related resources didn't work
      // rather than re-architecting, this sleep is added in v6.2.0
      const delay =
        parseInt(<string>process.env.RESOURCES_WAIT_TIME_SECONDS ?? "120") *
        1000;
      logger.info({
        label: `${MODULE_NAME}/handler`,
        message: `Sleeping for ${
          delay / 1000
        } seconds to make sure all resources are provisioned`,
      });
      await sleep(delay);
      logger.info({
        label: `${MODULE_NAME}/handler`,
        message: "Start putting supported services",
      });
      await putServiceMonitoringStatus(<string>process.env.SQ_SERVICE_TABLE);
    }
  } else if (LambdaTriggers.isDynamoDBStreamEvent(event)) {
    await handleDynamoDBStreamEvent(event);
  } else if (LambdaTriggers.isScheduledEvent(event)) {
    await putServiceMonitoringStatus(
      <string>process.env.SQ_SERVICE_TABLE,
      true
    );
  } else throw new UnsupportedEventException("this event type is not support");
};
