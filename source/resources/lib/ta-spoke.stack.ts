// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_iam as iam,
  aws_events as events,
  App,
  CfnParameter,
  CfnOutput,
  Stack,
  aws_events_targets as targets,
  StackProps,
  Aspects,
  CfnCondition,
  Fn,
} from "aws-cdk-lib";
import * as path from "path";
import { addCfnGuardSuppression } from "./cfn-guard-utils";
import { EventsToLambda } from "./events-lambda.construct";
import { TA_CHECKS_SERVICES } from "./exports";
import { Layer } from "./lambda-layer.construct";
import { AppRegistryApplication } from "./app-registry-application";
import { ConditionAspect } from "./condition.utils";

/**
 * @description
 * This is the Trusted Advisor Spoke Stack for Quota Monitor for AWS for AWS Organizations
 * The stack should be deployed in the spoke accounts
 * @author aws-solutions
 */

interface QuotaMonitorTASpokeProps extends StackProps {
  targetPartition: "Commercial" | "China";
}

export class QuotaMonitorTASpoke extends Stack {
  /**
   * @param {App} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: App, id: string, props: QuotaMonitorTASpokeProps) {
    super(scope, id, props);

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const eventBusArn = new CfnParameter(this, "EventBusArn", {
      type: "String",
    });

    const taRefreshRate = new CfnParameter(this, "TARefreshRate", {
      type: "String",
      default: "rate(12 hours)",
      allowedValues: ["rate(6 hours)", "rate(12 hours)", "rate(1 day)"],
      description: "The rate at which to refresh Trusted Advisor checks",
    });

    const reportOKNotifications = new CfnParameter(this, "ReportOKNotifications", {
      type: "String",
      default: "No",
      allowedValues: ["Yes", "No"],
    });

    const reportOKNotificationsCondition = new CfnCondition(this, "ReportOKNotificationsCondition", {
      expression: Fn.conditionEquals(reportOKNotifications.valueAsString, "Yes"),
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: {
              default: "Monitoring Account Configuration",
            },
            Parameters: ["EventBusArn"],
          },
          {
            Label: {
              default: "Trusted Advisor Configuration",
            },
            Parameters: ["TARefreshRate", "ReportOKNotifications"],
          },
        ],
        ParameterLabels: {
          EventBusArn: {
            default: "Arn for the EventBridge bus in the monitoring account",
          },
          TARefreshRate: {
            default: "Trusted Advisor Refresh Rate",
          },
          ReportOKNotifications: {
            default: "Report OK Notifications",
          },
        },
      },
    };
    this.templateOptions.description = `(${this.node.tryGetContext("SOLUTION_ID")}-TA) - ${this.node.tryGetContext(
      "SOLUTION_NAME"
    )} - Trusted Advisor Template. Version ${this.node.tryGetContext("SOLUTION_VERSION")}`;
    this.templateOptions.templateFormatVersion = "2010-09-09";

    //=============================================================================================
    // Resources
    //=============================================================================================

    /**
     * @description primary event bus to send events to
     */
    const primaryEventBus = events.EventBus.fromEventBusArn(this, "QM-EventBus", eventBusArn.valueAsString);
    const target = new targets.EventBus(primaryEventBus);

    /**
     * @description event rule pattern for TA events
     */
    const TAOKPattern: events.EventPattern = {
      account: [this.account],
      detail: {
        status: ["OK"],
        "check-item-detail": {
          Service: TA_CHECKS_SERVICES,
        },
      },
      detailType: ["Trusted Advisor Check Item Refresh Notification"],
      source: ["aws.trustedadvisor"],
    };

    const TAWarnPattern: events.EventPattern = {
      account: [this.account],
      detail: {
        status: ["WARN"],
        "check-item-detail": {
          Service: TA_CHECKS_SERVICES,
        },
      },
      detailType: ["Trusted Advisor Check Item Refresh Notification"],
      source: ["aws.trustedadvisor"],
    };

    const TAErrorPattern: events.EventPattern = {
      account: [this.account],
      detail: {
        status: ["ERROR"],
        "check-item-detail": {
          Service: TA_CHECKS_SERVICES,
        },
      },
      detailType: ["Trusted Advisor Check Item Refresh Notification"],
      source: ["aws.trustedadvisor"],
    };

    // event rule for TA OK events
    const TAOKRule = new events.Rule(this, "TAOkRule", {
      description: "Quota Monitor Solution - Spoke - Rule for TA OK events",
      enabled: true,
      eventPattern: TAOKPattern,
      targets: [target],
    });
    Aspects.of(TAOKRule).add(new ConditionAspect(reportOKNotificationsCondition));

    // event rule for TA WARN events
    new events.Rule(this, "TAWarnRule", {
      description: "Quota Monitor Solution - Spoke - Rule for TA WARN events",
      enabled: true,
      eventPattern: TAWarnPattern,
      targets: [target],
    });

    // event rule for TA ERROR events
    new events.Rule(this, "TAErrorRule", {
      description: "Quota Monitor Solution - Spoke - Rule for TA ERROR events",
      enabled: true,
      eventPattern: TAErrorPattern,
      targets: [target],
    });

    /**
     * @description utility layer for solution microservices
     */
    const utilsLayer = new Layer(
      this,
      "QM-UtilsLayer",
      `${path.dirname(__dirname)}/../lambda/utilsLayer/dist/utilsLayer.zip`
    );

    /**
     * @description event-lambda construct for refreshing TA checks
     */
    const refresher = new EventsToLambda<events.Schedule>(this, "QM-TA-Refresher", {
      eventRule: events.Schedule.expression(taRefreshRate.valueAsString),
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/taRefresher/dist/ta-refresher.zip`,
      environment: {
        AWS_SERVICES: TA_CHECKS_SERVICES.join(","),
      },
      layers: [utilsLayer.layer],
    });
    addCfnGuardSuppression(refresher.target, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

    // permission to refresh TA checks
    refresher.target.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["support:RefreshTrustedAdvisorCheck"],
        resources: ["*"], // does not allow resource-level permissions
      })
    );

    /**
     * app registry application for TA stack
     */

    if (props.targetPartition !== "China") {
      new AppRegistryApplication(this, "TASpokeAppRegistryApplication", {
        appRegistryApplicationName: this.node.tryGetContext("APP_REG_TA_SPOKE_APPLICATION_NAME"),
        solutionId: `${this.node.tryGetContext("SOLUTION_ID")}-TA`,
      });
    }

    //=============================================================================================
    // Outputs
    //=============================================================================================
    new CfnOutput(this, "ServiceChecks", {
      value: TA_CHECKS_SERVICES.join(","),
      description: "service limit checks monitored in the account",
    });
  }
}
