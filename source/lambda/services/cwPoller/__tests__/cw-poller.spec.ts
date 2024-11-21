// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  createQuotaUtilizationEvents,
  generateCWQueriesForAllQuotas,
  getCWDataForQuotaUtilization,
  getQuotasForService,
  QUOTA_STATUS,
  sendQuotaUtilizationEventsToBridge,
  MetricQueryIdToQuotaMap,
} from "../exports";

import { UnsupportedEventException, ServiceQuotasHelper } from "solutions-utils";
import { handler } from "../index";
import { MetricDataQuery, MetricDataResult } from "@aws-sdk/client-cloudwatch";

const getMetricDataMock = jest.fn();
const queryQuotasForServiceMock = jest.fn();
const putEventMock = jest.fn();
const getAllEnabledServicesMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    CloudWatchHelper: function () {
      return {
        getMetricData: getMetricDataMock,
      };
    },
    DynamoDBHelper: function () {
      return {
        queryQuotasForService: queryQuotasForServiceMock,
        getAllEnabledServices: getAllEnabledServicesMock,
      };
    },
    EventsHelper: function () {
      return {
        putEvent: putEventMock,
      };
    },
  };
});

const serviceCodes = ["monitoring", "dynamodb", "ec2", "ecr", "firehose"];

const event = {
  "detail-type": "Scheduled Event",
};

const invalidEvent = {
  "detail-type": "Surprise Event",
};

const quota1 = {
  QuotaCode: "Quota1",
  QuotaName: "Quota 1",
  UsageMetric: {
    MetricNamespace: "AWS/Usage",
    MetricName: "ResourceCount",
    MetricDimensions: {
      Class: "None",
      Resource: "resource1",
      Service: "service1",
      Type: "Resource",
    },
    MetricStatisticRecommendation: "Maximum",
  },
};
const quota2 = {
  QuotaCode: "Quota2",
  QuotaName: "Quota 2",
  UsageMetric: {
    MetricNamespace: "AWS/Usage",
    MetricName: "ResourceCount",
    MetricDimensions: {
      Class: "None",
      Resource: "resource2",
      Service: "service2",
      Type: "Resource",
    },
    MetricStatisticRecommendation: "Maximum",
  },
};
const quotas = [quota1, quota2];
const usageQuery: MetricDataQuery = {
  Id: "id",
};
const percentageUsageQuery: MetricDataQuery = {
  Id: "id",
};
const cwQuery = [usageQuery, percentageUsageQuery];
const metric1: MetricDataResult = {
  Id: "service1_resource1_none_resource_quota1_pct_utilization",
  Label: "data label",
  Values: [100, 81, 10],
  StatusCode: "Complete",
  Timestamps: [new Date(1664386148), new Date(1664390148), new Date(1664396148)],
};
const metric2: MetricDataResult = {
  Id: "service2_resource2_none_resource_quota2_pct_utilization",
  Label: "data label",
  Values: [100, 81, 10],
  StatusCode: "Complete",
  Timestamps: [new Date(1664386148), new Date(1664390148), new Date(1664396148)],
};
const metricQueryIdToQuotaMap: MetricQueryIdToQuotaMap = {};
const metricId1 = metric1?.Id ?? "";
const metricId2 = metric2?.Id ?? "";
metricQueryIdToQuotaMap[metricId1.split("_pct_utilization")[0]] = quota1;
metricQueryIdToQuotaMap[metricId2.split("_pct_utilization")[0]] = quota2;

const utilizationEvents = [
  {
    status: QUOTA_STATUS.ERROR,
    "check-item-detail": {
      "Limit Code": "Quota1",
      "Limit Name": "Quota 1",
      Service: "service1",
      Resource: "resource1",
      Region: "us-east-1",
      "Current Usage": "100%",
      "Limit Amount": "100%",
      Timestamp: new Date(1664386148),
    },
  },
  {
    status: QUOTA_STATUS.WARN,
    "check-item-detail": {
      "Limit Code": "Quota1",
      "Limit Name": "Quota 1",
      Service: "service1",
      Resource: "resource1",
      Region: "us-east-1",
      "Current Usage": "81%",
      "Limit Amount": "100%",
      Timestamp: new Date(1664390148),
    },
  },
  {
    status: QUOTA_STATUS.OK,
    "check-item-detail": {
      "Limit Code": "Quota1",
      "Limit Name": "Quota 1",
      Service: "service1",
      Resource: "resource1",
      Region: "us-east-1",
      "Current Usage": "10%",
      "Limit Amount": "100%",
      Timestamp: new Date(1664396148),
    },
  },
];

describe("CWPoller", () => {
  beforeAll(async () => {
    process.env.POLLER_FREQUENCY = "rate(6 hours)";
    process.env.THRESHOLD = "80";
    process.env.AWS_REGION = "us-east-1";
    process.env.SQ_REPORT_OK_NOTIFICATIONS = "Yes";
    getMetricDataMock.mockResolvedValue([metric1, metric2]);
    queryQuotasForServiceMock.mockResolvedValue(quotas);
    putEventMock.mockResolvedValue({});
    getAllEnabledServicesMock.mockResolvedValue(serviceCodes);

    jest.spyOn(ServiceQuotasHelper.prototype, "generateCWQuery").mockReturnValue([usageQuery, percentageUsageQuery]);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should get quotas for the service", async () => {
    const expectedQuotas = [quota1, quota2];
    const quotas = await getQuotasForService("quotaTable", "ec2");

    expect(quotas).toEqual(expectedQuotas);
  });

  it("should get metric data queries for quotas", () => {
    const queries = generateCWQueriesForAllQuotas(quotas);

    expect(queries).toEqual([...cwQuery, ...cwQuery]);
  });

  it("should get cloud watch quota utilization for queries", async () => {
    const dataPoints = await getCWDataForQuotaUtilization([...cwQuery]);
    expect(getMetricDataMock).toHaveBeenCalledTimes(1);
    expect(dataPoints).toEqual([metric1, metric2]);
  });

  it("should get batch getMetricDatacalls for > 100 quota utilization queries", async () => {
    const batchQueries: MetricDataQuery[] = [];
    for (let i = 0; i < 51; i++) {
      batchQueries.push(...cwQuery);
    }
    const dataPoints = await getCWDataForQuotaUtilization(batchQueries);
    expect(getMetricDataMock).toHaveBeenCalledTimes(2);
    expect(dataPoints).toEqual([metric1, metric2, metric1, metric2]);
  });

  it("should create quota utilization events", () => {
    const events = createQuotaUtilizationEvents(metric1, metricQueryIdToQuotaMap);

    expect(events).toEqual(utilizationEvents);
  });

  it("should create only WARN AND ERROR quota utilization events when REPORT_OK_NOTIFICATIONS = No", () => {
    process.env.SQ_REPORT_OK_NOTIFICATIONS = "No";
    const events = createQuotaUtilizationEvents(metric1, metricQueryIdToQuotaMap);

    expect(events).toEqual(utilizationEvents.filter((m) => m.status != QUOTA_STATUS.OK));
  });

  it("should send quota utilization events to bridge", async () => {
    await sendQuotaUtilizationEventsToBridge("bridge", utilizationEvents);

    expect(putEventMock).toHaveBeenCalledTimes(1);
  });

  it("should handle a scheduled event", async () => {
    await handler(event);

    expect(putEventMock).toHaveBeenCalled();
  });

  it("should handle a scheduled event with 1-day frequency", async () => {
    process.env.POLLER_FREQUENCY = "rate(1 day)";
    await handler(event);

    expect(putEventMock).toHaveBeenCalled();
    // Check if the frequency is correctly interpreted as 24 hours
    expect(getMetricDataMock).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), expect.anything());
  });

  it("should return if no quotas are found", async () => {
    queryQuotasForServiceMock.mockResolvedValue([]);
    await handler(event);

    expect(putEventMock).not.toHaveBeenCalled();
  });

  it("should throw an exception if the event is of an unknown type", async () => {
    const testCase = async () => {
      await handler(invalidEvent);
    };

    await expect(testCase).rejects.toThrow(UnsupportedEventException);
  });
});
