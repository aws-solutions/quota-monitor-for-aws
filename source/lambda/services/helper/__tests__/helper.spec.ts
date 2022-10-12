// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler, IEvent } from "../index";
import { sendAnonymousMetric } from "solutions-utils";

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    sendAnonymousMetric: jest.fn(),
  };
});

jest.mock("uuid", () => ({
  v4: () => {
    return process.env.SOLUTION_UUID;
  },
}));

const mockEvent: IEvent = {
  ResourceType: "",
  RequestType: "",
  StackId: "MyStack",
  RequestId: "ReqId",
  LogicalResourceId: "ResourceId",
  ResourceProperties: {},
  ResponseURL: "url",
};

describe("Helper", function () {
  let sendAnonymousMetricMock: jest.Mock;

  beforeAll(() => {
    sendAnonymousMetricMock = sendAnonymousMetric as jest.Mock;
    sendAnonymousMetricMock.mockResolvedValue({});
  });

  describe("CreateUUID Event", () => {
    const mockUUIDEvent = {
      ...mockEvent,
      ResourceType: "Custom::CreateUUID",
      RequestType: "Create",
    };

    it("should create a uuid", async () => {
      const response = await handler(mockUUIDEvent, {});
      expect(response.Status).toEqual("SUCCESS");
      expect(response.Data.UUID).toEqual(process.env.SOLUTION_UUID);
    });
  });

  describe("LaunchData Event", () => {
    const mockLaunchEvent = {
      ...mockEvent,
      ResourceType: "Custom::LaunchData",
      ResourceProperties: {
        SOLUTION_UUID: <string>process.env.SOLUTION_UUID,
      },
      RequestType: "Create",
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      process.env.SEND_METRIC = "Yes";
    });

    it("should successfully send a metric on solution creation", async () => {
      const response = await handler(mockLaunchEvent, {});
      expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(1);
      expect(sendAnonymousMetricMock).toHaveBeenCalledWith(
        process.env.METRICS_ENDPOINT,
        expect.objectContaining({
          Data: {
            Event: "SolutionCreate",
          },
        })
      );
      expect(response.Data.Data).toEqual("NOV");
    });

    it("should successfully send a metric on solution deletion", async () => {
      mockLaunchEvent.RequestType = "Delete";
      const response = await handler(mockLaunchEvent, {});
      expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(1);
      expect(sendAnonymousMetricMock).toHaveBeenCalledWith(
        process.env.METRICS_ENDPOINT,
        expect.objectContaining({
          Data: {
            Event: "SolutionDelete",
          },
        })
      );
      expect(response.Data.Data).toEqual("NOV");
    });

    it("should handle disabled metrics", async () => {
      process.env.SEND_METRIC = "No";
      const response = await handler(mockLaunchEvent, {});
      expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(0);
      expect(response.Data.Data).toEqual("NOV");
    });

    it("should handle a failure to send a metric", async () => {
      sendAnonymousMetricMock.mockRejectedValueOnce(
        new Error("Failed to send metrics")
      );
      const response = await handler(mockLaunchEvent, {});
      expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(1);
      expect(response.Data.Data).toEqual("NOV");
    });
  });
});
