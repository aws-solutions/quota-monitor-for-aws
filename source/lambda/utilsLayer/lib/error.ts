// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description generic exception for resource not found
 * @param {string} message - exception message
 * @returns
 */
export class ResourceNotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceNotFoundException";
  }
}

/**
 * @description generic exception for unsupported source event
 * @param {string} message - exception message
 * @returns
 */
export class UnsupportedEventException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedEventException";
  }
}

/**
 * @description generic exception for misconfiguration
 * @param {string} message - exception message
 * @returns
 */
export class IncorrectConfigurationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IncorrectConfigurationException";
  }
}

/**
 * @description generic exception for quotas that do not support utilization monitoring
 * @param {string} message - exception message
 * @returns
 */
export class UnsupportedQuotaException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedQuotaException";
  }
}
