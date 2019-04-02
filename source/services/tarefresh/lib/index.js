/*********************************************************************************************************************
 *  Copyright 2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance        *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://aws.amazon.com/asl/                                                                                    *
 *                                                                                                                    *
 *  or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

/**
 * @author Solution Builders
 */

'use strict';

let AWS = require('aws-sdk');
let TARefresh = require('./ta-refresh.js');
const LOGGER = new (require('./logger'))();

module.exports.respond = function(event, cb) {
  // get service limit refresh status
  let _taRefresh = new TARefresh();
  _taRefresh.getTARefreshStatus(event, function(err, data) {
    if (err) {
      LOGGER.log('ERROR', err);
      return cb(err, null);
    }

    return cb(null, data);
  });
};
