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

import { IncorrectConfigurationException, UnsupportedEventException } from "solutions-utils";

const getItemMock = jest.fn();
const putItemMock = jest.fn();
const queryQuotasForServiceMock = jest.fn();
const batchDeleteMock = jest.fn();
const batchWriteMock = jest.fn();
const getServiceCodesMock = jest.fn();
const getQuotaListMock = jest.fn();
const getQuotasWithUtilizationMetricsMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    sleep: jest.fn(),
    DynamoDBHelper: function () {
      return {
        getItem: getItemMock,
        putItem: putItemMock,
        queryQuotasForService: queryQuotasForServiceMock,
        batchDelete: batchDeleteMock,
        batchWrite: batchWriteMock,
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

const serviceCodes = ["monitoring", "dynamodb", "ec2", "sagemaker", "connect"];

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
            BOOL: true,
          },
        },
      },
    },
  ],
};

const insertEventNotMonitored = {
  Records: [
    {
      eventName: "INSERT",
      dynamodb: {
        NewImage: {
          ServiceCode: {
            S: "ec2",
          },
          Monitored: {
            BOOL: false,
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

  it("should put the service monitoring status if it doesn't exist", async () => {
    await putServiceMonitoringStatus({
      serviceTable: "dbTable",
      refresh: false,
      sageMakerMonitoring: true,
      connectMonitoring: false,
    });

    expect(getServiceCodesMock).toHaveBeenCalledTimes(1);
    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: true,
    });
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "connect",
      Monitored: false,
    });
  });

  it("should should not put the service monitoring status if it already exists", async () => {
    getItemMock.mockResolvedValueOnce({});
    await putServiceMonitoringStatus({
      serviceTable: "dbTable",
    });

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
    expect(batchWriteMock).toHaveBeenCalledTimes(1);
  });

  it("should handle more than 25 quotas by calling batchWrite multiple times", async () => {
    // Create an array of 30 quotas
    const largeQuotaList = Array.from({ length: 30 }, (_, index) => ({
      QuotaName: `Quota ${index + 1}`,
      UsageMetric: {
        MetricNamespace: "AWS/Usage",
      },
      Monitored: index % 2 === 0,
    }));

    getQuotaListMock.mockResolvedValueOnce(largeQuotaList);
    getQuotasWithUtilizationMetricsMock.mockResolvedValueOnce(largeQuotaList);

    await putQuotasForService("ec2");

    expect(batchWriteMock).toHaveBeenCalledTimes(2);
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
    expect(batchWriteMock).toHaveBeenCalledTimes(1);
  });

  it("should not add quotas for Dynamo DB Stream INSERT Event when Monitored is false", async () => {
    await handleDynamoDBStreamEvent(insertEventNotMonitored);
    expect(batchDeleteMock).toHaveBeenCalledTimes(0);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });

  it("should handle Dynamo DB Stream MODIFY Event", async () => {
    await handleDynamoDBStreamEvent(modifyEvent);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(batchWriteMock).toHaveBeenCalledTimes(1);
  });

  it("should handle Dynamo DB Stream DELETE Event", async () => {
    await handleDynamoDBStreamEvent(removeEvent);
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
    expect(batchWriteMock).toHaveBeenCalledTimes(0);
  });

  it("should update only SageMaker monitoring status", async () => {
    await putServiceMonitoringStatus({
      serviceTable: "dbTable",
      refresh: false,
      sageMakerMonitoring: true,
    });

    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: true,
    });
    expect(putItemMock).not.toHaveBeenCalledWith("dbTable", {
      ServiceCode: "connect",
      Monitored: expect.anything(),
    });
  });

  it("should update only Connect monitoring status", async () => {
    await putServiceMonitoringStatus({
      serviceTable: "dbTable",
      refresh: false,
      connectMonitoring: false,
    });

    expect(putItemMock).not.toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: expect.anything(),
    });
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "connect",
      Monitored: false,
    });
  });
});

describe("Handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle a Create event", async () => {
    const event = {
      RequestType: "Create",
      ResourceType: "",
      ResourceProperties: {
        SageMakerMonitoring: "Yes",
        ConnectMonitoring: "No",
      },
    };

    await handler(event);
    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: true,
    });
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "connect",
      Monitored: false,
    });
  });

  it("should handle an update event on a clean slate", async () => {
    const event = {
      RequestType: "Update",
      ResourceType: "",
    };

    await handler(event);
    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });

  it("should handle an update event with service table not empty", async () => {
    const event = {
      RequestType: "Update",
      ResourceType: "",
    };
    getItemMock.mockResolvedValueOnce({
      Service: "ec2",
      Monitored: true,
    });
    getItemMock.mockResolvedValueOnce({
      Service: "ec2",
      Monitored: false,
    });
    await handler(event);
    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });

  it("should handle an Update event with changes to SageMaker and Connect", async () => {
    const event = {
      RequestType: "Update",
      ResourceType: "",
      OldResourceProperties: {
        SageMakerMonitoring: "Yes",
        ConnectMonitoring: "No",
      },
      ResourceProperties: {
        SageMakerMonitoring: "No",
        ConnectMonitoring: "Yes",
      },
    };

    await handler(event);
    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: false,
    });
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "connect",
      Monitored: true,
    });
  });

  it("should handle a dynamo db stream event", async () => {
    await handler(insertEvent);
    expect(batchDeleteMock).toHaveBeenCalledTimes(0);
    expect(batchWriteMock).toHaveBeenCalledTimes(1);
  });

  it("should should handle a scheduled event", async () => {
    const event = {
      "detail-type": "Scheduled Event",
    };
    await handler(event);

    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(batchDeleteMock).toHaveBeenCalledTimes(0);
    expect(putItemMock).toHaveBeenCalledTimes(0);
  });

  it("should should handle a scheduled event with service table not empty", async () => {
    const event = {
      "detail-type": "Scheduled Event",
    };
    // return 4 monitored items and one unmonitored
    getItemMock.mockResolvedValueOnce({
      Service: "ec2",
      Monitored: true,
    });
    getItemMock.mockResolvedValueOnce({
      Service: "ec2",
      Monitored: true,
    });
    getItemMock.mockResolvedValueOnce({
      Service: "ec2",
      Monitored: true,
    });
    getItemMock.mockResolvedValueOnce({
      Service: "ec2",
      Monitored: true,
    });
    getItemMock.mockResolvedValueOnce({
      Service: "ec2",
      Monitored: false,
    });
    await handler(event);

    expect(getItemMock).toHaveBeenCalledTimes(5);
    expect(batchDeleteMock).toHaveBeenCalledTimes(0);
    expect(putItemMock).toHaveBeenCalledTimes(8); // the 4 monitored items are modified twice
  });

  it("should throw an exception for any other type of event", async () => {
    const event = {};
    const testCase = async () => {
      await handler(event);
    };

    await expect(testCase()).rejects.toThrow(UnsupportedEventException);
  });

  it("should preserve existing values for SageMaker and Connect during refresh", async () => {
    getServiceCodesMock.mockResolvedValue(["sagemaker", "connect"]);
    getItemMock.mockResolvedValueOnce({ ServiceCode: "sagemaker", Monitored: true });
    getItemMock.mockResolvedValueOnce({ ServiceCode: "connect", Monitored: false });

    await putServiceMonitoringStatus({
      serviceTable: "dbTable",
      refresh: true,
    });
    // Check that SageMaker is toggled off and then on
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: false,
    });
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: true,
    });

    // Connect should not be toggled because it was initially false
    expect(putItemMock).not.toHaveBeenCalledWith("dbTable", {
      ServiceCode: "connect",
      Monitored: true,
    });

    // Check the order and number of calls
    expect(putItemMock.mock.calls).toEqual([
      ["dbTable", { ServiceCode: "sagemaker", Monitored: false }],
      ["dbTable", { ServiceCode: "sagemaker", Monitored: true }],
    ]);

    expect(putItemMock).toHaveBeenCalledTimes(2);
  });

  it("should update SageMaker and Connect when values are provided", async () => {
    getServiceCodesMock.mockResolvedValue(["sagemaker", "connect"]);
    getItemMock.mockResolvedValueOnce({ ServiceCode: "sagemaker", Monitored: true });
    getItemMock.mockResolvedValueOnce({ ServiceCode: "connect", Monitored: false });

    await putServiceMonitoringStatus({
      serviceTable: "dbTable",
      refresh: false,
      sageMakerMonitoring: false,
      connectMonitoring: true,
    });

    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "sagemaker",
      Monitored: false,
    });
    expect(putItemMock).toHaveBeenCalledWith("dbTable", {
      ServiceCode: "connect",
      Monitored: true,
    });
  });
});
