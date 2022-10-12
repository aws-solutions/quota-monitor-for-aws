import { Match, Template } from "aws-cdk-lib/assertions";
import { QuotaMonitorTASpoke } from "../lib/ta-spoke.stack";
import { App } from "aws-cdk-lib";

describe("==TA-Spoke Stack Tests==", () => {
  const app = new App();
  const stack = new QuotaMonitorTASpoke(app, "TASpokeStack");
  const template = Template.fromStack(stack);

  describe("ta-spoke stack resources", () => {
    it("should have a Lambda Utils Layer with nodejs16.x runtime", () => {
      template.resourceCountIs("AWS::Lambda::LayerVersion", 1);
      template.hasResourceProperties("AWS::Lambda::LayerVersion", {
        CompatibleRuntimes: ["nodejs16.x"],
      });
    });

    it("should have events rules for OK, Warn, Error, and Refresher events", () => {
      template.resourceCountIs("AWS::Events::Rule", 4);
    });

    it("should have a Lambda Function with a DeadLetterQueue ", () => {
      template.resourceCountIs("AWS::SQS::Queue", 1);
      template.hasResourceProperties("AWS::Lambda::Function", {
        DeadLetterConfig: Match.objectLike({
          TargetArn: Match.objectLike(Match.anyValue),
        }),
      });
    });
  });

  describe("ta-spoke stack outputs", () => {
    it("should have output for ServiceChecks", () => {
      template.hasOutput("ServiceChecks", {});
    });
  });
});
