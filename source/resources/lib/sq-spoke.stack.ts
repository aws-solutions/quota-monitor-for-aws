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
  CfnMapping,
  StackProps,
  RemovalPolicy,
  Duration,
} from "aws-cdk-lib";
import path from "path";
import { LambdaToDDB } from "./lambda-dynamodb.construct";
import { Layer } from "./lambda-layer.construct";
import { EventsToLambda } from "./events-lambda.construct";
import { CustomResourceLambda } from "./custom-resource-lambda.construct";
import { StreamViewType } from "aws-cdk-lib/aws-dynamodb";
import {
  EVENT_NOTIFICATION_DETAIL_TYPE,
  EVENT_NOTIFICATION_SOURCES,
  QUOTA_TABLE,
  SERVICE_TABLE,
  SQ_CHECKS_SERVICES,
} from "./exports";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { KMS } from "./kms.construct";
import { applyDependsOn } from "./depends.utils";

/**
 * @description
 * This is the Trusted Advisor Spoke Stack for Quota Monitor for AWS for AWS Organizations
 * The stack should be deployed in the spoke accounts
 * @author aws-solutions
 */
export class QuotaMonitorSQSpoke extends Stack {
  /**
   * @param {App} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: App, id: string, props: StackProps) {
    super(scope, id, props);

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const eventBusArn = new CfnParameter(this, "EventBusArn", {
      type: "String",
    });

    const threshold = new CfnParameter(this, "NotificationThreshold", {
      type: "String",
      default: "80",
      allowedValues: ["60", "70", "80"],
    });

    const frequency = new CfnParameter(this, "MonitoringFrequency", {
      type: "String",
      default: "rate(12 hours)",
      allowedValues: ["rate(6 hours)", "rate(12 hours)"],
    });

    //=============================================================================================
    // Mapping & Conditions
    //=============================================================================================
    const map = new CfnMapping(this, "QuotaMonitorMap");
    map.setValue("Metrics", "SendAnonymousData", "Yes");

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
              default: "Service Quotas Configuration",
            },
            Parameters: ["NotificationThreshold", "MonitoringFrequency"],
          },
        ],
        ParameterLabels: {
          EventBusArn: {
            default: "Arn for the EventBridge bus in the monitoring account",
          },
          NotificationThreshold: {
            default: "At what quota utilization do you want notifications?",
          },
          MonitoringFrequency: {
            default: "Frequency to monitor quota utilization",
          },
        },
      },
    };
    this.templateOptions.description = `(${this.node.tryGetContext(
      "SOLUTION_ID"
    )}-SQ) - ${this.node.tryGetContext(
      "SOLUTION_NAME"
    )} version:${this.node.tryGetContext(
      "SOLUTION_VERSION"
    )} - Service Quotas Template`;
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
    const _primaryEventBus = events.EventBus.fromEventBusArn(
      this,
      "QM-Primary-Bus",
      eventBusArn.valueAsString
    );
    const primaryEventBus = new targets.EventBus(_primaryEventBus);

    /**
     * @description kms construct to generate KMS-CMK with needed base policy
     */
    const kms = new KMS(this, "KMS-SQSpoke");

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
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kms.key,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

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
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kms.key,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    /**
     * @description construct to deploy lambda backed custom resource for quota list manager
     */
    const quotaListManager = new CustomResourceLambda(this, "QM-ListManager", {
      assetLocation: `${path.dirname(
        __dirname
      )}/../lambda/services/quotaListManager/dist/quota-list-manager.zip`,
      environment: {
        SQ_SERVICE_TABLE: serviceTable.tableName,
        SQ_QUOTA_TABLE: quotaTable.tableName,
        PARTITION_KEY: SERVICE_TABLE.PartitionKey,
        SORT: QUOTA_TABLE.SortKey,
      },
      encryptionKey: kms.key,
      layers: [utilsLayer.layer],
      timeout: Duration.seconds(15),
    });

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
        ],
        effect: iam.Effect.ALLOW,
        resources: ["*"], // do not support resource level permissions
      })
    );

    // dynamodb stream trigger for lambda
    quotaListManager.function.addEventSource(
      new DynamoEventSource(serviceTable, {
        batchSize: 1,
        startingPosition: StartingPosition.LATEST, // trigger updates for changes in service table
      })
    );

    // Create/Update service list
    const generateQuotaList = quotaListManager.addCustomResource(
      "SQServiceList",
      {
        VERSION: this.node.tryGetContext("SOLUTION_VERSION"), // this is to trigger updates for different versions
      }
    );
    applyDependsOn(generateQuotaList, quotaTable);

    // cron schdedule to trigger lambda
    const quotaListManagerScheduleRule = new events.Rule(
      this,
      `QM-ListManagerSchedule`,
      {
        description: `${this.node.tryGetContext(
          "SOLUTION_ID"
        )} ${this.node.tryGetContext("SOLUTION_NAME")} - ${id}-EventsRule`,
        schedule: events.Schedule.cron({ minute: "0", hour: "0", day: "1" }), // every 1st of the month at 00:00 UTC
      }
    );
    quotaListManagerScheduleRule.addTarget(
      new targets.LambdaFunction(quotaListManager.function)
    );

    //===========================
    // Quota alerting components
    //===========================
    /**
     * @description events-lambda construct
     */
    const cwPoller = new EventsToLambda(this, "QM-CWPoller", {
      eventRule: events.Schedule.expression(frequency.valueAsString),
      encryptionKey: kms.key,
      assetLocation: `${path.dirname(
        __dirname
      )}/../lambda/services/cwPoller/dist/cw-poller.zip`,
      environment: {
        SQ_QUOTA_TABLE: quotaTable.tableName,
        SPOKE_EVENT_BUS: spokeBus.eventBusName,
        POLLER_FREQUENCY: frequency.valueAsString,
        THRESHOLD: threshold.valueAsString,
      },
      memorySize: 512,
      layers: [utilsLayer.layer],
    });

    // permission to read from the dynamodb table
    cwPoller.target.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:Query"],
        resources: [quotaTable.tableArn],
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

    /**
     * @description events pattern for quota utilization OK events
     */
    const quotaUtilizationOkEvent: events.EventPattern = {
      account: [this.account],
      detail: {
        status: ["OK"],
        "check-item-detail": {
          Service: SQ_CHECKS_SERVICES,
        },
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description rule to send quota utilization OK events to centralized event bus
     */
    new events.Rule(this, `QM-Utilization-OK`, {
      description: `${this.node.tryGetContext(
        "SOLUTION_ID"
      )} ${this.node.tryGetContext("SOLUTION_NAME")} - ${id}-EventsRule`,
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
        "check-item-detail": {
          Service: SQ_CHECKS_SERVICES,
        },
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description rule to send quota utilization WARN events to centralized event bus
     */
    new events.Rule(this, `QM-Utilization-Warn`, {
      description: `${this.node.tryGetContext(
        "SOLUTION_ID"
      )} ${this.node.tryGetContext("SOLUTION_NAME")} - ${id}-EventsRule`,
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
        "check-item-detail": {
          Service: SQ_CHECKS_SERVICES,
        },
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description rule to send quota utilization ERROR events to centralized event bus
     */
    new events.Rule(this, `QM-Utilization-Err`, {
      description: `${this.node.tryGetContext(
        "SOLUTION_ID"
      )} ${this.node.tryGetContext("SOLUTION_NAME")} - ${id}-EventsRule`,
      eventPattern: quotaUtilizationErrorEvent,
      eventBus: spokeBus,
      targets: [primaryEventBus],
    });
  }
}
