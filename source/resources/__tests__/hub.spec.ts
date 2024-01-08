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
  const stack = new QuotaMonitorHub(app, "QMHubStack");
  const template = Template.fromStack(stack);

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
      template.resourceCountIs(
        "AWS::ServiceCatalogAppRegistry::ResourceAssociation",
        1
      );
      template.hasResource(
        "AWS::ServiceCatalogAppRegistry::ResourceAssociation",
        {
          Properties: {
            Application: {
              "Fn::GetAtt": ["HubAppRegistryApplication3E8980C3", "Id"],
            },
            Resource: {
              Ref: "AWS::StackId",
            },
            ResourceType: "CFN_STACK",
          },
        }
      );
    });
  });

  describe("hub stack outputs", () => {
    TestsCommon.assertCommonHubOutputs(template);
  });
});
