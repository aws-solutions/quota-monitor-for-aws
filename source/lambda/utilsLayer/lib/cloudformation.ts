// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  CloudFormationClient,
  CloudFormationServiceException,
  CreateStackInstancesCommand,
  DeleteStackInstancesCommand,
  DescribeStackSetCommand,
  ListStackInstancesCommand,
  RegionConcurrencyType,
} from "@aws-sdk/client-cloudformation";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";
import { StackSetOperationPreferences, Parameter } from "@aws-sdk/client-cloudformation/dist-types/models/models_0";
import { IncorrectConfigurationException } from "./error";

export interface StackSetOpsPercentagePrefs {
  RegionConcurrencyType: string;
  MaxConcurrentPercentage: number;
  FailureTolerancePercentage: number;
}

export const defaultOpsPercentagePrefs: StackSetOpsPercentagePrefs = {
  RegionConcurrencyType: "PARALLEL",
  MaxConcurrentPercentage: 100,
  FailureTolerancePercentage: 0,
};

function validateStackSetOpsPercentagePrefs(
  opsPrefs: StackSetOperationPreferences
) {
  if (
    ![
      <string>RegionConcurrencyType.PARALLEL,
      <string>RegionConcurrencyType.SEQUENTIAL,
    ].includes(<string>opsPrefs.RegionConcurrencyType) ||
    <number>opsPrefs.MaxConcurrentPercentage < 1 ||
    <number>opsPrefs.MaxConcurrentPercentage > 100 ||
    <number>opsPrefs.FailureTolerancePercentage < 0 ||
    <number>opsPrefs.FailureTolerancePercentage > 100
  )
    throw new IncorrectConfigurationException(
      "Invalid StackSetOperationPreferences"
    );
}

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
  public readonly stackSetName: string;
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
   * @description - get the regions the stackset is deployed to
   * @returns
   */
  @catchDecorator(CloudFormationServiceException, true)
  async getDeployedRegions() {
    logger.debug({
      label: this.moduleName,
      message: `getting deployment regions for ${this.stackSetName}`,
    });
    const result = await this.client.send(
      new ListStackInstancesCommand({
        StackSetName: this.stackSetName,
        CallAs: "DELEGATED_ADMIN",
      })
    );
    //remove duplicates coming from different OUs
    return Array.from(
      new Set(
        <string[]>result?.Summaries?.map((summary) => summary.Region)
      ).values()
    );
  }

  /**
   * @description creates stackset instances
   * @param target - target for creating stackset instances, can either be root-id or ou-ids
   */
  @catchDecorator(CloudFormationServiceException, true)
  async createStackSetInstances(
    target: string[],
    regions: string[],
    opsPrefs: StackSetOperationPreferences = defaultOpsPercentagePrefs,
    paramOverrides: Parameter[] = []
  ) {
    validateStackSetOpsPercentagePrefs(opsPrefs);
    logger.debug({
      label: this.moduleName,
      message: `creating stackset instances for ${this.stackSetName}; regions: ${JSON.stringify(regions)}; targets :${JSON.stringify(target)}`,
    });
    if (target.length === 0 || regions.length === 0) {
      logger.debug({
        label: this.moduleName,
        message: `creating stackset instances aborted because ${
          target.length === 0 ? "targets" : "regions"
        } is empty`,
      });
      return;
    }
    await this.client.send(
      new CreateStackInstancesCommand({
        StackSetName: this.stackSetName,
        DeploymentTargets: { OrganizationalUnitIds: target },
        CallAs: "DELEGATED_ADMIN",
        Regions: regions,
        OperationPreferences: opsPrefs,
        ParameterOverrides: paramOverrides,
      })
    );
  }

  /**
   * @description creates stackset instances
   * @param target - target for creating stackset instances, can either be root-id or ou-ids
   */
  @catchDecorator(CloudFormationServiceException, true)
  async deleteStackSetInstances(
    target: string[],
    regions: string[],
    opsPrefs: StackSetOperationPreferences = defaultOpsPercentagePrefs
  ) {
    validateStackSetOpsPercentagePrefs(opsPrefs);
    logger.debug({
      label: this.moduleName,
      message: `deleting stackset instances for ${this.stackSetName}; regions: ${JSON.stringify(regions)}; targets :${JSON.stringify(target)}`,
    });
    if (target.length === 0 || regions.length === 0) {
      logger.debug({
        label: this.moduleName,
        message: `deleting stackset instances aborted because ${
          target.length === 0 ? "targets" : "regions"
        } is empty`,
      });
      return;
    }
    await this.client.send(
      new DeleteStackInstancesCommand({
        StackSetName: this.stackSetName,
        DeploymentTargets: { OrganizationalUnitIds: target },
        CallAs: "DELEGATED_ADMIN",
        Regions: regions,
        RetainStacks: false,
        OperationPreferences: opsPrefs,
      })
    );
  }
}
