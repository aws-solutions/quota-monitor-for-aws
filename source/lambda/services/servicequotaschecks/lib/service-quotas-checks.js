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
const AWS = require('aws-sdk');
const LOGGER = new (require('./logger'))();

class ServiceQuotasChecks {
    constructor() {
        AWS.config.update({region: 'us-east-1'});
    }

    /**
     * Gets all the valid regions for the Service Quotas
     */

    async getRegionsForServiceQuotas() {
        AWS.config.update({region: 'us-east-1'});
        let ec2 = new AWS.EC2({apiVersion: '2016-11-15'});
        let params = {};
        let ec2_regions = [];
        let service_quota_regions = [];
        let ec2_onDemand_quota={
            QuotaCode: 'L-1216C47A',
            ServiceCode: 'ec2'
        }
        try {   
            let response_ec2_regions = await ec2.describeRegions(params).promise();
            ec2_regions = response_ec2_regions.Regions;
            for(let item of ec2_regions) {
                let region = item.RegionName;
                let sq = new AWS.ServiceQuotas({
                    region: region,
                    maxRetries: 2,
                    httpOptions: {
                        timeout: 3000,
                        connectTimeout: 5000
                    }
                });
                try {
                    await sq.getAWSDefaultServiceQuota(ec2_onDemand_quota).promise();
                    service_quota_regions.push(region);
                } catch(err) {
                    LOGGER.log('DEBUG', `${err} - ${JSON.stringify(item)}`);
                }
            }
        } catch(err) {
            LOGGER.log('ERROR', err);
        }
        LOGGER.log('DEBUG', `service_quota_regions: ${service_quota_regions}`)
        return service_quota_regions;
    }

    /**
     * Gets the list all the vCPU types
     */

    async getEC2InstanceTypes() {
        let params= {ServiceCode: 'ec2'}
        let ec2_service_limits = [];
        let instance_Types = [];
        let quotas = {};
        AWS.config.update({region:'us-east-1'});
        let sq = new AWS.ServiceQuotas();
        try {
            quotas = await sq.listServiceQuotas(params).promise();
            quotas.Quotas.map(item=> {
                ec2_service_limits.push(item);
            });
            while(quotas.NextToken) {
                params.NextToken=quotas.NextToken;
                try { 
                    quotas = await sq.listServiceQuotas(params).promise();
                    quotas.Quotas.map(item=> {
                        ec2_service_limits.push(item);
                    })
                } catch(err) {
                    LOGGER.log('ERROR', err);
                }
            }
            ec2_service_limits.map(limit_type => {
                if(limit_type.UsageMetric)
                    instance_Types.push(limit_type);
            })
            LOGGER.log('DEBUG', 'instance_Types ' + JSON.stringify(instance_Types))
        } catch(err) {
            LOGGER.log('ERROR', err);
        }
        return instance_Types;
    }

    /**
     * Creates the parameter to get the service limits from Service Quotas
     * @param {string} quota_code The qouta code for the limit type
     */
    createVCPUServiceQuotaParams(quota_code){
        let sq_param = {
            QuotaCode: '',
            ServiceCode: 'ec2'
        };
        sq_param.QuotaCode = quota_code;
        return sq_param;
    }

    /**
     * Creates the parameter to get the cloudwatch metrics for the vCPU type
     * @param {string} vCPU_type vCPU type for the cloudwatch metric
     */

    createCloudwatchParamsForInstanceTypes(vCPU_type){

        /**
         * Gets the start and end times for the currnet 5 minute window
         */

        let  getUsageWindow = function() {
            let start_time = (Math.round((new Date()).getTime() / 1000)-300);
            let end_time = (Math.round((new Date()).getTime() / 1000));
            return[start_time,end_time];
        };
        let cloudwatch_param = 
        {
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
                                Value: ''
                            }
                        ]
                    },
                    Period: 300,
                    Stat: 'Maximum'
                }
            }]
        };
        cloudwatch_param.MetricDataQueries[0].MetricStat.Metric.Dimensions[3].Value = vCPU_type.UsageMetric.MetricDimensions.Class;
        return cloudwatch_param;
    }


    /**
     * Gets the service limits for the vCPU type
     * @param {string} checkName The vCPU type
     * @param {string} params The parameters to get the limits
     * @param {object} valid_regions List of valid regions.
     */

    async getServiceLimits(checkName, params, valid_regions) {
        if(!Promise.allSettled) {
            Promise.allSettled = function(promises) {
            return Promise.all(promises.map(p => Promise.resolve(p).then(value => ({
                status: 'fulfilled',
                value
            }), reason => ({
                status: 'rejected',
                reason
            }))));
            };
        }
        let limits_map = {};
        let region_map = {};
        let getServiceQuotas = valid_regions.map(currentRegion => {
        AWS.config.update({region: currentRegion});
        let servicequotas = new AWS.ServiceQuotas();
            return servicequotas.getServiceQuota(params).promise();
        });
        try {
            let serviceQuotasArray=[];
            let promiseResults = await Promise.allSettled(getServiceQuotas);
            promiseResults.forEach(result => {
                if(result.status==='fulfilled')
                    serviceQuotasArray.push(result.value);
            });
            serviceQuotasArray.map(item=> {
                let currentRegion = item.Quota.QuotaArn.split(":")[3];
                region_map[currentRegion]=item.Quota.Value;
            })
        } catch(err) {
            LOGGER.log('ERROR', err);
        }
        limits_map[checkName]=region_map;
        LOGGER.log('DEBUG', JSON.stringify(limits_map))
        return limits_map;
    }

    /**
     * Gets the usage for the vCPU type from CloudWatch
     * @param {string} checkName 
     * @param {string} params 
     * @param {object} valid_regions 
     */
    async getServiceUsage(checkName, params, valid_regions) {
        let usage_map = {};
        let region_map = {};
        for (let currentRegion of valid_regions) {
            AWS.config.update({region: currentRegion});
            let cloudwatch = new AWS.CloudWatch();
            try {
                let response = await cloudwatch.getMetricData(params).promise();
                if (response.MetricDataResults[0].Values[0] !== undefined) {
                    let maxUsage = response.MetricDataResults[0].Values[0]
                    region_map[currentRegion] = maxUsage;
                }
            } catch (err) {
                LOGGER.log('ERROR', err);
            }
        }
        usage_map[checkName]=region_map;
        LOGGER.log('DEBUG', JSON.stringify(usage_map));
        return usage_map;
    }

    /**
     * Pushes the event to the event bridge for primary and spoke accounts
     * @param {string} checkName 
     * @param {string} statusColor 
     * @param {number} currentUsage 
     * @param {string} region 
     * @param {string} service 
     * @param {string} statusMessage 
     * @param {number} currentServiceLimit 
     */

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
            LOGGER.log('DEBUG', JSON.stringify(params));
            await eventBridge.putEvents(params).promise();
        } catch (err) {
            LOGGER.log('ERROR', err);
        }
    }

    /**
     * Performs limit check to see if the limit threshold is exceeded
     * @param {string} checkName 
     * @param {stirng} service 
     * @param {object} params_limits 
     * @param {object} params_usage 
     * @param {object} valid_regions 
     */

    async performLimitCheck(checkName, service,params_limits,params_usage,valid_regions) {
        try {
            let serviceLimitPromise = this.getServiceLimits(checkName, params_limits, valid_regions);
            let serviceUsagePromise = this.getServiceUsage(checkName, params_usage, valid_regions);
            let serviceLimit = await serviceLimitPromise;
            let serviceUsage = await serviceUsagePromise;
            let serviceUsageMap = serviceUsage[checkName];
            let serviceLimitMap = serviceLimit[checkName];
            for(let region in serviceUsageMap) {
                let currentRegion = region;
                LOGGER.log('DEBUG', 'current region ' + JSON.stringify(currentRegion))
                let currentServiceLimit = serviceLimitMap[currentRegion];
                LOGGER.log('DEBUG', 'currentServiceLimit ' + JSON.stringify(currentServiceLimit))
                let currentUsage = serviceUsageMap[currentRegion];
                LOGGER.log('DEBUG', 'currentUsage  ' + JSON.stringify(currentUsage))
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
                    LOGGER.log("DEBUG", `checkName: ${checkName}`);
                }
            }
        } catch (err) {
            LOGGER.log('ERROR', err);
        }
    };

    /**
     * Checks if the customers have opted into vCPU limits
     */

    async checkVCPUOptIn(){
        let servicequotas = new AWS.ServiceQuotas();
        try {
            let ec2_onDemand_quota={
                QuotaCode: 'L-1216C47A',
                ServiceCode: 'ec2'
            }
            let service_quota = await servicequotas.getAWSDefaultServiceQuota(ec2_onDemand_quota).promise();
            if (service_quota.Quota.ServiceCode === "ec2") {
                return true;
            }
            else {
                return false;
            }
            } catch (err) {
                LOGGER.log('ERROR', err);
                return false;
            }
        }

    /**
     * Handler function to invoke the limit check functions
     */
    async checkForVCPULimits() {
        if(await this.checkVCPUOptIn()) {
            let instances_types = await this.getEC2InstanceTypes();
            let valid_regions = await this.getRegionsForServiceQuotas();
            for (let vCPUType of instances_types) {
                let vCPU_limit_name = vCPUType.QuotaName;
                let vCPU_quota_code= this.createVCPUServiceQuotaParams(vCPUType.QuotaCode);
                let vCPU_cloudwatch_params = await this.createCloudwatchParamsForInstanceTypes(vCPUType)
                await this.performLimitCheck(vCPU_limit_name, "EC2", vCPU_quota_code, vCPU_cloudwatch_params, valid_regions);
            }
        }
    }
}

module.exports=ServiceQuotasChecks;