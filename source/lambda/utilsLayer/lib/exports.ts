// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { IncorrectConfigurationException } from "./error";

/**
 * @description interface for all service helper class
 */
interface IServiceHelper<T> {
  /**
   * @description aws service client
   */
  client: T;
}

/**
 * @description abstract class to be extended by helper service modules
 */
export abstract class ServiceHelper<T> implements IServiceHelper<T> {
  abstract client: T;
  /**
   * @description module name to be used in logging
   */
  protected abstract moduleName: string;
}

/**
 * @description interface for ssm parameter change triggering event
 */
export interface IParameterChangeEvent {
  version: string;
  id: string;
  "detail-type": "Parameter Store Change";
  source: "aws.ssm";
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: {
    operation: string;
    name: string;
    type: string;
    description: string;
  };
}

/**
 * @description interface for event bridge policy statements
 */
export interface IPolicyStatement {
  Sid: string;
  Effect: string;
  Principal: { [key: string]: string };
  Action: string;
  Resource: string;
  Condition?: { [key: string]: string };
}

// https://docs.aws.amazon.com/organizations/latest/APIReference/API_OrganizationalUnit.html
export const OU_REGEX = "^ou-[0-9a-z]{4,32}-[a-z0-9]{8,32}$";
// https://docs.aws.amazon.com/organizations/latest/APIReference/API_Organization.html
export const ORG_REGEX = "^o-[a-z0-9]{10,32}$";
// https://docs.aws.amazon.com/organizations/latest/APIReference/API_Account.html
export const ACCOUNT_REGEX = "^\\d{12}";

/**
 * @description validates if given list is valid
 * @param list - Organization Id or OUs to validate
 */
export function validateOrgInput(list: string[]) {
  // iterate over list
  list.forEach((item) => {
    if (!(item.match(OU_REGEX) || item.match(ORG_REGEX)))
      throw new IncorrectConfigurationException(
        "valid values include OU-Ids or Org-Id"
      );
    if (item.match(ORG_REGEX) && list.length > 1)
      throw new IncorrectConfigurationException(
        "when providing Org-Id, provide single Org-Id "
      );
  });
  return true;
}

/**
 * @description validates if given account list is valid
 * @param accounts - Accounts to validate
 */
export function validateAccountInput(accounts: string[]) {
  accounts.forEach((account) => {
    if (!account.match(ACCOUNT_REGEX))
      throw new IncorrectConfigurationException(
        `invalid Account Id provided:${account}`
      );
  });
}

/**
 * @description creat chunks of fixed size from array
 * @param array
 * @returns
 */
export function createChunksFromArray(
  array: Record<string, any>[],
  chunkSize: number
) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
}
