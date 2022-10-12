// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  IncorrectConfigurationException,
  logger,
  OrganizationsHelper,
} from "solutions-utils";

/**
 * @description
 * The pre-requisite manager class has methods to support pre-req checks
 */

export class PreReqManager {
  /**
   * @description accound-id where stack is deployed, should be Organizations Management account
   */
  readonly accountId: string;
  readonly orgHelper;
  protected readonly moduleName: string;

  /**
   * @constructor
   */
  constructor(accountId: string) {
    this.accountId = accountId;
    this.orgHelper = new OrganizationsHelper();
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description throw error unless the organization full features is enabled
   */
  async throwIfOrgMisconfigured() {
    const organization = await this.orgHelper.getOrganizationDetails();

    // checking organizations full features
    if (organization && organization.FeatureSet !== "ALL") {
      const message = "Organization must be set with full-features";
      logger.error({
        label: this.moduleName,
        message: message,
      });
      throw new IncorrectConfigurationException(message);
    }

    // checking monitoring account is not same as management account
    if (organization && organization.MasterAccountId !== this.accountId) {
      const message =
        "The template must be deployed in Organization Management account";
      logger.error({
        label: this.moduleName,
        message: message,
      });
      throw new IncorrectConfigurationException(message);
    }
  }

  /**
   * @description enable trusted access for aws services
   */
  async enableTrustedAccess() {
    await this.orgHelper.enableAWSServiceAccess(
      "member.org.stacksets.cloudformation.amazonaws.com"
    );
  }

  /**
   * @description register delegated administrator for StackSets
   */
  async registerDelegatedAdministrator(monitortingAccountId: string) {
    if (this.accountId === monitortingAccountId) {
      const message =
        "Cannot register Management account as a delegated StackSet administrator";
      logger.error({
        label: this.moduleName,
        message: message,
      });
      throw new IncorrectConfigurationException(message);
    }

    await this.orgHelper.registerDelegatedAdministrator(
      monitortingAccountId,
      "member.org.stacksets.cloudformation.amazonaws.com"
    );
  }
}
