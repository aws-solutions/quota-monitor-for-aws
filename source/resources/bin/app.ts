// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, DefaultStackSynthesizer } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { PreReqStack } from "../lib/prereq.stack";
import { QuotaMonitorHub } from "../lib/hub.stack";
import { QuotaMonitorTASpoke } from "../lib/ta-spoke.stack";
import { QuotaMonitorSQSpoke } from "../lib/sq-spoke.stack";
import { QuotaMonitorHubNoOU } from "../lib/hub-no-ou.stack";
import { QuotaMonitorSnsSpoke } from "../lib/sns-spoke-stack";

interface AppProps {
  targetPartition: "Commercial" | "China";
}

function addAppStacks(app: App, props: AppProps): void {
  /**
   * MODIFY_TEMPLATES customizes asset handling for orgHub:deploy script:
   * - Uses SOLUTION_BUCKET, disables default encryption, modifies synthesizer.
   * - Workaround for spoke account deployments: Uses actual bucket instead of
   *   ${ACCOUNT_ID} and ${ACCOUNT_REGION}, fixing S3 reference issues.
   */
  const MODIFY_TEMPLATES = process.env.MODIFY_TEMPLATES === "true";
  const solutionBucket = MODIFY_TEMPLATES ? process.env.SOLUTION_BUCKET : undefined;

  const synthesizerProps = {
    generateBootstrapVersionRule: false,
    ...(solutionBucket ? { fileAssetsBucketName: solutionBucket } : {}),
  };
  const synthesizer = new DefaultStackSynthesizer(synthesizerProps);

  new PreReqStack(app, `quota-monitor-prerequisite${props.targetPartition === "China" ? "-cn" : ""}`, {
    synthesizer,
    targetPartition: props.targetPartition,
  });

  new QuotaMonitorHub(app, `quota-monitor-hub${props.targetPartition === "China" ? "-cn" : ""}`, {
    synthesizer,
    targetPartition: props.targetPartition,
  });

  new QuotaMonitorHubNoOU(app, `quota-monitor-hub-no-ou${props.targetPartition === "China" ? "-cn" : ""}`, {
    synthesizer,
    targetPartition: props.targetPartition,
  });

  new QuotaMonitorTASpoke(app, `quota-monitor-ta-spoke${props.targetPartition === "China" ? "-cn" : ""}`, {
    synthesizer,
    targetPartition: props.targetPartition,
    analyticsReporting: false,
  });

  new QuotaMonitorSQSpoke(app, `quota-monitor-sq-spoke${props.targetPartition === "China" ? "-cn" : ""}`, {
    synthesizer,
    targetPartition: props.targetPartition,
    analyticsReporting: false,
  });

  new QuotaMonitorSnsSpoke(app, `quota-monitor-sns-spoke${props.targetPartition === "China" ? "-cn" : ""}`, {
    synthesizer,
    targetPartition: props.targetPartition,
    analyticsReporting: false,
  });
}

function main(): void {
  const app = new App();
  const MODIFY_TEMPLATES = process.env.MODIFY_TEMPLATES === "true";

  if (MODIFY_TEMPLATES) {
    app.node.setContext("@aws-cdk/aws-s3-assets:disableDefaultEncryption", true);
  }

  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

  addAppStacks(app, { targetPartition: "Commercial" });
  addAppStacks(app, { targetPartition: "China" });
}

main();
