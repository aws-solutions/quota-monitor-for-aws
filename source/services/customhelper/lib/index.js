'use strict';

const uuidv4 = require('uuid/v4');
const https = require('https');
const url = require('url');
const moment = require('moment');
const async = require('async');
const AWS = require('aws-sdk');

const LOGGER = new(require('./logger'))();
const MetricsHelper = require('./metrics-helper');

module.exports.respond = function(event, context, callback) {

  //handle CREATE for custom resource CreateUUID
  if (event.LogicalResourceId === 'CreateUUID' && event.RequestType === 'Create') {
    LOGGER.log('DEBUG', `event details: ${event.LogicalResourceId}:${event.RequestType}`);

    let _responseData = {
      UUID: uuidv4(),
      Method: `${event.LogicalResourceId}:${event.RequestType}`
    }

    sendResponse(event, callback, context.logStreamName, 'SUCCESS', _responseData);
    return;

    //handle CREATE for DeploymentData
  } else if (event.LogicalResourceId === 'DeploymentData' && event.RequestType === 'Create') {
    LOGGER.log('DEBUG', `event details: ${event.LogicalResourceId}:${event.RequestType}`);

    let _metricData = {
      Version: event.ResourceProperties.VERSION,
      AnonymousData: event.ResourceProperties.ANONYMOUS_DATA
    }
    //call metric helper
    sendMetrics(_metricData, event, function(data) {
      LOGGER.log('INFO', `Metrics Status: ${JSON.stringify(data)}`);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`
      }

      sendResponse(event, callback, context.logStreamName, 'SUCCESS', _responseData);
      return;
    });

    //handle CREATE/UPDATE for custom resource AccountAnonymousData
  } else if (event.LogicalResourceId === 'AccountAnonymousData' && (event.RequestType === 'Create' || event.RequestType === 'Update')) {
    LOGGER.log('DEBUG', `event details: ${event.LogicalResourceId}:${event.RequestType}`);
    let _awsAccounts = event.ResourceProperties.SUB_ACCOUNTS.split(",");

    let _spokecount;
    if (_awsAccounts[0])
      _spokecount = event.ResourceProperties.SUB_ACCOUNTS.split(",").length;
    else
      _spokecount = 0;

    let _metricData = {
      Version: event.ResourceProperties.VERSION,
      SNSEvents: event.ResourceProperties.SNS_EVENTS,
      SlackEvents: event.ResourceProperties.SLACK_EVENTS,
      SpokeCount: _spokecount,
      TARefreshRate: event.ResourceProperties.TA_REFRESH_RATE
    }
    //call metric helper
    sendMetrics(_metricData, event, function(data) {
      LOGGER.log('INFO', `Metrics Status: ${JSON.stringify(data)}`);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`
      }

      sendResponse(event, callback, context.logStreamName, 'SUCCESS', _responseData);
      return;
    });

    //handle CREATE for custom resource EstablishTrust
  } else if (event.LogicalResourceId === 'EstablishTrust' && event.RequestType === 'Create') {
    LOGGER.log('DEBUG', `event details: ${event.LogicalResourceId}:${event.RequestType}`);
    let awsAccounts = event.ResourceProperties.SUB_ACCOUNTS.replace(/"/g, "");
    let _awsAccounts = awsAccounts.split(",");

    createTrust(_awsAccounts, function(data) {
      LOGGER.log('INFO', data);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`
      }

      sendResponse(event, callback, context.logStreamName, 'SUCCESS', _responseData);
      return;
    });

    //handle UPDATE for custom resource EstablishTrust
  } else if (event.LogicalResourceId === 'EstablishTrust' && event.RequestType === 'Update') {
    LOGGER.log('DEBUG', `event details: ${event.LogicalResourceId}:${event.RequestType}`);
    let oldAccounts = event.OldResourceProperties.SUB_ACCOUNTS.replace(/"/g, "");
    let _oldAccounts = oldAccounts.split(",");
    let newAccounts = event.ResourceProperties.SUB_ACCOUNTS.replace(/"/g, "");
    let _newAccounts = newAccounts.split(",");

    //remove trust first
    removeTrust(_oldAccounts, function(data) {
      LOGGER.log('INFO', data);
      //now establish trust for updated account list
      createTrust(_newAccounts, function(data) {
        LOGGER.log('INFO', data);
        let _responseData = {
          Method: `${event.LogicalResourceId}:${event.RequestType}`
        }

        sendResponse(event, callback, context.logStreamName, 'SUCCESS', _responseData);
        return;
      });
    });

    //handle DELETE for custom resource EstablishTrust
  } else if (event.LogicalResourceId === 'EstablishTrust' && event.RequestType === 'Delete') {
    LOGGER.log('DEBUG', `event details: ${event.LogicalResourceId}:${event.RequestType}`);
    let awsAccounts = event.ResourceProperties.SUB_ACCOUNTS.replace(/"/g, "");
    let _awsAccounts = awsAccounts.split(",");

    removeTrust(_awsAccounts, function(data) {
      LOGGER.log('INFO', data);
      let _responseData = {
        Method: `${event.LogicalResourceId}:${event.RequestType}`
      }

      sendResponse(event, callback, context.logStreamName, 'SUCCESS', _responseData);
      return;
    });

    //always send response to custom resource
  } else {
    let _responseData = {
      Method: `${event.LogicalResourceId}:${event.RequestType}`
    }
    LOGGER.log('DEBUG', `event details: ${event.LogicalResourceId}:${event.RequestType}`);

    sendResponse(event, callback, context.logStreamName, 'SUCCESS', _responseData);
    return;
  }
}

/**
 * [sendMetrics description]
 * @type {[type]}
 */
let sendMetrics = function(metricData, event, cb) {
  let _metricsHelper = new MetricsHelper();

  let _metric = {
    Solution: event.ResourceProperties.SOLUTION,
    UUID: event.ResourceProperties.UUID,
    TimeStamp: moment().utc().format('YYYY-MM-DD HH:mm:ss.S'),
    Data: metricData
  };

  LOGGER.log('DEBUG', `anonymous metric: ${JSON.stringify(_metric)}`);

  _metricsHelper.sendAnonymousMetric(_metric, function(err, data) {
    let responseData;
    if (err) {
      responseData = {
        Error: 'Sending anonymous metric failed'
      };
    } else {
      responseData = {
        Success: 'Anonymous metrics sent to AWS'
      }
    }

    return cb(responseData);
  });

}

/**
 * Sends a response to the pre-signed S3 URL
 */
let sendResponse = function(event, callback, logStreamName, responseStatus, responseData) {
  const responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: `See the details in CloudWatch Log Stream: ${logStreamName}`,
    PhysicalResourceId: `CustomResource-${event.LogicalResourceId}`,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData
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
      'Content-Length': responseBody.length
    }
  };

  const req = https.request(options, (res) => {
    LOGGER.log('INFO', `STATUS: ${res.statusCode}`);
    LOGGER.log('DEBUG', `HEADERS: ${JSON.stringify(res.headers)}`);
    callback(null, 'Successfully sent stack response!');
  });

  req.on('error', (err) => {
    LOGGER.log('ERROR', `sendResponse Error:\n ${err}`);
    callback(err);
  });

  req.write(responseBody);
  req.end();
}

/**
 * Establish trust relationship for cross accounts
 */

let createTrust = function(accounts, cb) {
  let CWE = new AWS.CloudWatchEvents();
  if (accounts[0])
    LOGGER.log('DEBUG', `accounts for establishing trust relationship:\n ${accounts}`);
  else
    return cb('no accounts to establish trust');

  async.each(accounts, function(account, callback) {
      let _params = {
        Action: 'events:PutEvents',
        Principal: account,
        StatementId: `limtr-${account}`
      };

      CWE.putPermission(_params, function(err, data) {
        if (err)
          LOGGER.log('ERROR', `${JSON.stringify({
          CreateTrust: {
            status: 'ERROR',
            account: account,
            response: err
          }
        }, null, 2)}`); // an error occurred 🔥
        else
          LOGGER.log('DEBUG', `${JSON.stringify({
                CreateTrust: {
                  status: 'SUCCESS',
                  account: account,
                  response: data}
        }, null, 2)}`); // successful response 👌
        callback();
      });
    },
    function(err) {
      if (err) {
        // One of the iterations produced an error.
        // All processing will now stop.

      } else {
        return cb('trust relationship established');
      }
    });
}

/**
 * Removes trust relationship for cross accounts
 */
let removeTrust = function(accounts, cb) {
  let CWE = new AWS.CloudWatchEvents();
  if (accounts[0])
    LOGGER.log('DEBUG', `accounts for removing trust relationship:\n ${accounts}`);
  else
    return cb('no accounts to remove trust');

  async.each(accounts, function(account, callback) {
      let _params = {
        StatementId: `limtr-${account}`
      };

      CWE.removePermission(_params, function(err, data) {
        if (err)
          LOGGER.log('ERROR', `${JSON.stringify({
    RemoveTrust: {
      status: 'ERROR',
      account: account,
      response: err } // an error occurred 🔥
    }, null, 2)}`);
        else
          LOGGER.log('DEBUG', `${JSON.stringify({
          RemoveTrust: {
            status: 'SUCCESS',
            account: account,
            response: data}
          }, null, 2)}`); // successful response 👌
        callback();
      });
    },
    function(err) {
      if (err) {
        // One of the iterations produced an error.
        // All processing will now stop.

      } else {
        return cb('trust relationship removed');
      }
    });
}
