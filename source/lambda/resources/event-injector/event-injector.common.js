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
const AWS = require('aws-sdk/global');
const Events = require('aws-sdk/clients/cloudwatchevents');
const Logger = require('logger')

class EventInjector {
    /**
     * @class EventInjector
     * @constructor
     */
    constructor() { }

    async static putEvent() {
        //TODO cloudwatch events put data
        var params = {
            Entries: [ /* required */
                {
                    Detail: 'STRING_VALUE',
                    DetailType: 'STRING_VALUE',
                    EventBusName: 'STRING_VALUE',
                    Resources: [
                        'STRING_VALUE',
                        /* more items */
                    ],
                    Source: 'STRING_VALUE',
                    Time: new Date || 'Wed Dec 31 1969 16:00:00 GMT-0800 (PST)' || 123456789
                },
                /* more items */
            ]
        };
        try { await Events.putEvents(); }
        catch (e) {
            Logger.log('ERROR', `${e}`)
            throw new Error(e)
        }

    }
}

module.exports = {
    EventInjector,
}
