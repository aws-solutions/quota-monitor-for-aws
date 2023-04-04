// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SNSPublisher } from "../lib/sns-publish";
import { handler } from "../index";

const snsPublishMock = jest.fn();
const getSSMParameterMock = jest.fn();
const sendAnonymousMetricMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    SNSHelper: function () {
      return {
        publish: snsPublishMock,
      };
    },
    SSMHelper: function () {
      return {
        getParameter: getSSMParameterMock,
      };
    },
    sendAnonymousMetric: function () {
      sendAnonymousMetricMock();
    },
  };
});

describe("SNS publisher", function () {
  beforeEach(async () => {
    process.env.SEND_METRIC = "No";
    jest.clearAllMocks();
  });
  const sampleEvent = {
    version: "0",
    id: "test-event",
    "detail-type": "Trusted Advisor Check Item Refresh Notification",
    source: "aws.trustedadvisor",
    account: "111",
    time: "2023-01-27T01:55:53Z",
    region: "us-east-1",
    resources: [],
    detail: {
      "check-name": "VPC",
      "check-item-detail": {
        Status: "Red",
        "Current Usage": "5",
        "Limit Name": "VPCs",
        Region: "us-east-1",
        Service: "VPC",
        "Limit Amount": "5",
      },
      status: "ERROR",
      resource_id: "",
      uuid: "97fe56f8-5463-4454-b2de-2bb8c5Test01",
    },
  };

  it("should call sns publisher successfully", async () => {
    await new SNSPublisher().publish(JSON.stringify(sampleEvent));
    expect(snsPublishMock).toHaveBeenCalledTimes(1);
  });

  it("should publish the message successfully if service isn't muted", async () => {
    getSSMParameterMock.mockResolvedValue(["NOP"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(1);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
    expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(0);
  });

  it("should publish the message successfully if service isn't muted, with sendMetric Yes", async () => {
    process.env.SEND_METRIC = "Yes";
    getSSMParameterMock.mockResolvedValue(["NOP"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(1);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
    expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should not publish the message successfully if service is muted", async () => {
    getSSMParameterMock.mockResolvedValue(["ec2", "VPC"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(0);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
    expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(0);
  });

  it("should not publish the message successfully if service is muted, with sendMetric Yes", async () => {
    process.env.SEND_METRIC = "Yes";
    getSSMParameterMock.mockResolvedValue(["ec2", "VPC"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(0);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
    expect(sendAnonymousMetricMock).toHaveBeenCalledTimes(0);
  });

  it("should return error when unexpected failure happens", async () => {
    getSSMParameterMock.mockResolvedValue(["NOP"]);
    snsPublishMock.mockImplementation(async () => {
      throw new Error();
    });
    const result = await handler(sampleEvent);
    expect(result).toEqual(new Error());
  });

  it("should not publish the message successfully if limit name matches", async () => {
    getSSMParameterMock.mockResolvedValue(["ec2", "vpc:vpcs"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(0);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
  });

  it("should publish the message successfully if limit code is empty and specific quota name is muted", async () => {
    getSSMParameterMock.mockResolvedValue(["ec2", "VPC:L-6E869C2A"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(1);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
  });

  it("should not publish the message successfully if * is used", async () => {
    getSSMParameterMock.mockResolvedValue(["ec2", "VPC:*"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(0);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
  });

  it("should publish the message successfully if service: is given", async () => {
    getSSMParameterMock.mockResolvedValue(["ec2", "vpc:"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(1);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
  });

  it("should publish the message successfully if another service is muted", async () => {
    getSSMParameterMock.mockResolvedValue(["ec2", "cloudwatch"]);
    await handler(sampleEvent);

    expect(snsPublishMock).toHaveBeenCalledTimes(1);
    expect(getSSMParameterMock).toHaveBeenCalledTimes(1);
  });


});
