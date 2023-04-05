// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler } from "../index";
import {
  putServiceMonitoringStatus,
  getServiceMonitoringStatus,
  readDynamoDBStreamEvent,
  putQuotasForService,
  deleteQuotasForService,
  handleDynamoDBStreamEvent,
} from "../exports";

import {
  IncorrectConfigurationException,
  UnsupportedEventException,
} from "solutions-utils";

const getItemMock = jest.fn();
const putItemMock = jest.fn();
const queryQuotasForServiceMock = jest.fn();
const batchDeleteMock = jest.fn();
const getServiceCodesMock = jest.fn();
const getQuotaListMock = jest.fn();
const getQuotasWithUtilizationMetricsMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    DynamoDBHelper: function () {
      return {
        getItem: getItemMock,
        putItem: putItemMock,
        queryQuotasForService: queryQuotasForServiceMock,
        batchDelete: batchDeleteMock,
      };
    },
    ServiceQuotasHelper: function () {
      return {
        getServiceCodes: getServiceCodesMock,
        getQuotaList: getQuotaListMock,
        getQuotasWithUtilizationMetrics: getQuotasWithUtilizationMetricsMock,
      };
    },
  };
});

const serviceCodes = ["monitoring", "dynamodb", "ec2", "ecr", "firehose"];

const quota1 = {
  QuotaName: "Quota 1",
  UsageMetric: {
    MetricNamespace: "AWS/Usage",
  },
  Monitored: false,
};
const quota2 = {
  QuotaName: "Quota 2",
  UsageMetric: {
    MetricNamespace: "AWS/Usage",
  },
  Monitored: true,
};
const quotas = [quota1, quota2];

const insertEvent = {
  Records: [
    {
      eventName: "INSERT",
      dynamodb: {
        NewImage: {
          ServiceCode: {
            S: "ec2",
          },
          Monitored: {
            BOOL: "Bool",
          },
        },
      },
    },
  ],
};

const modifyEvent = {
  Records: [
    {
      eventName: "MODIFY",
      dynamodb: {
        NewImage: {
          ServiceCode: {
            S: "ec2",
          },
          Monitored: {
            BOOL: "true",
          },
        },
        OldImage: {
          ServiceCode: {
            S: "ec2",
          },
          Monitored: {
            BOOL: "false",
          },
        },
      },
    },
  ],
};

const removeEvent = {
  Records: [
    {
      eventName: "REMOVE",
      dynamodb: {
        OldImage: {
          ServiceCode: {
            S: "ec2",
          },
        },
      },
    },
  ],
};

describe("Quota List Manager Exports", () => {
  beforeAll(() => {
    getItemMock.mockResolvedValue(undefined);
    putItemMock.mockResolvedValue({});
    queryQuotasForServiceMock.mockResolvedValue(quotas);
    batchDeleteMock.mockResolvedValue({});
    getServiceCodesMock.mockResolvedValue(serviceCodes);
    getQuotaListMock.mockResolvedValue(quotas);
    getQuotasWithUtilizationMetricsMock.mockResolvedValue(quotas);

    process.env.SQ_SERVICE_TABLE = "dbTable";
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should should put the service monitoring status if it doesn't exist", async () => {
    await putServiceMonitoringStatus();

    expect(getServiceCodesMock).toHaveBeenCalledTimes(1);
    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledTimes(5);
  });

  it("should should not put the service monitoring status if it already exists", async () => {
    getItemMock.mockResolvedValueOnce({});
    await putServiceMonitoringStatus();

    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledTimes(4);
  });

  it("should get service monitoring status", async () => {
    getItemMock.mockResolvedValue({ Status: "Green" });
    const statusItems = await getServiceMonitoringStatus();

    const expectedItems = [
      { Status: "Green" },
      { Status: "Green" },
      { Status: "Green" },
      { Status: "Green" },
      { Status: "Green" },
    ];

    expect(statusItems).toEqual(expectedItems);
  });

  it("should read the dynamo DB Stream INSERT event", () => {
    const operationType = readDynamoDBStreamEvent(insertEvent);

    expect(operationType).toEqual("INSERT");
  });

  it("should throw an exception if more than one record is received", () => {
    const event = {
      Records: [
        {
          eventName: "INSERT",
        },
        {
          eventName: "INSERT",
        },
      ],
    };

    const testCase = () => {
      readDynamoDBStreamEvent(event);
    };

    expect(testCase).toThrow(IncorrectConfigurationException);
  });

  it("should throw an exception if INSERT event is misconfigured", () => {
    const event = {
      Records: [
        {
          eventName: "INSERT",
        },
      ],
    };

    const testCase = () => {
      readDynamoDBStreamEvent(event);
    };

    expect(testCase).toThrow(IncorrectConfigurationException);
  });

  it("should read the dynamo DB Stream MODIFY event", () => {
    const operationType = readDynamoDBStreamEvent(modifyEvent);

    expect(operationType).toEqual("MODIFY");
  });

  it("should throw an exception if MODIFY event is misconfigured", () => {
    const event = {
      Records: [
        {
          eventName: "MODIFY",
          dynamodb: {
            NewImage: {
              Monitored: {
                BOOL: "true",
              },
            },
            OldImage: {
              Monitored: {
                BOOL: "true",
              },
            },
          },
        },
      ],
    };

    const testCase = () => {
      readDynamoDBStreamEvent(event);
    };

    expect(testCase).toThrow(IncorrectConfigurationException);
  });

  it("should read the dynamo DB Stream REMOVE event", () => {
    const operationType = readDynamoDBStreamEvent(removeEvent);

    expect(operationType).toEqual("REMOVE");
  });

  it("should throw an exception if REMOVE event is misconfigured", () => {
    const event = {
      Records: [
        {
          eventName: "REMOVE",
        },
      ],
    };

    const testCase = () => {
      readDynamoDBStreamEvent(event);
    };

    expect(testCase).toThrow(IncorrectConfigurationException);
  });

  it("should put quotas for given service", async () => {
    await putQuotasForService("ec2");

    expect(getQuotaListMock).toHaveBeenCalledTimes(1);
    expect(getQuotasWithUtilizationMetricsMock).toHaveBeenCalledTimes(1);
    expect(putItemMock).toHaveBeenCalledTimes(2);
  });

  it("should put nothing if no quotas returned", async () => {
    queryQuotasForServiceMock.mockResolvedValueOnce([]);
    getQuotasWithUtilizationMetricsMock.mockResolvedValueOnce([]);

    await putQuotasForService("ec2");

    expect(getQuotaListMock).toHaveBeenCalledTimes(1);
    expect(getQuotasWithUtilizationMetricsMock).toHaveBeenCalledTimes(1);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });

  it("should delete quotas for given service", async () => {
    await deleteQuotasForService("ec2");

    expect(queryQuotasForServiceMock).toHaveBeenCalledTimes(1);
  });

  it("should handle Dynamo DB Stream INSERT Event", async () => {
    await handleDynamoDBStreamEvent(insertEvent);
    expect(batchDeleteMock).toHaveBeenCalledTimes(0);
    expect(putItemMock).toHaveBeenCalledTimes(2);
  });

  it("should handle Dynamo DB Stream MODIFY Event", async () => {
    await handleDynamoDBStreamEvent(modifyEvent);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(putItemMock).toHaveBeenCalledTimes(2);
  });

  it("should handle Dynamo DB Stream DELETE Event", async () => {
    await handleDynamoDBStreamEvent(removeEvent);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });
});

describe("Handler", () => {
  it("should handle a Create event", async () => {
    const event = {
      RequestType: "Create",
      ResourceType: "",
    };

    await handler(event);
    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });

  it("should handle an update event", async () => {
    const event = {
      RequestType: "Update",
      ResourceType: "",
    };

    await handler(event);
    expect(getItemMock).toHaveBeenCalledTimes(10);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });

  it("should handle a dynamo db stream event", async () => {
    await handler(insertEvent);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(putItemMock).toHaveBeenCalledTimes(2);
  });

  it("should should handle a scheduled event", async () => {
    const event = {
      "detail-type": "Scheduled Event",
    };
    await handler(event);

    expect(getItemMock).toHaveBeenCalledTimes(15);
    expect(batchDeleteMock).toHaveBeenCalledTimes(6);
    expect(putItemMock).toHaveBeenCalledTimes(2);
  });

  it("should throw an exception for any other type of event", async () => {
    const event = {};
    const testCase = async () => {
      await handler(event);
    };

    await expect(testCase()).rejects.toThrow(UnsupportedEventException);
  });
});
