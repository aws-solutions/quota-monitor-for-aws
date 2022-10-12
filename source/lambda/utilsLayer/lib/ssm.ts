// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  GetParameterCommand,
  SSMClient,
  ParameterType,
  ParameterNotFound,
  SSMServiceException,
} from "@aws-sdk/client-ssm";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for SSM
 */
export class SSMHelper extends ServiceHelper<SSMClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new SSMClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }
  /**
   * @description method to get the ssm parameter
   * @param name - name of the parameter to get
   * @returns
   */
  @catchDecorator(SSMServiceException, true)
  async getParameter(name: string, withDecrpytion = false) {
    logger.debug({
      label: this.moduleName,
      message: `getting ssm parameter ${name}`,
    });
    const response = await this.client.send(
      new GetParameterCommand({ Name: name, WithDecryption: withDecrpytion })
    );
    if (!response.Parameter || !response.Parameter.Value)
      throw ParameterNotFound;
    else {
      if (response.Parameter.Type === ParameterType.STRING_LIST)
        return response.Parameter.Value.split(",");
      else return [response.Parameter.Value];
    }
  }
}
