// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { SNSHelper } from "solutions-utils";

export class SNSPublisher {
  private readonly snsHelper;
  private readonly topicArn;

  constructor() {
    this.snsHelper = new SNSHelper();
    this.topicArn = <string>process.env.TOPIC_ARN;
  }

  async publish(message: string) {
    await this.snsHelper.publish(this.topicArn, message);
  }
}
