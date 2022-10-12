// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  EC2Client,
  EC2ServiceException,
  DescribeRegionsCommand,
} from "@aws-sdk/client-ec2";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for EC2
 */
export class EC2Helper extends ServiceHelper<EC2Client> {
  readonly client;
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new EC2Client({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description get enabled region names from EC2
   * @returns
   */
  @catchDecorator(EC2ServiceException, true)
  async getEnabledRegionNames() {
    logger.debug({
      label: this.moduleName,
      message: `getting regions`,
    });
    const response = await this.client.send(new DescribeRegionsCommand({}));
    return response.Regions?.map((region) => region.RegionName ?? "") ?? [];
  }
}
