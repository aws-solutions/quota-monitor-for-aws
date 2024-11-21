// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  CloudWatchClient,
  CloudWatchServiceException,
  MetricDataQuery,
  MetricDataResult,
  paginateGetMetricData,
} from "@aws-sdk/client-cloudwatch";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for CloudWatch
 */
export class CloudWatchHelper extends ServiceHelper<CloudWatchClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new CloudWatchClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }
  /**
   * @description method to get the cloudwatch metric data
   * @param startTime - earliest timestamp to fetch data
   * @param endTime - latest timestamp to fetch data
   * @param queries - metric data query to fetch percentage utilization
   */
  @catchDecorator(CloudWatchServiceException, true)
  async getMetricData(startTime: Date, endTime: Date, queries: MetricDataQuery[]) {
    logger.debug({
      label: this.moduleName,
      message: `getting cloudwatch metric data for queries: ${JSON.stringify(queries)}`,
    });
    const paginator = paginateGetMetricData(
      { client: this.client },
      { StartTime: startTime, EndTime: endTime, MetricDataQueries: queries }
    );
    const metricDataResults: MetricDataResult[] = [];
    for await (const page of paginator) {
      if (page.MetricDataResults) {
        metricDataResults.push(...page.MetricDataResults);
      }
    }
    return metricDataResults;
  }
}
