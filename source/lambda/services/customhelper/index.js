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

console.log('Loading function');
let lib = require('./lib');
const LOGGER = new (require('./lib/logger'))();

exports.handler = function(event, context, callback) {
  //log received event
  LOGGER.log('DEBUG', `Received event: ${JSON.stringify(event, null, 2)}`);

  lib.respond(event, context, function(err, response) {
    if (err) return callback(null, err);
    return callback(null, response);
  });
};
