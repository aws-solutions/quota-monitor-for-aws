// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  CloudWatchServiceException,
  MetricDataQuery,
} from "@aws-sdk/client-cloudwatch";
import {
  MetricInfo,
  paginateListServiceQuotas,
  paginateListServices,
  ServiceInfo,
  ServiceQuota,
  ServiceQuotasClient,
  ServiceQuotasServiceException,
} from "@aws-sdk/client-service-quotas";
import { CloudWatchHelper } from "./cloudwatch";
import { catchDecorator } from "./catch";
import { UnsupportedQuotaException } from "./error";
import { ServiceHelper, sleep } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for Service Quotas
 */
export class ServiceQuotasHelper extends ServiceHelper<ServiceQuotasClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new ServiceQuotasClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description method to get the ssm parameter
   * @param serviceCode - service code for which to generate quota list
   * @returns
   */
  @catchDecorator(ServiceQuotasServiceException, true)
  async getServiceCodes(): Promise<string[]> {
    logger.debug({
      label: this.moduleName,
      message: "getting services in Service quotas",
    });

    const services: ServiceInfo[] = [];
    const paginator = paginateListServices(
      {
        client: this.client,
        pageSize: 100,
      },
      {}
    );

    for await (const page of paginator) {
      services.push(...(page.Services as ServiceInfo[]));
    }
    return services
      .map((value) => value.ServiceCode)
      .filter((value) => value !== undefined)
      .map((value) => <string>value);
  }

  /**
   * @description returns a list of services supported by the Servrice Quotas
   * @returns
   */
  @catchDecorator(ServiceQuotasServiceException, true)
  async getQuotaList(serviceCode: string) {
    logger.debug({
      label: this.moduleName,
      message: `getting quota list for ${serviceCode}`,
    });

    const paginator = paginateListServiceQuotas(
      {
        client: this.client,
        pageSize: 100,
      },
      { ServiceCode: serviceCode }
    );
    const quotasSupportingUsage: ServiceQuota[] = [];
    // get list of quotas which support usage metric
    for await (const page of paginator) {
      if (page.Quotas) {
        quotasSupportingUsage.push(
          ...page.Quotas.filter(
            (Quota) => Quota.UsageMetric?.MetricNamespace == "AWS/Usage"
          )
        );
      }
      await sleep(1000);
    }

    logger.debug({
      label: this.moduleName,
      message: `quotas for ${serviceCode} supporting usage ${quotasSupportingUsage}`,
    });
    return quotasSupportingUsage;
  }

  /**
   * @description returns list of quotas that support utilization monitoring
   * @param quotas
   * @param serviceCode optional parameter needed only for logging
   */
  @catchDecorator(CloudWatchServiceException, true)
  async getQuotasWithUtilizationMetrics(
    quotas: ServiceQuota[],
    serviceCode?: string
  ) {
    logger.debug({
      label: this.moduleName,
      message: `Starting to process ${quotas.length} quotas for ${serviceCode}`,
    });
    const cw = new CloudWatchHelper();
    const BATCH_SIZE = 100;
    const validatedQuotas: ServiceQuota[] = [];
    let batchCount = 0;
    for (let i = 0; i < quotas.length; i += BATCH_SIZE) {
      batchCount++;
      const batch = quotas.slice(i, i + BATCH_SIZE);
      await this.processBatch(
        batch,
        validatedQuotas,
        cw,
        batchCount,
        serviceCode
      );
      await sleep(1000);
    }
    logger.debug({
      label: this.moduleName,
      message: `Finished processing ${quotas.length} quotas for ${serviceCode}. Validated ${validatedQuotas.length} quotas.`,
    });
    return validatedQuotas;
  }
  /**
   * @description Processes a batch of service quotas to validate their utilization monitoring support.
   * @param batch An array of ServiceQuota objects to process.
   * @param validatedQuotas An array to store the validated quotas.
   * @param cw CloudWatchHelper instance for making CloudWatch API calls.
   * @param batchCount The current batch number for logging purposes.
   * @param serviceCode The service code for the current batch, used for logging.
   */
  private async processBatch(
    batch: ServiceQuota[],
    validatedQuotas: ServiceQuota[],
    cw: CloudWatchHelper,
    batchCount: number,
    serviceCode?: string,
    retryCount: number = 0
  ) {
    const queries = this.generateCWQueriesForQuotas(batch);
    if (queries.length === 0) {
      logger.debug({
        label: this.moduleName,
        message: `Batch ${batchCount} for ${serviceCode}: No valid queries, skipping`,
      });
      return;
    }
    try {
      await cw.getMetricData(
        new Date(Date.now() - 15 * 60 * 1000),
        new Date(),
        queries
      );
      validatedQuotas.push(...batch);
      logger.debug({
        label: this.moduleName,
        message: `Successfully processed Batch ${batchCount} for ${serviceCode}:`,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ValidationError") {
        await this.handleValidationError(
          error,
          batch,
          validatedQuotas,
          cw,
          batchCount,
          serviceCode,
          retryCount
        );
      } else {
        logger.error({
          label: this.moduleName,
          message: `Error processing batch ${batchCount} for ${serviceCode}: ${error}`,
        });
      }
    }
  }

  /**
   * @description Handles validation errors encountered during batch processing of service quotas.
   * @param error The error object thrown during validation.
   * @param batch The batch of ServiceQuota objects being processed when the error occurred.
   * @param validatedQuotas An array to store the validated quotas.
   * @param cw CloudWatchHelper instance for making CloudWatch API calls.
   * @param batchCount The current batch number for logging purposes.
   * @param serviceCode The service code for the current batch, used for logging.
   */
  private async handleValidationError(
    error: Error,
    batch: ServiceQuota[],
    validatedQuotas: ServiceQuota[],
    cw: CloudWatchHelper,
    batchCount: number,
    serviceCode?: string,
    retryCount: number = 0
  ) {
    logger.warn({
      label: this.moduleName,
      message: `Batch ${batchCount} for ${serviceCode}: Error validating quotas: ${error.message}`,
    });
    const MAX_RETRIES = 5;
    const problematicMetric = this.extractProblematicMetric(error.message);
    logger.debug({
      label: this.moduleName,
      message: `Extracted problematic metric: ${problematicMetric}`,
    });
    if (problematicMetric) {
      const { problematicQuota, updatedBatch } = this.removeProblematicQuota(
        batch,
        problematicMetric
      );
      // Log the skipping of the problematic quota and process the updated batch
      if (problematicQuota) {
        logger.info({
          label: this.moduleName,
          message: `Since Quota ${problematicQuota.QuotaCode} for ${serviceCode} is not compatible with SERVICE_QUOTA() function, removing it and retrying the batch.`,
        });
        if (updatedBatch.length > 0 && retryCount < MAX_RETRIES) {
          logger.info({
            label: this.moduleName,
            message: `Retrying batch ${batchCount} for ${serviceCode} with ${
              updatedBatch.length
            } remaining quotas. Retry attempt ${
              retryCount + 1
            } of ${MAX_RETRIES}`,
          });
          await this.processBatch(
            updatedBatch,
            validatedQuotas,
            cw,
            batchCount,
            serviceCode,
            retryCount + 1
          );
        } else {
          logger.warn({
            label: this.moduleName,
            message: `Max retries reached or no progress made. Skipping remaining quotas in this batch for ${serviceCode}.`,
          });
        }
      } else {
        logger.warn({
          label: this.moduleName,
          message: `Could not identify a problematic quota to remove. Skipping remaining quotas in this batch for ${serviceCode}.`,
        });
      }
    } else {
      logger.warn({
        label: this.moduleName,
        message: `Unable to extract problematic metric. Skipping remaining quotas in this batch for ${serviceCode}.`,
      });
    }
  }

  /**
   * @description Extracts the problematic metric identifier from an error message.
   * @param errorMessage The error message string to parse.
   * @returns The extracted metric identifier, or null if not found.
   */
  private extractProblematicMetric(errorMessage: string): string | null {
    // This regex pattern is designed to safely extract metric names while preventing potential DoS attacks
    // caused by catastrophic backtracking.
    const MAX_LENGTH = 1000;
    if (errorMessage.length > MAX_LENGTH) {
      logger.warn({
        label: this.moduleName,
        message: `Error message exceeds maximum length of ${MAX_LENGTH} characters. Truncating.`,
      });
      errorMessage = errorMessage.slice(0, MAX_LENGTH);
    }

    const pattern = /\b([a-z0-9]+(?:_[a-z0-9]+){4,5}(?:_pct_utilization)?)\b/;
    const match = errorMessage.match(pattern);

    return match && match[1] ? match[1] : null;
  }

  /**
   * @description Removes a problematic quota from a batch based on the problematic metric.
   * @param batch An array of ServiceQuota objects to search.
   * @param problematicMetric The identifier of the problematic metric.
   * @returns An object containing the problematic quota (if found) and the updated batch without it.
   */
  private removeProblematicQuota(
    batch: ServiceQuota[],
    problematicMetric: string
  ): {
    problematicQuota: ServiceQuota | undefined;
    updatedBatch: ServiceQuota[];
  } {
    const problematicQuota = batch.find(
      (q) =>
        q.UsageMetric &&
        (this.generateMetricQueryId(q.UsageMetric, q.QuotaCode) ===
          problematicMetric ||
          `${this.generateMetricQueryId(
            q.UsageMetric,
            q.QuotaCode
          )}_pct_utilization` === problematicMetric)
    );
    const updatedBatch = batch.filter(
      (q) =>
        q.UsageMetric &&
        this.generateMetricQueryId(q.UsageMetric, q.QuotaCode) !==
          problematicMetric &&
        `${this.generateMetricQueryId(
          q.UsageMetric,
          q.QuotaCode
        )}_pct_utilization` !== problematicMetric
    );
    return { problematicQuota, updatedBatch };
  }

  /**
   * @description Generates CloudWatch metric data queries for quotas that have usage metrics
   * @param quotas An array of ServiceQuota objects to generate queries for
   * @returns An array of MetricDataQuery objects for CloudWatch
   */
  private generateCWQueriesForQuotas(
    quotas: ServiceQuota[]
  ): MetricDataQuery[] {
    const queries: MetricDataQuery[] = [];
    for (const quota of quotas) {
      if (quota.UsageMetric) {
        queries.push(...this.generateCWQuery(quota, 300));
      }
    }
    return queries;
  }

  /**
   * @description method to make data query to fetch quota utilization
   * @param quota - quota for which cw query needs to be generated
   * @param period - period to apply metric statistic
   * @returns
   */
  @catchDecorator(UnsupportedQuotaException, true)
  generateCWQuery(quota: ServiceQuota, period: number) {
    logger.debug({
      label: this.moduleName,
      message: `generating cw query for quota ${quota.QuotaCode}`,
    });

    this.validateQuotaHasUsageMetrics(quota);
    const usageQuery = this.generateUsageQuery(
      <MetricInfo>quota.UsageMetric,
      period,
      quota.QuotaCode
    );
    const percentageUsageQuery = this.generatePercentageUtilizationQuery(
      <string>usageQuery.Id
    );
    logger.debug({
      label: this.moduleName,
      message: `${JSON.stringify({
        usageQuery: usageQuery,
        percentageUsageQuery: percentageUsageQuery,
      })}`,
    });
    return [usageQuery, percentageUsageQuery];
  }

  /**
   * @description validates if given quota supports usage metrics
   * @param quota
   */
  private validateQuotaHasUsageMetrics(quota: ServiceQuota) {
    if (
      !quota.UsageMetric ||
      !quota.UsageMetric.MetricNamespace ||
      !quota.UsageMetric.MetricName ||
      !quota.UsageMetric.MetricDimensions ||
      !quota.UsageMetric.MetricStatisticRecommendation
    )
      throw new UnsupportedQuotaException(
        `${quota.QuotaCode} for ${quota.ServiceName} does not currently support utilization monitoring`
      );
  }

  /**
   * generates a metric query id with a pattern, so that it can be used again
   * @param metricInfo
   * @param quotaCode
   */
  public generateMetricQueryId(
    metricInfo: MetricInfo,
    quotaCode: string | undefined
  ): string {
    logger.debug({
      label: `generateMetricQueryId/metricInfo`,
      message: JSON.stringify(metricInfo),
    });
    const service = (metricInfo.MetricDimensions?.Service || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const resource = (metricInfo.MetricDimensions?.Resource || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const classValue = (metricInfo.MetricDimensions?.Class || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const type = (metricInfo.MetricDimensions?.Type || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    const code = (quotaCode || "").toLowerCase().replace(/[^a-z0-9_]/g, "");

    const metricQueryId = `${service}_${resource}_${classValue}_${type}_${code}`;

    logger.debug({
      label: `generateMetricQueryId/result`,
      message: `Generated MetricQueryId: ${metricQueryId}`,
    });

    return metricQueryId;
  }

  /**
   * @description get usage query to fetch quota usage
   * @param metricInfo
   * @param period - period to apply metric statistic
   * @param quotaCode - the code which identifies the quota.
   * @returns
   */
  private generateUsageQuery(
    metricInfo: MetricInfo,
    period: number,
    quotaCode: string | undefined
  ) {
    const usageQuery: MetricDataQuery = {
      Id: this.generateMetricQueryId(metricInfo, quotaCode),
      MetricStat: {
        Metric: {
          Namespace: metricInfo.MetricNamespace,
          MetricName: metricInfo.MetricName,
          Dimensions: Object.entries(
            metricInfo.MetricDimensions as Record<string, string>
          ).map(([key, value]) => {
            return { Name: key, Value: value };
          }),
        },
        Period: period,
        Stat: metricInfo.MetricStatisticRecommendation,
      },
      ReturnData: false,
    };
    return usageQuery;
  }

  /**
   * @description generates quota percentage utilization against current applied quota
   * @param usageQueryId cw query id that fetches usage metric
   * @returns
   */
  private generatePercentageUtilizationQuery(usageQueryId: string) {
    const percentageUtilizationQuery: MetricDataQuery = {
      Id: `${usageQueryId}_pct_utilization`,
      Expression: `(${usageQueryId}/SERVICE_QUOTA(${usageQueryId}))*100`,
      ReturnData: true,
    };
    return percentageUtilizationQuery;
  }
}
