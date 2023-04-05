// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorHub } from "../lib/hub.stack";
import { App } from "aws-cdk-lib";

describe("==Hub Stack Tests==", () => {
  const app = new App();
  const stack = new QuotaMonitorHub(app, "QMHubStack");
  const template = Template.fromStack(stack);

  describe("hub stack resources", () => {
    it("should have a Lambda Utils Layer with nodejs16.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::LayerVersion", 1);
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        CompatibleRuntimes: ["nodejs16.x"],
      });
    });

    it("should have an event bus called QuotaMonitorBus", () => {
      template.hasResourceProperties("AWS::Events::EventBus", {
        Name: "QuotaMonitorBus",
      });
    });

    it("should have SSM Parameters for SlackHook, OU, Accounts, Notification Configuration and Regions List", () => {
      template.resourceCountIs("AWS::SSM::Parameter", 5);
      template.hasResource("AWS::SSM::Parameter", {
        Properties: {
          Description: "List of target Accounts",
          Type: "StringList",
          Value: "NOP",
        },
        Condition: "AccountDeployCondition",
      });
      expect(
        template.findResources("AWS::SSM::Parameter", {
          Condition: "OrgDeployCondition",
        })
      ).toEqual({});
    });

    it("should have events rules for the pollers", () => {
      template.resourceCountIs("AWS::Events::Rule", 5);
      let rules = template.findResources("AWS::Events::Rule", {
        Properties: {
          State: "ENABLED",
          EventPattern: {
            detail: {
              status: ["WARN", "ERROR"],
            },
          },
        },
      });
      expect(Object.keys(rules).length).toEqual(2);
      rules = template.findResources("AWS::Events::Rule", {
        Properties: {
          State: "ENABLED",
          EventPattern: {
            detail: {
              status: ["OK", "WARN", "ERROR"],
            },
          },
        },
      });
      expect(Object.keys(rules).length).toEqual(1);
      rules = template.findResources("AWS::Events::Rule", {
        Properties: {
          State: "ENABLED",
          ScheduleExpression: "rate(5 minutes)",
        },
      });
      expect(Object.keys(rules).length).toEqual(1);
      template.hasResource("AWS::Events::Rule", {
        Properties: {
          State: "ENABLED",
          EventPattern: {
            detail: {
              status: ["WARN", "ERROR"],
            },
          },
        },
        Condition: "SlackTrueCondition",
      });
    });

    it("should have lambda functions for SNSPublisher, SlackNotifier, Reporter, DeploymentManager, Helper, and provider", () => {
      template.resourceCountIs("AWS::Lambda::Function", 6);
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
      template.hasResource("AWS::SNS::Topic", {
        Properties: {
          KmsMasterKeyId: {
            "Fn::Join": [
              "",
              [
                "arn:",
                { Ref: "AWS::Partition" },
                ":kms:",
                { Ref: "AWS::Region" },
                ":",
                { Ref: "AWS::AccountId" },
                ":alias/aws/sns",
              ],
            ],
          },
        },
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

    it("should have SQ and TA StackSets, ", () => {
      template.resourceCountIs("AWS::CloudFormation::StackSet", 2);
    });

    it("should have parameters", () => {
      const allParams = template.findParameters("*",  {});
      expect(allParams).toHaveProperty("SNSEmail");
      expect(allParams).toHaveProperty("SlackNotification");
      expect(allParams).toHaveProperty("DeploymentModel");
      expect(allParams).toHaveProperty("RegionsList");
      expect(allParams).toHaveProperty("RegionConcurrency");
      expect(allParams).toHaveProperty("MaxConcurrentPercentage");
      expect(allParams).toHaveProperty("FailureTolerancePercentage");
      template.hasParameter("*",  {
        Type: "String",
        AllowedValues: [ "PARALLEL", "SEQUENTIAL" ],
      });
      template.hasParameter("*",  {
        Type: "String",
        AllowedValues: [ "Yes", "No" ],
      });
      template.hasParameter("*",  {
        Type: "String",
        AllowedValues: [ "Organizations", "Hybrid" ],
      });
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
