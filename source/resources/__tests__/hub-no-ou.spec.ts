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
  const stack = new QuotaMonitorHubNoOU(app, "QMHubStackNoOU");
  const template = Template.fromStack(stack);

  describe("hub stack resources", () => {
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
      template.resourceCountIs(
        "AWS::ServiceCatalogAppRegistry::ResourceAssociation",
        1
      );
      template.hasResource(
        "AWS::ServiceCatalogAppRegistry::ResourceAssociation",
        {
          Properties: {
            Application: {
              "Fn::GetAtt": ["HubNoOUAppRegistryApplication11687F81", "Id"],
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
