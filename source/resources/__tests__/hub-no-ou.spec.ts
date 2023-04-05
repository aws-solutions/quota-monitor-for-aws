// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorHubNoOU } from "../lib/hub-no-ou.stack";
import { App } from "aws-cdk-lib";

describe("==Hub No OU Stack Tests==", () => {
  const app = new App();
  const stack = new QuotaMonitorHubNoOU(app, "QMHubStackNoOU");
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

    it("should have SSM Parameters for SlackHook, Accounts and Muted Services", () => {
      template.resourceCountIs("AWS::SSM::Parameter", 3);
    });

    it("should have events rules for the pollers", () => {
      template.resourceCountIs("AWS::Events::Rule", 5);
    });

    it("should have lambda functions for SNSPublisher, SlackNotifier, Reporter, DeploymentManager, Helper, and provider  ", () => {
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

    it("should have no StackSets, ", () => {
      template.resourceCountIs("AWS::CloudFormation::StackSet", 0);
    });

    it("should have parameters", () => {
      const allParams = template.findParameters("*", {});
      expect(allParams).toHaveProperty("SNSEmail");
      expect(allParams).toHaveProperty("SlackNotification");
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
