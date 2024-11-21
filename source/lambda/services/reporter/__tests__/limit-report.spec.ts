// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import { LimitReport } from "../lib/limit-report";
import { handler } from "../index";
import { UnsupportedEventException } from "solutions-utils";

const deleteMessageMock = jest.fn();
const receiveMessagesMock = jest.fn();
const putItemMock = jest.fn();
const destroyMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    SQSHelper: function () {
      return {
        deleteMessage: deleteMessageMock,
        receiveMessages: receiveMessagesMock,
        destroy: destroyMock,
      };
    },
    DynamoDBHelper: function () {
      return {
        putItem: putItemMock,
      };
    },
  };
});

const data = {
  ResponseMetadata: {
    RequestId: "xxxxx-00000-xxxx",
  },
  Messages: [
    {
      MessageId: "xxx-xxx-xxx",
      ReceiptHandle: "testreceipthandle",
      MD5OfBody: "0000000000",
      Body: '{"version":"0","id":"00000","detail-type":"Trusted Advisor Check Item Refresh Notification","source":"aws.trustedadvisor","account":"x000099990000","time":"2018-03-26T15:42:37Z","region":"us-east-1","resources":[],"detail":{"check-name":"Auto Scaling Launch Configurations","check-item-detail":{"Status":"0","Current Usage":"200","Region":"us-west-1","Service":"AutoScaling","Limit Amount":"Launch configurations"},"status":"OK","resource_id":"","uuid":"xxxx-0000-xxxx"}}',
      Attributes: {
        SentTimestamp: "1522078958422",
      },
    },
    {
      MessageId: "xxx-xxx-xxx",
      ReceiptHandle: "testreceipthandle",
      MD5OfBody: "0000000000",
      Body: '{"version":"0","id":"00000","detail-type":"Trusted Advisor Check Item Refresh Notification","source":"aws.trustedadvisor","account":"x000099990000","time":"2018-03-26T15:42:37Z","region":"us-east-1","resources":[],"detail":{"check-name":"Auto Scaling Launch Configurations","check-item-detail":{"Status":"0","Current Usage":"200","Region":"us-west-1","Service":"AutoScaling","Limit Amount":"Launch configurations"},"status":"OK","resource_id":"","uuid":"xxxx-0000-xxxx"}}',
      Attributes: {
        SentTimestamp: "1522078958422",
      },
    },
  ],
};

const emptyData = {
  ResponseMetadata: {
    RequestId: "xxxxx-00000-xxxx",
  },
  Messages: [],
};

const emptyMessageBody = {
  ResponseMetadata: {
    RequestId: "xxxxx-00000-xxxx",
  },
  Messages: [
    {
      MessageId: "xxx-xxx-xxx",
      ReceiptHandle: "testreceipthandle",
      MD5OfBody: "0000000000",
      Attributes: {
        SentTimestamp: "1522078958422",
      },
    },
  ],
};

const event = {
  "detail-type": "Scheduled Event",
};

describe("limitreport", function () {
  beforeAll(async () => {
    deleteMessageMock.mockResolvedValue(undefined);
    receiveMessagesMock.mockResolvedValue(data.Messages);
    putItemMock.mockResolvedValue(undefined);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe("#updateReport", function () {
    const limitReport = new LimitReport();

    beforeEach(() => {
      process.env.LIMIT_REPORT_TBL = "limitreport";
      process.env.AWS_REGION = "us-east-1";
      process.env.SQS_URL = "https://test.com";
      process.env.MAX_MESSAGES = "2";
      process.env.MAX_LOOPS = "2";

      deleteMessageMock.mockResolvedValue(undefined);
      receiveMessagesMock.mockResolvedValue(data.Messages);
      putItemMock.mockResolvedValue(undefined);
    });

    it("should call successfully from index.ts", async () => {
      await handler(event);
      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(4);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });

    it("handler should throw error for unsupported trigger", async () => {
      const testCase = async () => {
        await handler({});
      };
      await expect(testCase()).rejects.toThrow(UnsupportedEventException);
    });

    it("should delete sqs message if all APIs successful", async () => {
      await limitReport.readQueueAsync();

      expect(receiveMessagesMock.mock.calls[0][1]).toBe(2);
      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(4);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });

    it("should log dynamo error when put fails", async () => {
      putItemMock.mockRejectedValueOnce("ddb error");
      await limitReport.readQueueAsync();
      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(3);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });

    it("should handle some message loops returning empty arrays", async () => {
      receiveMessagesMock.mockResolvedValueOnce(data.Messages).mockResolvedValueOnce(emptyData);

      await limitReport.readQueueAsync();

      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(2);
      expect(putItemMock).toHaveBeenCalledTimes(2);
      expect(destroyMock).toHaveBeenCalledTimes(1);
    });
    it("should return an error if the message is empty", async () => {
      receiveMessagesMock.mockResolvedValue(emptyMessageBody);

      await limitReport.readQueueAsync();

      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(0);
      expect(putItemMock).toHaveBeenCalledTimes(0);
      expect(destroyMock).toHaveBeenCalledTimes(0);
    });

    it("should handle an error if the message fails to delete from the queue", async () => {
      deleteMessageMock.mockRejectedValueOnce("delete message error");
      await limitReport.readQueueAsync();

      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(4);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });

    it("should handle missing environment variables", async () => {
      process.env.LIMIT_REPORT_TBL = undefined;
      process.env.AWS_REGION = undefined;
      process.env.SQS_URL = undefined;
      process.env.MAX_MESSAGES = undefined;
      process.env.MAX_LOOPS = undefined;
      process.env.LOG_LEVEL = undefined;

      await limitReport.readQueueAsync();

      expect(receiveMessagesMock).toHaveBeenCalledTimes(0);
      expect(deleteMessageMock).toHaveBeenCalledTimes(0);
      expect(putItemMock).toHaveBeenCalledTimes(0);
      expect(destroyMock).toHaveBeenCalledTimes(0);
    });

    it("should handle MAX_MESSAGES > 10", async () => {
      process.env.MAX_MESSAGES = "11";

      await limitReport.readQueueAsync();

      expect(receiveMessagesMock.mock.calls[0][1]).toBe(10);
      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(4);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });

    it("should handle MAX_MESSAGES == 0", async () => {
      process.env.MAX_MESSAGES = "0";

      await limitReport.readQueueAsync();

      expect(receiveMessagesMock.mock.calls[0][1]).toBe(10);
      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(4);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });

    it("should handle MAX_MESSAGES < 0", async () => {
      process.env.MAX_MESSAGES = "-1";

      await limitReport.readQueueAsync();

      expect(receiveMessagesMock.mock.calls[0][1]).toBe(10);
      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(4);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });

    it("should handle MAX_MESSAGES being undefined", async () => {
      process.env.MAX_MESSAGES = undefined;

      await limitReport.readQueueAsync();

      expect(receiveMessagesMock.mock.calls[0][1]).toBe(10);
      expect(receiveMessagesMock).toHaveBeenCalledTimes(2);
      expect(deleteMessageMock).toHaveBeenCalledTimes(4);
      expect(putItemMock).toHaveBeenCalledTimes(4);
      expect(destroyMock).toHaveBeenCalledTimes(2);
    });
  });
});
