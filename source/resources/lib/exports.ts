// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_events as events,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_dynamodb as dynamodb,
  Duration,
} from "aws-cdk-lib";
import { ILayerVersion } from "aws-cdk-lib/aws-lambda";

/**
 * @description supported lambda runtime in the solution
 */
export const LAMBDA_RUNTIME_NODE = lambda.Runtime.NODEJS_16_X;

/**
 * @description partition key and sort key for service table
 */
export const SERVICE_TABLE = {
  PartitionKey: "ServiceCode",
};

/**
 * @description partition key and sort key for quota tables
 */
export const QUOTA_TABLE = {
  PartitionKey: SERVICE_TABLE.PartitionKey,
  SortKey: "QuotaCode",
};
/**
 * @description supported log levels in microservices
 */
export enum LOG_LEVEL {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export const TA_CHECKS_SERVICES = [
  "AutoScaling",
  "CloudFormation",
  "DynamoDB",
  "EBS",
  "EC2",
  "ELB",
  "IAM",
  "Kinesis",
  "RDS",
  "Route53",
  "SES",
  "VPC",
];

export const SQ_CHECKS_SERVICES = [
  "monitoring",
  "dynamodb",
  "ec2",
  "ecr",
  "firehose",
];

/**
 * @description supported event rule types
 */
export type QuotaMonitorEvent = events.Schedule | events.EventPattern;

/**
 * @description generic interface for rule to target constructs
 */
export interface IRuleToTarget<K> {
  /**
   * @description triggering event rule
   */
  rule: events.Rule;
  /**
   * @description target for the rule
   */
  target: K;
}

/**
 * @description generic interface for rule to target constructor props
 */
export interface RuleTargetProps<T> {
  /**
   * @description event pattern, rate or pattern based
   */
  eventRule: T;
  /**
   * @description kms key to be used for encryption
   */
  encryptionKey?: kms.Key;
  /**
   * @description event bus on to attach the rule to, if undefined rule will be attached to default bus
   */
  eventBus?: events.EventBus;
}

/**
 * @description generic interface for lambda function to target constructs
 */
export interface LambdaToTarget<T> {
  /**
   * @description function to perform functional logic
   */
  function: lambda.Function;
  /**
   * @description aws resource to use with the lambda function like dynamodb, event bridge, sns etc.
   */
  target: T;
}

/**
 * @description interface for rule to lambda constructor props
 */
export interface LambdaProps {
  /**
   * @description pre-provisioned lambda function to use
   */
  function?: lambda.Function;
  /**
   * @description local zip location for lambda code
   */
  assetLocation?: string;
  /**
   * @description lambda environment variables
   */
  environment?: { [key: string]: string };
  /**
   * @description timeout for lambda
   */
  timeout?: Duration;
  /**
   * @description kms key to be used for encryption
   */
  encryptionKey?: kms.Key;
  /**
   * @description layers to apply for this function
   */
  layers?: ILayerVersion[];
  /**
   * @description The amount of memory, in MB, that is allocated to your Lambda function
   */
  memorySize?: number;
}

export interface DynamoDBProps {
  /**
   * @description pre-provisioned dynamodb table  to use
   */
  table?: dynamodb.Table;
  /**
   * @description partition key for the table
   */
  partitionKey?: string;
  /**
   * @description sort key for the table
   */
  sortKey?: string;
  /**
   * @description kms key to be used for encryption
   */
  encryptionKey?: kms.Key;
}

/**
 * @description supported sources for event patterns
 */
export enum EVENT_NOTIFICATION_SOURCES {
  TRUSTED_ADVISOR = "aws.trustedadvisor",
  SERVICE_QUOTA = "aws-solutions.quota-monitor",
}

/**
 * @description support detail types in event pattern
 */
export enum EVENT_NOTIFICATION_DETAIL_TYPE {
  TRUSTED_ADVISOR = "Trusted Advisor Check Item Refresh Notification",
  SERVICE_QUOTA = "Service Quotas Utilization Notification",
}
