// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_iam as iam,
  aws_cloudformation as cloudformation,
  aws_dynamodb as dynamodb,
  aws_events as events,
  aws_sns as sns,
  aws_ssm as ssm,
  App,
  CfnCondition,
  CfnParameter,
  CfnMapping,
  CfnOutput,
  Duration,
  Fn,
  Stack,
  Aspects,
  Aws,
  CfnCapabilities,
  StackProps,
} from "aws-cdk-lib";
import { Subscription } from "aws-cdk-lib/aws-sns";
import * as path from "path";
import { ConditionAspect } from "./condition.utils";
import { CustomResourceLambda } from "./custom-resource-lambda.construct";
import { EventsToLambda } from "./events-lambda.construct";
import { EventsToSNS } from "./events-sns.construct";
import { EventsToSQS } from "./events-sqs.construct";
import {
  EVENT_NOTIFICATION_DETAIL_TYPE,
  EVENT_NOTIFICATION_SOURCES,
  SQ_CHECKS_SERVICES,
  TA_CHECKS_SERVICES,
} from "./exports";
import { KMS } from "./kms.construct";
import { Layer } from "./lambda-layer.construct";

/**
 * @description
 * This is the Trusted Advisor Stack for Quota Monitor for AWS for AWS Organizations
 * The stack should be deployed in the monitoring account
 * @author aws-solutions
 */

export class QuotaMonitorHub extends Stack {
  /**
   * @param {App} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    //=============================================================================================
    // Parameters
    //=============================================================================================
    const snsEmail = new CfnParameter(this, "SNSEmail", {
      description: "To disable email notifications, leave this blank.",
      type: "String",
      default: "",
    });

    const slackNotification = new CfnParameter(this, "SlackNotification", {
      allowedValues: ["Yes", "No"],
      default: "No",
    });

    const deploymentModel = new CfnParameter(this, "DeploymentModel", {
      allowedValues: ["Organizations", "Hybrid"],
      default: "Organizations",
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
    map.setValue("SSMParameters", "SlackHook", "/QuotaMonitor/SlackHook");
    map.setValue("SSMParameters", "Accounts", "/QuotaMonitor/Accounts");
    map.setValue("SSMParameters", "OrganizationalUnits", "/QuotaMonitor/OUs");

    const snsTrue = new CfnCondition(this, "SNSTrueCondition", {
      expression: Fn.conditionNot(
        Fn.conditionEquals(snsEmail.valueAsString, "")
      ),
    });

    const slackTrue = new CfnCondition(this, "SlackTrueCondition", {
      expression: Fn.conditionEquals(slackNotification.valueAsString, "Yes"),
    });

    const orgDeployCondition = new CfnCondition(this, "OrgDeployCondition", {
      expression: Fn.conditionOr(
        Fn.conditionEquals(deploymentModel, "Organizations"),
        Fn.conditionEquals(deploymentModel, "Hybrid")
      ),
    });

    const accountDeployCondition = new CfnCondition(
      this,
      "AccountDeployCondition",
      {
        expression: Fn.conditionOr(
          Fn.conditionEquals(deploymentModel, "Accounts"),
          Fn.conditionEquals(deploymentModel, "Hybrid")
        ),
      }
    );

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: {
              default: "Deployment Configuration",
            },
            Parameters: ["DeploymentModel"],
          },
          {
            Label: {
              default: "Notification Configuration",
            },
            Parameters: ["SNSEmail", "SlackNotification"],
          },
        ],
        ParameterLabels: {
          DeploymentModel: {
            default:
              "Do you want to monitor quotas across Organizational Units, Accounts or both?",
          },
          SNSEmail: {
            default: "Email address for notifications",
          },
          SlackNotification: {
            default: "Do you want slack notifications?",
          },
        },
      },
    };
    this.templateOptions.description = `(${this.node.tryGetContext(
      "SOLUTION_ID"
    )}) - ${this.node.tryGetContext(
      "SOLUTION_NAME"
    )} version:${this.node.tryGetContext("SOLUTION_VERSION")} - Hub Template`;
    this.templateOptions.templateFormatVersion = "2010-09-09";

    //=============================================================================================
    // Resources
    //=============================================================================================

    //=========================
    // Common shared components
    //=========================
    /**
     * @description event bus for quota monitor events
     */
    const quotaMonitorBus = new events.EventBus(this, "QM-Bus", {
      eventBusName: "QuotaMonitorBus",
    });

    /**
     * @description kms construct to generate KMS-CMK with needed base policy
     */
    const kms = new KMS(this, "KMS-Hub");

    /**
     * @description slack hook url for sending quota monitor events
     */
    const ssmSlackHook = new ssm.StringParameter(this, "QM-SlackHook", {
      parameterName: map.findInMap("SSMParameters", "SlackHook"),
      stringValue: "NOP",
      description: "Slack Hook URL to send Quota Monitor events",
      simpleName: false,
    });
    Aspects.of(ssmSlackHook).add(new ConditionAspect(slackTrue));

    /**
     * @description list of targeted AWS Organizational Units for quota monitoring
     * value could be Organization-Id or list of OU-Ids
     */
    const ssmQMOUs = new ssm.StringListParameter(this, "QM-OUs", {
      parameterName: map.findInMap("SSMParameters", "OrganizationalUnits"),
      description: "List of target Organizational Units",
      stringListValue: ["NOP"],
      simpleName: false,
    });
    Aspects.of(ssmQMOUs).add(new ConditionAspect(orgDeployCondition));

    /**
     * @description list of targeted AWS Accounts for quota monitoring
     * value could be list Account-Ids
     */
    const ssmQMAccounts = new ssm.StringListParameter(this, "QM-Accounts", {
      parameterName: map.findInMap("SSMParameters", "Accounts"),
      stringListValue: ["NOP"],
      description: "List of target Accounts",
      simpleName: false,
    });
    Aspects.of(ssmQMAccounts).add(new ConditionAspect(accountDeployCondition));

    /**
     * @description utility layer for solution microservices
     */
    const utilsLayer = new Layer(
      this,
      "QM-UtilsLayer",
      `${path.dirname(__dirname)}/../lambda/utilsLayer/dist/utilsLayer.zip`
    );

    //=========================
    // Slack workflow component
    //=========================
    /**
     * @description event rule pattern for slack events
     */
    const slackRulePattern: events.EventPattern = {
      detail: {
        status: ["WARN", "ERROR"],
        "check-item-detail": {
          Service: [...TA_CHECKS_SERVICES, ...SQ_CHECKS_SERVICES],
        },
      },
      detailType: [
        EVENT_NOTIFICATION_DETAIL_TYPE.TRUSTED_ADVISOR,
        EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA,
      ],
      source: [
        EVENT_NOTIFICATION_SOURCES.TRUSTED_ADVISOR,
        EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA,
      ],
    };

    /**
     * @description policy statement allowing READ on SSM parameter store
     */
    const slackNotifierSSMReadPolicy = new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      effect: iam.Effect.ALLOW,
      resources: [ssmSlackHook.parameterArn],
    });

    /**
     * @description construct for events-lambda
     */
    const slackNotifier = new EventsToLambda<events.EventPattern>(
      this,
      "QM-SlackNotifier",
      {
        assetLocation: `${path.dirname(
          __dirname
        )}/../lambda/services/slackNotifier/dist/slack-notifier.zip`,
        environment: {
          SLACK_HOOK: map.findInMap("SSMParameters", "SlackHook"),
        },
        layers: [utilsLayer.layer],
        eventRule: slackRulePattern,
        encryptionKey: kms.key,
        eventBus: quotaMonitorBus,
      }
    );
    slackNotifier.target.addToRolePolicy(slackNotifierSSMReadPolicy);

    // applying condition on all child nodes
    Aspects.of(slackNotifier).add(new ConditionAspect(slackTrue));

    //=======================
    // SNS workflow component
    //=======================
    /**
     * @description event rule pattern for sns events
     */
    const snsRulePattern: events.EventPattern = {
      detail: {
        status: ["WARN", "ERROR"],
        "check-item-detail": {
          Service: [...TA_CHECKS_SERVICES, ...SQ_CHECKS_SERVICES],
        },
      },
      detailType: [
        EVENT_NOTIFICATION_DETAIL_TYPE.TRUSTED_ADVISOR,
        EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA,
      ],
      source: [
        EVENT_NOTIFICATION_SOURCES.TRUSTED_ADVISOR,
        EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA,
      ],
    };

    /**
     * @description construct for events-sns
     */
    const snsNotifier = new EventsToSNS<events.EventPattern>(
      this,
      "QM-SNSNotifier",
      {
        eventRule: snsRulePattern,
        encryptionKey: kms.key,
        eventBus: quotaMonitorBus,
      }
    );

    /**
     * @description subscription for email notifications for quota monitor
     */
    const qmSubscription = new Subscription(this, "QM-EmailSubscription", {
      topic: snsNotifier.target,
      protocol: sns.SubscriptionProtocol.EMAIL,
      endpoint: snsEmail.valueAsString,
    });

    // applying condition on all child nodes
    Aspects.of(qmSubscription).add(new ConditionAspect(snsTrue));
    Aspects.of(snsNotifier).add(new ConditionAspect(snsTrue));

    //==============================
    // Summarizer workflow component
    //==============================
    /**
     * @description event rule pattern for summarizer sqs events
     */
    const summarizerRulePattern: events.EventPattern = {
      detail: {
        status: ["OK", "WARN", "ERROR"],
        "check-item-detail": {
          Service: [...TA_CHECKS_SERVICES, ...SQ_CHECKS_SERVICES],
        },
      },
      detailType: [
        EVENT_NOTIFICATION_DETAIL_TYPE.TRUSTED_ADVISOR,
        EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA,
      ],
      source: [
        EVENT_NOTIFICATION_SOURCES.TRUSTED_ADVISOR,
        EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA,
      ],
    };

    /**
     * @description construct for event-sqs
     */
    const summarizerEventQueue = new EventsToSQS<events.EventPattern>(
      this,
      "QM-Summarizer-EventQueue",
      {
        eventRule: summarizerRulePattern,
        encryptionKey: kms.key,
        eventBus: quotaMonitorBus,
      }
    );

    /**
     * @description quota summary dynamodb table
     */
    const summaryTable = new dynamodb.Table(this, `QM-Table`, {
      partitionKey: {
        name: "MessageId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "TimeStamp",
        type: dynamodb.AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kms.key,
    });

    /**
     * @description event-lambda construct for capturing quota summary
     */
    const summarizer = new EventsToLambda<events.Schedule>(
      this,
      "QM-Reporter",
      {
        eventRule: events.Schedule.rate(Duration.minutes(5)),
        encryptionKey: kms.key,
        assetLocation: `${path.dirname(
          __dirname
        )}/../lambda/services/reporter/dist/reporter.zip`,
        environment: {
          QUOTA_TABLE: summaryTable.tableName,
          SQS_URL: summarizerEventQueue.target.queueUrl,
          MAX_MESSAGES: "10", //100 messages can be read with each invocation, change as needed
          MAX_LOOPS: "10",
          ANONYMOUS_DATA: map.findInMap("Metrics", "SendAnonymousData"),
        },
        memorySize: 512,
        timeout: Duration.seconds(10),
        layers: [utilsLayer.layer],
      }
    );

    // adding queue permissions to summarizer lambda function
    summarizer.target.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sqs:DeleteMessage", "sqs:ReceiveMessage"],
        effect: iam.Effect.ALLOW,
        resources: [summarizerEventQueue.target.queueArn],
      })
    );

    // adding dynamodb permissions to lambda role
    summarizer.target.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
        effect: iam.Effect.ALLOW,
        resources: [summaryTable.tableArn],
      })
    );

    //==============================================
    // StackSets for Organization/Hybrid deployments
    //==============================================
    const qmTAStackSet = new cloudformation.CfnStackSet(
      this,
      "QM-TA-StackSet",
      {
        stackSetName: "QM-TA-Spoke-StackSet",
        permissionModel: "SERVICE_MANAGED",
        description:
          "StackSet for deploying Quota Monitor Trusted Advisor spokes in Organization",
        templateUrl: `https://${this.node.tryGetContext(
          "SOLUTION_TEMPLATE_BUCKET"
        )}.s3.amazonaws.com/${this.node.tryGetContext(
          "SOLUTION_NAME"
        )}/${this.node.tryGetContext(
          "SOLUTION_VERSION"
        )}/quota-monitor-ta-spoke.template`,
        parameters: [
          {
            parameterKey: "EventBusArn",
            parameterValue: quotaMonitorBus.eventBusArn,
          },
        ],
        autoDeployment: {
          enabled: true,
          retainStacksOnAccountRemoval: false,
        },
        managedExecution: {
          Active: true,
        },
        capabilities: [CfnCapabilities.ANONYMOUS_IAM],
        callAs: "DELEGATED_ADMIN",
      }
    );
    Aspects.of(qmTAStackSet).add(new ConditionAspect(orgDeployCondition));

    const qmSQStackSet = new cloudformation.CfnStackSet(
      this,
      "QM-SQ-StackSet",
      {
        stackSetName: "QM-SQ-Spoke-StackSet",
        permissionModel: "SERVICE_MANAGED",
        description:
          "StackSet for deploying Quota Monitor Service Quota spokes in Organization",
        templateUrl: `https://${this.node.tryGetContext(
          "SOLUTION_TEMPLATE_BUCKET"
        )}.s3.amazonaws.com/${this.node.tryGetContext(
          "SOLUTION_NAME"
        )}/${this.node.tryGetContext(
          "SOLUTION_VERSION"
        )}/quota-monitor-sq-spoke.template`,
        parameters: [
          {
            parameterKey: "EventBusArn",
            parameterValue: quotaMonitorBus.eventBusArn,
          },
        ],
        autoDeployment: {
          enabled: true,
          retainStacksOnAccountRemoval: false,
        },
        managedExecution: {
          Active: true,
        },
        capabilities: [CfnCapabilities.ANONYMOUS_IAM],
        callAs: "DELEGATED_ADMIN",
      }
    );
    Aspects.of(qmSQStackSet).add(new ConditionAspect(orgDeployCondition));

    /**
     * @description event rule pattern for SSM parameters
     */
    const ssmRulePattern: events.EventPattern = {
      detailType: ["Parameter Store Change"],
      source: ["aws.ssm"],
      resources: [
        Fn.conditionIf(
          orgDeployCondition.logicalId,
          ssmQMOUs.parameterArn,
          Aws.NO_VALUE
        ).toString(),
        Fn.conditionIf(
          accountDeployCondition.logicalId,
          ssmQMAccounts.parameterArn,
          Aws.NO_VALUE
        ).toString(),
      ],
    };

    /**
     * @description construct for events-lambda
     */
    const deploymentManager = new EventsToLambda<events.EventPattern>(
      this,
      "QM-Deployment-Manager",
      {
        eventRule: ssmRulePattern,
        encryptionKey: kms.key,
        assetLocation: `${path.dirname(
          __dirname
        )}/../lambda/services/deploymentManager/dist/deployment-manager.zip`,
        environment: {
          EVENT_BUS_NAME: quotaMonitorBus.eventBusName,
          EVENT_BUS_ARN: quotaMonitorBus.eventBusArn,
          TA_STACKSET_ID: Fn.conditionIf(
            orgDeployCondition.logicalId,
            qmTAStackSet.attrStackSetId,
            Aws.NO_VALUE
          ).toString(),
          SQ_STACKSET_ID: Fn.conditionIf(
            orgDeployCondition.logicalId,
            qmSQStackSet.attrStackSetId,
            Aws.NO_VALUE
          ).toString(),
          QM_OU_PARAMETER: Fn.conditionIf(
            orgDeployCondition.logicalId,
            ssmQMOUs.parameterName,
            Aws.NO_VALUE
          ).toString(),
          QM_ACCOUNT_PARAMETER: Fn.conditionIf(
            accountDeployCondition.logicalId,
            ssmQMAccounts.parameterName,
            Aws.NO_VALUE
          ).toString(),
          DEPLOYMENT_MODEL: deploymentModel.valueAsString,
        },
        layers: [utilsLayer.layer],
        memorySize: 512,
      }
    );

    /**
     * @description policy statement to allow CRUD on event bus permissions
     */
    const deployerEventsPolicy1 = new iam.PolicyStatement({
      actions: ["events:PutPermission", "events:RemovePermission"],
      effect: iam.Effect.ALLOW,
      resources: ["*"], // do not support resource-level permission
    });
    const deployerEventsPolicy2 = new iam.PolicyStatement({
      actions: ["events:DescribeEventBus"],
      effect: iam.Effect.ALLOW,
      resources: [quotaMonitorBus.eventBusArn],
    });
    deploymentManager.target.addToRolePolicy(deployerEventsPolicy1);
    deploymentManager.target.addToRolePolicy(deployerEventsPolicy2);

    /**
     * @description policy statement to allow READ on SSM parameters
     */
    const helperSSMReadPolicy = new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      effect: iam.Effect.ALLOW,
      resources: [
        Fn.conditionIf(
          orgDeployCondition.logicalId,
          ssmQMOUs.parameterArn,
          Aws.NO_VALUE
        ).toString(),
        Fn.conditionIf(
          accountDeployCondition.logicalId,
          ssmQMAccounts.parameterArn,
          Aws.NO_VALUE
        ).toString(),
      ],
    });
    deploymentManager.target.addToRolePolicy(helperSSMReadPolicy);

    /**
     * @description policy statement to describe organizations
     */
    const deployerOrgReadPolicy = new iam.PolicyStatement({
      actions: [
        "organizations:DescribeOrganization",
        "organizations:ListRoots",
        "organizations:ListDelegatedAdministrators",
      ],
      effect: iam.Effect.ALLOW,
      resources: ["*"], // do not support resource-level permissions
    });
    deploymentManager.target.addToRolePolicy(deployerOrgReadPolicy);

    /**
     * @description policy statement allowing CRUD on stackset instances
     */
    const deployerStackSetPolicy = new iam.PolicyStatement({
      actions: [
        "cloudformation:DescribeStackSet",
        "cloudformation:CreateStackInstances",
        "cloudformation:DeleteStackInstances",
      ],
      effect: iam.Effect.ALLOW,
      resources: ["*"], // StackSet resources willl be conditionally created based on deployment mode
    });
    deploymentManager.target.addToRolePolicy(deployerStackSetPolicy);

    /**
     * @description policy statement allowing reading regions
     */
    const deployerRegionPolicy = new iam.PolicyStatement({
      actions: ["ec2:DescribeRegions"],
      effect: iam.Effect.ALLOW,
      resources: ["*"], // do not support resource level permission
    });
    deploymentManager.target.addToRolePolicy(deployerRegionPolicy);

    //===========================
    // Solution helper components
    //===========================
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
    const createUUID = helper.addCustomResource("CreateUUID");
    helper.addCustomResource("LaunchData", {
      SOLUTION_UUID: createUUID.getAttString("UUID"),
    });

    //=============================================================================================
    // Outputs
    //=============================================================================================
    new CfnOutput(this, "SlackHookKey", {
      condition: slackTrue,
      value: map.findInMap("SSMParameters", "SlackHook"),
      description:
        "SSM parameter for Slack Web Hook, change the value for your slack workspace",
    });

    new CfnOutput(this, "UUID", {
      value: createUUID.getAttString("UUID"),
      description: "UUID for the deployment",
    });

    new CfnOutput(this, "EventBus", {
      value: quotaMonitorBus.eventBusArn,
      description: "Event Bus Arn in hub",
    });
  }
}
