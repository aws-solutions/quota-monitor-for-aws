#!/usr/bin/env node
/*****************************************************************************
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.   *
 *                                                                            *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may   *
 *  not use this file except in compliance with the License. A copy of the    *
 *  License is located at                                                     *
 *                                                                            *
 *      http://www.apache.org/licenses/LICENSE-2.0                            *
 *                                                                            *
 *  or in the 'license' file accompanying this file. This file is distributed *
 *  on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,        *
 *  express or implied. See the License for the specific language governing   *
 *  permissions and limitations under the License.                            *
 *****************************************************************************/

import * as cdk from '@aws-cdk/core';
import { LimitMonitorSpokeStack } from '../lib/limit-monitor-spoke-stack';
import { LimitMonitorStack } from '../lib/limit-monitor-stack';
import { ServiceQuotasChecksStack } from '../lib/service-quotas-checks-stack';

const SOLUTION_VERSION = process.env['DIST_VERSION'];
const SOLUTION_NAME = process.env['SOLUTION_NAME'];
const SOLUTION_ID = process.env['SOLUTION_ID'] || 'SO0005';
const SOLUTION_BUCKET = process.env['DIST_OUTPUT_BUCKET']; 
const SOLUTION_TMN = process.env['SOLUTION_TRADEMARKEDNAME'];
const SOLUTION_PROVIDER = 'AWS Solution Development';
const SOLUTION_TEMPLATE_BUCKET = process.env['DIST_TEMPLATE_BUCKET']

const app = new cdk.App();

export interface LimitMonitorStackProps extends cdk.StackProps {
  solutionId: string;
  solutionTradeMarkName: string | undefined;
  solutionProvider: string | undefined;
  solutionBucket: string | undefined;
  solutionTemplateBucket: string | undefined;
  solutionName: string | undefined;
  solutionVersion: string | undefined;
}

let limitMonitorStackProps: LimitMonitorStackProps = {
  solutionId: SOLUTION_ID,
  solutionTradeMarkName: SOLUTION_TMN,
  solutionProvider: SOLUTION_PROVIDER,
  solutionBucket: SOLUTION_BUCKET,
  solutionTemplateBucket: SOLUTION_TEMPLATE_BUCKET,
  solutionName: SOLUTION_NAME,
  solutionVersion: SOLUTION_VERSION,
  description: '(' + SOLUTION_ID + ') - ' + SOLUTION_NAME + ', version ' + SOLUTION_VERSION,
}
new LimitMonitorStack(app, 'limit-monitor', limitMonitorStackProps);

let serviceQuotasChecksStackProps: LimitMonitorStackProps = {
  solutionId: SOLUTION_ID,
  solutionTradeMarkName: SOLUTION_TMN,
  solutionProvider: SOLUTION_PROVIDER,
  solutionBucket: SOLUTION_BUCKET,
  solutionTemplateBucket: SOLUTION_TEMPLATE_BUCKET,
  solutionName: SOLUTION_NAME,
  solutionVersion: SOLUTION_VERSION,
  description: '(' + SOLUTION_ID + ') - ' + SOLUTION_NAME + ', version ' + SOLUTION_VERSION + ' - Spoke Template for vCPU limits',
}

new ServiceQuotasChecksStack(app, 'service-quotas-checks', serviceQuotasChecksStackProps);

let spokeTemplateProps: LimitMonitorStackProps = {
  solutionId: SOLUTION_ID,
  solutionTradeMarkName: SOLUTION_TMN,
  solutionProvider: SOLUTION_PROVIDER,
  solutionBucket: SOLUTION_BUCKET,
  solutionTemplateBucket: SOLUTION_TEMPLATE_BUCKET,
  solutionName: SOLUTION_NAME,
  solutionVersion: SOLUTION_VERSION,
  description: '(' + SOLUTION_ID + ') - ' + SOLUTION_NAME + ', version ' + SOLUTION_VERSION + ' - Spoke Template for vCPU limits',
}

new LimitMonitorSpokeStack(app, 'limit-monitor-spoke', spokeTemplateProps)
