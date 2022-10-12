// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @description service codes
 */
export enum SQ_SERVICE_CODES {
  CLOUDWATCH = "monitoring",
  DYNAMODB = "dynamodb",
  EC2 = "ec2",
  ECR = "ecr",
  FIREHOSE = "firehose",
}

/**
 * @description supported services for service quotas monitoring
 */
export const SUPPORTED_SERVICES = Object.values(SQ_SERVICE_CODES);
