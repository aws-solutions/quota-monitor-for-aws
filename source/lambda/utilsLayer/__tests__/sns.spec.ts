// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import { SNSHelper } from "../lib";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

describe("SNSHelper", () => {
  const snsMock = mockClient(SNSClient);
  snsMock.on(PublishCommand).resolves({});

  it("should publish message", async () => {
    const snsHelper = new SNSHelper();
    await snsHelper.publish("ARN:123", "{}");
    expect(snsMock).toHaveReceivedCommand(PublishCommand);
  });
});
