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
  aws_s3_assets,
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

    const regionsListCfnParam = new CfnParameter(this, "RegionsList", {
      description:
        "Comma separated list of regions like us-east-1,us-east-2 or ALL or leave it blank for ALL",
      default: "ALL",
    });

    const stackSetRegionConcurrencyType = new CfnParameter(
      this,
      "RegionConcurrency",
      {
        allowedValues: ["PARALLEL", "SEQUENTIAL"],
        default: "PARALLEL",
        description:
          "Choose to deploy StackSets into regions sequentially or in parallel",
      }
    );

    const stackSetMaxConcurrentPercentage = new CfnParameter(
      this,
      "MaxConcurrentPercentage",
      {
        type: "Number",
        default: 100,
        minValue: 1,
        maxValue: 100,
        description:
          "Percentage of accounts per region to which you can deploy stacks at one time. The higher the number, the faster the operation",
      }
    );

    const stackSetFailureTolerancePercentage = new CfnParameter(
      this,
      "FailureTolerancePercentage",
      {
        type: "Number",
        default: 0,
        minValue: 0,
        maxValue: 100,
        description:
          "Percentage of account, per region, for which stacks can fail before CloudFormation stops the operation in that region. If the operation is stopped in one region, it does not continue in other regions. The lower the number the safer the operation",
      }
    );

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
    map.setValue("SSMParameters", "OrganizationalUnits", "/QuotaMonitor/OUs");
    map.setValue(
      "SSMParameters",
      "NotificationMutingConfig",
      "/QuotaMonitor/NotificationConfiguration"
    );
    map.setValue(
      "SSMParameters",
      "RegionsList",
      "/QuotaMonitor/RegionsToDeploy"
    );

    const emailTrue = new CfnCondition(this, "EmailTrueCondition", {
      expression: Fn.conditionNot(
        Fn.conditionEquals(snsEmail.valueAsString, "")
      ),
    });

    const slackTrue = new CfnCondition(this, "SlackTrueCondition", {
      expression: Fn.conditionEquals(slackNotification.valueAsString, "Yes"),
    });

    const accountDeployCondition = new CfnCondition(
      this,
      "AccountDeployCondition",
      {
        expression: Fn.conditionEquals(deploymentModel, "Hybrid"),
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
            Parameters: ["DeploymentModel", "RegionsList"],
          },
          {
            Label: {
              default: "Stackset Deployment Options",
            },
            Parameters: [
              "RegionConcurrency",
              "MaxConcurrentPercentage",
              "FailureTolerancePercentage",
            ],
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
          RegionsList: {
            default:
              "List of regions to deploy resources to monitor service quotas",
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
     * @description list of regions to deploy spoke resources
     */
    const ssmRegionsList = new ssm.StringListParameter(this, "QM-RegionsList", {
      parameterName: map.findInMap("SSMParameters", "RegionsList"),
      description:
        "list of regions to deploy spoke resources (eg. us-east-1,us-west-2)",
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
      assetLocation: `${path.dirname(
        __dirname
      )}/../lambda/services/helper/dist/helper.zip`,
      layers: [utilsLayer.layer],
      environment: {
        METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
        SEND_METRIC: map.findInMap("Metrics", "SendAnonymizedData"),
        QM_STACK_ID: id,
        QM_SLACK_NOTIFICATION: slackNotification.valueAsString,
        QM_EMAIL_NOTIFICATION: Fn.conditionIf(
          "EmailTrueCondition",
          "Yes",
          "No"
        ).toString(),
      },
    });

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
          SOLUTION_UUID: createUUID.getAttString("UUID"),
          METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
          SEND_METRIC: map.findInMap("Metrics", "SendAnonymizedData"),
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
        templateUrl: Fn.sub(
          "https://" +
            `${this.node.tryGetContext("SOLUTION_BUCKET")}` +
            "-${AWS::Region}.s3.${AWS::Region}.amazonaws.com/" +
            `${this.node.tryGetContext(
              "SOLUTION_NAME"
            )}/${this.node.tryGetContext(
              "SOLUTION_VERSION"
            )}/quota-monitor-ta-spoke.template`),
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

    const qmSQStackSet = new cloudformation.CfnStackSet(
      this,
      "QM-SQ-StackSet",
      {
        stackSetName: "QM-SQ-Spoke-StackSet",
        permissionModel: "SERVICE_MANAGED",
        description:
          "StackSet for deploying Quota Monitor Service Quota spokes in Organization",
        templateUrl: Fn.sub(
          "https://" +
            `${this.node.tryGetContext("SOLUTION_BUCKET")}` +
            "-${AWS::Region}.s3.${AWS::Region}.amazonaws.com/" +
            `${this.node.tryGetContext(
              "SOLUTION_NAME"
            )}/${this.node.tryGetContext(
              "SOLUTION_VERSION"
            )}/quota-monitor-sq-spoke.template`),
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

    // the spoke templates which are parameters of the stacksets as assets for cdk deploy to work
    // use `npm run cdk:deploy quota-monitor-hub` to generate the template that can be deployed by cdk
    // `npm run cdk:deploy` runs cdk synth twice, once for generating the spoke templates for the stacksets
    // (with parameterized templateUrls that are to be substituted by deployment scripts)
    // and once more for generating the corresponding cdk assets and updating the corresponding templateUrls
    try {
      console.log(
        "Attempting to generate cdk assets for the stackset templates"
      );
      const stackSetCdkTemplateTA = new aws_s3_assets.Asset(
        this,
        "QM-TA-Spoke-StackSet-Template",
        {
          path: `${path.dirname(
            __dirname
          )}/cdk.out/quota-monitor-ta-spoke.template.json`,
        }
      );
      const stackSetCdkTemplateSQ = new aws_s3_assets.Asset(
        this,
        "QM-SQ-Spoke-StackSet-Template",
        {
          path: `${path.dirname(
            __dirname
          )}/cdk.out/quota-monitor-sq-spoke.template.json`,
        }
      );
      console.log("Updating stackset templateUrls for cdk deployment");
      qmTAStackSet.templateUrl = stackSetCdkTemplateTA.httpUrl;
      qmSQStackSet.templateUrl = stackSetCdkTemplateSQ.httpUrl;
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
        Fn.conditionIf(
          accountDeployCondition.logicalId,
          ssmQMAccounts.parameterArn,
          Aws.NO_VALUE
        ).toString(),
        ssmRegionsList.parameterArn,
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
          TA_STACKSET_ID: qmTAStackSet.attrStackSetId.toString(),
          SQ_STACKSET_ID: qmSQStackSet.attrStackSetId.toString(),
          QM_OU_PARAMETER: ssmQMOUs.parameterName.toString(),
          QM_ACCOUNT_PARAMETER: Fn.conditionIf(
            accountDeployCondition.logicalId,
            ssmQMAccounts.parameterName,
            Aws.NO_VALUE
          ).toString(),
          DEPLOYMENT_MODEL: deploymentModel.valueAsString,
          REGIONS_LIST: regionsListCfnParam.valueAsString,
          QM_REGIONS_LIST_PARAMETER: ssmRegionsList.parameterName.toString(),
          REGIONS_CONCURRENCY_TYPE: stackSetRegionConcurrencyType.valueAsString,
          MAX_CONCURRENT_PERCENTAGE:
            stackSetMaxConcurrentPercentage.valueAsString,
          FAILURE_TOLERANCE_PERCENTAGE:
            stackSetFailureTolerancePercentage.valueAsString,
          SOLUTION_UUID: createUUID.getAttString("UUID"),
          METRICS_ENDPOINT: map.findInMap("Metrics", "MetricsEndpoint"),
          SEND_METRIC: map.findInMap("Metrics", "SendAnonymizedData"),
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
        ssmQMOUs.parameterArn,
        Fn.conditionIf(
          accountDeployCondition.logicalId,
          ssmQMAccounts.parameterArn,
          Aws.NO_VALUE
        ).toString(),
        ssmRegionsList.parameterArn,
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
        "organizations:ListAccounts",
        "organizations:ListAccountsForParent",
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
        "cloudformation:ListStackInstances",
      ],
      effect: iam.Effect.ALLOW,
      resources: ["*"], // StackSet resources will be conditionally created based on deployment mode
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
    
    /**
    * app registry application for hub stack
    */
    
    new AppRegistryApplication(this, 'HubAppRegistryApplication', {
      appRegistryApplicationName: this.node.tryGetContext("APP_REG_HUB_APPLICATION_NAME"),
      solutionId: this.node.tryGetContext("SOLUTION_ID")
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
