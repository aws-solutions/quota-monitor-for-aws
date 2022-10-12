import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorHub } from "../lib/hub.stack";
import { App } from "aws-cdk-lib";

describe("==TA-Spoke Stack Tests==", () => {
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

    it("should have SSM Parameters for SlackHook, OU, Accounts", () => {
      template.resourceCountIs("AWS::SSM::Parameter", 3);
    });

    it("should have events rules for the pollers", () => {
      template.resourceCountIs("AWS::Events::Rule", 5);
    });

    it("should have lambda functions for SlackNotifier, Reporter, DeploymentManager, Helper, and provider  ", () => {
      template.resourceCountIs("AWS::Lambda::Function", 5);
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
    });

    it("should have an SNS Subscription for email notifications", () => {
      template.hasResourceProperties("AWS::SNS::Subscription", {
        Endpoint: {
          Ref: "SNSEmail",
        },
      });
    });

    it("should have SQS Queues for DeadLetters and Summarizer Event, ", () => {
      template.resourceCountIs("AWS::SQS::Queue", 4);
    });

    it("should have a dynamodb table for the usage messages", () => {
      template.hasResourceProperties("AWS::DynamoDB::Table", {
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
      });
    });

    it("should have SQ and TA StackSets, ", () => {
      template.resourceCountIs("AWS::CloudFormation::StackSet", 2);
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
  });
});
