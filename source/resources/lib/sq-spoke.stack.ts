// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_events as events,
  aws_iam as iam,
  aws_dynamodb as dynamodb,
  aws_events_targets as targets,
  App,
  CfnParameter,
  Stack,
  StackProps,
  RemovalPolicy,
  Duration,
  CfnMapping,
  Fn,
  CfnCondition,
  Aspects,
  ArnFormat,
} from "aws-cdk-lib";
import path from "path";
import { LambdaToDDB } from "./lambda-dynamodb.construct";
import {
  addCfnGuardSuppression,
  addCfnGuardSuppressionToNestedResources,
  addDynamoDbSuppressions,
} from "./cfn-guard-utils";
import { Layer } from "./lambda-layer.construct";
import { EventsToLambda } from "./events-lambda.construct";
import { CustomResourceLambda } from "./custom-resource-lambda.construct";
import { StreamViewType } from "aws-cdk-lib/aws-dynamodb";
import { EVENT_NOTIFICATION_DETAIL_TYPE, EVENT_NOTIFICATION_SOURCES, QUOTA_TABLE, SERVICE_TABLE } from "./exports";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { applyDependsOn } from "./depends.utils";
import { NagSuppressions } from "cdk-nag";
import { IConstruct } from "constructs";
import { AppRegistryApplication } from "./app-registry-application";
import { ConditionAspect } from "./condition.utils";

/**
 * @description
 * This is the Trusted Advisor Spoke Stack for Quota Monitor for AWS for AWS Organizations
 * The stack should be deployed in the spoke accounts
 * @author aws-solutions
 */

interface QuotaMonitorSQSpokeProps extends StackProps {
  targetPartition: "Commercial" | "China";
}

export class QuotaMonitorSQSpoke extends Stack {
  /**
   * @param {App} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: App, id: string, props: QuotaMonitorSQSpokeProps) {
    super(scope, id, props);

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const eventBusArn = new CfnParameter(this, "EventBusArn", {
      type: "String",
    });

    const spokeSnsRegion = new CfnParameter(this, "SpokeSnsRegion", {
      type: "String",
      default: "",
      description: `The region in which the spoke SNS stack exists in this account. Leave blank if the spoke SNS is not needed.`,
    });

    const threshold = new CfnParameter(this, "NotificationThreshold", {
      type: "String",
      default: "80",
      description: "Threshold percentage for quota utilization alerts (0-100)",
      allowedPattern: "^([1-9]|[1-9][0-9])$",
      constraintDescription: "Threshold must be a whole number between 0 and 100",
    });

    const frequency = new CfnParameter(this, "MonitoringFrequency", {
      type: "String",
      default: "rate(12 hours)",
      allowedValues: ["rate(6 hours)", "rate(12 hours)", "rate(1 day)"],
    });

    const reportOKNotifications = new CfnParameter(this, "ReportOKNotifications", {
      type: "String",
      default: "No",
      allowedValues: ["Yes", "No"],
    });

    const sageMakerMonitoring = new CfnParameter(this, "SageMakerMonitoring", {
      type: "String",
      default: "Yes",
      allowedValues: ["Yes", "No"],
    });

    const connectMonitoring = new CfnParameter(this, "ConnectMonitoring", {
      type: "String",
      default: "Yes",
      allowedValues: ["Yes", "No"],
    });

    const map = new CfnMapping(this, "QuotaMonitorMap");
    map.setValue("SSMParameters", "NotificationMutingConfig", "/QuotaMonitor/spoke/NotificationConfiguration");

    const spokeSnsRegionExists = new CfnCondition(this, "SpokeSnsRegionExists", {
      expression: Fn.conditionNot(Fn.conditionEquals(spokeSnsRegion, "")),
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
            Parameters: ["EventBusArn", "SpokeSnsRegion"],
          },
          {
            Label: {
              default: "Service Quotas Configuration",
            },
            Parameters: [
              "NotificationThreshold",
              "MonitoringFrequency",
              "ReportOKNotifications",
              "SageMakerMonitoring",
              "ConnectMonitoring",
            ],
          },
        ],
        ParameterLabels: {
          EventBusArn: {
            default: "Arn for the EventBridge bus in the monitoring account",
          },
          SpokeSnsRegion: {
            default: "Region in which the spoke SNS stack exists in this account",
          },
          NotificationThreshold: {
            default: "At what quota utilization do you want notifications?",
          },
          MonitoringFrequency: {
            default: "Frequency to monitor quota utilization",
          },
          ReportOKNotifications: {
            default: "Report OK Notifications",
          },
          SageMakerMonitoring: {
            default: "Enable monitoring for SageMaker quotas",
          },
          ConnectMonitoring: {
            default: "Enable monitoring for Connect quotas",
          },
        },
      },
    };
    this.templateOptions.description = `(${this.node.tryGetContext("SOLUTION_ID")}-SQ) - ${this.node.tryGetContext(
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
    const spokeBus = new events.EventBus(this, "QM-Spoke-Bus", {
      eventBusName: "QuotaMonitorSpokeBus",
    });

    /**
     * @description primary event bus in the monitoring account to send events to
     */
    const _primaryEventBus = events.EventBus.fromEventBusArn(this, "QM-Primary-Bus", eventBusArn.valueAsString);
    const primaryEventBus = new targets.EventBus(_primaryEventBus);

    /**
     * @description utility layer for solution microservices
     */
    const utilsLayer = new Layer(
      this,
      `QM-UtilsLayer-${this.stackName}`,
      `${path.dirname(__dirname)}/../lambda/utilsLayer/dist/utilsLayer.zip`
    );

    //=================================
    // Quota list generation components
    //=================================
    /**
     * @description dynamodb table for supported sq service list
     */
    const serviceTable = new dynamodb.Table(this, `SQ-ServiceTable`, {
      partitionKey: {
        name: SERVICE_TABLE.PartitionKey,
        type: dynamodb.AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    addDynamoDbSuppressions(serviceTable);

    /**
     * @description dynamodb table for supported quota list
     */
    const quotaTable = new dynamodb.Table(this, `SQ-QuotaTable`, {
      partitionKey: {
        name: QUOTA_TABLE.PartitionKey,
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: QUOTA_TABLE.SortKey,
        type: dynamodb.AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    addDynamoDbSuppressions(quotaTable);

    /**
     * @description construct to deploy lambda backed custom resource for quota list manager
     */
    const quotaListManager = new CustomResourceLambda(this, "QM-ListManager", {
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/quotaListManager/dist/quota-list-manager.zip`,
      environment: {
        SQ_SERVICE_TABLE: serviceTable.tableName,
        SQ_QUOTA_TABLE: quotaTable.tableName,
        PARTITION_KEY: SERVICE_TABLE.PartitionKey,
        SORT: QUOTA_TABLE.SortKey,
      },
      memorySize: 256,
      layers: [utilsLayer.layer],
      timeout: Duration.minutes(15),
    });
    addCfnGuardSuppression(quotaListManager.function, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);
    addCfnGuardSuppressionToNestedResources(quotaListManager, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

    /**
     * @description lambda-dynamodb construct for service list table
     */
    new LambdaToDDB(this, "QM-ServiceList", {
      function: quotaListManager.function,
      table: serviceTable,
    });

    /**
     * @description lambda-dynamodb construct for quota list table
     */
    new LambdaToDDB(this, "QM-QuotaList", {
      function: quotaListManager.function,
      table: quotaTable,
    });

    // permissions for SQ and CloudWatch
    quotaListManager.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudwatch:GetMetricData",
          "servicequotas:ListServiceQuotas",
          "servicequotas:ListServices",
          "dynamodb:DescribeLimits",
          "autoscaling:DescribeAccountLimits",
          "route53:GetAccountLimit",
          "rds:DescribeAccountAttributes",
        ],
        effect: iam.Effect.ALLOW,
        resources: ["*"], // do not support resource level permissions
      })
    );

    // dynamodb stream trigger for lambda
    const eventSourceMapping = new DynamoEventSource(serviceTable, {
      batchSize: 1,
      startingPosition: StartingPosition.LATEST, // trigger updates for changes in service table
    });
    quotaListManager.function.addEventSource(eventSourceMapping);

    // Schedule to trigger lambda
    const quotaListManagerScheduleRule = new events.Rule(this, `QM-ListManagerSchedule`, {
      description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
        "SOLUTION_NAME"
      )} - ${id}-EventsRule`,
      schedule: events.Schedule.rate(Duration.days(30)),
    });
    quotaListManagerScheduleRule.addTarget(new targets.LambdaFunction(quotaListManager.function));

    // cdk-nag suppressions
    NagSuppressions.addResourceSuppressions(
      <IConstruct>quotaListManager.function.role,
      [
        {
          id: "AwsSolutions-IAM5",
          reason: "Actions do not support resource-level permissions",
        },
      ],
      true
    );

    //===========================
    // Quota alerting components
    //===========================
    /**
     * @description events-lambda construct
     */
    const cwPoller = new EventsToLambda(this, "QM-CWPoller", {
      eventRule: events.Schedule.expression(frequency.valueAsString),
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/cwPoller/dist/cw-poller.zip`,
      environment: {
        SQ_SERVICE_TABLE: serviceTable.tableName,
        SQ_QUOTA_TABLE: quotaTable.tableName,
        SPOKE_EVENT_BUS: spokeBus.eventBusName,
        POLLER_FREQUENCY: frequency.valueAsString,
        THRESHOLD: threshold.valueAsString,
        SQ_REPORT_OK_NOTIFICATIONS: reportOKNotifications.valueAsString,
      },
      memorySize: 512,
      layers: [utilsLayer.layer],
      timeout: Duration.minutes(15),
    });
    addCfnGuardSuppression(cwPoller.target, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

    // permission to query the quota table
    cwPoller.target.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:Query"],
        resources: [quotaTable.tableArn],
      })
    );
    // permission to scan the service table
    cwPoller.target.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:Scan"],
        resources: [serviceTable.tableArn],
      })
    );

    // permission to get cw metric data
    cwPoller.target.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:GetMetricData"],
        resources: ["*"], // does not support reseource-level permission
      })
    );

    // permission to put events
    cwPoller.target.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["events:PutEvents"],
        effect: iam.Effect.ALLOW,
        resources: [spokeBus.eventBusArn],
      })
    );

    // permission to get list of services
    cwPoller.target.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["servicequotas:ListServices"],
        effect: iam.Effect.ALLOW,
        resources: ["*"], // do not support resource level permissions
      })
    );

    /**
     * @description events pattern for quota utilization OK events
     */
    const quotaUtilizationOkEvent: events.EventPattern = {
      account: [this.account],
      detail: {
        status: ["OK"],
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description rule to send quota utilization OK events to centralized event bus
     */
    new events.Rule(this, `QM-Utilization-OK`, {
      description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
        "SOLUTION_NAME"
      )} - ${id}-EventsRule`,
      eventPattern: quotaUtilizationOkEvent,
      eventBus: spokeBus,
      targets: [primaryEventBus],
    });

    /**
     * @description events pattern for quota utilization WARN events
     */
    const quotaUtilizationWarnEvent: events.EventPattern = {
      account: [this.account],
      detail: {
        status: ["WARN"],
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description rule to send quota utilization WARN events to centralized event bus
     */
    new events.Rule(this, `QM-Utilization-Warn`, {
      description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
        "SOLUTION_NAME"
      )} - ${id}-EventsRule`,
      eventPattern: quotaUtilizationWarnEvent,
      eventBus: spokeBus,
      targets: [primaryEventBus],
    });

    /**
     * @description events pattern for quota utilization ERROR events
     */
    const quotaUtilizationErrorEvent: events.EventPattern = {
      account: [this.account],
      detail: {
        status: ["ERROR"],
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description rule to send quota utilization ERROR events to centralized event bus
     */
    const eventsRuleError = new events.Rule(this, `QM-Utilization-Err`, {
      description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
        "SOLUTION_NAME"
      )} - ${id}-EventsRule`,
      eventPattern: quotaUtilizationErrorEvent,
      eventBus: spokeBus,
      targets: [primaryEventBus],
    });

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
    const _spokeSnsEventBus = events.EventBus.fromEventBusArn(
      this,
      "QM-Spoke-SNS-Bus",
      Stack.of(this).formatArn({
        service: "events",
        region: spokeSnsRegion.valueAsString,
        resource: "event-bus",
        resourceName: "QuotaMonitorSnsSpokeBus",
        arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      })
    );
    const spokeSnsEventBus = new targets.EventBus(_spokeSnsEventBus);
    Aspects.of(_spokeSnsEventBus).add(new ConditionAspect(spokeSnsRegionExists));

    const spokeSnsRule = new events.Rule(this, "SpokeSnsRule", {
      description: `${this.node.tryGetContext("SOLUTION_ID")} ${this.node.tryGetContext(
        "SOLUTION_NAME"
      )} - ${id}-SpokeSnsEventsRule`,
      eventPattern: snsRulePattern,
      eventBus: spokeBus,
      targets: [spokeSnsEventBus],
    });

    Aspects.of(spokeSnsRule).add(new ConditionAspect(spokeSnsRegionExists));

    /**
     * app registry application for SQ stack
     */
    if (props.targetPartition !== "China") {
      new AppRegistryApplication(this, "SQSpokeAppRegistryApplication", {
        appRegistryApplicationName: this.node.tryGetContext("APP_REG_SQ_SPOKE_APPLICATION_NAME"),
        solutionId: `${this.node.tryGetContext("SOLUTION_ID")}-SQ`,
      });
    }

    // add mode depends on the custom resource so that it fires the lambda function at last
    // Create/Update service list
    const generateQuotaList = quotaListManager.addCustomResource("SQServiceList", {
      VERSION: this.node.tryGetContext("SOLUTION_VERSION"), // this is to trigger updates for different versions
      SageMakerMonitoring: sageMakerMonitoring.valueAsString,
      ConnectMonitoring: connectMonitoring.valueAsString,
    });
    applyDependsOn(generateQuotaList, quotaTable);
    applyDependsOn(generateQuotaList, serviceTable);
    applyDependsOn(generateQuotaList, eventsRuleError);
  }
}
