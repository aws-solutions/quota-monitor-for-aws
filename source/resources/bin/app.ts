// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { App, Aspects, DefaultStackSynthesizer } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";
import { PreReqStack } from "../lib/prereq.stack";
import { QuotaMonitorHub } from "../lib/hub.stack";
import { QuotaMonitorTASpoke } from "../lib/ta-spoke.stack";
import { QuotaMonitorSQSpoke } from "../lib/sq-spoke.stack";
import { QuotaMonitorHubNoOU } from "../lib/hub-no-ou.stack";

const app = new App();
new PreReqStack(app, "quota-monitor-prerequisite", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
new QuotaMonitorHub(app, "quota-monitor-hub", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
new QuotaMonitorHubNoOU(app, "quota-monitor-hub-no-ou", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
});
new QuotaMonitorTASpoke(app, "quota-monitor-ta-spoke", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  analyticsReporting: false,
});
new QuotaMonitorSQSpoke(app, "quota-monitor-sq-spoke", {
  synthesizer: new DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  analyticsReporting: false,
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
