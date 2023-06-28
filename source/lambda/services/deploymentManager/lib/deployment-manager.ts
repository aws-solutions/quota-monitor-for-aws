// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  logger,
  ORG_REGEX,
  validateAccountInput,
  validateOrgInput,
  CloudFormationHelper,
  EventsHelper,
  OrganizationsHelper,
  SSMHelper,
  EC2Helper,
  IncorrectConfigurationException,
  SupportHelper,
  StackSetOpsPercentagePrefs,
  arrayIncludesIgnoreCase,
  arrayDiff,
  sendAnonymizedMetric,
  stringEqualsIgnoreCase,
} from "solutions-utils";

/**
 * @description supported deployment models for the solution
 */
export enum DEPLOYMENT_MODEL {
  ORG = "Organizations",
  ACCOUNT = "Accounts",
  HYBRID = "Hybrid",
}

interface SpokeDeploymentMetricData {
  SpokeCount?: number;
  RegionsList?: string;
}

export class DeploymentManager {
  private org;
  private events;
  private ec2;
  private ssm;
  private stackSetOpsPrefs: StackSetOpsPercentagePrefs;

  protected readonly moduleName;

  constructor() {
    this.org = new OrganizationsHelper();
    this.events = new EventsHelper();
    this.ec2 = new EC2Helper();
    this.ssm = new SSMHelper();
    this.moduleName = <string>__filename.split("/").pop();
    this.stackSetOpsPrefs = {
      RegionConcurrencyType: <string>process.env.REGIONS_CONCURRENCY_TYPE,
      MaxConcurrentPercentage: parseInt(
        <string>process.env.MAX_CONCURRENT_PERCENTAGE,
        10
      ),
      FailureTolerancePercentage: parseInt(
        <string>process.env.FAILURE_TOLERANCE_PERCENTAGE,
        10
      ),
    };
  }

  async manageDeployments() {
    const principals = await this.getPrincipals();
    const organizationId = await this.getOrganizationId();

    await this.updatePermissions(principals, organizationId);
    await this.manageStackSets();
  }

  private async getPrincipals() {
    const accountParameter = <string>process.env.QM_ACCOUNT_PARAMETER;
    const ouParameter = <string>process.env.QM_OU_PARAMETER;

    let principals: string[] = [];

    switch (process.env.DEPLOYMENT_MODEL) {
      case DEPLOYMENT_MODEL.ORG: {
        principals = await this.ssm.getParameter(ouParameter);
        validateOrgInput(principals);
        break;
      }
      case DEPLOYMENT_MODEL.ACCOUNT: {
        principals = await this.ssm.getParameter(accountParameter);
        validateAccountInput(principals);
        break;
      }
      case DEPLOYMENT_MODEL.HYBRID: {
        const org_principals = await this.ssm.getParameter(ouParameter);
        validateOrgInput(org_principals);
        const account_principals = await this.ssm.getParameter(
          accountParameter
        );
        validateAccountInput(account_principals);
        principals = [...org_principals, ...account_principals];
        break;
      }
    }

    return principals;
  }

  private async getOrganizationId() {
    let organizationId = "";

    if (
      process.env.DEPLOYMENT_MODEL === DEPLOYMENT_MODEL.ORG ||
      process.env.DEPLOYMENT_MODEL === DEPLOYMENT_MODEL.HYBRID
    )
      organizationId = await this.org.getOrganizationId();

    return organizationId;
  }

  private async updatePermissions(
    principals: string[],
    organizationId: string
  ) {
    await this.events.createEventBusPolicy(
      principals,
      organizationId,
      <string>process.env.EVENT_BUS_ARN,
      <string>process.env.EVENT_BUS_NAME
    );
  }

  /*
   * Trusted Advisor is a global service with a data plane in only a few regions per partition
   * commercial partition : us-east-1
   * us-gov partition: us-gov-west-1
   * ADC partitions:  not supported yet
   * There is no api that returns the current partition, so that is determined indirectly by checking the data plane region is amongst the region list
   */
  private getTARegions(regionsList: string[]): string[] {
    const taRegions = [];
    const REGION_US_EAST_1 = "us-east-1";
    const REGION_US_GOV_WEST_1 = "us-gov-west-1";
    if (regionsList.includes(REGION_US_GOV_WEST_1)) {
      taRegions.push(REGION_US_GOV_WEST_1);
    } else if (regionsList.includes(REGION_US_EAST_1)) {
      taRegions.push(REGION_US_EAST_1);
    } else {
      throw new IncorrectConfigurationException(
        `The Trusted Advisor template can only be deployed in the regions ${REGION_US_EAST_1} and ${REGION_US_GOV_WEST_1}`
      );
    }
    return taRegions;
  }

  private async getUserSelectedRegions(): Promise<string[]> {
    const regionsFromCfnTemplate = (<string>process.env.REGIONS_LIST).split(
      ","
    );
    const ssmParamName = <string>process.env.QM_REGIONS_LIST_PARAMETER;
    const regionsFromSSMParamStore = await this.ssm.getParameter(ssmParamName);
    logger.debug({
      label: `${this.moduleName}/handler/getUserSelectedRegions`,
      message: `original list of regions passed to the template = ${regionsFromCfnTemplate}`,
    });
    logger.debug({
      label: `${this.moduleName}/handler/getUserSelectedRegions`,
      message: `current list of regions from the ssm parameter = ${regionsFromSSMParamStore}`,
    });
    return regionsFromSSMParamStore;
  }

  private async manageStackSets() {
    const ouParameter = <string>process.env.QM_OU_PARAMETER;

    if (
      process.env.DEPLOYMENT_MODEL === DEPLOYMENT_MODEL.ORG ||
      process.env.DEPLOYMENT_MODEL === DEPLOYMENT_MODEL.HYBRID
    ) {
      const cfnTA = new CloudFormationHelper(
        <string>process.env.TA_STACKSET_ID
      );
      const cfnSQ = new CloudFormationHelper(
        <string>process.env.SQ_STACKSET_ID
      );
      const isTAAvailable =
        await new SupportHelper().isTrustedAdvisorAvailable();
      const deploymentTargets = await this.ssm.getParameter(ouParameter);
      const sqRegions = [];
      const userSelectedRegions = await this.getUserSelectedRegions();
      const spokeDeploymentMetricData: SpokeDeploymentMetricData = {};
      if (
        userSelectedRegions.length === 0 ||
        arrayIncludesIgnoreCase(userSelectedRegions, "ALL")
      ) {
        sqRegions.push(...(await this.ec2.getEnabledRegionNames()));
        spokeDeploymentMetricData.RegionsList = "ALL";
      } else {
        sqRegions.push(...userSelectedRegions);
        spokeDeploymentMetricData.RegionsList = userSelectedRegions.join(",");
      }
      const taRegions = this.getTARegions(sqRegions);
      logger.debug({
        label: `${this.moduleName}/handler/manageStackSets`,
        message: `StackSet Operation Preferences = ${JSON.stringify(
          this.stackSetOpsPrefs
        )}`,
      });
      if (isTAAvailable) {
        await this.manageStackSetInstances(cfnTA, deploymentTargets, taRegions);
      }
      await this.manageStackSetInstances(
        cfnSQ,
        deploymentTargets,
        sqRegions,
        spokeDeploymentMetricData
      );
      await this.sendMetric(
        {
          TAAvailable: isTAAvailable,
        },
        "Is Trusted Advisor Available"
      );
    }
  }

  /**
   * <p>creates or deletes stacks in the stackset based on the difference between the deployed and desired instances
   * the difference is determined by the following criteria</p>
   * ```
   * OrgRootMode - differences in the list of regions from the parameter store and the list of regions where the stack is currently deployed
   * OrgUnitsMode - differences both in the regions lists and deployment targets
   * ```
   * <p>the createStackSets and deleteStackSets functions are called with the following two parameters</p>
   * ```
   * deploymentTargets
   * regionsList
   * ```
   * If either is empty, the functions abort and return without touching the stackset
   */
  private async manageStackSetInstances(
    stackSet: CloudFormationHelper,
    deploymentTargets: string[],
    regions: string[],
    spokeDeploymentMetricData?: SpokeDeploymentMetricData
  ) {
    const deployedRegions = await stackSet.getDeployedRegions();
    const regionsToRemove = arrayDiff(deployedRegions, regions);
    const regionsNetNew = arrayDiff(regions, deployedRegions);
    logger.debug({
      label: `${this.moduleName}/handler/manageStackSetInstances ${stackSet.stackSetName}`,
      message: `deployedRegions: ${JSON.stringify(deployedRegions)}`,
    });
    logger.debug({
      label: `${this.moduleName}/handler/manageStackSetInstances ${stackSet.stackSetName}`,
      message: `regionsToRemove: ${JSON.stringify(regionsToRemove)}`,
    });
    logger.debug({
      label: `${this.moduleName}/handler/manageStackSetInstances ${stackSet.stackSetName}`,
      message: `regionsNetNew: ${JSON.stringify(regionsNetNew)}`,
    });
    const sendMetric =
      stringEqualsIgnoreCase(<string>process.env.SEND_METRIC, "Yes") &&
      spokeDeploymentMetricData;
    if (deploymentTargets[0].match(ORG_REGEX)) {
      const root = await this.org.getRootId();
      await stackSet.deleteStackSetInstances(
        [root],
        regionsToRemove,
        this.stackSetOpsPrefs
      );
      await stackSet.createStackSetInstances(
        [root],
        regionsNetNew,
        this.stackSetOpsPrefs
      );
      if (sendMetric) {
        spokeDeploymentMetricData.SpokeCount =
          (await this.org.getNumberOfAccountsInOrg()) - 1; //minus the management account
      }
    } else {
      const deployedTargets = await stackSet.getDeploymentTargets();
      const targetsToRemove = arrayDiff(deployedTargets, deploymentTargets);
      const targetsNetNew = arrayDiff(deploymentTargets, deployedTargets);
      logger.debug({
        label: `${this.moduleName}/handler/manageStackSetInstances ${stackSet.stackSetName}`,
        message: `targetsToRemove: ${JSON.stringify(targetsToRemove)}`,
      });
      logger.debug({
        label: `${this.moduleName}/handler/manageStackSetInstances ${stackSet.stackSetName}`,
        message: `targetsNetNew: ${JSON.stringify(targetsNetNew)}`,
      });
      await stackSet.deleteStackSetInstances(
        targetsToRemove,
        deployedRegions,
        this.stackSetOpsPrefs
      );
      await stackSet.deleteStackSetInstances(
        deployedTargets,
        regionsToRemove,
        this.stackSetOpsPrefs
      );
      await stackSet.createStackSetInstances(
        targetsNetNew,
        regions,
        this.stackSetOpsPrefs
      );
      await stackSet.createStackSetInstances(
        deploymentTargets,
        regionsNetNew,
        this.stackSetOpsPrefs
      );
      if (sendMetric) {
        const allPromises = Promise.allSettled(
          deploymentTargets.map(async (ouId) => {
            return this.org.getNumberOfAccountsInOU(ouId);
          })
        );
        spokeDeploymentMetricData.SpokeCount = (await allPromises)
          .map((result) => (result.status === "fulfilled" ? result.value : 0))
          .reduce((count1, count2) => count1 + count2);
      }
    }
    if (sendMetric) {
      await this.sendMetric(
        {
          SpokeCount: spokeDeploymentMetricData?.SpokeCount || 0,
          SpokeDeploymentRegions: spokeDeploymentMetricData?.RegionsList || "",
        },
        "Spoke Deployment Metric"
      );
    }
  }

  private async sendMetric(
    data: { [key: string]: string | number | boolean },
    message = ""
  ) {
    const metric = {
      UUID: <string>process.env.SOLUTION_UUID,
      Solution: <string>process.env.SOLUTION_ID,
      TimeStamp: new Date().toISOString().replace("T", " ").replace("Z", ""), // Date and time instant in a java.sql.Timestamp compatible format,
      Data: {
        Event: "ManageStackSetInstances",
        Version: <string>process.env.VERSION,
        ...data,
      },
    };
    try {
      await sendAnonymizedMetric(<string>process.env.METRICS_ENDPOINT, metric);
      logger.info({
        label: `${this.moduleName}/sendMetric`,
        message: `${message} metric sent successfully`,
      });
    } catch (error) {
      logger.warn({
        label: `${this.moduleName}/sendMetric`,
        message: `${message} metric failed ${error}`,
      });
    }
  }
}
