// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { logger, SupportHelper } from "solutions-utils";

/**
 * @description supported TA check services
 */
enum TAServices {
  "AUTOSCALING" = "AutoScaling",
  "CLOUDFORMATION" = "CloudFormation",
  "DYNAMODB" = "DynamoDB",
  "EBS" = "EBS",
  "EC2" = "EC2",
  "ELB" = "ELB",
  "IAM" = "IAM",
  "KINESIS" = "Kinesis",
  "RDS" = "RDS",
  "ROUTE53" = "Route53",
  "SES" = "SES",
  "VPC" = "VPC",
}

/**
 * @description supported AWS service check-ids
 */
const serviceChecks: { [key: string]: string[] } = {};
serviceChecks[TAServices.AUTOSCALING] = ["aW7HH0l7J9", "fW7HH0l7J9"];
serviceChecks[TAServices.CLOUDFORMATION] = ["gW7HH0l7J9"];
serviceChecks[TAServices.DYNAMODB] = ["6gtQddfEw6", "c5ftjdfkMr"];
serviceChecks[TAServices.EBS] = [
  "eI7KK0l7J9",
  "dH7RR0l6J9",
  "cG7HH0l7J9",
  "tV7YY0l7J9",
  "gI7MM0l7J9",
  "wH7DD0l3J9",
  "gH5CC0e3J9",
  "dH7RR0l6J3",
  "gI7MM0l7J2",
];
serviceChecks[TAServices.EC2] = ["0Xc6LMYG8P", "iH7PP0l7J9", "aW9HH0l8J6"];
serviceChecks[TAServices.ELB] = ["iK7OO0l7J9", "EM8b3yLRTr", "8wIqYSt25K"];
serviceChecks[TAServices.IAM] = [
  "sU7XX0l7J9",
  "nO7SS0l7J9",
  "pR7UU0l7J9",
  "oQ7TT0l7J9",
  "rT7WW0l7J9",
  "qS7VV0l7J9",
];
serviceChecks[TAServices.KINESIS] = ["bW7HH0l7J9"];
serviceChecks[TAServices.RDS] = [
  "jtlIMO3qZM",
  "7fuccf1Mx7",
  "gjqMBn6pjz",
  "XG0aXHpIEt",
  "jEECYg2YVU",
  "gfZAn3W7wl",
  "dV84wpqRUs",
  "keAhfbH5yb",
  "dBkuNCvqn5",
  "3Njm0DJQO9",
  "pYW8UkYz2w",
  "UUDvOa5r34",
  "dYWBaXaaMM",
  "jEhCtdJKOY",
  "P1jhKWEmLa",
];
serviceChecks[TAServices.ROUTE53] = [
  "dx3xfcdfMr",
  "ru4xfcdfMr",
  "ty3xfcdfMr",
  "dx3xfbjfMr",
  "dx8afcdfMr",
];
serviceChecks[TAServices.SES] = ["hJ7NN0l7J9"];
serviceChecks[TAServices.VPC] = ["lN7RR0l7J9", "kM7QQ0l7J9", "jL7PP0l7J9"];

/**
 * Performs Trusted Advisor refresh
 *
 * @description helper class for TA
 */
export class TAHelper {
  readonly supportHelper;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  /**
   * @description constructor
   */
  constructor() {
    this.supportHelper = new SupportHelper();
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description - refreshes trusted advisor service checks
   */
  async refreshChecks(services: string[]) {
    logger.debug({
      label: this.moduleName,
      message: `refreshing TA checks for: ${services}`,
    });

    const checkIds: string[] = [];

    services.forEach((service) => {
      const _checks = serviceChecks[service];
      if (_checks) {
        checkIds.push(..._checks);
      }
    });

    await Promise.allSettled(
      checkIds.map(async (checkId) => {
        await this.supportHelper.refreshTrustedAdvisorCheck(checkId);
      })
    );
  }
}
