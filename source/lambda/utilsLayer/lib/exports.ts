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
      throw new IncorrectConfigurationException(`valid values include OU-Ids or Org-Id ${item}`);
    if (item.match(ORG_REGEX) && list.length > 1)
      throw new IncorrectConfigurationException(`when providing Org-Id, provide single Org-Id ${item}'`);
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
      throw new IncorrectConfigurationException(`invalid Account Id provided:${account}`);
  });
}

/**
 * @description creat chunks of fixed size from array
 * @param array
 * @returns
 */
export function createChunksFromArray(array: Record<string, any>[], chunkSize: number) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    const chunk = array.slice(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * @description case insensitive string compare
 * @param str1
 * @param str2
 */
export function stringEqualsIgnoreCase(str1: string, str2: string): boolean {
  return str1.toLowerCase() === str2.toLowerCase();
}

/**
 * case-insensitive array includes
 * @param arr
 * @param value
 */
export function arrayIncludesIgnoreCase(arr: string[], value: string): boolean {
  const valueL = value.toLowerCase();
  return arr.some((s) => valueL === s.toLowerCase());
}

/**
 * checks whether the array contains one of the given values (case-insensitive)
 * @param arr
 * @param values
 */
export function arrayIncludesAnyIgnoreCase(arr: string[], values: string[]) {
  return arr.find((s) => arrayIncludesIgnoreCase(values, s)) !== undefined;
}

/**
 * returns the items in arr1, but not in arr2
 * @param arr1
 * @param arr2
 */
export function arrayDiff(arr1: any[], arr2: any[]): any[] {
  const set2 = new Set(arr2);
  return arr1.filter((item) => !set2.has(item));
}

/**
 * generates a map of muted services to quotas
 * @param mutingConfig
 * @param separator
 */
function getMutedNotificationMap(mutingConfig: string[], separator: string) {
  const mutedMap: { [key: string]: string[] } = {};
  for (const config of mutingConfig) {
    const parts = config.split(separator);
    const lowerCaseService = parts[0].toLowerCase(); //to make the map case-insensitive
    if (lowerCaseService !== "") {
      if (!mutedMap[lowerCaseService]) {
        mutedMap[lowerCaseService] = [];
      }
      if (parts.length === 2) {
        mutedMap[lowerCaseService].push(parts[1]);
      }
    }
  }
  return mutedMap;
}

/**
 * retrieves the quotas belonging to a service from the muted notification configuration
 * @param mutingConfig
 * @param separator
 * @param service
 */
function getMutedQuotasForService(mutingConfig: string[], separator: string, service: string) {
  // using the whole return map is more readable than getting the array for a specific
  // service and differentiating between when a service not included in the config, and
  // when the service specified with no quotas to mute all quotas in that service
  const mutedMap = getMutedNotificationMap(mutingConfig, separator);
  return mutedMap[service.toLowerCase()];
}

/**
 * result of the notification config change
 * if muted is false there is no reason to populate the other fields
 */
export interface NotificationConfigStatus {
  muted: boolean;
  message?: string;
}

/**
 * type containing the values of the current quota to be checked whether it's muted
 */
export interface MutingDetail {
  service: string;
  quotaName: string;
  quotaCode?: string;
  resource?: string;
}

/**
 * checks whether a service/quota is muted in the notification setting
 * @param mutingConfig an expression like ec2:L-1216C47A,ec2:Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances,dynamodb,logs:*,geo:L-05EFD12D
 * @param mutingDetail the  values to check against the muting configuration
 */
export function getNotificationMutingStatus(
  mutingConfig: string[],
  mutingDetail: MutingDetail
): NotificationConfigStatus {
  const SEPARATOR = ":";
  const WILD_CARD = "*";
  const lowerCaseServiceCode = mutingDetail.service.toLowerCase();
  const mutedQuotas = getMutedQuotasForService(mutingConfig, SEPARATOR, mutingDetail.service);
  if (!mutedQuotas) {
    //service not included in the muting config
    return { muted: false };
  } else {
    if (mutedQuotas.length === 0) {
      //all quotas in the service muted
      return {
        muted: true,
        message: `${lowerCaseServiceCode} in the notification muting configuration; all quotas/limits in ${lowerCaseServiceCode} muted`,
      };
    } else if (
      //a specific quota is muted
      arrayIncludesAnyIgnoreCase(
        mutedQuotas,
        <string[]>(
          [mutingDetail.quotaCode, mutingDetail.quotaName, mutingDetail.resource].filter(
            (s) => s !== undefined && s !== ""
          )
        )
      )
    ) {
      return {
        muted: true,
        message: `${lowerCaseServiceCode}:${mutedQuotas} in the notification muting configuration; those quotas/limits are muted`,
      };
    } else if (arrayIncludesIgnoreCase(mutedQuotas, WILD_CARD)) {
      //wild card is used
      return {
        muted: true,
        message: `${lowerCaseServiceCode}:* in the notification muting configuration, all quotas/limits in ${lowerCaseServiceCode} muted`,
      };
    } else {
      //no matching quota found
      return { muted: false };
    }
  }
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
