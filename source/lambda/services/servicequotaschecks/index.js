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
const LOGGER = new (require('./lib/logger'))();
LOGGER.log("INFO",'Loading serviceQuotasChecks function');
let serviceQuotasChecks = require ('./lib/service-quotas-checks.js')
exports.handler = async(event)=> {
    let _serviceQuotasChecks = new serviceQuotasChecks();
    let eventText = JSON.stringify(event, null, 2);
    LOGGER.log('DEBUG', `Received event: ${eventText}`);
    try {
        await _serviceQuotasChecks.checkForVCPULimits();
    }catch(err) {
        LOGGER.log("ERROR", err);
    }
}