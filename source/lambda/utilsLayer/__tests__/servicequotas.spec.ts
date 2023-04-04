// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  ListServicesCommand,
  ListServiceQuotasCommand,
  ServiceQuota,
  ServiceQuotasClient,
} from "@aws-sdk/client-service-quotas";

import { ServiceQuotasHelper } from "../lib/servicequotas";

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
});
