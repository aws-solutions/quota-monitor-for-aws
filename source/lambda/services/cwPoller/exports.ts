// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { ServiceQuota } from "@aws-sdk/client-service-quotas";
import { MetricDataQuery, MetricDataResult } from "@aws-sdk/client-cloudwatch";
import { PutEventsRequestEntry } from "@aws-sdk/client-cloudwatch-events";
import {
  CloudWatchHelper,
  DynamoDBHelper,
  EventsHelper,
  ServiceQuotasHelper,
  SQ_SERVICE_CODES,
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
    "Limit Name": string;
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
export async function getQuotasForService(
  table: string,
  service: SQ_SERVICE_CODES
) {
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

/**
 * @description get all metric data points for quota utilization
 * @param queries
 * @returns
 */
export async function getCWDataForQuotaUtilization(queries: MetricDataQuery[]) {
  const cw = new CloudWatchHelper();
  const dataPoints = await cw.getMetricData(
    new Date(Date.now() - getFrequencyInHours() * 60 * 60 * 1000),
    new Date(),
    queries
  );
  return dataPoints;
}

/**
 * @description performs string manipulation on metric data id to get service and quota name
 * @param metricData
 * @returns
 */
function getQuotaNameFromMetricData(
  metricData: Omit<MetricDataResult, "Label">
) {
  const quotaName = (<string>metricData.Id).split("_pct_utilization")[0];
  const names = quotaName.split("_");
  return { ServiceName: names[0], QuotaName: names[1] };
}

/**
 * @description evaluate metric data and create quota utilization events
 * @param metricData
 */
export function createQuotaUtilizationEvents(metricData: MetricDataResult) {
  const quotaIdentifier = getQuotaNameFromMetricData(metricData);
  const utilizationValues = <number[]>metricData.Values;

  const items: IQuotaUtilizationEvent[] = [];

  utilizationValues.forEach((value, index) => {
    const quotaEvents: IQuotaUtilizationEvent = {
      status: QUOTA_STATUS.OK,
      "check-item-detail": {
        "Limit Name": quotaIdentifier.QuotaName,
        Service: quotaIdentifier.ServiceName,
        Region: <string>process.env.AWS_REGION,
        "Current Usage": "",
        "Limit Amount": "100", // max utilization is 100%
      },
    };
    if (value == 100) {
      quotaEvents.status = QUOTA_STATUS.ERROR;
    } else if (value > +(<string>process.env.THRESHOLD)) {
      quotaEvents.status = QUOTA_STATUS.WARN;
    } else {
      quotaEvents.status = QUOTA_STATUS.OK;
    }
    quotaEvents["check-item-detail"]["Current Usage"] = "" + value;
    quotaEvents["check-item-detail"].Timestamp = (<Date[]>(
      metricData.Timestamps
    ))[index];

    items.push(quotaEvents);
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
