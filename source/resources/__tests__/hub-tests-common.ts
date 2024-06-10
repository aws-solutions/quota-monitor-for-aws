// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Match, Template } from "aws-cdk-lib/assertions";

export function assertCommonHubResources(template: Template) {
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
  it(
    "should have lambda functions for SNSPublisher, SlackNotifier, " +
      "Reporter, DeploymentManager, Helper, and provider with " +
      "nodejs18.x runtime",
    () => {
      template.resourceCountIs("AWS::Lambda::Function", 6);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs18.x",
      });
    }
  );

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
        TimeToLiveSpecification: {
          AttributeName: "ExpiryTime",
        },
      },
    });
  });
  it("should have Service Catalog AppRegistry Application, ", () => {
    template.resourceCountIs("AWS::ServiceCatalogAppRegistry::Application", 1);
  });

  it("should have Service Catalog AppRegistry AttributeGroup, ", () => {
    template.resourceCountIs(
      "AWS::ServiceCatalogAppRegistry::AttributeGroup",
      1
    );
  });

  it("should have Service Catalog AppRegistry AttributeGroup Association, ", () => {
    template.resourceCountIs(
      "AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation",
      1
    );
  });
}

export function assertCommonHubOutputs(template: Template) {
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
}
