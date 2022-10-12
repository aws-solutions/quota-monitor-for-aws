import {
  logger,
  IPolicyStatement,
  ORG_REGEX,
  validateAccountInput,
  validateOrgInput,
  CloudFormationHelper,
  EventsHelper,
  OrganizationsHelper,
  SSMHelper,
  EC2Helper,
} from "solutions-utils";

/**
 * @description supported deployment models for the solution
 */
export enum DEPLOYMENT_MODEL {
  ORG = "Organizations",
  ACCOUNT = "Accounts",
  HYBRID = "Hybrid",
}

export class DeploymentManager {
  private org;
  private events;
  private ec2;
  private ssm;

  protected readonly moduleName;

  constructor() {
    this.org = new OrganizationsHelper();
    this.events = new EventsHelper();
    this.ec2 = new EC2Helper();
    this.ssm = new SSMHelper();
    this.moduleName = <string>__filename.split("/").pop();
  }

  async manageDeployments() {
    const principals = await this.getPrincipals();
    const organizationId = await this.getOrganizationId();

    await this.updatePermissions(principals, organizationId);
    await this.updateStackSets();
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
    // create permissions for validated principals
    for (const principal of principals)
      await this.events.createTrust(principal, organizationId);

    // remove permissions no longer needed
    const busPermissions: IPolicyStatement[] =
      await this.events.getPermissions();
    for (const p of busPermissions) {
      if (!principals.includes(p.Sid)) await this.events.removeTrust(p.Sid);
    }
  }

  private async updateStackSets() {
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

      const taRegions = ["us-east-1"];
      const sqRegions: string[] = await this.ec2.getEnabledRegionNames();

      logger.debug({
        label: `${this.moduleName}/handler`,
        message: sqRegions.join(","),
      });

      const deploymentTargets = await this.ssm.getParameter(ouParameter);

      logger.debug({
        label: `${this.moduleName}/handler`,
        message: deploymentTargets.join(","),
      });

      if (deploymentTargets[0].match(ORG_REGEX)) {
        const root = await this.org.getRootId();
        await cfnTA.createStackSetInstances([root], taRegions); // create with root id as deployment target
        await cfnSQ.createStackSetInstances([root], sqRegions);
      } else {
        const deployedTargets = await cfnTA.getDeploymentTargets();

        const deployedSet = new Set(deployedTargets);
        const deploymentSet = new Set(deploymentTargets);

        const removedStacks = deployedTargets.filter(
          (target) => !deploymentSet.has(target)
        );

        const addedStacks = deploymentTargets.filter(
          (target) => !deployedSet.has(target)
        );

        logger.debug({
          label: `${this.moduleName}/handler`,
          message: `stacks to be removed: ${removedStacks.join(",")}`,
        });

        logger.debug({
          label: `${this.moduleName}/handler`,
          message: `stacks to be added: ${addedStacks.join(",")}`,
        });

        await cfnTA.deleteStackSetInstances(removedStacks, taRegions);
        await cfnTA.createStackSetInstances(addedStacks, taRegions);

        await cfnSQ.deleteStackSetInstances(removedStacks, sqRegions);
        await cfnSQ.createStackSetInstances(addedStacks, sqRegions);
      }
    }
  }
}
