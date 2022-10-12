import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  ListServiceQuotasCommand,
  ServiceQuota,
  ServiceQuotasClient,
} from "@aws-sdk/client-service-quotas";

import { ServiceQuotasHelper } from "../lib/servicequotas";
import { SQ_SERVICE_CODES } from "../lib/services";
import { IncorrectConfigurationException } from "../lib/error";

jest.mock("../lib/cloudwatch", () => {
  const getMetricDataMock = { getMetricData: jest.fn().mockReturnValue([]) };
  return { CloudWatchHelper: jest.fn(() => getMetricDataMock) };
});

describe("Service Quotas Helper", () => {
  const sqMock = mockClient(ServiceQuotasClient);
  let sqHelper: ServiceQuotasHelper;

  beforeEach(() => {
    sqMock.reset();
    sqHelper = new ServiceQuotasHelper();
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

    const response = await sqHelper.getQuotaList(SQ_SERVICE_CODES.EC2);

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

  it("should throw an exception if no quotas found", async () => {
    let error: Error | undefined;
    try {
      await sqHelper.getQuotasWithUtilizationMetrics([]);
    } catch (err) {
      error = err;
    }

    expect(error).toEqual(
      new IncorrectConfigurationException("no quotas found")
    );
  });
});
