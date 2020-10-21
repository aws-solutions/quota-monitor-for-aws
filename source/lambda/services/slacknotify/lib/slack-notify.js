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
const url = require('url');
const https = require('https');
const LOGGER = new (require('./logger'))();

/**
 * Sends notification on Slack channel
 *
 * @class slacknotify
 */
class slacknotify {
  constructor() {
    this.ssm = new AWS.SSM();
    this.slackHookURL = process.env.SLACK_HOOK;
    this.slackChannel = process.env.SLACK_CHANNEL;
  }

  /**
   * Sends slack notification
   * @param  {CWEvent}    event           [triggering event]
   * @param  {Function}   cb              [callback]
   * @return {sendNotification~callback}  [callback that handles response]
   */

  sendNotification(event, cb) {
    const _self = this;

    _self.ssm.getParameter(
      {
        Name: _self.slackChannel,
      },
      function(err, _channelData) {
        if (err) {
          LOGGER.log('ERROR', err.stack);
          return cb(err, null); // an error occurred;
        } else {
          _self.ssm.getParameter(
            {
              Name: _self.slackHookURL,
              WithDecryption: true,
            },
            function(err, _hookData) {
              if (err) return cb(err, null);

              let _slackURL = _hookData.Parameter.Value;

              let _slackMssg = _self.slackMessageBuilder(event);
              _slackMssg.channel = _channelData.Parameter.Value;

              _self.processEvent(_slackURL, _slackMssg, function(err, data) {
                if (err) return cb(err, null);
                return cb(null, {
                  result: 'success',
                });
              });
            }
          );
        } // successful response 👌
      }
    );
  }

  /**
   * [slackMessageBuilder description]
   * @param  {[type]} event [description]
   * @return {[type]}       [description]
   */
  slackMessageBuilder(event) {
    const _self = this;
    let _notifyColor = '#93938f';
    if (event.detail['status'] === 'OK') _notifyColor = '#36a64f';
    if (event.detail['status'] === 'WARN') _notifyColor = '#eaea3c';
    if (event.detail['status'] === 'ERROR') _notifyColor = '#bf3e2d';

    let _status = event.detail['status'];
    if (_status === 'OK') _status = `🆗`;
    if (_status === 'WARN') _status = `⚠️`;
    if (_status === 'ERROR') _status = `🔥`;

    /*
     * SO-Limit-M-41 - 07/30/2018 - Slack mapping
     * Fixed slack notification mapping
     */
    let _slackMssg = {
      attachments: [
        {
          color: _notifyColor,
          fields: [
            {
              title: 'AccountId',
              value: `${event.account}`,
              short: true,
            },
            {
              title: 'Status',
              value: _status,
              short: true,
            },
            {
              title: 'TimeStamp',
              value: `${event.time}`,
              short: true,
            },
            {
              title: 'Region',
              value: `${event.detail['check-item-detail']['Region']}`,
              short: true,
            },
            {
              title: 'Service',
              value: `${event.detail['check-item-detail']['Service']}`,
              short: true,
            },
            {
              title: 'LimitName',
              value: `${event.detail['check-item-detail']['Limit Name']}`,
              short: true,
            },
            {
              title: 'CurrentUsage',
              value: `${event.detail['check-item-detail']['Current Usage']}`,
              short: true,
            },
            {
              title: 'LimitAmount',
              value: `${event.detail['check-item-detail']['Limit Amount']}`,
              short: true,
            },
          ],
          pretext: '*Limit Monitor Update*',
          fallback: 'new notification from AWS Limit Monitor',
          author_name: '@aws-limit-monitor',
          title: 'Limit Monitor Documentation',
          title_link:
            'https://aws.amazon.com/answers/account-management/limit-monitor/',
          footer: 'Take Action?',
          actions: [
            {
              text: 'AWS Console',
              type: 'button',
              url:
                'https://console.aws.amazon.com/support/home?region=us-east-1#',
            },
          ],
        },
      ],
    };

    return _slackMssg;
  }

  /**
   * [postMessage description]
   * @param  {[type]}   message  [description]
   * @param  {Function} callback [description]
   * @return {[type]}            [description]
   */
  postMessage(slackurl, message, callback) {
    const _self = this;
    const body = JSON.stringify(message);
    const options = url.parse(slackurl);
    options.method = 'POST';
    options.headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };

    const postReq = https.request(options, res => {
      const chunks = [];
      res.setEncoding('utf8');
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (callback) {
          callback({
            body: chunks.join(''),
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
          });
        }
      });
      return res;
    });

    postReq.write(body);
    postReq.end();
  }

  /**
   * [processEvent description]
   * @param  {[type]}   slackconfig [description]
   * @param  {Function} cb          [description]
   * @return {[type]}               [description]
   */
  processEvent(slackURL, slackMssg, cb) {
    const _self = this;
    _self.postMessage(slackURL, slackMssg, response => {
      if (response.statusCode < 400) {
        return cb(null, 'Message posted successfully');
      } else if (response.statusCode < 500) {
        LOGGER.log(
          'WARN',
          `Error posting message to Slack API: ${response.statusCode} - ${
            response.statusMessage
          }`
        );
        return cb(response.statusMessage, null); // Don't retry because the error is due to a problem with the request
      } else {
        // Let Lambda retry
        return cb(
          `Server error when processing message: ${response.statusCode} - ${
            response.statusMessage
          }`
        );
      }
    });
  }
}

module.exports = slacknotify;
