// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  App,
  Aspects,
  Aws,
  aws_cloudformation as cloudformation,
  aws_dynamodb as dynamodb,
  aws_events as events,
  aws_iam as iam,
  aws_s3_assets,
  aws_sns as sns,
  aws_ssm as ssm,
  CfnCapabilities,
  CfnCondition,
  CfnMapping,
  CfnOutput,
  CfnParameter,
  Duration,
  Fn,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Subscription } from "aws-cdk-lib/aws-sns";
import * as path from "path";
import { addCfnGuardSuppression, addCfnGuardSuppressionToNestedResources } from "./cfn-guard-utils";
import { ConditionAspect } from "./condition.utils";
import { CustomResourceLambda } from "./custom-resource-lambda.construct";
import { EventsToLambda } from "./events-lambda.construct";
import { EventsToSQS } from "./events-sqs.construct";
import { EVENT_NOTIFICATION_DETAIL_TYPE, EVENT_NOTIFICATION_SOURCES } from "./exports";
import { Layer } from "./lambda-layer.construct";
import { EventsToLambdaToSNS } from "./events-lambda-sns.construct";
import { KMS } from "./kms.construct";
import { AppRegistryApplication } from "./app-registry-application";

/**
 * @description
 * This is the Trusted Advisor Stack for Quota Monitor for AWS for AWS Organizations
 * The stack should be deployed in the monitoring account
 * @author aws-solutions
 */

interface QuotaMonitorHubProps extends StackProps {
  targetPartition: "Commercial" | "China";
}

export class QuotaMonitorHub extends Stack {
  /**
   * @param {App} scope - parent of the construct
   * @param {string} id - identifier for the object
   */
  private isChinaPartition: CfnCondition;
  constructor(scope: App, id: string, props: QuotaMonitorHubProps) {
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

    const managementAccountId = new CfnParameter(this, "ManagementAccountId", {
      description: "AWS Account Id for the organization's management account or *",
      type: "String",
      allowedPattern: "^([0-9]{1}\\d{11})|\\*$",
      default: "*",
    });

    const regionsListCfnParam = new CfnParameter(this, "RegionsList", {
      description: "Comma separated list of regions like us-east-1,us-east-2 or ALL or leave it blank for ALL",
      default: "ALL",
    });

    const snsSpokeRegion = new CfnParameter(this, "SnsSpokeRegion", {
      description:
        "The region in which to launch the SNS stack in each spoke account. Leave blank if the spoke SNS is not needed",
      type: "String",
      default: "",
    });

    const stackSetRegionConcurrencyType = new CfnParameter(this, "RegionConcurrency", {
      allowedValues: ["PARALLEL", "SEQUENTIAL"],
      default: "PARALLEL",
      description: "Choose to deploy StackSets into regions sequentially or in parallel",
    });

    const stackSetMaxConcurrentPercentage = new CfnParameter(this, "MaxConcurrentPercentage", {
      type: "Number",
      default: 100,
      minValue: 1,
      maxValue: 100,
      description:
        "Percentage of accounts per region to which you can deploy stacks at one time. The higher the number, the faster the operation",
    });

    const stackSetFailureTolerancePercentage = new CfnParameter(this, "FailureTolerancePercentage", {
      type: "Number",
      default: 0,
      minValue: 0,
      maxValue: 100,
      description:
        "Percentage of account, per region, for which stacks can fail before CloudFormation stops the operation in that region. If the operation is stopped in one region, it does not continue in other regions. The lower the number the safer the operation",
    });

    const sqNotificationThreshold = new CfnParameter(this, "SQNotificationThreshold", {
      type: "String",
      default: "80",
      description: "Threshold percentage for quota utilization alerts (0-100)",
      allowedPattern: "^([1-9]|[1-9][0-9])$",
      constraintDescription: "Threshold must be a whole number between 0 and 100",
    });

    const sqMonitoringFrequency = new CfnParameter(this, "SQMonitoringFrequency", {
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
      description:
        "Enable monitoring for SageMaker quotas. NOTE: (1) SageMaker monitoring consumes a high number of quotas, potentially resulting in higher usage cost. (2) Changing this value during a stack update will affect all spoke accounts but if left unchanged, it preserves existing spoke accounts customizations.",
    });

    const connectMonitoring = new CfnParameter(this, "ConnectMonitoring", {
      type: "String",
      default: "Yes",
      allowedValues: ["Yes", "No"],
      description:
        "Enable monitoring for Connect quotas. NOTE: (1) Connect monitoring consumes a high number of quotas, potentially resulting in higher usage cost. (2) Changing this value during a stack update will affect all spoke accounts but if left unchanged, it preserves existing spoke accounts customizations.",
    });

    //=============================================================================================
    // Mapping & Conditions
    //=============================================================================================
    const map = new CfnMapping(this, "QuotaMonitorMap");
    map.setValue("Metrics", "SendAnonymizedData", this.node.tryGetContext("SEND_METRICS"));
    map.setValue("Metrics", "MetricsEndpoint", this.node.tryGetContext("METRICS_ENDPOINT"));
    map.setValue("SSMParameters", "SlackHook", "/QuotaMonitor/SlackHook");
    map.setValue("SSMParameters", "Accounts", "/QuotaMonitor/Accounts");
    map.setValue("SSMParameters", "OrganizationalUnits", "/QuotaMonitor/OUs");
    map.setValue("SSMParameters", "NotificationMutingConfig", "/QuotaMonitor/NotificationConfiguration");
    map.setValue("SSMParameters", "RegionsList", "/QuotaMonitor/RegionsToDeploy");

    const emailTrue = new CfnCondition(this, "EmailTrueCondition", {
      expression: Fn.conditionNot(Fn.conditionEquals(snsEmail.valueAsString, "")),
    });

    const slackTrue = new CfnCondition(this, "SlackTrueCondition", {
      expression: Fn.conditionEquals(slackNotification.valueAsString, "Yes"),
    });

    const reportOKNotificationsCondition = new CfnCondition(this, "ReportOKNotificationsCondition", {
      expression: Fn.conditionEquals(reportOKNotifications.valueAsString, "Yes"),
    });

    const accountDeployCondition = new CfnCondition(this, "AccountDeployCondition", {
      expression: Fn.conditionEquals(deploymentModel, "Hybrid"),
    });

    this.isChinaPartition = new CfnCondition(this, "IsChinaPartition", {
      expression: Fn.conditionEquals(Aws.PARTITION, "aws-cn"),
    });
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
            Parameters: ["DeploymentModel", "RegionsList", "SnsSpokeRegion", "ManagementAccountId"],
          },
          {
            Label: {
              default: "Stackset Deployment Options",
            },
            Parameters: ["RegionConcurrency", "MaxConcurrentPercentage", "FailureTolerancePercentage"],
          },
          {
            Label: {
              default: "Notification Configuration",
            },
            Parameters: ["SNSEmail", "SlackNotification"],
          },
          {
            Label: {
              default: "Stackset Stack Configuration Parameters",
            },
            Parameters: [
              "SQNotificationThreshold",
              "SQMonitoringFrequency",
              "ReportOKNotifications",
              "SageMakerMonitoring",
              "ConnectMonitoring",
            ],
          },
        ],
        ParameterLabels: {
          DeploymentModel: {
            default: "Do you want to monitor quotas across Organizational Units, Accounts or both?",
          },
          SNSEmail: {
            default: "Email address for notifications",
          },
          SlackNotification: {
            default: "Do you want slack notifications?",
          },
          ManagementAccountId: {
            default: "Organization's management Id to scope permissions down for Stackset creation",
          },
          RegionsList: {
            default: "List of regions to deploy resources to monitor service quotas",
          },
          SnsSpokeRegion: {
            default: "Region in which to launch the SNS stack in the spoke accounts.",
          },
          RegionConcurrencyType: {
            default: "Region Concurrency",
          },
          MaxConcurrentPercentage: {
            default: "Percentage Maximum concurrent accounts",
          },
          FailureTolerancePercentage: {
            default: "Percentage Failure tolerance",
          },
          SQNotificationThreshold: {
            default: "At what quota utilization do you want notifications?",
          },
          SQMonitoringFrequency: {
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
    this.templateOptions.description = `(${this.node.tryGetContext("SOLUTION_ID")}) - ${this.node.tryGetContext(
      "SOLUTION_NAME"
    )} - Hub Template. Version ${this.node.tryGetContext("SOLUTION_VERSION")}`;
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
     * @description list of muted services and limits (quotas) for quota monitoring
     * value could be list of serviceCode[:quota_name|quota_code|resource]
     */
    const ssmNotificationMutingConfig = new ssm.StringListParameter(this, "QM-NotificationMutingConfig", {
      parameterName: map.findInMap("SSMParameters", "NotificationMutingConfig"),
      stringListValue: ["NOP"],
      description:
        "Muting configuration for services, limits e.g. ec2:L-1216C47A,ec2:Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances,dynamodb,logs:*,geo:L-05EFD12D",
      simpleName: false,
    });

    /**
     * @description list of regions to deploy spoke resources
     */
    const ssmRegionsList = new ssm.StringListParameter(this, "QM-RegionsList", {
      parameterName: map.findInMap("SSMParameters", "RegionsList"),
      description: "list of regions to deploy spoke resources (eg. us-east-1,us-west-2)",
      stringListValue: regionsListCfnParam.valueAsString.split(","), //initialize it with the template parameter
      simpleName: false,
    });

    /**
     * @description utility layer for solution microservices
     */
    const utilsLayer = new Layer(
      this,
      "QM-UtilsLayer",
      `${path.dirname(__dirname)}/../lambda/utilsLayer/dist/utilsLayer.zip`
    );

    //===========================
    // Solution helper components
    //===========================
    /**
     * @description construct to deploy lambda backed custom resource
     */
    const helper = new CustomResourceLambda(this, "QM-Helper", {
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/helper/dist/helper.zip`,
      layers: [utilsLayer.layer],
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metrics", "SendAnonymizedData"),
        QM_STACK_ID: id,
        QM_SLACK_NOTIFICATION: slackNotification.valueAsString,
        QM_EMAIL_NOTIFICATION: Fn.conditionIf("EmailTrueCondition", "Yes", "No").toString(),
        SAGEMAKER_MONITORING: sageMakerMonitoring.valueAsString,
        CONNECT_MONITORING: connectMonitoring.valueAsString,
      },
    });
    addCfnGuardSuppression(helper.function, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);
    addCfnGuardSuppressionToNestedResources(helper, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

    // Custom resources
    const createUUID = helper.addCustomResource("CreateUUID");
    helper.addCustomResource("LaunchData", {
      SOLUTION_UUID: createUUID.getAttString("UUID"),
    });

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
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.TRUSTED_ADVISOR, EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.TRUSTED_ADVISOR, EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description policy statement allowing READ on SSM parameter store
     */
    const slackNotifierSSMReadPolicy = new iam.PolicyStatement({
      actions: ["ssm:GetParameter"],
      effect: iam.Effect.ALLOW,
      resources: [ssmSlackHook.parameterArn, ssmNotificationMutingConfig.parameterArn],
    });

    /**
     * @description construct for events-lambda
     */
    const slackNotifier = new EventsToLambda<events.EventPattern>(this, "QM-SlackNotifier", {
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/slackNotifier/dist/slack-notifier.zip`,
      environment: {
        SLACK_HOOK: map.findInMap("SSMParameters", "SlackHook"),
        QM_NOTIFICATION_MUTING_CONFIG_PARAMETER: ssmNotificationMutingConfig.parameterName,
      },
      layers: [utilsLayer.layer],
      eventRule: slackRulePattern,
      eventBus: quotaMonitorBus,
      encryptionKey: kms.key,
    });
    addCfnGuardSuppression(slackNotifier.target, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);
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
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.TRUSTED_ADVISOR, EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.TRUSTED_ADVISOR, EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
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

    const snsPublisher = new EventsToLambdaToSNS<events.EventPattern>(this, "QM-SNSPublisher", {
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/snsPublisher/dist/sns-publisher.zip`,
      environment: {
        QM_NOTIFICATION_MUTING_CONFIG_PARAMETER: ssmNotificationMutingConfig.parameterName,
        SOLUTION_UUID: createUUID.getAttString("UUID"),
        METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metrics", "SendAnonymizedData"),
      },
      layers: [utilsLayer.layer],
      eventRule: snsRulePattern,
      eventBus: quotaMonitorBus,
      encryptionKey: kms.key,
    });
    addCfnGuardSuppression(snsPublisher.target, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

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
        status: Fn.conditionIf(reportOKNotificationsCondition.logicalId, ["OK", "WARN", "ERROR"], ["WARN", "ERROR"]),
      },
      detailType: [EVENT_NOTIFICATION_DETAIL_TYPE.TRUSTED_ADVISOR, EVENT_NOTIFICATION_DETAIL_TYPE.SERVICE_QUOTA],
      source: [EVENT_NOTIFICATION_SOURCES.TRUSTED_ADVISOR, EVENT_NOTIFICATION_SOURCES.SERVICE_QUOTA],
    };

    /**
     * @description construct for event-sqs
     */
    const summarizerEventQueue = new EventsToSQS<events.EventPattern>(this, "QM-Summarizer-EventQueue", {
      eventRule: summarizerRulePattern,
      encryptionKey: kms.key,
      eventBus: quotaMonitorBus,
    });

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
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: kms.key,
      timeToLiveAttribute: "ExpiryTime",
    });

    /**
     * @description event-lambda construct for capturing quota summary
     */
    const summarizer = new EventsToLambda<events.Schedule>(this, "QM-Reporter", {
      eventRule: events.Schedule.rate(Duration.minutes(5)),
      encryptionKey: kms.key,
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/reporter/dist/reporter.zip`,
      environment: {
        QUOTA_TABLE: summaryTable.tableName,
        SQS_URL: summarizerEventQueue.target.queueUrl,
        MAX_MESSAGES: "10", //100 messages can be read with each invocation, change as needed
        MAX_LOOPS: "10",
      },
      memorySize: 512,
      timeout: Duration.seconds(10),
      layers: [utilsLayer.layer],
    });
    addCfnGuardSuppression(summarizer.target, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

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
    const qmTAStackSet = new cloudformation.CfnStackSet(this, "QM-TA-StackSet", {
      stackSetName: "QM-TA-Spoke-StackSet",
      permissionModel: "SERVICE_MANAGED",
      description: "StackSet for deploying Quota Monitor Trusted Advisor spokes in Organization",
      templateUrl: this.getTemplateUrl("quota-monitor-ta-spoke.template"),
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
      operationPreferences: {
        regionConcurrencyType: stackSetRegionConcurrencyType.valueAsString,
        maxConcurrentPercentage: stackSetMaxConcurrentPercentage.valueAsNumber,
        failureTolerancePercentage: stackSetFailureTolerancePercentage.valueAsNumber,
      },
    });

    const qmSQStackSet = new cloudformation.CfnStackSet(this, "QM-SQ-StackSet", {
      stackSetName: "QM-SQ-Spoke-StackSet",
      permissionModel: "SERVICE_MANAGED",
      description: "StackSet for deploying Quota Monitor Service Quota spokes in Organization",
      templateUrl: this.getTemplateUrl("quota-monitor-sq-spoke.template"),
      parameters: [
        {
          parameterKey: "EventBusArn",
          parameterValue: quotaMonitorBus.eventBusArn,
        },
        {
          parameterKey: "SpokeSnsRegion",
          parameterValue: snsSpokeRegion.valueAsString,
        },
        {
          parameterKey: "SageMakerMonitoring",
          parameterValue: sageMakerMonitoring.valueAsString,
        },
        {
          parameterKey: "ConnectMonitoring",
          parameterValue: connectMonitoring.valueAsString,
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
      operationPreferences: {
        regionConcurrencyType: stackSetRegionConcurrencyType.valueAsString,
        maxConcurrentPercentage: stackSetMaxConcurrentPercentage.valueAsNumber,
        failureTolerancePercentage: stackSetFailureTolerancePercentage.valueAsNumber,
      },
    });

    const qmSnsStackSet = new cloudformation.CfnStackSet(this, "QM-SNS-StackSet", {
      stackSetName: "QM-SNS-Spoke-StackSet",
      permissionModel: "SERVICE_MANAGED",
      description: "StackSet for deploying Quota Monitor notification spokes in Organization",
      templateUrl: this.getTemplateUrl("quota-monitor-sns-spoke.template"),
      parameters: [],
      autoDeployment: {
        enabled: true,
        retainStacksOnAccountRemoval: false,
      },
      managedExecution: {
        Active: true,
      },
      capabilities: [CfnCapabilities.ANONYMOUS_IAM],
      callAs: "DELEGATED_ADMIN",
    });

    // the spoke templates which are parameters of the stacksets as assets for cdk deploy to work
    // use `npm run cdk:deploy quota-monitor-hub` to generate the template that can be deployed by cdk
    // `npm run cdk:deploy` runs cdk synth twice, once for generating the spoke templates for the stacksets
    // (with parameterized templateUrls that are to be substituted by deployment scripts)
    // and once more for generating the corresponding cdk assets and updating the corresponding templateUrls
    try {
      console.log("Attempting to generate cdk assets for the stackset templates");
      const stackSetCdkTemplateTA = new aws_s3_assets.Asset(this, "QM-TA-Spoke-StackSet-Template", {
        path: `${path.dirname(__dirname)}/cdk.out/quota-monitor-ta-spoke.template.json`,
      });
      const stackSetCdkTemplateSQ = new aws_s3_assets.Asset(this, "QM-SQ-Spoke-StackSet-Template", {
        path: `${path.dirname(__dirname)}/cdk.out/quota-monitor-sq-spoke.template.json`,
      });
      const stackSetCdkTemplateSNS = new aws_s3_assets.Asset(this, "QM-SNS-Spoke-StackSet-Template", {
        path: `${path.dirname(__dirname)}/cdk.out/quota-monitor-sns-spoke.template.json`,
      });
      console.log("Updating stackset templateUrls for cdk deployment");
      qmTAStackSet.templateUrl = stackSetCdkTemplateTA.httpUrl;
      qmSQStackSet.templateUrl = stackSetCdkTemplateSQ.httpUrl;
      qmSnsStackSet.templateUrl = stackSetCdkTemplateSNS.httpUrl;
    } catch (error) {
      //Error is expected the first time the templates are synthesized
      console.log("Not updating templateUrls for cdk deployment");
    }

    /**
     * @description event rule pattern for SSM parameters
     */
    const ssmRulePattern: events.EventPattern = {
      detailType: ["Parameter Store Change"],
      source: ["aws.ssm"],
      resources: [
        ssmQMOUs.parameterArn,
        Fn.conditionIf(accountDeployCondition.logicalId, ssmQMAccounts.parameterArn, Aws.NO_VALUE).toString(),
        ssmRegionsList.parameterArn,
      ],
    };

    /**
     * @description construct for events-lambda
     */
    const deploymentManager = new EventsToLambda<events.EventPattern>(this, "QM-Deployment-Manager", {
      eventRule: ssmRulePattern,
      encryptionKey: kms.key,
      assetLocation: `${path.dirname(__dirname)}/../lambda/services/deploymentManager/dist/deployment-manager.zip`,
      environment: {
        EVENT_BUS_NAME: quotaMonitorBus.eventBusName,
        EVENT_BUS_ARN: quotaMonitorBus.eventBusArn,
        TA_STACKSET_ID: qmTAStackSet.attrStackSetId.toString(),
        SQ_STACKSET_ID: qmSQStackSet.attrStackSetId.toString(),
        SNS_STACKSET_ID: qmSnsStackSet.attrStackSetId.toString(),
        QM_OU_PARAMETER: ssmQMOUs.parameterName.toString(),
        QM_ACCOUNT_PARAMETER: Fn.conditionIf(
          accountDeployCondition.logicalId,
          ssmQMAccounts.parameterName,
          Aws.NO_VALUE
        ).toString(),
        DEPLOYMENT_MODEL: deploymentModel.valueAsString,
        REGIONS_LIST: regionsListCfnParam.valueAsString,
        QM_REGIONS_LIST_PARAMETER: ssmRegionsList.parameterName.toString(),
        SNS_SPOKE_REGION: snsSpokeRegion.valueAsString,
        SQ_NOTIFICATION_THRESHOLD: sqNotificationThreshold.valueAsString,
        SQ_MONITORING_FREQUENCY: sqMonitoringFrequency.valueAsString,
        REPORT_OK_NOTIFICATIONS: reportOKNotifications.valueAsString,
        SOLUTION_UUID: createUUID.getAttString("UUID"),
        METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metrics", "SendAnonymizedData"),
      },
      layers: [utilsLayer.layer],
      memorySize: 512,
    });
    addCfnGuardSuppression(deploymentManager.target, ["LAMBDA_INSIDE_VPC", "LAMBDA_CONCURRENCY_CHECK"]);

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
        ssmQMOUs.parameterArn,
        Fn.conditionIf(accountDeployCondition.logicalId, ssmQMAccounts.parameterArn, Aws.NO_VALUE).toString(),
        ssmRegionsList.parameterArn,
      ],
    });
    deploymentManager.target.addToRolePolicy(helperSSMReadPolicy);

    /**
     * @description policy statement to describe organizations
     */
    const deployerOrgReadPolicy1 = new iam.PolicyStatement({
      actions: ["organizations:DescribeOrganization", "organizations:ListRoots", "organizations:ListAccounts"],
      effect: iam.Effect.ALLOW,
      resources: ["*"], // do not support resource-level permissions
    });
    const deployerOrgReadPolicy2 = new iam.PolicyStatement({
      actions: ["organizations:ListDelegatedAdministrators", "organizations:ListAccountsForParent"],
      effect: iam.Effect.ALLOW,
      resources: ["*"],
      // documentation says can be narrowed to `arn:aws:organizations::<Account>:ou/o-*/ou-*`
      // but all three
      // arn:aws:organizations::<DelegatedAdmin>:ou/o-*/ou-*
      // arn:aws:organizations::<ManagementAccount>:ou/o-*/ou-*
      // arn:aws:organizations::*:ou/o-*/ou-*
      // result in the same unrelated error message
      // Account used is not a delegated administrator
    });
    deploymentManager.target.addToRolePolicy(deployerOrgReadPolicy1);
    deploymentManager.target.addToRolePolicy(deployerOrgReadPolicy2);

    /**
     * @description policy statement allowing CRUD on stackset instances
     * <p>
     * the stacksets are owned by the organization's management account,
     * not the delegated admin account, because the api calls are being made as
     * DELEGATED_ADMIN, not SELF
     * that's why we need the management account in the following policies
     * </p>
     */
    const deployerStackSetPolicy1 = new iam.PolicyStatement({
      actions: ["cloudformation:DescribeStackSet"],
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset/QM-TA-Spoke-StackSet:*`,
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset/QM-SQ-Spoke-StackSet:*`,
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset/QM-SNS-Spoke-StackSet:*`,
      ],
    });
    const deployerStackSetPolicy2 = new iam.PolicyStatement({
      actions: [
        "cloudformation:CreateStackInstances",
        "cloudformation:DeleteStackInstances",
        "cloudformation:ListStackInstances",
      ],
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset/QM-TA-Spoke-StackSet:*`,
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset/QM-SQ-Spoke-StackSet:*`,
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset/QM-SNS-Spoke-StackSet:*`,
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset-target/QM-SNS-Spoke-StackSet:*/*`,
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset-target/QM-TA-Spoke-StackSet:*/*`,
        `arn:${this.partition}:cloudformation:*:${managementAccountId.valueAsString}:stackset-target/QM-SQ-Spoke-StackSet:*/*`,
        `arn:${this.partition}:cloudformation:*::type/resource/*`,
      ],
    });
    deploymentManager.target.addToRolePolicy(deployerStackSetPolicy1);
    deploymentManager.target.addToRolePolicy(deployerStackSetPolicy2);

    /**
     * @description policy statement allowing reading regions
     */
    const deployerRegionPolicy = new iam.PolicyStatement({
      actions: ["ec2:DescribeRegions"],
      effect: iam.Effect.ALLOW,
      resources: ["*"], // do not support resource level permission
    });
    deploymentManager.target.addToRolePolicy(deployerRegionPolicy);

    /**
     * used to check whether trusted advisor is available (have the support plan needed) in the account
     */
    const taDescribeTrustedAdvisorChecksPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["support:DescribeTrustedAdvisorChecks"],
      resources: ["*"], // does not allow resource-level permissions
    });
    deploymentManager.target.addToRolePolicy(taDescribeTrustedAdvisorChecksPolicy);

    /**
     * app registry application for hub stack
     */

    if (props.targetPartition !== "China") {
      new AppRegistryApplication(this, "HubAppRegistryApplication", {
        appRegistryApplicationName: this.node.tryGetContext("APP_REG_HUB_APPLICATION_NAME"),
        solutionId: this.node.tryGetContext("SOLUTION_ID"),
      });
    }

    //=============================================================================================
    // Outputs
    //=============================================================================================
    new CfnOutput(this, "SlackHookKey", {
      condition: slackTrue,
      value: map.findInMap("SSMParameters", "SlackHook"),
      description: "SSM parameter for Slack Web Hook, change the value for your slack workspace",
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

  private getTemplateUrl(templateName: string): string {
    const solutionBucket = this.node.tryGetContext("SOLUTION_BUCKET");
    const solutionName = this.node.tryGetContext("SOLUTION_NAME");
    const solutionVersion = this.node.tryGetContext("SOLUTION_VERSION");

    return Fn.join("", [
      "https://",
      solutionBucket,
      `-${Aws.REGION}.s3.${Aws.REGION}.amazonaws.com`,
      Fn.conditionIf(this.isChinaPartition.logicalId, ".cn", ""),
      "/",
      solutionName,
      "/",
      solutionVersion,
      "/",
      Fn.conditionIf(this.isChinaPartition.logicalId, templateName.replace(".template", "-cn.template"), templateName),
    ]);
  }
}
