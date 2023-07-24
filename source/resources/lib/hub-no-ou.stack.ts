// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  aws_iam as iam,
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
  StackProps,
} from "aws-cdk-lib";
import { Subscription } from "aws-cdk-lib/aws-sns";
import * as path from "path";
import { ConditionAspect } from "./condition.utils";
import { CustomResourceLambda } from "./custom-resource-lambda.construct";
import { EventsToLambda } from "./events-lambda.construct";
import { EventsToSQS } from "./events-sqs.construct";
import {
  EVENT_NOTIFICATION_DETAIL_TYPE,
  EVENT_NOTIFICATION_SOURCES,
} from "./exports";
import { Layer } from "./lambda-layer.construct";
import { EventsToLambdaToSNS } from "./events-lambda-sns.construct";
import { KMS } from "./kms.construct";
import { AppRegistryApplication } from "./app-registry-application";

/**
 * @description
 * This is the Hub Stack for Quota Monitor for AWS
 * The stack should be deployed in the monitoring account
 * Use it when you are not using AWS Organizations
 * @author aws-solutions
 */

export class QuotaMonitorHubNoOU extends Stack {
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

    //=============================================================================================
    // Mapping & Conditions
    //=============================================================================================
    const map = new CfnMapping(this, "QuotaMonitorMap");
    map.setValue(
      "Metrics",
      "SendAnonymizedData",
      this.node.tryGetContext("SEND_METRICS")
    );
    map.setValue(
      "Metrics",
      "MetricsEndpoint",
      this.node.tryGetContext("METRICS_ENDPOINT")
    );
    map.setValue("SSMParameters", "SlackHook", "/QuotaMonitor/SlackHook");
    map.setValue("SSMParameters", "Accounts", "/QuotaMonitor/Accounts");
    map.setValue(
      "SSMParameters",
      "NotificationMutingConfig",
      "/QuotaMonitor/NotificationConfiguration"
    );

    const emailTrue = new CfnCondition(this, "EmailTrueCondition", {
      expression: Fn.conditionNot(
        Fn.conditionEquals(snsEmail.valueAsString, "")
      ),
    });

    const slackTrue = new CfnCondition(this, "SlackTrueCondition", {
      expression: Fn.conditionEquals(slackNotification.valueAsString, "Yes"),
    });

    //=============================================================================================
    // Metadata
    //=============================================================================================
    this.templateOptions.metadata = {
      "AWS::CloudFormation::Interface": {
        ParameterGroups: [
          {
            Label: {
              default: "Notification Configuration",
            },
            Parameters: ["SNSEmail", "SlackNotification"],
          },
        ],
        ParameterLabels: {
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
    )}-NoOU) - ${this.node.tryGetContext(
      "SOLUTION_NAME"
    )} version:${this.node.tryGetContext(
      "SOLUTION_VERSION"
    )} - Hub Template, use it when you are not using AWS Organizations`;
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
     * @description list of targeted AWS Accounts for quota monitoring
     * value could be list Account-Ids
     */
    const ssmQMAccounts = new ssm.StringListParameter(this, "QM-Accounts", {
      parameterName: map.findInMap("SSMParameters", "Accounts"),
      stringListValue: ["NOP"],
      description: "List of target Accounts",
      simpleName: false,
    });

    /**
     * @description list of muted services and limits (quotas) for quota monitoring
     * value could be list of serviceCode[:quota_name|quota_code|resource]
     */
    const ssmNotificationMutingConfig = new ssm.StringListParameter(
      this,
      "QM-NotificationMutingConfig",
      {
        parameterName: map.findInMap(
          "SSMParameters",
          "NotificationMutingConfig"
        ),
        stringListValue: ["NOP"],
        description:
          "Muting configuration for services, limits e.g. ec2:L-1216C47A,ec2:Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances,dynamodb,logs:*,geo:L-05EFD12D",
        simpleName: false,
      }
    );

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
      resources: [
        ssmSlackHook.parameterArn,
        ssmNotificationMutingConfig.parameterArn,
      ],
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
          QM_NOTIFICATION_MUTING_CONFIG_PARAMETER:
            ssmNotificationMutingConfig.parameterName,
        },
        layers: [utilsLayer.layer],
        eventRule: slackRulePattern,
        eventBus: quotaMonitorBus,
        encryptionKey: kms.key,
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
    const snsPublisherSSMReadPolicy = new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      effect: iam.Effect.ALLOW,
      resources: [ssmNotificationMutingConfig.parameterArn],
    });

    /**
     * @description construct for events-lambda
     */

    const snsPublisher = new EventsToLambdaToSNS<events.EventPattern>(
      this,
      "QM-SNSPublisher",
      {
        assetLocation: `${path.dirname(
          __dirname
        )}/../lambda/services/snsPublisher/dist/sns-publisher.zip`,
        environment: {
          QM_NOTIFICATION_MUTING_CONFIG_PARAMETER:
            ssmNotificationMutingConfig.parameterName,
        },
        layers: [utilsLayer.layer],
        eventRule: snsRulePattern,
        eventBus: quotaMonitorBus,
        encryptionKey: kms.key,
      }
    );

    snsPublisher.target.addToRolePolicy(snsPublisherSSMReadPolicy);

    /**
     * @description subscription for email notifications for quota monitor
     */
    const qmSubscription = new Subscription(this, "QM-EmailSubscription", {
      topic: snsPublisher.snsTopic,
      protocol: sns.SubscriptionProtocol.EMAIL,
      endpoint: snsEmail.valueAsString,
    });

    // applying condition on all child nodes
    Aspects.of(qmSubscription).add(new ConditionAspect(emailTrue));

    //==============================
    // Summarizer workflow component
    //==============================
    /**
     * @description event rule pattern for summarizer sqs events
     */
    const summarizerRulePattern: events.EventPattern = {
      detail: {
        status: ["OK", "WARN", "ERROR"],
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
      timeToLiveAttribute: "ExpiryTime",
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

    //==============================
    // Deployment manager components
    //==============================
    /**
     * @description event rule pattern for SSM parameters
     */
    const ssmRulePattern: events.EventPattern = {
      detailType: ["Parameter Store Change"],
      source: ["aws.ssm"],
      resources: [ssmQMAccounts.parameterArn],
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
          QM_ACCOUNT_PARAMETER: ssmQMAccounts.parameterName,
          DEPLOYMENT_MODEL: "Accounts",
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
      resources: [ssmQMAccounts.parameterArn],
    });
    deploymentManager.target.addToRolePolicy(helperSSMReadPolicy);

    /**
     * used to check whether trusted advisor is available (have the support plan needed) in the account
     */
    const taDescribeTrustedAdvisorChecksPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["support:DescribeTrustedAdvisorChecks"],
      resources: ["*"], // does not allow resource-level permissions
    });
    deploymentManager.target.addToRolePolicy(
      taDescribeTrustedAdvisorChecksPolicy
    );

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
        SEND_METRIC: map.findInMap("Metrics", "SendAnonymizedData"),
        QM_STACK_ID: id,
      },
    });

    // Custom resources
    const createUUID = helper.addCustomResource("CreateUUID");
    helper.addCustomResource("LaunchData", {
      SOLUTION_UUID: createUUID.getAttString("UUID"),
    });


    /**
    * app registry application for hub-no-ou-stack
    */

    new AppRegistryApplication(this, 'HubNoOUAppRegistryApplication', {
      appRegistryApplicationName: this.node.tryGetContext("APP_REG_HUB_NO_OU_APPLICATION_NAME"),
      solutionId: `${this.node.tryGetContext("SOLUTION_ID")}-NoOU`
    })

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

    new CfnOutput(this, "SNSTopic", {
      value: snsPublisher.snsTopic.topicArn,
      description: "The SNS Topic where notifications are published to",
    });
  }
}
