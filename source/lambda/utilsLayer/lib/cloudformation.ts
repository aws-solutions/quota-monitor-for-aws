// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  CloudFormationClient,
  CloudFormationServiceException,
  CreateStackInstancesCommand,
  DeleteStackInstancesCommand,
  DescribeStackSetCommand,
} from "@aws-sdk/client-cloudformation";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for Cloudformation
 */
export class CloudFormationHelper extends ServiceHelper<CloudFormationClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  /**
   * @description stackset name
   */
  private readonly stackSetName: string;
  /**
   * @description constructor
   * @param name name of the stackset
   */
  constructor(name: string) {
    super();
    this.client = new CloudFormationClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
    this.stackSetName = name;
  }

  /**
   * @description - get current deployment targets for the stackset
   * @returns
   */
  @catchDecorator(CloudFormationServiceException, true)
  async getDeploymentTargets() {
    logger.debug({
      label: this.moduleName,
      message: `getting deployment targets for ${this.stackSetName}`,
    });
    const result = await this.client.send(
      new DescribeStackSetCommand({
        StackSetName: this.stackSetName,
        CallAs: "DELEGATED_ADMIN",
      })
    );
    return <string[]>result?.StackSet?.OrganizationalUnitIds; // can either be root-id or ou-ids
  }

  /**
   * @description creates stackset instances
   * @param target - target for creating stackset instances, can either be root-id or ou-ids
   */
  @catchDecorator(CloudFormationServiceException, true)
  async createStackSetInstances(target: string[], regions: string[]) {
    logger.debug({
      label: this.moduleName,
      message: `creating stackset instances for ${this.stackSetName}`,
    });
    await this.client.send(
      new CreateStackInstancesCommand({
        StackSetName: this.stackSetName,
        DeploymentTargets: { OrganizationalUnitIds: target },
        CallAs: "DELEGATED_ADMIN",
        Regions: regions,
      })
    );
  }

  /**
   * @description creates stackset instances
   * @param target - target for creating stackset instances, can either be root-id or ou-ids
   */
  @catchDecorator(CloudFormationServiceException, true)
  async deleteStackSetInstances(target: string[], regions: string[]) {
    if (target.length === 0) {
      return;
    }
    logger.debug({
      label: this.moduleName,
      message: `deleting stackset instances for ${this.stackSetName}`,
    });
    await this.client.send(
      new DeleteStackInstancesCommand({
        StackSetName: this.stackSetName,
        DeploymentTargets: { OrganizationalUnitIds: target },
        CallAs: "DELEGATED_ADMIN",
        Regions: regions,
        RetainStacks: false,
      })
    );
  }
}
