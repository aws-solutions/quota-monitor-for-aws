// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { aws_dynamodb as dynamodb, aws_iam as iam, aws_lambda as lambda, Duration, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DynamoDBProps, LambdaProps, LambdaToTarget, LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "./exports";
import { KMS } from "./kms.construct";

/**
 * @description construct for lambda to dynamodb pattern
 */
export class LambdaToDDB extends Construct implements LambdaToTarget<dynamodb.Table> {
  readonly function: lambda.Function;
  readonly target: dynamodb.Table;

  /**
   * @param {Stack} scope - construct will be created in stack
   * @param {string} id - unique id for the construct
   * @param props - constructor props
   */
  constructor(scope: Stack, id: string, props: LambdaProps & DynamoDBProps) {
    super(scope, id);

    /**
     * @description lambda function
     */
    this.function = props.function
      ? props.function
      : new lambda.Function(this, `${id}-Function`, {
          description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
            "SOLUTION_NAME"
          )} - ${id}-Lambda`,
          runtime: LAMBDA_RUNTIME_NODE,
          code: lambda.Code.fromAsset(<string>props.assetLocation),
          handler: "index.handler",
          environment: {
            ...props.environment,
            LOG_LEVEL: this.node.tryGetContext("LOG_LEVEL") || LOG_LEVEL.INFO, //change as needed
            CUSTOM_SDK_USER_AGENT: `AwsSolution/${this.node.tryGetContext("SOLUTION_ID")}/${this.node.tryGetContext(
              "SOLUTION_VERSION"
            )}`,
          },
          timeout: props.timeout ? props.timeout : Duration.seconds(60),
          deadLetterQueueEnabled: true,
          environmentEncryption: props.encryptionKey,
          layers: props.layers,
          maxEventAge: Duration.hours(4),
        });

    /**
     * @description dynamodb table
     */
    this.target = props.table
      ? props.table
      : new dynamodb.Table(this, `${id}-Table`, {
          partitionKey: {
            name: <string>props.partitionKey,
            type: dynamodb.AttributeType.STRING,
          },
          sortKey: {
            name: <string>props.sortKey,
            type: dynamodb.AttributeType.STRING,
          },
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true,
          },
          readCapacity: 2,
          writeCapacity: 2,
          billingMode: dynamodb.BillingMode.PROVISIONED,
          encryption: dynamodb.TableEncryption.AWS_MANAGED,
        });

    // adding dynamodb permissions to lambda role
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        effect: iam.Effect.ALLOW,
        resources: [this.target.tableArn],
      })
    );

    // permissions to access KMS key if function created by the construct
    if (!props.function && props.encryptionKey) {
      KMS.getIAMPolicyStatementsToAccessKey(props.encryptionKey.keyArn).forEach((policyStatement) => {
        this.function.addToRolePolicy(policyStatement);
      });
    }
  }
}
