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

const { "v4": uuidv4 } = require('uuid');
const https = require('https');
const url = require('url');
const AWS = require('aws-sdk');

const LOGGER = new (require('./logger'))();
const MetricsHelper = require('./metrics-helper');

const respond = function(event, context, callback) {
  //handle CREATE for custom resource CreateUUID
  if (
    event.LogicalResourceId === 'CreateUUID' &&
    event.RequestType === 'Create'
  ) {
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );

    let _responseData = {
      UUID: uuidv4(),
      Method: `${event.LogicalResourceId}:${event.RequestType}`,
    };

    sendResponse(
      event,
      callback,
      context.logStreamName,
      'SUCCESS',
      _responseData
    );
    return;

    //handle CREATE for SSMParameter
  } else if (
    event.LogicalResourceId === 'SSMParameter' &&
    (event.RequestType === 'Create' || event.RequestType === 'Update')
  ) {
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );

    let _responseData = {
      Method: `${event.LogicalResourceId}:${event.RequestType}`,
    };


    const slackHookKey = event.ResourceProperties.SLACK_HOOK_KEY;
    const slackChannelKey = event.ResourceProperties.SLACK_CHANNEL_KEY;

    createSSMParameter(slackChannelKey, slackHookKey, function(data) {
      LOGGER.log('INFO', `SSM Status: ${JSON.stringify(data)}`);
      sendResponse(
        event,
        callback,
        context.logStreamName,
        'SUCCESS',
        _responseData
      );
      return;
    });

    //handle CREATE for DeploymentData
  } else if (
    event.LogicalResourceId === 'DeploymentData' &&
    event.RequestType === 'Create'
  ) {
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );

    let _metricData = {
      Version: event.ResourceProperties.VERSION,
      AnonymousData: event.ResourceProperties.ANONYMOUS_DATA,
    };
    //call metric helper
    sendMetrics(_metricData, event, function(data) {
      LOGGER.log('INFO', `Metrics Status: ${JSON.stringify(data)}`);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`,
      };

      sendResponse(
        event,
        callback,
        context.logStreamName,
        'SUCCESS',
        _responseData
      );
      return;
    });

    //handle CREATE/UPDATE for custom resource AccountAnonymousData
  } else if (
    event.LogicalResourceId === 'AccountAnonymousData' &&
    (event.RequestType === 'Create' || event.RequestType === 'Update')
  ) {
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );
    let _awsAccounts = event.ResourceProperties.SUB_ACCOUNTS.split(',');

    let _spokecount;
    if (_awsAccounts[0])
      _spokecount = event.ResourceProperties.SUB_ACCOUNTS.split(',').length;
    else _spokecount = 0;

    let _metricData = {
      Version: event.ResourceProperties.VERSION,
      SNSEvents: event.ResourceProperties.SNS_EVENTS,
      SlackEvents: event.ResourceProperties.SLACK_EVENTS,
      SpokeCount: _spokecount,
      TARefreshRate: event.ResourceProperties.TA_REFRESH_RATE,
    };
    //call metric helper
    sendMetrics(_metricData, event, function(data) {
      LOGGER.log('INFO', `Metrics Status: ${JSON.stringify(data)}`);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`,
      };

      sendResponse(
        event,
        callback,
        context.logStreamName,
        'SUCCESS',
        _responseData
      );
      return;
    });

    //handle CREATE for custom resource EstablishTrust
  } else if (
    event.LogicalResourceId === 'EstablishTrust' &&
    event.RequestType === 'Create'
  ) {
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );
    let awsAccounts = event.ResourceProperties.SUB_ACCOUNTS.replace(/"/g, '');
    let _awsAccounts = awsAccounts.split(',');

    createTrust(_awsAccounts, function(data) {
      LOGGER.log('INFO', data);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`,
      };

      sendResponse(
        event,
        callback,
        context.logStreamName,
        'SUCCESS',
        _responseData
      );
      return;
    });

    //handle UPDATE for custom resource EstablishTrust
  } else if (
    event.LogicalResourceId === 'EstablishTrust' &&
    event.RequestType === 'Update'
  ) {
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );
    let oldAccounts = event.OldResourceProperties.SUB_ACCOUNTS.replace(
      /"/g,
      ''
    );
    let _oldAccounts = oldAccounts.split(',');
    let newAccounts = event.ResourceProperties.SUB_ACCOUNTS.replace(/"/g, '');
    let _newAccounts = newAccounts.split(',');

    //remove trust first
    removeTrust(_oldAccounts, function(data) {
      LOGGER.log('INFO', data);
      //now establish trust for updated account list
      createTrust(_newAccounts, function(data) {
        LOGGER.log('INFO', data);
        let _responseData = {
          Method: `${event.LogicalResourceId}:${event.RequestType}`,
        };

        sendResponse(
          event,
          callback,
          context.logStreamName,
          'SUCCESS',
          _responseData
        );
        return;
      });
    });

    //handle DELETE for custom resource EstablishTrust
  } else if (
    event.LogicalResourceId === 'EstablishTrust' &&
    event.RequestType === 'Delete'
  ) {
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );
    let awsAccounts = event.ResourceProperties.SUB_ACCOUNTS.replace(/"/g, '');
    let _awsAccounts = awsAccounts.split(',');

    removeTrust(_awsAccounts, function(data) {
      LOGGER.log('INFO', data);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`,
      };

      sendResponse(
        event,
        callback,
        context.logStreamName,
        'SUCCESS',
        _responseData
      );
      return;
    });

    //always send response to custom resource
  } else {
    let _responseData = {
      Method: `${event.LogicalResourceId}:${event.RequestType}`,
    };
    LOGGER.log(
      'DEBUG',
      `event details: ${event.LogicalResourceId}:${event.RequestType}`
    );

    sendResponse(
      event,
      callback,
      context.logStreamName,
      'SUCCESS',
      _responseData
    );
    return;
  }
};

/**
 * [sendMetrics description]
 * @type {[type]}
 */
let sendMetrics = function(metricData, event, cb) {
  let _metricsHelper = new MetricsHelper();

  let _metric = {
    Solution: event.ResourceProperties.SOLUTION,
    UUID: event.ResourceProperties.UUID,
    TimeStamp: new Date(),
    Data: metricData,
  };

  LOGGER.log('DEBUG', `anonymous metric: ${JSON.stringify(_metric)}`);

  _metricsHelper.sendAnonymousMetric(_metric, function(err, data) {
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
};

/**
 * Sends a response to the pre-signed S3 URL
 */
let sendResponse = function(
  event,
  callback,
  logStreamName,
  responseStatus,
  responseData
) {
  const responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: `See the details in CloudWatch Log Stream: ${logStreamName}`,
    PhysicalResourceId: `CustomResource-${event.LogicalResourceId}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData,
  });

  LOGGER.log('DEBUG', `RESPONSE BODY:\n ${responseBody}`);
  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'Content-Type': '',
      'Content-Length': responseBody.length,
    },
  };

  const req = https.request(options, res => {
    LOGGER.log('INFO', `STATUS: ${res.statusCode}`);
    LOGGER.log('DEBUG', `HEADERS: ${JSON.stringify(res.headers)}`);
    callback(null, 'Successfully sent stack response!');
  });

  req.on('error', err => {
    LOGGER.log('ERROR', `sendResponse Error:\n ${err}`);
    callback(err);
  });

  req.write(responseBody);
  req.end();
};

/**
 * Establish trust relationship for cross accounts
 */

// 03/13/2019 - SO-Limit-M-45 - Fix to concurrent put permission call
const createTrust = async function(accounts, cb) {
  const CWE = new AWS.CloudWatchEvents();
  if (accounts[0])
    LOGGER.log(
      'DEBUG',
      `accounts for establishing trust relationship:\n ${accounts}`
    );
  else return cb('no accounts to establish trust');

  for (const account of accounts) {
    LOGGER.log('INFO', `Authorising account ${account}...`);
    await CWE.putPermission({
      Action: 'events:PutEvents',
      Principal: account,
      StatementId: `limtr-${account}`,
    })
      .promise()
      .then(function(r) {
        LOGGER.log(
          'DEBUG',
          `${JSON.stringify(
            {
              CreateTrust: {
                status: 'SUCCESS',
                account: account,
                response: r,
              },
            },
            null,
            2
          )}`
        );
      })
      .catch(function(err) {
        LOGGER.log(
          'ERROR',
          `${JSON.stringify(
            {
              CreateTrust: {
                status: 'ERROR',
                account: account,
                response: err,
              },
            },
            null,
            2
          )}`
        );
      });
  }

  return cb('trust relationship established');
};
/**
 * Removes trust relationship for cross accounts
 */
const removeTrust = async function(accounts, cb) {
  let CWE = new AWS.CloudWatchEvents();
  if (accounts[0])
    LOGGER.log(
      'DEBUG',
      `accounts for removing trust relationship:\n ${accounts}`
    );
  else return cb('no accounts to remove trust');

  for (const account of accounts) {
    LOGGER.log('INFO', `Authorising account ${account}...`);
    await CWE.removePermission({
      StatementId: `limtr-${account}`,
    })
      .promise()
      .then(function(r) {
        LOGGER.log(
          'DEBUG',
          `${JSON.stringify(
            {
              RemoveTrust: {
                status: 'SUCCESS',
                account: account,
                response: r,
              },
            },
            null,
            2
          )}`
        ); // successful response 👌
      })
      .catch(function(err) {
        LOGGER.log(
          'ERROR',
          `${JSON.stringify(
            {
              RemoveTrust: {
                status: 'ERROR',
                account: account,
                response: err,
              }, // an error occurred 🔥
            },
            null,
            2
          )}`
        );
      });
  }
  return cb('trust relationship removed');
};

/**
 * Create SSM Parameter if it doesn't exist
 */
async function createSSMParameter(channelKey, hookURLKey, cb) {
  const ssm = new AWS.SSM();
  try {
    const data = await ssm
      .getParameters({Names: [channelKey, hookURLKey], WithDecryption: true})
      .promise();
    LOGGER.log(
      'DEBUG',
      `${JSON.stringify(
        {
          SSMParameter: {
            create: 'true',
            parameters: data.InvalidParameters,
          },
        },
        null,
        2
      )}`
    );
    await Promise.all(
      data.InvalidParameters.map(async ssmParam => {
        console.log(ssmParam);
        await ssm
          .putParameter({
            Name: ssmParam /* required */,
            Type: 'String' /* required */,
            Value: 'SLACK_DUMMY' /* required */,
          })
          .promise();
      })
    );
    // successful response 👌
    cb('slack ssm parameter creation done');
  } catch (err) {
    LOGGER.log(
      'ERROR',
      `${JSON.stringify(
        {
          SSMParameter: {
            channelKey: channelKey,
            hookKey: hookURLKey,
            response: err,
          }, // an error occurred 🔥
        },
        null,
        2
      )}`
    );
    cb(err);
  }
}

module.exports = {
  respond: respond,
  createSSMParameter: createSSMParameter,
};
