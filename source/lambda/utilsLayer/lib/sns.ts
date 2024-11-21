// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SNSClient, PublishCommand, SNSServiceException } from "@aws-sdk/client-sns";
import { ServiceHelper } from "./exports";
import { catchDecorator } from "./catch";

/**
 * @description helper class for SNS
 */
export class SNSHelper extends ServiceHelper<SNSClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new SNSClient({
      region: process.env.AWS_REGION,
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * publishes messages to the provided topic
   * @param topicArn
   * @param message
   */
  @catchDecorator(SNSServiceException, true)
  async publish(topicArn: string, message: string) {
    const input = {
      TopicArn: topicArn,
      Message: message,
    };
    const command = new PublishCommand(input);
    await this.client.send(command);
  }
}
