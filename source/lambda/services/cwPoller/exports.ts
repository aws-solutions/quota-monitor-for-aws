// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { MetricInfo, ServiceQuota } from "@aws-sdk/client-service-quotas";
import { MetricDataQuery, MetricDataResult } from "@aws-sdk/client-cloudwatch";
import { PutEventsRequestEntry } from "@aws-sdk/client-cloudwatch-events";
import {
  CloudWatchHelper,
  DynamoDBHelper,
  EventsHelper,
  ServiceQuotasHelper,
  stringEqualsIgnoreCase,
  logger,
} from "solutions-utils";

/**
 * @description period of 1hr for metric stats
 */
export const METRIC_STATS_PERIOD = 3600;

/**
 * @description supported frequencies for cw poller in hours
 */
export enum FREQUENCY {
  "06_HOUR" = "rate(6 hours)",
  "12_HOUR" = "rate(12 hours)",
}

/**
 * @description status for quota utilization events
 */
export enum QUOTA_STATUS {
  OK = "OK",
  WARN = "WARN",
  ERROR = "ERROR",
}

/**
 * @description support quota utilization event format to be sent on bridge
 */
interface IQuotaUtilizationEvent {
  status: QUOTA_STATUS;
  "check-item-detail": {
    "Limit Code": string;
    "Limit Name": string;
    Resource: string;
    Service: string;
    Region: string;
    "Current Usage": string;
    "Limit Amount": string;
    Timestamp?: Date;
  };
}

/**
 * @description get frequency in hours
 * @param rate
 * @returns
 */
function getFrequencyInHours(
  rate: string = <string>process.env.POLLER_FREQUENCY
) {
  if (rate == FREQUENCY["06_HOUR"]) return 6;
  if (rate == FREQUENCY["12_HOUR"]) return 12;
  else return 24; // default frequency 24 hours
}

/**
 * @description scan quota table and gets quotas to monitor for utilization
 * @param table quota table to scan for quota items
 * @param service service for which to fetch quotas
 * @returns
 */
export async function getQuotasForService(table: string, service: string) {
  const ddb = new DynamoDBHelper();
  const items = await ddb.queryQuotasForService(table, service);
  return items ?? [];
}

/**
 * @description generates CW GetMetricData queries for all quotas
 * @param quotas
 */
export function generateCWQueriesForAllQuotas(quotas: ServiceQuota[]) {
  const sq = new ServiceQuotasHelper();
  const queries: MetricDataQuery[] = [];
  quotas.forEach((quota) => {
    try {
      queries.push(...sq.generateCWQuery(quota, 3600));
    } catch (_) {
      // quota throws error with generating query
    }
  });
  return queries;
}

export type MetricQueryIdToQuotaMap = { [key: string]: ServiceQuota };

/**
 * generates a map of metric query ids and the corresponding quota objects from which the ids are generated
 * @param quotas
 */
export function generateMetricQueryIdMap(quotas: ServiceQuota[]) {
  const sq = new ServiceQuotasHelper();
  const dict: MetricQueryIdToQuotaMap = {};
  for (const quota of quotas) {
    const metricQueryId = sq.generateMetricQueryId(
      <MetricInfo>quota.UsageMetric,
      quota.QuotaCode
    );
    dict[metricQueryId] = quota;
  }
  return dict;
}

/**
 * @description get all metric data points for quota utilization
 * @param queries
 * @returns
 */
export async function getCWDataForQuotaUtilization(queries: MetricDataQuery[]) {
  const cw = new CloudWatchHelper();
  const BATCH_SIZE = 100;
  const allDataPoints = [];

  const batchQueries = (queries: MetricDataQuery[]): MetricDataQuery[][] => {
    const batches: MetricDataQuery[][] = [];

    while (queries.length > 0) {
      batches.push(queries.splice(0, BATCH_SIZE));
    }

    return batches;
  };

  const batches = batchQueries(queries);

  for (const batch of batches) {
    try {
      const dataPoints = await cw.getMetricData(
        new Date(Date.now() - getFrequencyInHours() * 60 * 60 * 1000),
        new Date(),
        batch
      );
      allDataPoints.push(...dataPoints);
    } catch (error) {
      if (error.name === "CloudWatchServiceException") {
        logger.error(
          `Error occurred while getting metric data: ${error.message}`
        );
      } else {
        throw error;
      }
    }
  }

  return allDataPoints;
}

/**
 * @description returns the metric query id from the result query id
 * @param metricData
 */
function getMetricQueryIdFromMetricData(
  metricData: Omit<MetricDataResult, "Label">
) {
  return (<string>metricData.Id).split("_pct_utilization")[0];
}

/**
 * @description evaluate metric data and create quota utilization events
 * @param metricData
 * @param metricQueryIdToQuotaMap
 */
export function createQuotaUtilizationEvents(
  metricData: MetricDataResult,
  metricQueryIdToQuotaMap: MetricQueryIdToQuotaMap
) {
  const metricQueryId = getMetricQueryIdFromMetricData(metricData);
  const quota = metricQueryIdToQuotaMap[metricQueryId];
  const utilizationValues = <number[]>metricData.Values;

  const items: IQuotaUtilizationEvent[] = [];

  const sendOKNotifications = stringEqualsIgnoreCase(
    <string>process.env.SQ_REPORT_OK_NOTIFICATIONS,
    "Yes"
  );
  utilizationValues.forEach((value, index) => {
    const quotaEvents: IQuotaUtilizationEvent = {
      status: QUOTA_STATUS.OK,
      "check-item-detail": {
        "Limit Code": <string>quota.QuotaCode,
        "Limit Name": <string>quota.QuotaName,
        Resource: <string>quota.UsageMetric?.MetricDimensions?.Resource,
        Service: <string>quota.UsageMetric?.MetricDimensions?.Service,
        Region: <string>process.env.AWS_REGION,
        "Current Usage": "",
        "Limit Amount": "100%", // max utilization is 100%
      },
    };
    if (value >= 100) {
      quotaEvents.status = QUOTA_STATUS.ERROR;
    } else if (value > +(<string>process.env.THRESHOLD)) {
      quotaEvents.status = QUOTA_STATUS.WARN;
    } else {
      quotaEvents.status = QUOTA_STATUS.OK;
    }
    quotaEvents["check-item-detail"]["Current Usage"] = "" + value + "%";
    quotaEvents["check-item-detail"].Timestamp = (<Date[]>(
      metricData.Timestamps
    ))[index];
    if (sendOKNotifications || quotaEvents.status != QUOTA_STATUS.OK) {
      items.push(quotaEvents);
    }
  });

  return items;
}

/**
 * @description send events to spoke event bridge for quota utilization
 * @param eventBridge event bridge to receive the events
 * @param utilizationEvents utilization events to send to bridge
 */
export async function sendQuotaUtilizationEventsToBridge(
  eventBridge: string,
  utilizationEvents: IQuotaUtilizationEvent[]
) {
  const events = new EventsHelper();
  const putEventEntries: PutEventsRequestEntry[] = [];
  utilizationEvents.forEach((event) => {
    putEventEntries.push({
      Source: "aws-solutions.quota-monitor",
      DetailType: "Service Quotas Utilization Notification",
      Detail: JSON.stringify(event),
      EventBusName: eventBridge,
    });
  });
  await events.putEvent(putEventEntries);
}
