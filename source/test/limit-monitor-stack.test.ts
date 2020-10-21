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

import { SynthUtils } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import limitMonitorStack = require('../lib/limit-monitor-stack');
import '@aws-cdk/assert/jest';
import { LimitMonitorStackProps } from '../bin/limit-monitor';


function getTestStack(): cdk.Stack {
  const app = new cdk.App();
  const envEU = { account: '111111111111', region: 'eu-west-1'};
  const props: LimitMonitorStackProps = {
    env: envEU,
    solutionId: 'SO0005',
    solutionBucket: 'solutions',
    solutionTemplateBucket: 'solutions-us-east-1',
    solutionName: 'limit-monitor',
    solutionVersion: 'v5.3.3',
    solutionProvider: 'AWS Solution Builders',
    solutionTradeMarkName: 'limit-monitor'
  }
  const stack = new limitMonitorStack.LimitMonitorStack(app, 'stack', props)

  const limitMonitorStackMetadata =
  {
    "AWS::CloudFormation::Interface": {
      "ParameterGroups": [
        {
          "Label": {
            "default": "Notification Configuration"
          },
          "Parameters": [
            "SNSEmail"
          ]
        },
      ],
      "ParameterLabels": {
        "SNSEmail": {
          "default": "Email Address"
        }
      }
    }
  }
  stack.templateOptions.metadata = limitMonitorStackMetadata
  stack.templateOptions.templateFormatVersion = "2010-09-09"
  return stack;
}

/*
 * SnapShot Testing for the LimitMonitorStack.
 */
test('LimitMonitorStack snapshot test', () => {
  process.env.DIST_OUTPUT_BUCKET = 'solutions'
  process.env.DIST_SOLUTION_NAME = 'limit-monitor'
  process.env.DIST_VERSION = 'v5.3.3'
  process.env.SOLUTION_ID = 'SO0005'
  process.env.SOLUTION_NAME = 'limit-monitor'
  process.env.SOLUTION_TRADEMARKEDNAME = 'limit-monitor'
  expect(SynthUtils.toCloudFormation(getTestStack())).toMatchSnapshot();
});