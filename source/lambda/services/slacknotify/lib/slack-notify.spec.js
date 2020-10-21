/*********************************************************************************************************************
 *  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

/**
 * @author Solution Builders
 */

'use strict';

let assert = require('chai').assert;
let expect = require('chai').expect;
let path = require('path');
let AWS = require('aws-sdk-mock');
let sinon = require('sinon');
AWS.setSDK(path.resolve('./node_modules/aws-sdk'));
let SlackNotify = require('./slack-notify.js');

describe('slacknotify', function() {
  describe('#sendNotification', function() {
    let _ssmData = {
      Parameter: {
        Name: 'test',
        Type: 'SecureString',
        Value: 'https://test.com',
        Version: 2,
      },
    };

    beforeEach(function() {
      AWS.mock('SSM', 'getParameter', function(params, callback) {
        callback(null, _ssmData);
      });
    });

    afterEach(function() {
      AWS.restore('SSM');
    });

    xit('should return success when notification sent successfully', function() {});

    xit('should return fail when notification failed', function() {});
  });
});
