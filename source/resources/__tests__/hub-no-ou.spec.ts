// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorHubNoOU } from "../lib/hub-no-ou.stack";
import { App } from "aws-cdk-lib";

describe("==Hub No OU Stack Tests==", () => {
  const app = new App({
    context: {
      "SOLUTION_VERSION": "test_version",
      "SOLUTION_NAME": "test_name",
      "SOLUTION_ID": "SO0005",
      "SOLUTION_BUCKET": "test_bucket",
      "SOLUTION_TEMPLATE_BUCKET": "test_bucket",
      "CUSTOM_USER_AGENT": "AwsSolution/SO0005/test_version",
      "SEND_METRICS": "Yes",
      "METRICS_ENDPOINT": "https://metrics.awssolutionsbuilder.com/generic",
      "LOG_LEVEL": "info",
      "APPLICATION_TYPE": "AWS-Solutions",
      "APP_REG_HUB_NO_OU_APPLICATION_NAME": "QM_Hub",
      "APP_REG_HUB_APPLICATION_NAME": "QM_Hub_Org",
      "APP_REG_TA_SPOKE_APPLICATION_NAME": "QM_TA",
      "APP_REG_SQ_SPOKE_APPLICATION_NAME": "QM_SQ"
    },
  });
  const stack = new QuotaMonitorHubNoOU(app, "QMHubStackNoOU");
  const template = Template.fromStack(stack);

  describe("hub stack resources", () => {
    it("should have a Lambda Utils Layer with nodejs18.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::LayerVersion", 1);
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        CompatibleRuntimes: ["nodejs18.x"],
      });
    });

    it("should have an event bus called QuotaMonitorBus", () => {
      template.hasResourceProperties("AWS::Events::EventBus", {
        Name: "QuotaMonitorBus",
      });
    });

    it("should have SSM Parameters for SlackHook, Accounts and Muted Services", () => {
      template.resourceCountIs("AWS::SSM::Parameter", 3);
    });

    it("should have events rules for the pollers", () => {
      template.resourceCountIs("AWS::Events::Rule", 5);
    });

    it("should have lambda functions for SNSPublisher, SlackNotifier, " +
      "Reporter, DeploymentManager, Helper, and provider with nodejs18.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::Function", 6);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs18.x",
      });
    });

    it("should have DeadLetterQueues for Lambda Functions ", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        DeadLetterConfig: Match.objectLike({
          TargetArn: Match.objectLike(Match.anyValue),
        }),
      });
    });

    it("should have an SNS Topic for SNSNotifier", () => {
      template.resourceCountIs("AWS::SNS::Topic", 1);
      template.hasResourceProperties("AWS::SNS::Topic", {
        KmsMasterKeyId: Match.anyValue(),
      });
    });

    it("should have an SNS Subscription for email notifications", () => {
      template.hasResource("AWS::SNS::Subscription", {
        Properties: {
          Protocol: "email",
          Endpoint: {
            Ref: "SNSEmail",
          },
        },
        Condition: "EmailTrueCondition",
      });
    });

    it("should have SQS Queues for DeadLetters and Summarizer Event, ", () => {
      template.resourceCountIs("AWS::SQS::Queue", 5);
    });

    it("should have a dynamodb table for the usage messages", () => {
      template.resourceCountIs("AWS::DynamoDB::Table", 1);
      template.hasResource("AWS::DynamoDB::Table", {
        UpdateReplacePolicy: "Retain",
        DeletionPolicy: "Retain",
        Properties: {
          KeySchema: [
            {
              AttributeName: "MessageId",
              KeyType: "HASH",
            },
            {
              AttributeName: "TimeStamp",
              KeyType: "RANGE",
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: "MessageId",
              AttributeType: "S",
            },
            {
              AttributeName: "TimeStamp",
              AttributeType: "S",
            },
          ],
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true,
          },
          SSESpecification: {
            SSEEnabled: true,
          },
        },
      });
    });

    it("should have no StackSets, ", () => {
      template.resourceCountIs("AWS::CloudFormation::StackSet", 0);
    });

    it("should have parameters", () => {
      const allParams = template.findParameters("*", {});
      expect(allParams).toHaveProperty("SNSEmail");
      expect(allParams).toHaveProperty("SlackNotification");
    });

    it("should have Service Catalog AppRegistry Application, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::Application", 1);
    });

    it("should have Service Catalog AppRegistry AttributeGroup, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroup", 1);
    });

    it("should have Service Catalog AppRegistry Resource Association, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::ResourceAssociation", 1);
      template.hasResource("AWS::ServiceCatalogAppRegistry::ResourceAssociation", {
        Properties: {
          Application: {
            "Fn::GetAtt": [
              "HubNoOUAppRegistryApplication11687F81",
              "Id"
            ]
          },
          Resource: {
            "Ref": "AWS::StackId"
          },
          ResourceType: "CFN_STACK",
        }
      });
    });

    it("should have Service Catalog AppRegistry AttributeGroup Association, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation", 1);
    });
  });

  describe("hub stack outputs", () => {
    it("should have output for Slack Hook Key", () => {
      template.hasOutput("SlackHookKey", {});
    });
    it("should have output for UUID", () => {
      template.hasOutput("UUID", {});
    });
    it("should have output for EventBus", () => {
      template.hasOutput("EventBus", {});
    });
    it("should have output for SNS topic", () => {
      template.hasOutput("SNSTopic", {});
    });
  });
});
