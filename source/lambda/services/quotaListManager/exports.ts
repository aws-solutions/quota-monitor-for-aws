// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { OperationType, _Record } from "@aws-sdk/client-dynamodb-streams";
import { ServiceQuota } from "@aws-sdk/client-service-quotas";
import {
  DynamoDBHelper,
  ServiceQuotasHelper,
  IncorrectConfigurationException,
  SQ_SERVICE_CODES,
  SUPPORTED_SERVICES,
  createChunksFromArray,
  LambdaTriggers,
} from "solutions-utils";

/**
 * @description generic interface for service table items
 */
interface IServiceTableItem extends Record<string, any> {
  ServiceCode: SQ_SERVICE_CODES;
  Monitored: boolean;
}

/**
 * @description performs put on service table, updates monitoring status
 * @param {string} serviceTable - dynamodb table name for service table
 */
export async function putServiceMonitoringStatus(
  serviceTable: string = <string>process.env.SQ_SERVICE_TABLE
) {
  const ddb = new DynamoDBHelper();
  await Promise.allSettled(
    SUPPORTED_SERVICES.map(async (service) => {
      const getItemResponse = <IServiceTableItem>await ddb.getItem(
        serviceTable,
        {
          ServiceCode: service,
        }
      );
      if (!getItemResponse)
        await ddb.putItem(serviceTable, {
          ServiceCode: service,
          Monitored: true,
        });
    })
  );
}

/**
 * @description performs get on service table to retrieve monitoring status
 * @param {string} serviceTable - dynamodb table name for service table
 */
export async function getServiceMonitoringStatus(
  serviceTable: string = <string>process.env.SQ_SERVICE_TABLE
) {
  const ddb = new DynamoDBHelper();
  const statusItems: IServiceTableItem[] = [];
  await Promise.allSettled(
    SUPPORTED_SERVICES.map(async (service) => {
      const getItemResponse = <IServiceTableItem>await ddb.getItem(
        serviceTable,
        {
          ServiceCode: service,
        }
      );
      if (getItemResponse) statusItems.push(getItemResponse);
    })
  );
  return statusItems;
}

/**
 * @description reads dynamodb stream event and identifies the operation
 * @param event - dynamodb stream event
 * @returns
 */
export function readDynamoDBStreamEvent(event: Record<string, any>) {
  if (LambdaTriggers.isDynamoDBStreamEvent(event) && event.Records.length > 1)
    throw new IncorrectConfigurationException(
      "batch size more than 1 not supported"
    );
  const streamRecord = event.Records[0];
  // service monitoring turned ON
  if (
    streamRecord.eventName == "INSERT" &&
    streamRecord.dynamodb?.NewImage?.ServiceCode?.S &&
    streamRecord.dynamodb?.NewImage?.Monitored?.BOOL
  )
    return <OperationType>"INSERT";
  // service monitoring toggled
  if (
    streamRecord.eventName == "MODIFY" &&
    streamRecord.dynamodb?.NewImage?.Monitored?.BOOL !=
      streamRecord.dynamodb?.OldImage?.Monitored?.BOOL
  )
    return <OperationType>"MODIFY";
  // service monitoring turned OFF
  if (
    streamRecord.eventName == "REMOVE" &&
    streamRecord.dynamodb?.OldImage?.ServiceCode?.S
  )
    return <OperationType>"REMOVE";
  else
    throw new IncorrectConfigurationException("incorrect stream record format");
}

/**
 * @description adding quotas to monitor on dynamodb table
 * @param serviceCode
 */
export async function putQuotasForService(serviceCode: SQ_SERVICE_CODES) {
  const _quotas = await _getQuotasWithUtilizationMetrics(serviceCode);
  await _putMonitoredQuotas(_quotas, <string>process.env.SQ_QUOTA_TABLE);
}

/**
 * @description get quotas that support utilization metrics
 * @param serviceCode - service code for which to get the quotas
 * @returns
 */
async function _getQuotasWithUtilizationMetrics(serviceCode: SQ_SERVICE_CODES) {
  if (SUPPORTED_SERVICES.includes(serviceCode)) {
    const sq = new ServiceQuotasHelper();
    const quotas = (await sq.getQuotaList(serviceCode)) || [];
    const quotasWithMetric = await sq.getQuotasWithUtilizationMetrics(quotas);
    return quotasWithMetric;
  } else
    throw new IncorrectConfigurationException(
      `service ${serviceCode} is not supported`
    );
}

/**
 * @description updates the quota table with quotas to be monitored
 * @param quotas - quotas that support utilization metrics
 * @param table - table to update for quota codes to monitor
 */
async function _putMonitoredQuotas(quotas: ServiceQuota[], table: string) {
  const ddb = new DynamoDBHelper();
  await Promise.allSettled(
    quotas.map(async (quota) => {
      await ddb.putItem(table, quota);
    })
  );
}

/**
 * @description delete all quotas from table for a given service
 * @param serviceCode
 */
export async function deleteQuotasForService(serviceCode: SQ_SERVICE_CODES) {
  const ddb = new DynamoDBHelper();
  const quotaItems = await ddb.queryQuotasForService(
    <string>process.env.SQ_QUOTA_TABLE,
    serviceCode
  );
  const deleteRequestChunks = _getChunkedDeleteQuotasRequests(
    <ServiceQuota[]>quotaItems
  );
  await Promise.allSettled(
    deleteRequestChunks.map(async (chunk) => {
      await ddb.batchDelete(<string>process.env.SQ_QUOTA_TABLE, chunk);
    })
  );
}

/**
 * @description get chunked delete requests for deleting quotas for a service
 * @param quotas
 * @returns
 */
function _getChunkedDeleteQuotasRequests(quotas: ServiceQuota[]) {
  const deleteRequests = quotas.map((item) => {
    return {
      DeleteRequest: {
        Key: {
          ServiceCode: item.ServiceCode,
          QuotaCode: item.QuotaCode,
        },
      },
    };
  });
  return createChunksFromArray(deleteRequests, 25);
}

/**
 * @description handler for dynamodb stream event
 * @param event
 */
export async function handleDynamoDBStreamEvent(event: Record<string, any>) {
  const _record = <_Record>event.Records[0];
  switch (readDynamoDBStreamEvent(event)) {
    case "INSERT": {
      await putQuotasForService(
        <SQ_SERVICE_CODES>_record.dynamodb?.NewImage?.ServiceCode.S
      );
      break;
    }
    case "MODIFY": {
      await deleteQuotasForService(
        <SQ_SERVICE_CODES>_record.dynamodb?.NewImage?.ServiceCode.S
      );
      if (_record.dynamodb?.NewImage?.Monitored?.BOOL)
        await putQuotasForService(
          <SQ_SERVICE_CODES>_record.dynamodb?.NewImage?.ServiceCode.S
        );
      break;
    }
    case "REMOVE": {
      await deleteQuotasForService(
        <SQ_SERVICE_CODES>_record.dynamodb?.OldImage?.ServiceCode.S
      );
      break;
    }
  }
}
