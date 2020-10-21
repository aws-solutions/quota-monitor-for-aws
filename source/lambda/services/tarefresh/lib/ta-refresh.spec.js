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
AWS.setSDK(path.resolve('./node_modules/aws-sdk'));

let TARefresh = require('./ta-refresh.js');

describe('tarefresh', function() {
  describe('#getTARefreshStatus', function() {
    let params = {};

    beforeEach(function() {});

    afterEach(function() {
      AWS.restore('Support');
    });

    it('should return success when TA refresh is successful', function(done) {
      AWS.mock('Support', 'refreshTrustedAdvisorCheck', function(
        params,
        callback
      ) {
        callback(null, {
          result: 'success',
        });
      });

      let _taRefresh = new TARefresh();
      _taRefresh.getTARefreshStatus(params, function(err, data) {
        if (err) done('invalid failure for positive test: ', err);
        else {
          assert.equal(data.Result, 'TA refresh done');
          done();
        }
      });
    });

    it('should return success logging which TA check failed', function(done) {
      AWS.mock('Support', 'refreshTrustedAdvisorCheck', function(
        params,
        callback
      ) {
        callback('error', null);
      });

      let _taRefresh = new TARefresh();
      _taRefresh.getTARefreshStatus(params, function(err, data) {
        if (err) {
          //expect(err).to.equal('error');
          done('invalid failure for negative test: ', err);
        } else {
          assert.equal(data.Result, 'TA refresh done');
          done();
        }
      });
    });
  });
});
