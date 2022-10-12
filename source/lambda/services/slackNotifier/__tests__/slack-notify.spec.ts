// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SlackNotifier } from "../lib/slack-notify";
import { handler } from "../index";
import { ResourceNotFoundException } from "solutions-utils";

let statusCode = 200;
let statusMessage = "success";

jest.mock("https", () => ({
  ...jest.requireActual("https"), // import and retain the original functionalities
  request: (_url: any, _post_option: any, cb: any) =>
    cb({
      setEncoding: jest.fn(),
      on: (_data: any, cb2: any) => cb2(Buffer.from("", "utf8")),
      statusCode: statusCode,
      statusMessage: statusMessage,
    }),
  on: jest.fn(),
  write: jest.fn(),
  end: jest.fn(),
}));

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
      const result = await slackNotifier.sendNotification(event);
      expect(result.result).toEqual("Message posted successfully");
    });

    it("should return error when the call to ssm fails", async () => {
      getParameterMock.mockRejectedValueOnce(
        new ResourceNotFoundException("error")
      );

      const result = await slackNotifier.sendNotification(errorEvent);
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
      expect(result.result).toEqual(
        "Server error when processing message: 503 - error"
      );
    });

    it("should succeed when called from handler", async () => {
      const result = await handler(event);
      expect(result.result).toEqual("Message posted successfully");
    });
  });
});
