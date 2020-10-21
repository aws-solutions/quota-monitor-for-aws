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

let LimitReport = require('./limit-report.js');

describe('limitreport', function() {
  describe('#updateReport', function() {
    let _data = {
      ResponseMetadata: {
        RequestId: 'xxxxx-00000-xxxx',
      },
      Messages: [
        {
          MessageId: 'xxx-xxx-xxx',
          ReceiptHandle: 'testreceipthandle',
          MD5OfBody: '0000000000',
          Body:
            '{"version":"0","id":"00000","detail-type":"Trusted Advisor Check Item Refresh Notification","source":"aws.trustedadvisor","account":"000099990000","time":"2018-03-26T15:42:37Z","region":"us-east-1","resources":[],"detail":{"check-name":"Auto Scaling Launch Configurations","check-item-detail":{"Status":"0","Current Usage":"200","Region":"us-west-1","Service":"AutoScaling","Limit Amount":"Launch configurations"},"status":"OK","resource_id":"","uuid":"xxxx-0000-xxxx"}}',
          Attributes: {
            SentTimestamp: '1522078958422',
          },
        },
      ],
    };

    beforeEach(function() {
      AWS.mock('SQS', 'receiveMessage', function(params, callback) {
        callback(null, _data);
      });

      AWS.mock('SQS', 'deleteMessage', function(params, callback) {
        callback(null, {
          result: 'success',
        });
      });

      AWS.mock('DynamoDB.DocumentClient', 'put', function(params, callback) {
        callback(null, {
          result: 'success',
        });
      });
    });

    afterEach(function() {
      AWS.restore('DynamoDB.DocumentClient');
      AWS.restore('SQS');
    });

    it('should delete sqs message if all APIs successful', function(done) {
      let _limitreport = new LimitReport();
      _limitreport.updateReport({}, function(err, data) {
        if (err) done('invalid failure for positive test: ', err);
        assert.equal(data.Result, 'TA messages read');
        done();
      });
    });

    it('should log error when sqs receive message fails', function(done) {
      AWS.restore('SQS', 'receiveMessage');

      AWS.mock('SQS', 'receiveMessage', function(params, callback) {
        callback('sqs error', null);
      });

      let _limitreport = new LimitReport();
      _limitreport.updateReport({}, function(err, data) {
        if (err) done();
        assert.equal(data.Result, 'TA messages read');
        done();
      });
    });

    it('should log dynamo error when put fails', function(done) {
      AWS.restore('DynamoDB.DocumentClient');
      AWS.mock('DynamoDB.DocumentClient', 'put', function(params, callback) {
        callback('ddb error', null);
      });

      let _limitreport = new LimitReport();
      _limitreport.updateReport({}, function(err, data) {
        if (err) done();
        assert.equal(data.Result, 'TA messages read');
        done();
      });
    });
  });
});
