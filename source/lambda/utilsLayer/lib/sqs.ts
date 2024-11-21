// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  DeleteMessageCommand,
  QueueAttributeName,
  ReceiveMessageCommand,
  SQSClient,
  SQSServiceException,
} from "@aws-sdk/client-sqs";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for SQS
 */
export class SQSHelper extends ServiceHelper<SQSClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new SQSClient({
      region: process.env.AWS_REGION,
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description receives messages from the queue
   * @param maxMessages The maximum number of messages to return
   * @returns
   */
  @catchDecorator(SQSServiceException, false)
  async receiveMessages(queueUrl: string, maxMessages: number = 10) {
    logger.debug({
      label: this.moduleName,
      message: `receiving messages from ${queueUrl}`,
    });
    const input = {
      AttributeNames: [QueueAttributeName.All],
      MaxNumberOfMessages: maxMessages,
      QueueUrl: queueUrl,
    };
    const command = new ReceiveMessageCommand(input);
    const response = await this.client.send(command);
    return response.Messages ?? [];
  }

  /**
   * @description delete message from the queue
   * @param receiptHandle identifier associated with the act of receiving the message
   */
  @catchDecorator(SQSServiceException, false)
  async deleteMessage(queueUrl: string, receiptHandle: string) {
    logger.debug({
      label: this.moduleName,
      message: `deleting sqs message`,
    });
    const input = {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    };
    const command = new DeleteMessageCommand(input);
    await this.client.send(command);
  }

  /**
   * @description Destroy underlying resources, like sockets as described [here]{@link https://github.com/aws/aws-sdk-js-v3/blob/main/clients/client-sqs/src/SQSClient.ts#L444}
   */
  @catchDecorator(SQSServiceException, false)
  destroy() {
    logger.debug({
      label: this.moduleName,
      message: `cleaning up sqs resources`,
    });
    this.client.destroy();
  }
}
