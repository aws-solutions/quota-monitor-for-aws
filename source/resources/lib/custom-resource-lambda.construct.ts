// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_lambda as lambda,
  Duration,
  Stack,
  custom_resources as cr,
  CustomResource,
} from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { Construct, IConstruct } from "constructs";
import { LambdaProps, LAMBDA_RUNTIME_NODE, LOG_LEVEL } from "./exports";
import { KMS } from "./kms.construct";

/**
 * @description interface for lambda backed custom resource construct
 */
interface ICRLambda {
  /**
   * @description lambda function backing custom resource
   */
  function: lambda.Function;
  /**
   * @description method to register custom resources with the given provider
   * @param identifier - identifier for the custom resource to distinguish with others
   * @param properties - key,value pairs
   * @returns
   */
  addCustomResource(
    identifier: string,
    properties?: { [key: string]: string }
  ): CustomResource;
}

/**
 * @description construct for lambda backed custom resource
 */
export class CustomResourceLambda extends Construct implements ICRLambda {
  readonly function: lambda.Function;
  /**
   * @description custom resource provider
   */
  private provider: cr.Provider;
  constructor(scope: Stack, id: string, props: LambdaProps) {
    super(scope, id);

    this.function = new lambda.Function(this, `${id}-Function`, {
      description: `${this.node.tryGetContext(
        "SOLUTION_ID"
      )} ${this.node.tryGetContext("SOLUTION_NAME")} - ${id}-Function`,
      code: lambda.Code.fromAsset(<string>props.assetLocation),
      memorySize: 128,
      timeout: props.timeout ? props.timeout : Duration.seconds(5),
      handler: "index.handler",
      runtime: LAMBDA_RUNTIME_NODE,
      environment: {
        ...props.environment,
        LOG_LEVEL: this.node.tryGetContext("LOG_LEVEL") || LOG_LEVEL.INFO, //change as needed
        CUSTOM_SDK_USER_AGENT: `AwsSolution/${this.node.tryGetContext(
          "SOLUTION_ID"
        )}/${this.node.tryGetContext("SOLUTION_VERSION")}`,
        VERSION: this.node.tryGetContext("SOLUTION_VERSION"),
        SOLUTION_ID: this.node.tryGetContext("SOLUTION_ID"),
      },
      environmentEncryption: props.encryptionKey,
      layers: props.layers,
    });

    this.provider = new cr.Provider(this, `${id}-Provider`, {
      onEventHandler: this.function,
    });

    // permission to use kms-cmk
    if (props.encryptionKey) {
      KMS.getIAMPolicyStatementsToAccessKey(props.encryptionKey.keyArn).forEach(
        (policyStatement) => {
          this.function.addToRolePolicy(policyStatement);
        }
      );
    }

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(
      <IConstruct>this.function.role,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole added by cdk only gives write permissions for CW logs",
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "Actions restricted on kms key ARN. Only actions that do not support resource-level permissions have * in resource",
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(
      this.provider,
      [
        {
          id: "AwsSolutions-IAM4",
          reason:
            "AWSLambdaBasicExecutionRole added by cdk only gives write permissions for CW logs",
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "IAM policy is appropriated scoped, ARN is provided in policy resource, false warning",
        },
        {
          id: "AwsSolutions-L1",
          reason:
            "Lambda function created by Provider L2 construct uses nodejs 14, risk is tolerable",
        },
      ],
      true
    );
  }

  addCustomResource(
    identifier: string,
    properties?: { [key: string]: string }
  ) {
    const cr = new CustomResource(this, identifier, {
      resourceType: `Custom::${identifier}`,
      serviceToken: this.provider.serviceToken,
      properties: properties ? properties : undefined,
    });
    return cr;
  }
}
