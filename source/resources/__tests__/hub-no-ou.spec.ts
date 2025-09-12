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
  const stack = new QuotaMonitorHubNoOU(app, "QMHubStackNoOU", {});
  const template = Template.fromStack(stack);

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
  });

  describe("No ou hub stack outputs", () => {
    TestsCommon.assertCommonHubOutputs(template);
  });
});
