// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_events as events,
  aws_iam as iam,
  aws_ssm as ssm,
  aws_kms as kms,
  App,
  Stack,
  StackProps,
  CfnMapping,
  CfnOutput,
} from "aws-cdk-lib";
import path from "path";
import { addCfnGuardSuppression } from "./cfn-guard-utils";
import { Layer } from "./lambda-layer.construct";
import { EVENT_NOTIFICATION_DETAIL_TYPE, EVENT_NOTIFICATION_SOURCES } from "./exports";
import { AppRegistryApplication } from "./app-registry-application";
import { EventsToLambdaToSNS } from "./events-lambda-sns.construct";

/**
 * @description
 * This is the SNS Spoke Stack for Quota Monitor for AWS for AWS Organizations
 * The stack should be deployed in the spoke accounts before the SQ spoke stacks
 * @author aws-solutions
 */

interface QuotaMonitorSnsSpokeProps extends StackProps {
  targetPartition: "Commercial" | "China";
}

export class QuotaMonitorSnsSpoke extends Stack {
  /**
   * @param {App} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: App, id: string, props: QuotaMonitorSnsSpokeProps) {
    super(scope, id, props);

    //=============================================================================================
    // Parameters
    //=============================================================================================

    const map = new CfnMapping(this, "QuotaMonitorMap");
    map.setValue("SSMParameters", "NotificationMutingConfig", "/QuotaMonitor/spoke/NotificationConfiguration");

    //=============================================================================================
    // Metadata
    //=============================================================================================

    this.templateOptions.description = `(${this.node.tryGetContext(
      "SOLUTION_ID"
    )}-SPOKE-SNS) - ${this.node.tryGetContext(
      "SOLUTION_NAME"
    )} - Service Quotas Template. Version ${this.node.tryGetContext("SOLUTION_VERSION")}`;
    this.templateOptions.templateFormatVersion = "2010-09-09";

    //=============================================================================================
    // Resources
    //=============================================================================================

    //=========================
    // Common shared components
    //=========================
    /**
     * @description local event bus for quota monitor events
     */
    const snsSpokeBus = new events.EventBus(this, "QM-SNS-Spoke-Bus", {
      eventBusName: "QuotaMonitorSnsSpokeBus",
    });

    const spokeBusPolicyStatement = new iam.PolicyStatement({
      sid: "allowed_accounts",
      effect: iam.Effect.ALLOW,
      actions: ["events:PutEvents"],
      principals: [new iam.AccountPrincipal(this.account)],
      resources: [snsSpokeBus.eventBusArn],
    });

    snsSpokeBus.addToResourcePolicy(spokeBusPolicyStatement);

    /**
     * @description utility layer for solution microservices
     */
    const utilsLayer = new Layer(
      this,
      `QM-UtilsLayer-${this.stackName}`,
      `${path.dirname(__dirname)}/../lambda/utilsLayer/dist/utilsLayer.zip`
    );

    //=======================
    // SNS workflow component
    //=======================
    /**
     * @description event rule pattern for sns events
     */
    const snsRulePattern: events.EventPattern = {
      detail: {
        status: ["WARN", "ERROR"],
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.TRUSTED_ADVISOR, EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.TRUSTED_ADVISOR, EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description list of muted services and limits (quotas) for quota monitoring
     * value could be list of serviceCode[:quota_name|quota_code|resource]
     */
    const ssmNotificationMutingConfig = new ssm.StringListParameter(this, "sq-spoke-NotificationMutingConfig", {
      parameterName: map.findInMap("SSMParameters", "NotificationMutingConfig"),
      stringListValue: ["NOP"],
      description:
        "Muting configuration for services, limits e.g. ec2:L-1216C47A,ec2:Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances,dynamodb,logs:*,geo:L-05EFD12D",
      simpleName: false,
    });

    /**
     * @description use aws managed kms key for SNS
     */
    const aws_sns_kms = kms.Alias.fromAliasName(this, "aws-managed-sns-kms-key", "alias/aws/sns");

    /**
     * @description construct for events-lambda
     */
    const snsPublisher = new EventsToLambdaToSNS<events.EventPattern>(this, "sq-spoke-SNSPublisher", {
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/snsPublisher/dist/sns-publisher.zip`,
      environment: {
        QM_NOTIFICATION_MUTING_CONFIG_PARAMETER: ssmNotificationMutingConfig.parameterName,
        SEND_METRIC: "No",
      },
      layers: [utilsLayer.layer],
      eventRule: snsRulePattern,
      eventBus: snsSpokeBus,
      encryptionKey: aws_sns_kms,
    });
    addCfnGuardSuppression(snsPublisher.target, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

    /**
     * @description policy statement allowing READ on SSM parameter store
     */
    const snsPublisherSSMReadPolicy = new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      effect: iam.Effect.ALLOW,
      resources: [ssmNotificationMutingConfig.parameterArn],
    });

    snsPublisher.target.addToRolePolicy(snsPublisherSSMReadPolicy);

    /**
     * app registry application for spoke SNS stack
     */
    if (props.targetPartition !== "China") {
      new AppRegistryApplication(this, "SpokeSnsAppRegistryApplication", {
        appRegistryApplicationName: this.node.tryGetContext("APP_REG_SPOKE_SNS_APPLICATION_NAME"),
        solutionId: `${this.node.tryGetContext("SOLUTION_ID")}-SPOKE-SNS`,
      });
    }

    new CfnOutput(this, "SpokeSnsEventBus", {
      value: snsSpokeBus.eventBusArn,
      description: "SNS Event Bus Arn in spoke account",
    });
  }
}
