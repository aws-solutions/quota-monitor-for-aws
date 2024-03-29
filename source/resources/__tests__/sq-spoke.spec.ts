// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorSQSpoke } from "../lib/sq-spoke.stack";
import { App } from "aws-cdk-lib";
import TestContext from "./test-context";

describe("==SQ-Spoke Stack Tests==", () => {
  const app = new App({
    context: TestContext,
  });
  const stack = new QuotaMonitorSQSpoke(app, "SQSpokeStack", {});
  const template = Template.fromStack(stack);

  describe("sq-spoke stack resources", () => {
    it("should have a Lambda Utils Layer with nodejs18.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::LayerVersion", 1);
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        CompatibleRuntimes: ["nodejs18.x"],
      });
    });

    it("should have an event bus called QuotaMonitorSpokeBus", () => {
      template.hasResourceProperties("AWS::Events::EventBus", {
        Name: "QuotaMonitorSpokeBus",
      });
    });

    it("should have two tables", () => {
      template.resourceCountIs("AWS::DynamoDB::Table", 2);
    });

    it("should have a dynamodb table for the Service List", () => {
      template.hasResource("AWS::DynamoDB::Table", {
        UpdateReplacePolicy: "Delete",
        DeletionPolicy: "Delete",
        Properties: {
          KeySchema: [
            {
              AttributeName: "ServiceCode",
              KeyType: "HASH",
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: "ServiceCode",
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

    it("should have a dynamodb table for the Quota List", () => {
      template.hasResource("AWS::DynamoDB::Table", {
        UpdateReplacePolicy: "Delete",
        DeletionPolicy: "Delete",
        Properties: {
          KeySchema: [
            {
              AttributeName: "ServiceCode",
              KeyType: "HASH",
            },
            {
              AttributeName: "QuotaCode",
              KeyType: "RANGE",
            },
          ],
          AttributeDefinitions: [
            {
              AttributeName: "ServiceCode",
              AttributeType: "S",
            },
            {
              AttributeName: "QuotaCode",
              AttributeType: "S",
            },
          ],
        },
      });
    });

    it("should have custom resource for service list", () => {
      template.resourceCountIs("Custom::SQServiceList", 1);
    });

    it(
      "should have lambda functions for QMListManager, CWPoller, and provider frameworks " +
        "with nodejs18.x runtime",
      () => {
        template.resourceCountIs("AWS::Lambda::Function", 3);
        template.hasResourceProperties("AWS::Lambda::Function", {
          Runtime: "nodejs18.x",
        });
      }
    );

    it("should have events rules for the pollers", () => {
      template.resourceCountIs("AWS::Events::Rule", 5);
    });

    it("should have DeadLetterQueues for Lambda Functions ", () => {
      template.resourceCountIs("AWS::SQS::Queue", 1);
      template.hasResourceProperties("AWS::Lambda::Function", {
        DeadLetterConfig: Match.objectLike({
          TargetArn: Match.objectLike(Match.anyValue),
        }),
      });
    });

    it("should have parameters", () => {
      const allParams = template.findParameters("*", {});
      expect(allParams).toHaveProperty("NotificationThreshold");
      expect(allParams).toHaveProperty("MonitoringFrequency");
    });

    it("should have Service Catalog AppRegistry Application, ", () => {
      template.resourceCountIs(
        "AWS::ServiceCatalogAppRegistry::Application",
        1
      );
    });

    it("should have Service Catalog AppRegistry AttributeGroup, ", () => {
      template.resourceCountIs(
        "AWS::ServiceCatalogAppRegistry::AttributeGroup",
        1
      );
    });

    it("should have Service Catalog AppRegistry Resource Association, ", () => {
      template.resourceCountIs(
        "AWS::ServiceCatalogAppRegistry::ResourceAssociation",
        1
      );
      template.hasResource(
        "AWS::ServiceCatalogAppRegistry::ResourceAssociation",
        {
          Properties: {
            Application: {
              "Fn::GetAtt": ["SQSpokeAppRegistryApplicationB3787B2B", "Id"],
            },
            Resource: {
              Ref: "AWS::StackId",
            },
            ResourceType: "CFN_STACK",
          },
        }
      );
    });

    it("should have Service Catalog AppRegistry AttributeGroup Association, ", () => {
      template.resourceCountIs(
        "AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation",
        1
      );
    });
  });
});
