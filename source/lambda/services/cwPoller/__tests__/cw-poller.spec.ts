import {
  createQuotaUtilizationEvents,
  generateCWQueriesForAllQuotas,
  getCWDataForQuotaUtilization,
  getQuotasForService,
  QUOTA_STATUS,
  sendQuotaUtilizationEventsToBridge,
} from "../exports";

import { SQ_SERVICE_CODES, UnsupportedEventException } from "solutions-utils";
import { handler } from "../index";

const getMetricDataMock = jest.fn();
const queryQuotasForServiceMock = jest.fn();
const putEventMock = jest.fn();
const generateCWQueryMock = jest.fn();

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
      };
    },
    EventsHelper: function () {
      return {
        putEvent: putEventMock,
      };
    },
    ServiceQuotasHelper: function () {
      return {
        generateCWQuery: generateCWQueryMock,
      };
    },
  };
});

const event = {
  "detail-type": "Scheduled Event",
};

const invalidEvent = {
  "detail-type": "Surprise Event",
};

const quota1 = {
  QuotaName: "Quota 1",
  UsageMetric: {
    MetricNamespace: "AWS/Usage",
  },
};
const quota2 = {
  QuotaName: "Quota 2",
  UsageMetric: {
    MetricNamespace: "AWS/Usage",
  },
};
const quotas = [quota1, quota2];
const usageQuery = {
  Id: "id",
};
const percentageUsageQuery = {
  Id: "id",
};
const cwQuery = [usageQuery, percentageUsageQuery];
const metric = {
  Id: "service_quota_pct_utilization",
  Label: "data label",
  Values: [100, 81, 10],
  StatusCode: "Complete",
  Timestamps: [
    new Date(1664386148),
    new Date(1664390148),
    new Date(1664396148),
  ],
};

const utilizationEvents = [
  {
    status: QUOTA_STATUS.ERROR,
    "check-item-detail": {
      "Limit Name": "quota",
      Service: "service",
      Region: "us-east-1",
      "Current Usage": "100",
      "Limit Amount": "100",
      Timestamp: new Date(1664386148),
    },
  },
  {
    status: QUOTA_STATUS.WARN,
    "check-item-detail": {
      "Limit Name": "quota",
      Service: "service",
      Region: "us-east-1",
      "Current Usage": "81",
      "Limit Amount": "100",
      Timestamp: new Date(1664390148),
    },
  },
  {
    status: QUOTA_STATUS.OK,
    "check-item-detail": {
      "Limit Name": "quota",
      Service: "service",
      Region: "us-east-1",
      "Current Usage": "10",
      "Limit Amount": "100",
      Timestamp: new Date(1664396148),
    },
  },
];

describe("CWPoller", () => {
  beforeAll(async () => {
    process.env.POLLER_FREQUENCY = "rate(6 hours)";
    process.env.THRESHOLD = "80";
    process.env.AWS_REGION = "us-east-1";
    getMetricDataMock.mockResolvedValue([metric, metric]);
    queryQuotasForServiceMock.mockResolvedValue(quotas);
    putEventMock.mockResolvedValue({});
    generateCWQueryMock.mockReturnValue([usageQuery, percentageUsageQuery]);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should get quotas for the service", async () => {
    const expectedQuotas = [quota1, quota2];
    const quotas = await getQuotasForService(
      "quotaTable",
      SQ_SERVICE_CODES.EC2
    );

    expect(quotas).toEqual(expectedQuotas);
  });

  it("should get metric data queries for quotas", () => {
    const queries = generateCWQueriesForAllQuotas(quotas);

    expect(queries).toEqual([...cwQuery, ...cwQuery]);
  });

  it("should get cloud watch quota utilization for queries", async () => {
    const dataPoints = await getCWDataForQuotaUtilization([...cwQuery]);

    expect(dataPoints).toEqual([metric, metric]);
  });

  it("should create quota utilization events", () => {
    const events = createQuotaUtilizationEvents(metric);

    expect(events).toEqual(utilizationEvents);
  });

  it("should send quota utilizations to bridge", async () => {
    await sendQuotaUtilizationEventsToBridge("bridge", utilizationEvents);

    expect(putEventMock).toHaveBeenCalledTimes(1);
  });

  it("should handle a scheduled event", async () => {
    await handler(event);

    expect(putEventMock).toHaveBeenCalled();
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
