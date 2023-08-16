// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorTASpoke } from "../lib/ta-spoke.stack";
import { App } from "aws-cdk-lib";

describe("==TA-Spoke Stack Tests==", () => {
  const app = new App({
    context: {
      "SOLUTION_VERSION": "test_version",
      "SOLUTION_NAME": "test_name",
      "SOLUTION_ID": "SO0005",
      "SOLUTION_BUCKET": "test_bucket",
      "SOLUTION_TEMPLATE_BUCKET": "test_bucket",
      "CUSTOM_USER_AGENT": "AwsSolution/SO0005/test_version",
      "SEND_METRICS": "Yes",
      "METRICS_ENDPOINT": "https://metrics.awssolutionsbuilder.com/generic",
      "LOG_LEVEL": "info",
      "APPLICATION_TYPE": "AWS-Solutions",
      "APP_REG_HUB_NO_OU_APPLICATION_NAME": "QM_Hub",
      "APP_REG_HUB_APPLICATION_NAME": "QM_Hub_Org",
      "APP_REG_TA_SPOKE_APPLICATION_NAME": "QM_TA",
      "APP_REG_SQ_SPOKE_APPLICATION_NAME": "QM_SQ"
    },
  });
  const stack = new QuotaMonitorTASpoke(app, "TASpokeStack");
  const template = Template.fromStack(stack);

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
            "Fn::GetAtt": [
              "TASpokeAppRegistryApplicationAEA2BFDF",
              "Id"
            ]
          },
          Resource: {
            "Ref": "AWS::StackId"
          },
          ResourceType: "CFN_STACK",
        }
      });
    });

    it("should have Service Catalog AppRegistry AttributeGroup Association, ", () => {
      template.resourceCountIs("AWS::ServiceCatalogAppRegistry::AttributeGroupAssociation", 1);
    });
  });

  describe("ta-spoke stack outputs", () => {
    it("should have output for ServiceChecks", () => {
      template.hasOutput("ServiceChecks", {});
    });
  });
});
