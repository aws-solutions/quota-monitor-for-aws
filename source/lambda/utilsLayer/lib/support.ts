// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  RefreshTrustedAdvisorCheckCommand,
  SupportClient,
  SupportServiceException,
} from "@aws-sdk/client-support";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for Support Helper
 */
export class SupportHelper extends ServiceHelper<SupportClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  /**
   * @description constructor
   */
  constructor() {
    super();
    this.client = new SupportClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }

  @catchDecorator(SupportServiceException, true)
  async refreshTrustedAdvisorCheck(checkId: string) {
    logger.debug({
      label: this.moduleName,
      message: `refreshing TA check for: ${checkId}`,
    });

    const command = new RefreshTrustedAdvisorCheckCommand({
      checkId: checkId,
    });
    await this.client.send(command);
  }
}
