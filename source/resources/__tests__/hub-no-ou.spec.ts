// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorHubNoOU } from "../lib/hub-no-ou.stack";
import { App } from "aws-cdk-lib";
import TestContext from "./test-context";
import * as TestsCommon from "./hub-tests-common";

describe("==Hub No OU Stack Tests==", () => {
  const app = new App({
    context: TestContext,
  });
  const stack = new QuotaMonitorHubNoOU(app, "QMHubStackNoOU", { targetPartition: "Commercial" });
  const stack_cn = new QuotaMonitorHubNoOU(app, "QMHubStackNoOUChina", { targetPartition: "China" });
  const template = Template.fromStack(stack);
  const template_cn = Template.fromStack(stack_cn);

  describe("No ou hub stack resources", () => {
    TestsCommon.assertCommonHubResources(template);

    it("should have SSM Parameters for SlackHook, Accounts and Muted Services", () => {
      template.resourceCountIs("AWS::SSM::Parameter", 3);
    });

    it("should have no StackSets, ", () => {
      template.resourceCountIs("AWS::CloudFormation::StackSet", 0);
    });

    it("should have parameters", () => {
      const allParams = template.findParameters("*", {});
      expect(allParams).toHaveProperty("SNSEmail");
      expect(allParams).toHaveProperty("SlackNotification");
    });

    it("should have Service Catalog AppRegistry Resource Association, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::ResourceAssociation", 1);
      template.hasResource("AWS::ServiceCatalogAppRegistry::ResourceAssociation", {
        Properties: {
          Application: {
            "Fn::GetAtt": ["HubNoOUAppRegistryApplication11687F81", "Id"],
          },
          Resource: {
            Ref: "AWS::StackId",
          },
          ResourceType: "CFN_STACK",
        },
      });
    });
  });

  describe("No ou hub stack outputs", () => {
    TestsCommon.assertCommonHubOutputs(template);
  });

  describe("China partition no ou hub stack resources", () => {
    it("should not have Service Catalog AppRegistry resources", () => {
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::Application", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroup", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::ResourceAssociation", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation", 0);
    });
  });
});
