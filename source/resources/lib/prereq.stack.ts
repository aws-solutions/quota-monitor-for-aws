// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_iam as iam,
  App,
  Stack,
  CfnOutput,
  CfnParameter,
  CfnMapping,
  StackProps,
} from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";
import { IConstruct } from "constructs";
import * as path from "path";
import { CustomResourceLambda } from "./custom-resource-lambda.construct";
import { Layer } from "./lambda-layer.construct";

/**
 * @description
 * This is the Pre-Req Stack for Quota Monitor for AWS for AWS Organizations
 * The stack should be deployed in the Organization Management account
 * @author aws-solutions
 */
export class PreReqStack extends Stack {
  /**
   * @param {Construct} scope parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const monitoringAccountId = new CfnParameter(this, "MonitoringAccountId", {
      description: "AWS Account Id for the monitoring account",
      type: "String",
      allowedPattern: "^[0-9]{1}\\d{11}$",
    });

    //=============================================================================================
    // Mapping & Conditions
    //=============================================================================================
    const map = new CfnMapping(this, "QuotaMonitorMap");
    map.setValue(
      "Metrics",
      "SendAnonymousData",
      this.node.tryGetContext("SEND_METRICS")
    );
    map.setValue(
      "Metrics",
      "MetricsEndpoint",
      this.node.tryGetContext("METRICS_ENDPOINT")
    );

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: { default: "Pre-Requisite Configuration" },
            Parameters: [monitoringAccountId.logicalId],
          },
        ],
        ParameterLabels: {
          [monitoringAccountId.logicalId]: {
            default: "Quota Monitor Monitoring Account",
          },
        },
      },
    };

    this.templateOptions.description = `(${this.node.tryGetContext(
      "SOLUTION_ID"
    )}-PreReq) - ${this.node.tryGetContext(
      "SOLUTION_NAME"
    )} version:${this.node.tryGetContext(
      "SOLUTION_VERSION"
    )} - Prerequisite Template`;
    this.templateOptions.templateFormatVersion = "2010-09-09";

    //=============================================================================================
    // Resources
    //=============================================================================================

    //===========================
    // Solution helper components
    //===========================
    /**
     * @description utility layer for solution microservices
     */
    const utilsLayer = new Layer(
      this,
      "QM-UtilsLayer",
      `${path.dirname(__dirname)}/../lambda/utilsLayer/dist/utilsLayer.zip`
    );

    /**
     * @description construct to deploy lambda backed custom resource
     */
    const helper = new CustomResourceLambda(this, "QM-Helper", {
      assetLocation: `${path.dirname(
        __dirname
      )}/../lambda/services/helper/dist/helper.zip`,
      layers: [utilsLayer.layer],
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metrics", "SendAnonymousData"),
      },
    });

    // Custom resources
    const uuid = helper.addCustomResource("CreateUUID");
    helper.addCustomResource("LaunchData", {
      SOLUTION_UUID: uuid.getAttString("UUID"),
    });

    //=================================
    // Pre-requisite manager components
    //=================================
    /**
     * @description construct to deploy lambda backed custom resource
     */
    const preReqManager = new CustomResourceLambda(this, "QM-PreReqManager", {
      assetLocation: `${path.dirname(
        __dirname
      )}/../lambda/services/preReqManager/dist/prereq-manager.zip`,
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metrics", "SendAnonymousData"),
      },
      layers: [utilsLayer.layer],
    });

    /**
     * @description policy to allow write permissions for pre-requisite manager lambda
     */
    const prereqManagerPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      sid: "QMPreReqWrite",
      actions: [
        "organizations:EnableAWSServiceAccess",
        "organizations:DescribeOrganization",
        "organizations:RegisterDelegatedAdministrator",
        "iam:CreateServiceLinkedRole",
      ],
      resources: ["*"], // do not support resource level permissions
    });

    preReqManager.function.addToRolePolicy(prereqManagerPolicy);
    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(
      <IConstruct>preReqManager.function.role,
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "Actions do not support resource-level permissions",
        },
      ],
      true
    );

    preReqManager.addCustomResource("PreReqManagerCR", {
      QMMonitoringAccountId: monitoringAccountId.valueAsString,
      AccountId: this.account,
      Region: this.region,
      SolutionUuid: uuid.getAttString("UUID"),
    });

    //=============================================================================================
    // Output
    //=============================================================================================
    new CfnOutput(this, "UUID", {
      description: "UUID for deployment",
      value: uuid.getAttString("UUID"),
    });
  }
}
