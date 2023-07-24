// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Message } from "@aws-sdk/client-sqs";
import { DynamoDBHelper, logger, SQSHelper } from "solutions-utils";

/**
 * Fetches messages from SQS and writes to DynamoDB table
 * @class LimitReport
 */
export class LimitReport {
  protected readonly moduleName: string;

  /**
   * @constructor
   */
  constructor() {
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description initiate reading queue asynchronously
   */
  async readQueueAsync() {
    const promises: Promise<void>[] = [];
    const maxLoops = parseInt(<string>process.env.MAX_LOOPS) ?? 10;
    for (let i = 0; i < maxLoops; i++) {
      promises.push(this.processMessages());
    }
    await Promise.allSettled(promises);
  }

  /**
   * @description process message from sqs queue
   */
  async processMessages() {
    const sqsHelper = new SQSHelper();
    const messages = await sqsHelper.receiveMessages(
      <string>process.env.SQS_URL,
      parseInt(<string>process.env.MAX_MESSAGES) ?? 10
    );
    await Promise.allSettled(
      messages.map(async (message) => {
        await this.putUsageItemOnDDB(message);
        await sqsHelper.deleteMessage(
          <string>process.env.SQS_URL,
          <string>message.ReceiptHandle
        );
      })
    );
    logger.info({
      label: this.moduleName,
      message: `queue message processing complete`,
    });
  }

  /**
   * @description put the usage message on dynamodb
   * @param message
   * @returns
   */
  async putUsageItemOnDDB(message: Message) {
    if (!message.Body) return;
    const ddbHelper = new DynamoDBHelper();
    const usageMessage = JSON.parse(message.Body);
    const item = {
      MessageId: message.MessageId,
      AccountId: usageMessage.account,
      TimeStamp:
        usageMessage.detail["check-item-detail"]["Timestamp"] ??
        usageMessage.time,
      Region: usageMessage.detail["check-item-detail"]["Region"],
      Source: usageMessage.source,
      Service: usageMessage.detail["check-item-detail"]["Service"],
      Resource: usageMessage.detail["check-item-detail"]["Resource"],
      LimitCode: usageMessage.detail["check-item-detail"]["Limit Code"],
      LimitName: usageMessage.detail["check-item-detail"]["Limit Name"],
      CurrentUsage:
        usageMessage.detail["check-item-detail"]["Current Usage"] ?? "0",
      LimitAmount: usageMessage.detail["check-item-detail"]["Limit Amount"],
      Status: usageMessage.detail["status"],
      ExpiryTime: (
          Math.round(new Date().getTime() / 1000) +
          15 * 24 * 3600
      ).toString(), // 1️⃣5️⃣ days from now. Unix epoch timestamp in seconds.
    };

    logger.debug({
      label: this.moduleName,
      message: `usage item to put on dynamodb: ${JSON.stringify(item)}`,
    });
    await ddbHelper.putItem(<string>process.env.QUOTA_TABLE, item);
  }
}
