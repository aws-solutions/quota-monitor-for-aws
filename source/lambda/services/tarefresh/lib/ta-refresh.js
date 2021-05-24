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
const LOGGER = new (require('./logger'))();

//all service check ids
let serviceChecks = {
  AutoScaling: ['fW7HH0l7J9', 'aW7HH0l7J9'],
  CloudFormation: ['gW7HH0l7J9'],
  DynamoDB: [
    '6gtQddfEw6',
    'c5ftjdfkMr'
  ],
  /*
   * V172128963 - 01/21/2020 - New TA Checks
   * added TA checks for EBS and ELB
   */
  EBS: [
    'eI7KK0l7J9',
    'dH7RR0l6J9',
    'cG7HH0l7J9',
    'tV7YY0l7J9',
    'gI7MM0l7J9',
    'wH7DD0l3J9',
    'gH5CC0e3J9',
  ],
  EC2: ['0Xc6LMYG8P', 'iH7PP0l7J9'],
  ELB: ['iK7OO0l7J9', 'EM8b3yLRTr', '8wIqYSt25K'],
  IAM: [
    'sU7XX0l7J9',
    'nO7SS0l7J9',
    'pR7UU0l7J9',
    'oQ7TT0l7J9',
    'rT7WW0l7J9',
    'qS7VV0l7J9',
  ],
  Kinesis: ['bW7HH0l7J9'],
  RDS: [
    'jtlIMO3qZM',
    '7fuccf1Mx7',
    'gjqMBn6pjz',
    'XG0aXHpIEt',
    'jEECYg2YVU',
    'gfZAn3W7wl',
    'dV84wpqRUs',
    'keAhfbH5yb',
    'dBkuNCvqn5',
    '3Njm0DJQO9',
    'pYW8UkYz2w',
    'UUDvOa5r34',
    'dYWBaXaaMM',
    'jEhCtdJKOY',
    'P1jhKWEmLa',
  ],
  /*
   * SO-Limit-M-47 - 04/01/2019 - New TA Checks
   * added TA checks for R53 and DDB
   */
  Route53: [
    'dx3xfcdfMr',
    'ru4xfcdfMr',
    'ty3xfcdfMr',
    'dx3xfbjfMr',
    'dx8afcdfMr'
  ],
  SES: ['hJ7NN0l7J9'],
  VPC: ['lN7RR0l7J9', 'kM7QQ0l7J9', 'jL7PP0l7J9'],
};

//user provided services for TA refresh
const userServices = process.env.AWS_SERVICES.replace(/"/g, '');
const _userServices = userServices.split(',');

/**
 * Performs Trusted Advisor refresh
 *
 * @class tarefresh
 */
class tarefresh {
  /**
   * @class tarefresh
   * @constructor
   */
  constructor() {
    this.support = new AWS.Support();
  }

  /**
   * [getTARefreshStatus description]
   * @param  {[type]}   event [description]
   * @param  {Function} cb    [description]
   * @return {[type]}         [description]
   */


  /**
   * This function checks if the customers have opted-in for the vCPU limits from Ec2 service.
   * If the customers have opted in, the function will update the checks that will be performed by Trusted Advisor.
   */
  async getUpdatedEC2Checks() {
    let limits_ec2_Standard_OnDemand = {
      QuotaCode: 'L-1216C47A',
      ServiceCode: 'ec2'
    };
    let servicequotas = new AWS.ServiceQuotas();
    try {
      let response = await servicequotas.getAWSDefaultServiceQuota(limits_ec2_Standard_OnDemand).promise();
      if (response.Quota.ServiceCode === "ec2")
        serviceChecks.EC2 = ['iH7PP0l7J9'];
    } catch (err) {
      LOGGER.log('ERROR', err);
    }
  }

  async getTARefreshStatus(event, cb) {
    await this.getUpdatedEC2Checks();
    LOGGER.log('INFO', serviceChecks.EC2);
    const _self = this;
    async.each(
      _userServices,
      function (service, callback_p) {
        async.each(
          serviceChecks[service],
          function (checkId, callback_e) {
            _self.refreshTA(checkId, function (err, data) {
              if (err) {
                LOGGER.log(
                  'DEBUG',
                  `TA checkId could not be refreshed: ${checkId} ${err}`
                );
              }
              callback_e();
            });
          },
          function (err) {
            callback_p();
          }
        );
      },
      function (err) {
        return cb(null, {
          Result: 'TA refresh done',
        });
      }
    );
  }

  /**
   * [refreshTA description]
   * @param  {[type]}   checkId [description]
   * @param  {Function} cb      [description]
   * @return {[type]}           [description]
   */
  refreshTA(checkId, cb) {
    const _self = this;
    let params = {
      checkId: checkId /* required */,
    };

    this.support.refreshTrustedAdvisorCheck(params, function (err, data) {
      if (err) {
        return cb(err, null);
      }

      return cb(null, {
        result: 'success',
      });
    });
  }
}

module.exports = tarefresh;
