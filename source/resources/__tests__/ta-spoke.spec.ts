// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorTASpoke } from "../lib/ta-spoke.stack";
import { App } from "aws-cdk-lib";
import TestContext from "./test-context";

describe("==TA-Spoke Stack Tests==", () => {
  const app = new App({
    context: TestContext,
  });
  const stack = new QuotaMonitorTASpoke(app, "TASpokeStackCommerical", { targetPartition: "Commercial" });
  const stack_cn = new QuotaMonitorTASpoke(app, "TASpokeStackChina", { targetPartition: "China" });
  const template = Template.fromStack(stack);
  const template_cn = Template.fromStack(stack_cn);

  describe("ta-spoke stack resources", () => {
    it("should have a Lambda Utils Layer with nodejs18.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::LayerVersion", 1);
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        CompatibleRuntimes: ["nodejs18.x"],
      });
    });

    it("should have events rules for OK, Warn, Error, and Refresher events", () => {
      template.resourceCountIs("AWS::Events::Rule", 4);
    });

    it("should have lambda functions for TA-refresher with nodejs18.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::Function", 1);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs18.x",
      });
    });

    it("should have a Lambda Function with a DeadLetterQueue ", () => {
      template.resourceCountIs("AWS::SQS::Queue", 1);
      template.hasResourceProperties("AWS::Lambda::Function", {
        DeadLetterConfig: Match.objectLike({
          TargetArn: Match.objectLike(Match.anyValue),
        }),
      });
    });

    it("should have parameters", () => {
      const allParams = template.findParameters("*", {});
      expect(allParams).toHaveProperty("EventBusArn");
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
            "Fn::GetAtt": ["TASpokeAppRegistryApplicationAEA2BFDF", "Id"],
          },
          Resource: {
            Ref: "AWS::StackId",
          },
          ResourceType: "CFN_STACK",
        },
      });
    });

    it("should have Service Catalog AppRegistry AttributeGroup Association, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation", 1);
    });

    it("should have a TARefreshRate parameter", () => {
      template.hasParameter("TARefreshRate", {
        Type: "String",
        Default: "rate(12 hours)",
        AllowedValues: ["rate(6 hours)", "rate(12 hours)", "rate(1 day)"],
      });
    });

    it("should use the TARefreshRate parameter in the refresher event rule", () => {
      template.hasResourceProperties("AWS::Events::Rule", {
        ScheduleExpression: {
          Ref: "TARefreshRate",
        },
      });
    });
  });

  describe("ta-spoke stack outputs", () => {
    it("should have output for ServiceChecks", () => {
      template.hasOutput("ServiceChecks", {});
    });
  });
  describe("China partition ta-spoke stack resources", () => {
    it("should not have Service Catalog AppRegistry resources", () => {
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::Application", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroup", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::ResourceAssociation", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation", 0);
    });
  });
});
