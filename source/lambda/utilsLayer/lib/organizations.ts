// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  DescribeOrganizationCommand,
  EnableAWSServiceAccessCommand,
  ListRootsCommand,
  OrganizationsClient,
  OrganizationsServiceException,
  paginateListAccounts,
  paginateListAccountsForParent,
  RegisterDelegatedAdministratorCommand,
} from "@aws-sdk/client-organizations";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for Organizations
 */
export class OrganizationsHelper extends ServiceHelper<OrganizationsClient> {
  readonly client;
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new OrganizationsClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description get organization id
   * @returns
   */
  @catchDecorator(OrganizationsServiceException, true)
  async getOrganizationId() {
    logger.debug({
      label: this.moduleName,
      message: `getting organization id`,
    });
    const organization = await this.getOrganizationDetails();
    return <string>organization?.Id;
  }

  @catchDecorator(OrganizationsServiceException, true)
  async getRootId() {
    logger.debug({
      label: this.moduleName,
      message: `getting root id for the organization`,
    });
    const roots = await this.client.send(new ListRootsCommand({}));
    return <string>roots.Roots?.[0].Id;
  }

  @catchDecorator(OrganizationsServiceException, true)
  async enableAWSServiceAccess(servicePrincipal: string) {
    logger.debug({
      label: this.moduleName,
      message: `enabling AWS service access`,
    });

    const command = new EnableAWSServiceAccessCommand({
      ServicePrincipal: servicePrincipal,
    });

    await this.client.send(command);
  }

  @catchDecorator(OrganizationsServiceException, true)
  async registerDelegatedAdministrator(
    accountId: string,
    servicePrincipal: string
  ) {
    logger.debug({
      label: this.moduleName,
      message: `registering delegated administrator`,
    });

    const command = new RegisterDelegatedAdministratorCommand({
      AccountId: accountId,
      ServicePrincipal: servicePrincipal,
    });

    await this.client.send(command);
  }

  @catchDecorator(OrganizationsServiceException, true)
  async getOrganizationDetails() {
    logger.debug({
      label: this.moduleName,
      message: `getting organization details`,
    });
    const _org = await this.client.send(new DescribeOrganizationCommand({}));
    return _org.Organization;
  }

  @catchDecorator(OrganizationsServiceException, true)
  async getNumberOfAccountsInOrg(): Promise<number> {
    let count = 0;
    const paginator = paginateListAccounts({
        client: this.client,
      },
      {}
    );
    for await (const page of paginator) {
      count += page.Accounts?.length || 0;
    }
    return count;
  }

  @catchDecorator(OrganizationsServiceException, true)
  async getNumberOfAccountsInOU(ouId: string): Promise<number> {
    let count = 0;
    const paginator = paginateListAccountsForParent(
      {
        client: this.client,
      },
      {
        ParentId: ouId,
      }
    );
    for await (const page of paginator) {
      count += page.Accounts?.length || 0;
    }
    return count;
  }
}
