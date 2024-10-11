// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  ListServicesCommand,
  ListServiceQuotasCommand,
  ServiceQuota,
  ServiceQuotasClient,
  MetricInfo,
} from "@aws-sdk/client-service-quotas";

import { ServiceQuotasHelper } from "../lib/servicequotas";
import { CloudWatchHelper } from "../lib/cloudwatch";
import { logger } from "../lib/logger";
import { UnsupportedQuotaException } from "../lib/error";

jest.mock("../lib/cloudwatch", () => {
  const getMetricDataMock = { getMetricData: jest.fn().mockReturnValue([]) };
  return { CloudWatchHelper: jest.fn(() => getMetricDataMock) };
});

// Mock the logger
jest.mock("../lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("Service Quotas Helper", () => {
  const sqMock = mockClient(ServiceQuotasClient);
  let sqHelper: ServiceQuotasHelper;

  beforeEach(() => {
    sqMock.reset();
    sqHelper = new ServiceQuotasHelper();
    jest.clearAllMocks();
  });

  it("should get the list of services", async () => {
    sqMock.on(ListServicesCommand).resolves({
      Services: [
        {
          ServiceCode: "codepipeline",
          ServiceName: "AWS CodePipeline",
        },
        {
          ServiceCode: "ec2",
          ServiceName: "Amazon Elastic Compute Cloud (Amazon EC2)",
        },
        {
          ServiceCode: "elasticache",
          ServiceName: "Amazon ElastiCache",
        },
        {
          ServiceCode: undefined,
          ServiceName: undefined,
        },
      ],
    });

    const expectedResponse = ["codepipeline", "ec2", "elasticache"];

    const response = await sqHelper.getServiceCodes();

    expect(response).toEqual(expectedResponse);
  });

  it("should get the Quota List", async () => {
    sqMock.on(ListServiceQuotasCommand).resolves({
      Quotas: [
        {
          QuotaName: "Quota 1",
          UsageMetric: {
            MetricNamespace: "AWS/Usage",
          },
        },
        {
          QuotaName: "Quota 2",
          UsageMetric: {
            MetricNamespace: "AWS/Usage",
          },
        },
        {
          QuotaName: "Quota 3",
          UsageMetric: {
            MetricNamespace: "AWS/Other",
          },
        },
        {
          QuotaName: "Quota 4",
          UsageMetric: {
            MetricNamespace: "AWS/Usage",
          },
        },
      ],
    });

    const expectedResponse = [
      {
        QuotaName: "Quota 1",
        UsageMetric: {
          MetricNamespace: "AWS/Usage",
        },
      },
      {
        QuotaName: "Quota 2",
        UsageMetric: {
          MetricNamespace: "AWS/Usage",
        },
      },
      {
        QuotaName: "Quota 4",
        UsageMetric: {
          MetricNamespace: "AWS/Usage",
        },
      },
    ];

    const response = await sqHelper.getQuotaList("ec2");

    expect(response).toEqual(expectedResponse);
  });

  it("should get quotas with utilization metrics", async () => {
    const quotas: ServiceQuota[] = [];

    for (let i = 1; i < 3; i++) {
      quotas.push({
        ServiceName: `service${i}`,
        UsageMetric: {
          MetricNamespace: `namespace${i}`,
          MetricName: `name${i}`,
          MetricDimensions: {
            Service: `service${i}`,
            Resource: `resource${i}`,
            Type: `type${i}`,
            Class: `class${i}`,
          },
          MetricStatisticRecommendation: `statisticrecommendation${i}`,
        },
      });
    }

    const response = await sqHelper.getQuotasWithUtilizationMetrics(quotas);

    expect(response).toEqual(quotas);
  });

  it("should ignore unsupported quotas", async () => {
    const quotas: ServiceQuota[] = [];

    for (let i = 1; i < 3; i++) {
      quotas.push({
        ServiceName: `service${i}`,
      });
    }
    const response = await sqHelper.getQuotasWithUtilizationMetrics(quotas);

    expect(response).toEqual([]);
  });

  it("should work with empty list argument", async () => {
    const response = await sqHelper.getQuotasWithUtilizationMetrics([]);
    expect(response).toEqual([]);
  });

  describe("getQuotasWithUtilizationMetrics", () => {
    it("should process quotas in batches", async () => {
      const quotas: ServiceQuota[] = Array(150).fill({
        QuotaCode: "TestQuota",
        ServiceName: "TestService",
        UsageMetric: {
          MetricNamespace: "AWS/Usage",
          MetricName: "TestMetric",
          MetricDimensions: {
            Service: "TestService",
            Type: "Resource",
            Resource: "TestResource",
          },
          MetricStatisticRecommendation: "Maximum",
        },
      });

      const processBatchSpy = jest
        .spyOn(sqHelper as any, "processBatch")
        .mockResolvedValue(undefined);

      await sqHelper.getQuotasWithUtilizationMetrics(quotas, "testService");

      expect(processBatchSpy).toHaveBeenCalledTimes(2); // 150 quotas / 100 batch size = 2 batches
    });

    it("should handle empty quota list", async () => {
      const result = await sqHelper.getQuotasWithUtilizationMetrics(
        [],
        "testService"
      );
      expect(result).toEqual([]);
    });
  });

  describe("processBatch", () => {
    it("should skip processing if no valid queries", async () => {
      const batch: ServiceQuota[] = [{ QuotaCode: "TestQuota" }];
      const validatedQuotas: ServiceQuota[] = [];
      const cwMock = new CloudWatchHelper();

      const generateQueriesSpy = jest
        .spyOn(sqHelper as any, "generateCWQueriesForQuotas")
        .mockReturnValue([]);

      await (sqHelper as any).processBatch(
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService"
      );

      expect(generateQueriesSpy).toHaveBeenCalledTimes(1);
      expect(cwMock.getMetricData).not.toHaveBeenCalled();
      expect(validatedQuotas).toHaveLength(0);
    });

    it("should log an error when a non-ValidationError occurs", async () => {
      const batch: ServiceQuota[] = [{ QuotaCode: "TestQuota" }];
      const validatedQuotas: ServiceQuota[] = [];
      const cwMock = new CloudWatchHelper();
      const error = new Error("Non-validation error");

      jest
        .spyOn(sqHelper as any, "generateCWQueriesForQuotas")
        .mockReturnValue([{}]);
      cwMock.getMetricData = jest.fn().mockRejectedValue(error);

      const loggerErrorSpy = jest.spyOn(logger, "error");

      await (sqHelper as any).processBatch(
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService"
      );

      expect(loggerErrorSpy).toHaveBeenCalledWith({
        label: expect.any(String),
        message: `Error processing batch 1 for testService: ${error}`,
      });
    });

    it("should handle ValidationError", async () => {
      const batch: ServiceQuota[] = [
        {
          QuotaCode: "TestQuota",
          ServiceName: "TestService",
          UsageMetric: {
            MetricNamespace: "AWS/Usage",
            MetricName: "TestMetric",
            MetricDimensions: {
              Service: "TestService",
              Type: "Resource",
              Resource: "TestResource",
            },
            MetricStatisticRecommendation: "Maximum",
          },
        },
      ];
      const validatedQuotas: ServiceQuota[] = [];

      const validationError = new Error(
        "Error in expression 'test_metric_pct_utilization': Test error"
      );
      validationError.name = "ValidationError";

      const getMetricDataMock = jest.fn().mockRejectedValue(validationError);

      const cwMock: jest.Mocked<CloudWatchHelper> = {
        getMetricData: getMetricDataMock,
      } as any;

      jest
        .spyOn(sqHelper as any, "generateCWQueriesForQuotas")
        .mockReturnValue([{}]);
      const handleValidationErrorSpy = jest.spyOn(
        sqHelper as any,
        "handleValidationError"
      );
      jest
        .spyOn(sqHelper as any, "extractProblematicMetric")
        .mockReturnValue("test_metric");
      jest.spyOn(sqHelper as any, "removeProblematicQuota").mockReturnValue({
        problematicQuota: batch[0],
        updatedBatch: [],
      });

      await (sqHelper as any).processBatch(
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService"
      );

      expect(getMetricDataMock).toHaveBeenCalledTimes(1);
      expect(handleValidationErrorSpy).toHaveBeenCalledTimes(1);
      expect(handleValidationErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ValidationError",
          message: expect.stringContaining(
            "Error in expression 'test_metric_pct_utilization'"
          ),
        }),
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService",
        0
      );
    });
  });

  describe("extractProblematicMetric", () => {
    it("should return null if no metric is found in the error message", () => {
      const errorMessage = "Some other error without a metric";
      const result = (sqHelper as any).extractProblematicMetric(errorMessage);
      expect(result).toBeNull();
    });

    it("should extract the problematic metric from the error message with _pct_utilization", () => {
      const errorMessage =
        "Error in expression 'service_resource_none_type_quotacode_pct_utilization': Some error";
      const result = (sqHelper as any).extractProblematicMetric(errorMessage);
      expect(result).toBe(
        "service_resource_none_type_quotacode_pct_utilization"
      );
    });

    it("should extract the problematic metric from the error message without _pct_utilization", () => {
      const errorMessage =
        "Error in expression 'service_resource_none_type_quotacode': Some error";
      const result = (sqHelper as any).extractProblematicMetric(errorMessage);
      expect(result).toBe("service_resource_none_type_quotacode");
    });

    it("should handle error messages with multiple matching patterns", () => {
      const errorMessage =
        "Error in expression 'service_resource_none_type_quotacode_pct_utilization' and 'another_service_resource_none_type_quotacode': Some error";
      const result = (sqHelper as any).extractProblematicMetric(errorMessage);
      expect(result).toBe(
        "service_resource_none_type_quotacode_pct_utilization"
      );
    });
  });

  describe("handleValidationError", () => {
    it("should retry processing with updated batch when problematic quota is removed", async () => {
      const batch: ServiceQuota[] = [
        {
          QuotaCode: "GoodQuota",
          UsageMetric: { MetricNamespace: "AWS/Usage" },
        },
        {
          QuotaCode: "BadQuota",
          UsageMetric: { MetricNamespace: "AWS/Usage" },
        },
      ];
      const validatedQuotas: ServiceQuota[] = [];
      const cwMock = new CloudWatchHelper();

      jest
        .spyOn(sqHelper as any, "extractProblematicMetric")
        .mockReturnValue("bad_metric");
      jest.spyOn(sqHelper as any, "removeProblematicQuota").mockReturnValue({
        problematicQuota: {
          QuotaCode: "BadQuota",
          UsageMetric: { MetricNamespace: "AWS/Usage" },
        },
        updatedBatch: [
          {
            QuotaCode: "GoodQuota",
            UsageMetric: { MetricNamespace: "AWS/Usage" },
          },
        ],
      });
      const processBatchSpy = jest
        .spyOn(sqHelper as any, "processBatch")
        .mockResolvedValue(undefined);

      await (sqHelper as any).handleValidationError(
        new Error("Test error"),
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService",
        0
      );

      expect(processBatchSpy).toHaveBeenCalledWith(
        [
          {
            QuotaCode: "GoodQuota",
            UsageMetric: { MetricNamespace: "AWS/Usage" },
          },
        ],
        validatedQuotas,
        cwMock,
        1,
        "testService",
        1
      );
    });

    it("should not retry processing when max retries are reached", async () => {
      const batch: ServiceQuota[] = [
        {
          QuotaCode: "BadQuota",
          UsageMetric: { MetricNamespace: "AWS/Usage" },
        },
      ];
      const validatedQuotas: ServiceQuota[] = [];
      const cwMock = new CloudWatchHelper();

      jest
        .spyOn(sqHelper as any, "extractProblematicMetric")
        .mockReturnValue("bad_metric");
      jest.spyOn(sqHelper as any, "removeProblematicQuota").mockReturnValue({
        problematicQuota: {
          QuotaCode: "BadQuota",
          UsageMetric: { MetricNamespace: "AWS/Usage" },
        },
        updatedBatch: [],
      });
      const processBatchSpy = jest.spyOn(sqHelper as any, "processBatch");

      await (sqHelper as any).handleValidationError(
        new Error("Test error"),
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService",
        5
      );

      expect(processBatchSpy).not.toHaveBeenCalled();
    });

    it("should log a warning when no problematic quota is identified", async () => {
      const batch: ServiceQuota[] = [{ QuotaCode: "TestQuota" }];
      const validatedQuotas: ServiceQuota[] = [];
      const cwMock = new CloudWatchHelper();
      const error = new Error("Test error");

      jest
        .spyOn(sqHelper as any, "extractProblematicMetric")
        .mockReturnValue("test_metric");
      jest.spyOn(sqHelper as any, "removeProblematicQuota").mockReturnValue({
        problematicQuota: undefined,
        updatedBatch: batch,
      });

      const loggerWarnSpy = jest.spyOn(logger, "warn");

      await (sqHelper as any).handleValidationError(
        error,
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService",
        0
      );

      expect(loggerWarnSpy).toHaveBeenCalledWith({
        label: expect.any(String),
        message:
          "Could not identify a problematic quota to remove. Skipping remaining quotas in this batch for testService.",
      });
    });

    it("should log a warning when unable to extract problematic metric", async () => {
      const batch: ServiceQuota[] = [{ QuotaCode: "TestQuota" }];
      const validatedQuotas: ServiceQuota[] = [];
      const cwMock = new CloudWatchHelper();
      const error = new Error("Test error");

      jest
        .spyOn(sqHelper as any, "extractProblematicMetric")
        .mockReturnValue(null);

      const loggerWarnSpy = jest.spyOn(logger, "warn");

      await (sqHelper as any).handleValidationError(
        error,
        batch,
        validatedQuotas,
        cwMock,
        1,
        "testService",
        0
      );

      expect(loggerWarnSpy).toHaveBeenCalledWith({
        label: expect.any(String),
        message:
          "Unable to extract problematic metric. Skipping remaining quotas in this batch for testService.",
      });
    });
  });

  describe("removeProblematicQuota", () => {
    it("should remove the problematic quota from the batch", () => {
      const batch: ServiceQuota[] = [
        {
          QuotaCode: "GoodQuota",
          UsageMetric: {
            MetricDimensions: {
              Service: "service",
              Resource: "resource",
              Class: "class",
              Type: "type",
            },
          },
        },
        {
          QuotaCode: "BadQuota",
          UsageMetric: {
            MetricDimensions: {
              Service: "service",
              Resource: "resource",
              Class: "class",
              Type: "type",
            },
          },
        },
      ];

      jest
        .spyOn(sqHelper, "generateMetricQueryId")
        .mockImplementation((_metricInfo, quotaCode) => {
          if (quotaCode === "GoodQuota") return "good_metric";
          if (quotaCode === "BadQuota") return "bad_metric";
          return "";
        });

      const result = (sqHelper as any).removeProblematicQuota(
        batch,
        "bad_metric"
      );

      expect(result.problematicQuota).toBeDefined();
      expect(result.problematicQuota?.QuotaCode).toBe("BadQuota");
      expect(result.updatedBatch).toHaveLength(1);
      expect(result.updatedBatch[0].QuotaCode).toBe("GoodQuota");
    });

    it("should handle when no problematic quota is found", () => {
      const batch: ServiceQuota[] = [
        {
          QuotaCode: "GoodQuota1",
          UsageMetric: {
            MetricDimensions: {
              Service: "service",
              Resource: "resource",
              Class: "class",
              Type: "type",
            },
          },
        },
        {
          QuotaCode: "GoodQuota2",
          UsageMetric: {
            MetricDimensions: {
              Service: "service",
              Resource: "resource",
              Class: "class",
              Type: "type",
            },
          },
        },
      ];

      jest
        .spyOn(sqHelper as any, "generateMetricQueryId")
        .mockReturnValue("good_metric");

      const result = (sqHelper as any).removeProblematicQuota(
        batch,
        "bad_metric"
      );

      expect(result.problematicQuota).toBeUndefined();
      expect(result.updatedBatch).toHaveLength(2);
    });
  });

  describe("generateMetricQueryId", () => {
    it("should generate a correct metric query ID", () => {
      const metricInfo: MetricInfo = {
        MetricDimensions: {
          Service: "TestService",
          Resource: "TestResource",
          Class: "TestClass",
          Type: "TestType",
        },
      };
      const quotaCode = "TestQuotaCode";

      const result = sqHelper.generateMetricQueryId(metricInfo, quotaCode);

      expect(result).toBe(
        "testservice_testresource_testclass_testtype_testquotacode"
      );
    });

    it("should handle missing dimensions", () => {
      const metricInfo: MetricInfo = {
        MetricDimensions: {
          Service: "TestService",
          Resource: "TestResource",
        },
      };
      const quotaCode = "TestQuotaCode";

      const result = sqHelper.generateMetricQueryId(metricInfo, quotaCode);

      expect(result).toBe("testservice_testresource___testquotacode");
    });

    it("should handle undefined quotaCode", () => {
      const metricInfo: MetricInfo = {
        MetricDimensions: {
          Service: "TestService",
          Resource: "TestResource",
          Class: "TestClass",
          Type: "TestType",
        },
      };

      const result = sqHelper.generateMetricQueryId(metricInfo, undefined);

      expect(result).toBe("testservice_testresource_testclass_testtype_");
    });
  });

  describe("validateQuotaHasUsageMetrics", () => {
    it("should throw UnsupportedQuotaException for quota without usage metrics", () => {
      const invalidQuota: ServiceQuota = {
        QuotaCode: "TestQuota",
        ServiceName: "TestService",
        // UsageMetric is missing
      };

      expect(() =>
        (sqHelper as any).validateQuotaHasUsageMetrics(invalidQuota)
      ).toThrow(UnsupportedQuotaException);
      expect(() =>
        (sqHelper as any).validateQuotaHasUsageMetrics(invalidQuota)
      ).toThrow(
        "TestQuota for TestService does not currently support utilization monitoring"
      );
    });

    it("should not throw for valid quota with usage metrics", () => {
      const validQuota: ServiceQuota = {
        QuotaCode: "TestQuota",
        ServiceName: "TestService",
        UsageMetric: {
          MetricNamespace: "AWS/Usage",
          MetricName: "TestMetric",
          MetricDimensions: {
            Service: "TestService",
          },
          MetricStatisticRecommendation: "Maximum",
        },
      };

      expect(() =>
        (sqHelper as any).validateQuotaHasUsageMetrics(validQuota)
      ).not.toThrow();
    });
  });
});
