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
const CloudWatch = require('aws-sdk/clients/cloudwatch');
const Logger = require('logger')

class CWMetic {
    /**
     * @class CWMetric
     * @constructor
     */
    constructor() { }

    async static getData() {
        //TODO CloudWatch get data
        var params = {
            EndTime: new Date || 'Wed Dec 31 1969 16:00:00 GMT-0800 (PST)' || 123456789, /* required */
            MetricDataQueries: [ /* required */
                {
                    Id: 'STRING_VALUE', /* required */
                    Expression: 'STRING_VALUE',
                    Label: 'STRING_VALUE',
                    MetricStat: {
                        Metric: { /* required */
                            Dimensions: [
                                {
                                    Name: 'STRING_VALUE', /* required */
                                    Value: 'STRING_VALUE' /* required */
                                },
                                /* more items */
                            ],
                            MetricName: 'STRING_VALUE',
                            Namespace: 'STRING_VALUE'
                        },
                        Period: 'NUMBER_VALUE', /* required */
                        Stat: 'STRING_VALUE', /* required */
                        Unit: Seconds | Microseconds | Milliseconds | Bytes | Kilobytes | Megabytes | Gigabytes | Terabytes | Bits | Kilobits | Megabits | Gigabits | Terabits | Percent | Count | Bytes / Second | Kilobytes / Second | Megabytes / Second | Gigabytes / Second | Terabytes / Second | Bits / Second | Kilobits / Second | Megabits / Second | Gigabits / Second | Terabits / Second | Count / Second | None
                    },
                    ReturnData: true || false
                },
                /* more items */
            ],
            StartTime: new Date || 'Wed Dec 31 1969 16:00:00 GMT-0800 (PST)' || 123456789, /* required */
            MaxDatapoints: 'NUMBER_VALUE',
            NextToken: 'STRING_VALUE',
            ScanBy: TimestampDescending | TimestampAscending
        };
        try { await cloudwatch.getMetricData(params) }
        catch (e) {
            Logger.log('ERROR', `${e}`)
            throw new Error(e)
        }
    }
}

module.exports = {
    CWMetic,
}
