// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  SQSServiceException,
} from "@aws-sdk/client-sqs";

import { SQSHelper } from "../lib/sqs";

describe("SQS Helper", () => {
  const sqsMock = mockClient(SQSClient);
  let sqsHelper: SQSHelper;

  const messageBody = {
    account: "",
    time: "",
    detail: {
      status: "WARN",
      "check-item-detail": {
        Timestamp: "",
        Region: "us-east-1",
        Service: "EC2",
        "Limit Name": "instances",
        "Current Usage": 10,
        "Limit Amount": 8,
      },
    },
  };

  const message = {
    MessageId: "messageId",
    Body: JSON.stringify(messageBody),
  };

  beforeEach(() => {
    sqsMock.reset();
    sqsHelper = new SQSHelper();
  });

  it("should receive messages", async () => {
    sqsMock.on(ReceiveMessageCommand).resolves({
      Messages: [message, message],
    });

    const response = await sqsHelper.receiveMessages("queueUrl");

    expect(sqsMock).toHaveReceivedCommand(ReceiveMessageCommand);
    expect(response).toEqual([message, message]);
  });

  it("no messages are received, it should return empty array", async () => {
    sqsMock.on(ReceiveMessageCommand).resolves({});

    const response = await sqsHelper.receiveMessages("queueUrl");

    expect(sqsMock).toHaveReceivedCommand(ReceiveMessageCommand);
    expect(response).toEqual([]);
  });

  it("should not throw an exception if ReceiveMessageCommand fails", async () => {
    sqsMock.on(ReceiveMessageCommand).rejectsOnce(
      new SQSServiceException({
        name: "SQSServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await sqsHelper.receiveMessages("queueUrl");
    };

    await expect(testCase()).resolves.toBe(undefined);
    expect(sqsMock).toHaveReceivedCommand(ReceiveMessageCommand);
  });

  it("should delete a message", async () => {
    sqsMock.on(DeleteMessageCommand).resolves({});
    await sqsHelper.deleteMessage("queueUrl", "handle");

    expect(sqsMock).toHaveReceivedCommand(DeleteMessageCommand);
  });

  it("should not throw an exception if DeleteMessageCommand fails", async () => {
    sqsMock.on(DeleteMessageCommand).rejectsOnce(
      new SQSServiceException({
        name: "SQSServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await sqsHelper.deleteMessage("queueUrl", "handle");
    };

    await expect(testCase()).resolves.toBe(undefined);
    expect(sqsMock).toHaveReceivedCommand(DeleteMessageCommand);
  });
});
