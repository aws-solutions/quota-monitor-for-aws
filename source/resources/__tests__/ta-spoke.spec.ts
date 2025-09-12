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
  const stack = new QuotaMonitorTASpoke(app, "TASpokeStackCommerical", {});
  const template = Template.fromStack(stack);

  describe("ta-spoke stack resources", () => {
    it("should have a Lambda Utils Layer with nodejs22.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::LayerVersion", 1);
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        CompatibleRuntimes: ["nodejs22.x"],
      });
    });

    it("should have events rules for OK, Warn, Error, and Refresher events", () => {
      template.resourceCountIs("AWS::Events::Rule", 4);
    });

    it("should have lambda functions for TA-refresher with nodejs22.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::Function", 1);
      template.hasResourceProperties("AWS::Lambda::Function", {
        Runtime: "nodejs22.x",
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
});
