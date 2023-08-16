// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Template } from "aws-cdk-lib/assertions";
import { PreReqStack } from "../lib/prereq.stack";
import { App } from "aws-cdk-lib";

describe("==Pre-requisite Stack Tests==", () => {
  const app = new App();
  const stack = new PreReqStack(app, "PreReqStack");
  const template = Template.fromStack(stack);

  describe("Pre-requisite stack resources", () => {
    it("should have a Lambda Utils Layer with nodejs18.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::LayerVersion", 1);
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        CompatibleRuntimes: ["nodejs18.x"],
      });
    });

    it("should have helper, pre-req and provider lambda functions " +
      "with nodejs18.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::Function", 4);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs18.x",
      });
    });

    it("should have custom resource for launch", () => {
      template.resourceCountIs("Custom::LaunchData", 1);
    });
    it("should have custom resource for UUID", () => {
      template.resourceCountIs("Custom::CreateUUID", 1);
    });
    it("should have custom resource for UUID", () => {
      template.resourceCountIs("Custom::PreReqManagerCR", 1);
    });
    it("should have parameters", () => {
      const allParams = template.findParameters("*", {});
      expect(allParams).toHaveProperty("MonitoringAccountId");
    });
  });

  describe("Pre-requisite stack outputs", () => {
    it("should have output for UUID", () => {
      template.hasOutput("UUID", {});
    });
  });
});
