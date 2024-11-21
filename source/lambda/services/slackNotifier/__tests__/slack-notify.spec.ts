// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SlackNotifier } from "../lib/slack-notify";
import { handler } from "../index";
import { ResourceNotFoundException } from "solutions-utils";

let statusCode = 200;
let statusMessage = "success";
// the mock isn't hoisted unless it's var
var requestMock: jest.Mock; //NOSONAR

jest.mock("https", () => {
  requestMock = jest.fn();
  requestMock.mockImplementation((_url: any, _post_option: any, cb: any) =>
    cb({
      setEncoding: jest.fn(),
      on: (_data: any, cb2: any) => cb2(Buffer.from("", "utf8")),
      statusCode: statusCode,
      statusMessage: statusMessage,
    })
  );
  return {
    ...jest.requireActual("https"), // import and retain the original functionalities
    request: requestMock,
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
});

const getParameterMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    SSMHelper: function () {
      return {
        getParameter: getParameterMock,
      };
    },
  };
});

const event = {
  account: "",
  time: "",
  detail: {
    status: "OK",
    "check-item-detail": {
      Region: "",
      Service: "",
      "Limit Name": "",
      "Current Usage": "",
      "Limit Amount": "",
    },
  },
};

const errorEvent = {
  account: "",
  time: "",
  detail: {
    status: "ERROR",
    "check-item-detail": {
      Region: "",
      Service: "",
      "Limit Name": "",
      "Current Usage": "",
      "Limit Amount": "",
    },
  },
};

const eventForNotification = {
  account: "",
  time: "",
  detail: {
    status: "ERROR",
    "check-item-detail": {
      Region: "",
      Service: "ec2",
      Resource: "vCPU",
      "Limit Code": "L-6E869C2A",
      "Limit Name": "Running On-Demand DL instances",
      "Current Usage": "",
      "Limit Amount": "",
    },
  },
};

describe("slacknotify", function () {
  describe("#sendNotification", function () {
    const slackNotifier = new SlackNotifier();

    beforeAll(() => {
      getParameterMock.mockResolvedValue(["https://test.com"]);
    });

    beforeEach(function () {
      jest.clearAllMocks();
      statusCode = 200;
    });

    it("should return success when notification sent successfully", async () => {
      await slackNotifier.sendNotification(event);
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it("should return error when the call to ssm fails", async () => {
      getParameterMock.mockRejectedValueOnce(new ResourceNotFoundException("error"));

      const result = await slackNotifier.sendNotification(errorEvent);
      expect(requestMock).toHaveBeenCalledTimes(0);
      expect(result.result).toEqual("error");
    });

    it("should return error when notification failed to send to Slack with a 40X", async () => {
      statusCode = 404;
      statusMessage = "error";

      const result = await slackNotifier.sendNotification(errorEvent);
      expect(result.result).toEqual("error");
    });

    it("should return error when notification failed to send to Slack with a 50X", async () => {
      statusCode = 503;
      statusMessage = "error";

      const result = await slackNotifier.sendNotification(errorEvent);
      expect(result.result).toEqual("Server error when processing message: 503 - error");
    });

    it("should succeed when called from handler", async () => {
      await handler(event);
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it("should not send the message successfully if service is muted", async () => {
      getParameterMock.mockResolvedValue(["ec2", "VPC"]);
      await handler(eventForNotification);
      expect(requestMock).toHaveBeenCalledTimes(0);
    });

    it("should not send the message successfully if quota code is muted", async () => {
      getParameterMock.mockResolvedValue(["ec2:L-6E869C2A", "VPC"]);
      await handler(eventForNotification);
      expect(requestMock).toHaveBeenCalledTimes(0);
    });

    it("should send the message successfully if a different quota code is muted", async () => {
      getParameterMock.mockResolvedValue(["ec2:L-6E869C2A_ABC", "VPC"]);
      await handler(eventForNotification);
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it("should not send the message successfully if quota name is muted", async () => {
      getParameterMock.mockResolvedValue(["EC2:Running On-Demand DL instances", "VPC"]);
      await handler(eventForNotification);
      expect(requestMock).toHaveBeenCalledTimes(0);
    });

    it("should not send the message successfully if resource is muted", async () => {
      getParameterMock.mockResolvedValue(["EC2:vCPU", "VPC"]);
      await handler(eventForNotification);
      expect(requestMock).toHaveBeenCalledTimes(0);
    });

    it("should not send the message successfully if same quota from different service is muted", async () => {
      getParameterMock.mockResolvedValue(["cloudformation:L-6E869C2A", "VPC"]);
      await handler(eventForNotification);
      expect(requestMock).toHaveBeenCalledTimes(1);
    });
  });
});
