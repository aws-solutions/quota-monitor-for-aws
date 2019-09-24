/*********************************************************************************************************************
 *  Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
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
const AWS = require('aws-sdk');
const constants = require('./constants.js')
const LOGGER = new (require('./logger'))();
const regions = constants.regions;
let limitsMap = {
    "ec2_Standard_OnDemand":{},
    "ec2_G_OnDemand":{},
    "ec2_P_OnDemand":{},
    "ec2_F_OnDemand":{},
    "ec2_X_OnDemand":{}
};
let usageMap = {
    "ec2_Standard_OnDemand":{},
    "ec2_G_OnDemand":{},
    "ec2_P_OnDemand":{},
    "ec2_F_OnDemand":{},
    "ec2_X_OnDemand":{}
};

class ServiceQuotasChecks {

    constructor() {
        AWS.config.update({region: 'us-east-1'});
    }

    async getServiceLimits(checkName, params) { 
        let getServiceQuotas = regions.map(currentRegion => { 
            AWS.config.update({region: currentRegion});
            let servicequotas = new AWS.ServiceQuotas();
            return servicequotas.getServiceQuota(params).promise();
        });
        try {
            let serviceQuotasArray = await Promise.all(getServiceQuotas);
            serviceQuotasArray.map(entry => {
                let currentRegion = entry.Quota.QuotaArn.split(":")[3];
                limitsMap[checkName][currentRegion] = entry.Quota.Value
            })
        }catch(err) {
            LOGGER.log('ERROR', err);
        }
        return limitsMap;
    }

    async getServiceUsage(checkName, params) {

        for (let currentRegion of regions) {
            AWS.config.update({region: currentRegion});
            let cloudwatch = new AWS.CloudWatch();
            try {
                let response = await cloudwatch.getMetricData(params).promise();
                if (response.MetricDataResults[0].Values[0] !== undefined) {
                    let maxUsage = Math.max.apply(Math, response.MetricDataResults[0].Values);
                    usageMap[checkName][currentRegion] = maxUsage;
                }
            } catch (err) {
                LOGGER.log('ERROR', err);
                throw err;
            }
        }
        return usageMap;
    }

    async pushEventToEventbridge(checkName, statusColor, currentUsage, region, service, statusMessage,currentServiceLimit) {
        AWS.config.update({region: 'us-east-1'});
        let detailObj= {
            "checkname": checkName,
            "status": statusMessage,
            "check-item-detail": {
                "Status":statusColor,
                "Current Usage":currentUsage,
                "Limit Name":checkName,
                "Region":region,
                "Service":service,
                "Limit Amount":currentServiceLimit,
                "status": statusMessage
                },
        }
        let params = {
            Entries: [
                {
                    Source: "limit-monitor-solution",
                    DetailType: "Limit Monitor Checks",
                    Detail:JSON.stringify(detailObj),
                }    
            ]
        };
        let eventBridge = new AWS.EventBridge();
        try {
            LOGGER.log('DEBUG', params);
            await eventBridge.putEvents(params).promise();
        } catch (err) {
            LOGGER.log('ERROR', err);
        }
    }

    async doLimitCheck(checkName, service,params_limits,params_usage) {
        try {
            let serviceLimitPromise = this.getServiceLimits(checkName, params_limits);
            let serviceUsagePromise = this.getServiceUsage(checkName, params_usage);
            let serviceLimit = await serviceLimitPromise;
            let serviceUsage = await serviceUsagePromise;
            let serviceUsageMap = serviceUsage[checkName];
            let serviceLimitMap = serviceLimit[checkName];
            for(let region in serviceUsageMap) {
                let currentRegion = region;
                let currentServiceLimit = serviceLimitMap[currentRegion];
                let currentUsage = serviceUsageMap[currentRegion];
                if (currentUsage >= currentServiceLimit) { 
                    try {
                        await this.pushEventToEventbridge(checkName, "RED", currentUsage, currentRegion, service, "ERROR", currentServiceLimit);
                    }catch(err){
                        LOGGER.log('ERROR', err);
                    }
                }else if (currentUsage >= process.env.LIMIT_THRESHOLD * currentServiceLimit) {
                    try{
                        await this.pushEventToEventbridge(checkName, "YELLOW", currentUsage, currentRegion, service, "WARN", currentServiceLimit);
                    }catch(err){
                        LOGGER.log('ERROR', err);
                    }
                }else {
                    LOGGER.log("DEBUG", checkName);
                }
            }
        } catch (err) {
            LOGGER.log('ERROR', err);
        }
    };

    async checkVCPUOptIn(){
        let servicequotas = new AWS.ServiceQuotas();
        try {
            let response = await servicequotas.getAWSDefaultServiceQuota(constants.limits_ec2_Standard_OnDemand).promise();
            if (response.Quota.ServiceCode === "ec2")
                return true;
            else
                return false;
            }catch (err) {
                LOGGER.log('ERROR', err);
                return false;
            }
        }

    async performLimitChecks() {

        let  getUsageWindow = function() {
            let start_time = (Math.round((new Date()).getTime() / 1000)-300);
            let end_time = (Math.round((new Date()).getTime() / 1000));
            return[start_time,end_time];
        };

        let usage_ec2_Standard_OnDemand = {
            StartTime: getUsageWindow()[0],
            EndTime: getUsageWindow()[1],
            MetricDataQueries: [{
                Id: 'm1',
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/Usage',
                        MetricName: 'ResourceCount',
                        Dimensions: [{
                                Name: 'Service',
                                Value: 'EC2'
                            },
                            {
                                Name: 'Resource',
                                Value: 'vCPU'
                            },
                            {
                                Name: 'Type',
                                Value: 'Resource'
                            },
                            {
                                Name: 'Class',
                                Value: 'Standard/OnDemand'
                            }
                        ]
                    },
                    Period: 300,
                    Stat: 'Maximum'
                }
            }]
        };

        let usage_ec2_G_OnDemand = {
            StartTime: getUsageWindow()[0],
            EndTime: getUsageWindow()[1],
            MetricDataQueries: [{
                Id: 'm1',
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/Usage',
                        MetricName: 'ResourceCount',
                        Dimensions: [{
                                Name: 'Service',
                                Value: 'EC2'
                            },
                            {
                                Name: 'Resource',
                                Value: 'vCPU'
                            },
                            {
                                Name: 'Type',
                                Value: 'Resource'
                            },
                            {
                                Name: 'Class',
                                Value: 'G/OnDemand'
                            }
                        ]
                    },
                    Period: 300,
                    Stat: 'Maximum'
                }
            }]
        };

        let usage_ec2_P_OnDemand = {
            StartTime: getUsageWindow()[0],
            EndTime: getUsageWindow()[1],
            MetricDataQueries: [{
                Id: 'm1',
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/Usage',
                        MetricName: 'ResourceCount',
                        Dimensions: [{
                                Name: 'Service',
                                Value: 'EC2'
                            },
                            {
                                Name: 'Resource',
                                Value: 'vCPU'
                            },
                            {
                                Name: 'Type',
                                Value: 'Resource'
                            },
                            {
                                Name: 'Class',
                                Value: 'P/OnDemand'
                            }
                        ]
                    },
                    Period: 300,
                    Stat: 'Maximum'
                }
            }]
        };

        let usage_ec2_F_OnDemand = {
            StartTime: getUsageWindow()[0],
            EndTime: getUsageWindow()[1],
            MetricDataQueries: [{
                Id: 'm1',
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/Usage',
                        MetricName: 'ResourceCount',
                        Dimensions: [{
                                Name: 'Service',
                                Value: 'EC2'
                            },
                            {
                                Name: 'Resource',
                                Value: 'vCPU'
                            },
                            {
                                Name: 'Type',
                                Value: 'Resource'
                            },
                            {
                                Name: 'Class',
                                Value: 'F/OnDemand'
                            }
                        ]
                    },
                    Period: 300,
                    Stat: 'Maximum'
                }
            }]
        };

        let usage_ec2_X_OnDemand = {
            StartTime: getUsageWindow()[0],
            EndTime: getUsageWindow()[1],
            MetricDataQueries: [{
                Id: 'm1',
                MetricStat: {
                    Metric: {
                        Namespace: 'AWS/Usage',
                        MetricName: 'ResourceCount',
                        Dimensions: [{
                                Name: 'Service',
                                Value: 'EC2'
                            },
                            {
                                Name: 'Resource',
                                Value: 'vCPU'
                            },
                            {
                                Name: 'Type',
                                Value: 'Resource'
                            },
                            {
                                Name: 'Class',
                                Value: 'X/OnDemand'
                            }
                        ]
                    },
                    Period: 300,
                    Stat: 'Maximum'
                }
            }]
        };
        

        if(await this.checkVCPUOptIn()) {
            await Promise.all([
                this.doLimitCheck("ec2_Standard_OnDemand","EC2",constants.limits_ec2_Standard_OnDemand, usage_ec2_Standard_OnDemand),
                this.doLimitCheck("ec2_G_OnDemand","EC2",constants.limits_ec2_G_OnDemand, usage_ec2_G_OnDemand),
                this.doLimitCheck("ec2_P_OnDemand","EC2",constants.limits_ec2_P_OnDemand, usage_ec2_P_OnDemand),
                this.doLimitCheck("ec2_F_OnDemand","EC2",constants.limits_ec2_F_OnDemand, usage_ec2_F_OnDemand),
                this.doLimitCheck("ec2_X_OnDemand","EC2",constants.limits_ec2_X_OnDemand, usage_ec2_X_OnDemand)
            ]);
        }
    }

}
module.exports=ServiceQuotasChecks;