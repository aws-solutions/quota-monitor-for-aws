// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { OperationType, _Record } from "@aws-sdk/client-dynamodb-streams";
import { ServiceQuota } from "@aws-sdk/client-service-quotas";
import {
  DynamoDBHelper,
  ServiceQuotasHelper,
  IncorrectConfigurationException,
  createChunksFromArray,
  LambdaTriggers,
  logger,
} from "solutions-utils";

/**
 * @description executing module name
 */
const MODULE_NAME = __filename.split("/").pop();

/**
 * @description generic interface for service table items
 */
interface IServiceTableItem extends Record<string, any> {
  ServiceCode: string;
  Monitored: boolean;
}

/**
 * @description Interface for the properties of the putServiceMonitoringStatus function
 * @property {string} [serviceTable] - DynamoDB table name for service table
 * @property {boolean} [refresh] - If true, forces re-populating of the quotas for services
 * @property {boolean} [sageMakerMonitoring] - Optional. Specifies the monitoring status for SageMaker
 * @property {boolean} [connectMonitoring] - Optional. Specifies the monitoring status for Connect
 */
interface PutServiceMonitoringStatusProps {
  serviceTable?: string;
  refresh?: boolean;
  sageMakerMonitoring?: boolean;
  connectMonitoring?: boolean;
}

/**
 * @description performs put on service table, updates monitoring status
 * @param {PutServiceMonitoringStatusProps} props - The properties for the function
 */
export async function putServiceMonitoringStatus(props: PutServiceMonitoringStatusProps) {
  const {
    serviceTable = <string>process.env.SQ_SERVICE_TABLE,
    refresh = false,
    sageMakerMonitoring,
    connectMonitoring,
  } = props;
  const ddb = new DynamoDBHelper();
  const sq = new ServiceQuotasHelper();
  const serviceCodes: string[] = await sq.getServiceCodes();
  const monitoredServices: string[] = [];
  const disabledServices: string[] = [];
  const newServices: string[] = [];

  logger.debug({
    label: `${MODULE_NAME}/putServiceMonitoringStatus`,
    message: `Starting with refresh=${refresh}, sageMakerMonitoring=${sageMakerMonitoring}, connectMonitoring=${connectMonitoring}`,
  });

  logger.debug({
    label: `${MODULE_NAME}/serviceCodes`,
    message: JSON.stringify(serviceCodes),
  });
  await Promise.allSettled(
    serviceCodes.map(async (service) => {
      const getItemResponse = <IServiceTableItem>await ddb.getItem(serviceTable, {
        ServiceCode: service,
      });
      if (!getItemResponse) newServices.push(service);
      else if (getItemResponse.Monitored) monitoredServices.push(service);
      else disabledServices.push(service);
    })
  );
  logger.debug({
    label: `${MODULE_NAME}/monitoredServices`,
    message: JSON.stringify(monitoredServices),
  });
  logger.debug({
    label: `${MODULE_NAME}/disabledServices`,
    message: JSON.stringify(disabledServices),
  });
  logger.debug({
    label: `${MODULE_NAME}/newServices`,
    message: JSON.stringify(newServices),
  });
  if (newServices.length > 0) {
    logger.debug({
      label: `${MODULE_NAME}/putServiceMonitoringStatus`,
      message: "Adding new services",
    });
    await Promise.allSettled(
      newServices.map(async (service) => {
        logger.debug({
          label: `${MODULE_NAME}/putServiceMonitoringStatus`,
          message: `Adding new services`,
        });
        let monitoringStatus = true;
        if (service === "sagemaker" && sageMakerMonitoring !== undefined) {
          monitoringStatus = sageMakerMonitoring;
        } else if (service === "connect" && connectMonitoring !== undefined) {
          monitoringStatus = connectMonitoring;
        }
        await ddb.putItem(serviceTable, {
          ServiceCode: service,
          Monitored: monitoringStatus,
        });
      })
    );
  }
  if (refresh) {
    logger.debug({
      label: `${MODULE_NAME}/putServiceMonitoringStatus`,
      message: "Refresh: Toggling the monitored services Monitored to false",
    });
    await Promise.allSettled(
      monitoredServices.map(async (service) => {
        await ddb.putItem(serviceTable, {
          ServiceCode: service,
          Monitored: false,
        });
      })
    );
    logger.debug({
      label: `${MODULE_NAME}/putServiceMonitoringStatus`,
      message: "Refresh: Setting monitored services Monitored flag to true",
    });
    await Promise.allSettled(
      monitoredServices.map(async (service) => {
        await ddb.putItem(serviceTable, {
          ServiceCode: service,
          Monitored: true,
        });
      })
    );
  }
  // Update Monitoring status for SageMaker and Connect services
  if (sageMakerMonitoring !== undefined) {
    await ddb.putItem(serviceTable, {
      ServiceCode: "sagemaker",
      Monitored: sageMakerMonitoring,
    });
    logger.info({
      label: `${MODULE_NAME}/putServiceMonitoringStatus`,
      message: `Updated SageMaker monitoring status: ${sageMakerMonitoring}`,
    });
  }
  if (connectMonitoring !== undefined) {
    await ddb.putItem(serviceTable, {
      ServiceCode: "connect",
      Monitored: connectMonitoring,
    });
    logger.info({
      label: `${MODULE_NAME}/putServiceMonitoringStatus`,
      message: `Updated Connect monitoring status: ${connectMonitoring}`,
    });
  }
}

/**
 * @description performs get on service table to retrieve monitoring status
 * @param {string} serviceTable - dynamodb table name for service table
 */
export async function getServiceMonitoringStatus(serviceTable: string = <string>process.env.SQ_SERVICE_TABLE) {
  const ddb = new DynamoDBHelper();
  const statusItems: IServiceTableItem[] = [];
  const sq = new ServiceQuotasHelper();
  const serviceCodes = await sq.getServiceCodes();
  await Promise.allSettled(
    serviceCodes.map(async (service) => {
      const getItemResponse = <IServiceTableItem>await ddb.getItem(serviceTable, {
        ServiceCode: service,
      });
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
    throw new IncorrectConfigurationException("batch size more than 1 not supported");
  const streamRecord = event.Records[0];
  // service monitoring turned ON
  if (
    streamRecord.eventName == "INSERT" &&
    streamRecord.dynamodb?.NewImage?.ServiceCode?.S &&
    "BOOL" in streamRecord.dynamodb?.NewImage?.Monitored
  )
    return <OperationType>"INSERT";
  // service monitoring toggled
  if (
    streamRecord.eventName == "MODIFY" &&
    streamRecord.dynamodb?.NewImage?.Monitored?.BOOL != streamRecord.dynamodb?.OldImage?.Monitored?.BOOL
  )
    return <OperationType>"MODIFY";
  // service monitoring turned OFF
  if (streamRecord.eventName == "REMOVE" && streamRecord.dynamodb?.OldImage?.ServiceCode?.S)
    return <OperationType>"REMOVE";
  else throw new IncorrectConfigurationException("incorrect stream record format");
}

/**
 * @description adding quotas to monitor on dynamodb table
 * @param serviceCode
 */
export async function putQuotasForService(serviceCode: string) {
  const _quotas = await _getQuotasWithUtilizationMetrics(serviceCode);
  await _putMonitoredQuotas(_quotas, <string>process.env.SQ_QUOTA_TABLE);
}

/**
 * @description get quotas that support utilization metrics
 * @param serviceCode - service code for which to get the quotas
 * @returns
 */
async function _getQuotasWithUtilizationMetrics(serviceCode: string) {
  const sq = new ServiceQuotasHelper();
  const quotas = (await sq.getQuotaList(serviceCode)) || [];
  const quotasWithMetric = await sq.getQuotasWithUtilizationMetrics(quotas, serviceCode);
  return quotasWithMetric;
}

/**
 * @description updates the quota table with quotas to be monitored
 * @param quotas - quotas that support utilization metrics
 * @param table - table to update for quota codes to monitor
 */
async function _putMonitoredQuotas(quotas: ServiceQuota[], table: string) {
  const ddb = new DynamoDBHelper();
  const BATCH_SIZE = 25; // DynamoDB allows up to 25 items per BatchWriteItem operation

  for (let i = 0; i < quotas.length; i += BATCH_SIZE) {
    const batch = quotas.slice(i, i + BATCH_SIZE);
    const writeRequests = batch.map((quota) => ({
      PutRequest: {
        Item: quota,
      },
    }));

    try {
      const { success, result } = await ddb.batchWrite(table, writeRequests);
      if (success) {
        logger.info({
          label: `${MODULE_NAME}/_putMonitoredQuotas`,
          message: "All items processed successfully",
        });
      } else {
        logger.warn({
          label: `${MODULE_NAME}/_putMonitoredQuotas`,
          message: `Some items were not processed: ${JSON.stringify(result.UnprocessedItems)}`,
        });
      }
    } catch (error) {
      logger.error({
        label: `${MODULE_NAME}/_putMonitoredQuotas`,
        message: `Error batch writing to DynamoDB: ${error}`,
      });
    }
  }
}

/**
 * @description delete all quotas from table for a given service
 * @param serviceCode
 */
export async function deleteQuotasForService(serviceCode: string) {
  const ddb = new DynamoDBHelper();
  const quotaItems = await ddb.queryQuotasForService(<string>process.env.SQ_QUOTA_TABLE, serviceCode);
  const deleteRequestChunks = _getChunkedDeleteQuotasRequests(<ServiceQuota[]>quotaItems);
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
      if (_record.dynamodb?.NewImage?.Monitored?.BOOL === true) {
        await putQuotasForService(<string>_record.dynamodb?.NewImage?.ServiceCode.S);
      }
      break;
    }
    case "MODIFY": {
      await deleteQuotasForService(<string>_record.dynamodb?.NewImage?.ServiceCode.S);
      if (_record.dynamodb?.NewImage?.Monitored?.BOOL)
        await putQuotasForService(<string>_record.dynamodb?.NewImage?.ServiceCode.S);
      break;
    }
    case "REMOVE": {
      await deleteQuotasForService(<string>_record.dynamodb?.OldImage?.ServiceCode.S);
      break;
    }
  }
}
