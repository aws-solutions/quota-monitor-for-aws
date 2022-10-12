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
} from "solutions-utils";
import {
  putServiceMonitoringStatus,
  deleteQuotasForService,
  putQuotasForService,
  getServiceMonitoringStatus,
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
      await putServiceMonitoringStatus();
    }
  } else if (LambdaTriggers.isDynamoDBStreamEvent(event)) {
    await handleDynamoDBStreamEvent(event);
  } else if (LambdaTriggers.isScheduledEvent(event)) {
    // update quota list table
    const monitoringStatusForServices = await getServiceMonitoringStatus();
    await Promise.all(
      monitoringStatusForServices.map(async (item) => {
        await deleteQuotasForService(item.ServiceCode);
        if (item.Monitored) await putQuotasForService(item.ServiceCode);
      })
    );
  } else throw new UnsupportedEventException("this event type is not support");
};
