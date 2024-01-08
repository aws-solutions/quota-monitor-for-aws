// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  DescribeTrustedAdvisorChecksCommand,
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

  /**
   * requests a Trusted Advisor check
   * @param checkId
   */
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

  /**
   * retrieves the list of the checkIds of available Trusted Advisor Checks
   */
  @catchDecorator(SupportServiceException, true)
  async listTrustedAdvisorCheckIds() {
    logger.debug({
      label: this.moduleName,
      message: "describing list of TA checks",
    });

    const command = new DescribeTrustedAdvisorChecksCommand({ language: "en" });
    const response = await this.client.send(command);
    return response.checks?.map((check) => check.id);
  }

  /**
   * checks if the account has support plan that includes Trusted Advisor by trying to list the available checks
   */
  async isTrustedAdvisorAvailable() {
    try {
      await this.listTrustedAdvisorCheckIds();
      return true;
    } catch (e) {
      logger.info({
        label: this.moduleName,
        message:
          "Trusted Advisor check failed, thus this account doesn't have a support plan that includes Trusted Advisor",
      });
      return false;
    }
  }
}
