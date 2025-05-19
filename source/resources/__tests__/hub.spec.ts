// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorHub } from "../lib/hub.stack";
import { App } from "aws-cdk-lib";
import TestContext from "./test-context";
import * as TestsCommon from "./hub-tests-common";

describe("==Hub Stack Tests==", () => {
  const app = new App({
    context: TestContext,
  });
  const stack = new QuotaMonitorHub(app, "QMHubStack", { targetPartition: "Commercial" });
  const stack_cn = new QuotaMonitorHub(app, "QMHubStackChina", { targetPartition: "China" });
  const template = Template.fromStack(stack);
  const template_cn = Template.fromStack(stack_cn);

  describe("hub stack resources", () => {
    TestsCommon.assertCommonHubResources(template);

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

    it("should have SQ and TA and SNS StackSets, ", () => {
      template.resourceCountIs("AWS::CloudFormation::StackSet", 3);
    });

    it("should have parameters", () => {
      const allParams = template.findParameters("*", {});
      expect(allParams).toHaveProperty("SNSEmail");
      expect(allParams).toHaveProperty("SlackNotification");
      expect(allParams).toHaveProperty("DeploymentModel");
      expect(allParams).toHaveProperty("RegionsList");
      template.hasParameter("*", {
        Type: "String",
        AllowedValues: ["PARALLEL", "SEQUENTIAL"],
      });
      template.hasParameter("*", {
        Type: "String",
        AllowedValues: ["Yes", "No"],
      });
      template.hasParameter("*", {
        Type: "String",
        AllowedValues: ["Organizations", "Hybrid"],
      });
    });

    it("should have Service Catalog AppRegistry Resource Association, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::ResourceAssociation", 1);
      template.hasResource("AWS::ServiceCatalogAppRegistry::ResourceAssociation", {
        Properties: {
          Application: {
            "Fn::GetAtt": ["HubAppRegistryApplication3E8980C3", "Id"],
          },
          Resource: {
            Ref: "AWS::StackId",
          },
          ResourceType: "CFN_STACK",
        },
      });
    });

    it("should have a parameter for SQ notification threshold", () => {
      template.hasParameter("SQNotificationThreshold", {
        Type: "String",
        Default: "80",
        AllowedPattern: "^([1-9]|[1-9][0-9])$",
        Description: "Threshold percentage for quota utilization alerts (0-100)",
        ConstraintDescription: "Threshold must be a whole number between 0 and 100",
      });
    });
  });

  describe("hub stack outputs", () => {
    TestsCommon.assertCommonHubOutputs(template);
  });

  describe("China partition hub stack resources", () => {
    it("should not have Service Catalog AppRegistry resources", () => {
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::Application", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroup", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::ResourceAssociation", 0);
      template_cn.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation", 0);
    });
  });
});
