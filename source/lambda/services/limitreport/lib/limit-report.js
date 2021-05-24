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

let AWS = require('aws-sdk');
let async = require('async');
let _ = require('underscore');
let MetricsHelper = require('./metrics-helper');
const LOGGER = new (require('./logger'))();

AWS.config.update({
  region: process.env.AWS_REGION,
});

/**
 * Fetches messages from SQS and
 * writes to DynamoDB table
 *
 * @class limitreport
 */
class limitreport {
  /**
   * @constructor
   */
  constructor() {
    this.creds = new AWS.EnvironmentCredentials('AWS'); // Lambda provided credentials
    this.sqs = new AWS.SQS();

    this.dynamoConfig = {
      credentials: this.creds,
      region: process.env.AWS_REGION,
    };
    this.docClient = new AWS.DynamoDB.DocumentClient(this.dynamoConfig);

    this.ddbTable = process.env.LIMIT_REPORT_TBL;
    this.queueURL = process.env.SQS_URL;
    this.max_messages = process.env.MAX_MESSAGES;
    this.max_loops = process.env.MAX_LOOPS;
    this.anonymous_data = process.env.ANONYMOUS_DATA;
    this.solution = process.env.SOLUTION;
    this.uuid = process.env.UUID;
  }

  /**
   * Updates Dynamo DB table
   * @param  {CWEvent}   event      [description]
   * @param  {function}  cb         [callback function]
   * @return {limitreport~callback} [callback to handle response]
   */
  updateReport(event, cb) {
    const _self = this;
    let queueParams = {
      AttributeNames: ['SentTimestamp'],
      MaxNumberOfMessages: this.max_messages,
      MessageAttributeNames: ['All'],
      QueueUrl: this.queueURL,
    };

    async.each(
      _.range(this.max_loops),
      function(i, callback_p) {
        _self.sqs.receiveMessage(queueParams, function(err, rcv_payload) {
          if (err) {
            LOGGER.log('ERROR', err); //🔥
            callback_p();
          } else if (rcv_payload.Messages && rcv_payload.Messages.length > 0) {
            async.each(
              rcv_payload.Messages,
              function(message, callback_e) {
                _self.updateTable(message, function(err, data) {
                  if (err) {
                    LOGGER.log('ERROR', JSON.stringify(err));
                    callback_e();
                  } else {
                    LOGGER.log('INFO', JSON.stringify(data));

                    //calling sendMetrics and removeMessage in parallel
                    async.parallel(
                      {
                        remove_mssg: function(callback) {
                          _self.removeMessage(message, function(data) {
                            callback(null, data);
                          });
                        },
                        send_metric: function(callback) {
                          _self.sendMetrics(message, function(data) {
                            callback(null, data);
                          });
                        },
                      },
                      function(err, results) {
                        // results
                        LOGGER.log(
                          'INFO',
                          `results: ${JSON.stringify(results, null, 2)}`
                        );
                        callback_e();
                      }
                    );
                  }
                });
              },
              function(err) {
                if (
                  err //if any iteration callback called with error
                );
                else callback_p(); //executed after all iterations are done
              }
            );
          } else {
            callback_p();
          } //no messages
        });
      },
      function(err) {
        return cb(null, {
          Result: 'TA messages read',
        });
      }
    );
  }

  /**
   * [updateTable description]
   * @param  {[type]}   payload [description]
   * @param  {Function} cb      [description]
   * @return {[type]}           [description]
   */
  updateTable(payload, cb) {
    let ta_mssg = JSON.parse(payload.Body);
    let params = {
      TableName: this.ddbTable,
      Item: {
        MessageId: payload.MessageId,
        AccountId: ta_mssg.account,
        TimeStamp: ta_mssg.time,
        Region: ta_mssg.detail['check-item-detail']['Region'],
        Service: ta_mssg.detail['check-item-detail']['Service'],
        LimitName: ta_mssg.detail['check-item-detail']['Limit Name'],
        CurrentUsage: ta_mssg.detail['check-item-detail']['Current Usage'],
        LimitAmount: ta_mssg.detail['check-item-detail']['Limit Amount'],
        Status: ta_mssg.detail['status'],
        ExpiryTime: new Date().getTime() + 15 * 24 * 3600 * 1000, //1️⃣5️⃣ days
      },
    };
    LOGGER.log('DEBUG', `DDB put item: ${JSON.stringify(params)}`);

    this.docClient.put(params, function(err, data) {
      if (err) {
        return cb(
          {
            TableUpdate: {
              status: err,
            },
          },
          null
        ); //🔥
      } else {
        return cb(null, {
          TableUpdate: {
            status: 'success',
            //receipthandle: payload.ReceiptHandle
          },
        });
      }
    });
  }

  /**
   * [sendMetrics description]
   * @type {[type]}
   */
  sendMetrics(message, cb) {
    if (this.anonymous_data != 'Yes')
      return cb({
        Status: 'Customer chose not to send anonymous metrics to AWS',
      });

    let _metricsHelper = new MetricsHelper();

    let metrics = JSON.parse(message.Body);
    let metricData = {
      Region: metrics.detail['check-item-detail']['Region'],
      Service: metrics.detail['check-item-detail']['Service'],
      LimitName: metrics.detail['check-item-detail']['Limit Name'],
      Status: metrics.detail['status'], //include itemsize from ddb
    };

    let _anonymousmetric = {
      Solution: this.solution,
      UUID: this.uuid,
      TimeStamp: new Date(),
      Data: metricData,
    };

    LOGGER.log(
      'DEBUG',
      `anonymous metric: ${JSON.stringify(_anonymousmetric)}`
    );

    _metricsHelper.sendAnonymousMetric(_anonymousmetric, function(err, data) {
      let responseData;
      if (err) {
        responseData = {
          Error: 'Sending anonymous metric failed',
        };
      } else {
        responseData = {
          Success: 'Anonymous metrics sent to AWS',
        };
      }

      return cb(responseData);
    });
  }

  /**
   * [removeMessage description]
   * @param  {[type]}   message [description]
   * @param  {Function} cb      [description]
   * @return {[type]}           [description]
   */
  removeMessage(message, cb) {
    let _deleteParams = {
      QueueUrl: this.queueURL,
      ReceiptHandle: message.ReceiptHandle,
    };

    this.sqs.deleteMessage(_deleteParams, function(err, data) {
      if (err) {
        return cb({
          Status: {
            table_update: 'success',
            sqs_delete: err,
          },
        }); //🔥
      } else {
        return cb({
          Status: {
            table_update: 'success',
            sqs_delete: 'success',
          },
        });
      }
    });
  }
}

module.exports = limitreport;
