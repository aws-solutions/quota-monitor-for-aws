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

const ServiceQuotasChecks = require('./service-quotas-checks.js');
const LOGGER =  require('./logger');
const expect = require('chai').expect;
const sinon = require('sinon');
const AWS = require('aws-sdk-mock');

describe('service-quotas-checks module', function() {
  /**
   * @unit-test ServiceQuotasChecks
   */

  describe('checkVCPUOptIn method', function() {

    afterEach(()=> {
      AWS.restore('ServiceQuotas');
    });

    it('should be a function', function() {
      expect(new ServiceQuotasChecks().checkVCPUOptIn).to.be.a('function');
    });

    it('should return true when opted into vCPU limits', (async function() {
      const _sq = new ServiceQuotasChecks();
      AWS.mock('ServiceQuotas', 'getAWSDefaultServiceQuota', Promise.resolve({"Quota":{"ServiceCode":"ec2"}}));
      try {
        let result = await _sq.checkVCPUOptIn();
        expect(result).to.equals(true);
      }catch(err) {
        throw err;
      }
    }));

    it('should return false when NOT opted into vCPU limits', (async function() {
      const _sq = new ServiceQuotasChecks();
      AWS.mock('ServiceQuotas', 'getAWSDefaultServiceQuota', Promise.resolve({"Quota":{"ServiceCode":"s3"}}));
      try {
        let result = await _sq.checkVCPUOptIn();
        expect(result).to.equals(false);
      }catch(err) {
        throw err;
      }
    }));

    it('should catch error', (async function() {
      const _sq = new ServiceQuotasChecks();
      let logger_spy = sinon.spy(LOGGER.prototype,'log');
      AWS.mock('ServiceQuotas', 'getAWSDefaultServiceQuota', Promise.reject());
      try {
        let result = await _sq.checkVCPUOptIn();
        expect(logger_spy.args[0][0]).to.equal('ERROR');
      }catch(err) {
        throw err;
      }
      logger_spy.restore();
    }));
    
  });


  describe('getServiceLimits method', function() {

    afterEach(()=> {
      AWS.restore('ServiceQuotas');
    });

    it('should be a function', function() {
      expect(new ServiceQuotasChecks().getServiceLimits).to.be.a('function');
    });

    it('should return service limits', (async function() {
      const _sq = new ServiceQuotasChecks();
      let valid_regions = new Array();
      valid_regions.push('us-east-1');
      valid_regions.push('us-east-2');
      let limits_ec2_Standard_OnDemand = {
        QuotaCode: 'L-1216C47A',
        ServiceCode: 'ec2'
      };
      AWS.mock('ServiceQuotas', 'getServiceQuota', Promise.resolve({"Quota":{"QuotaArn": "arn:aws:servicequotas:us-east-1:WWWWWW:ec2/L-1216C47A","Value": 2688.0}}));
      try {
        let result = await _sq.getServiceLimits("ec2_Standard_OnDemand",limits_ec2_Standard_OnDemand, valid_regions);
        expect(result.ec2_Standard_OnDemand['us-east-1']).equals(2688.0); 
      }catch(err) {
        throw err;
      }
    }));

    it('should catch error', (async function() {
      const _sq = new ServiceQuotasChecks();
      let valid_regions = new Array();
      valid_regions.push('us-east-1');
      valid_regions.push('us-east-2');
      let limits_ec2_Standard_OnDemand = {
        QuotaCode: 'L-1216C47A',
        ServiceCode: 'ec2'
      }; 
      AWS.mock('ServiceQuotas', 'getServiceQuota', Promise.reject("NoSuchResourceException"));
      let logger_spy = sinon.spy(LOGGER.prototype,'log');
      try{
        let result = await _sq.getServiceLimits("ec2_Standard_OnDemand",limits_ec2_Standard_OnDemand, valid_regions);
        expect(result['us-east-1']).equals(undefined);
      }catch(err) {
        throw err;
      }
      logger_spy.restore();
    }))

  });

  describe('getServiceUsage method', function() {

    afterEach(()=> {
      AWS.restore('CloudWatch');
    });

    it('should be a function', function() {
      expect(new ServiceQuotasChecks().getServiceUsage).to.be.a('function');
    });

    it('should return service usage', (async function() {
      let valid_regions = new Array();
      valid_regions.push('us-east-1');
      valid_regions.push('us-east-2');
      const _sq = new ServiceQuotasChecks();
      let usage_ec2_Standard_OnDemand = {
        StartTime: 34234324234,
        EndTime: 34234324234,
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
      AWS.mock('CloudWatch','getMetricData',Promise.resolve({"MetricDataResults":[{"Values":[420]}]}));
      try{
        let result = await _sq.getServiceUsage("ec2_Standard_OnDemand",usage_ec2_Standard_OnDemand, valid_regions);
        expect(result.ec2_Standard_OnDemand['us-east-1']).equals(420); 
      }catch(err) {
        throw err;
      }
    }));

    it('should not add region to the region map if service usage not found', (async function() {
      let valid_regions = new Array();
      valid_regions.push('us-east-1');
      valid_regions.push('us-east-2');
      const _sq = new ServiceQuotasChecks();
      let usage_ec2_Standard_OnDemand = {
        StartTime: 34234324234,
        EndTime: 34234324234,
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
      AWS.mock('CloudWatch','getMetricData',Promise.resolve({"MetricDataResults":[{"Values":[]}]}));
      try{
        let result = await _sq.getServiceUsage("ec2_Standard_OnDemand",usage_ec2_Standard_OnDemand, valid_regions);
        expect(result.ec2_Standard_OnDemand['us-east-1']).equals(undefined);
      }catch(err) {
        throw err;
      }
    }));


    it('should catch error', (async function() {
      let logger_spy = sinon.spy(LOGGER.prototype,'log');
      let valid_regions = new Array();
      valid_regions.push('us-east-1');
      valid_regions.push('us-east-2');
      const _sq = new ServiceQuotasChecks();
      let usage_ec2_Standard_OnDemand = {
        StartTime: 34234324234,
        EndTime: 34234324234,
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
      AWS.mock('CloudWatch','getMetricData',Promise.reject("NoSuchResourceException"));
      try{
        let result = await _sq.getServiceUsage("ec2_Standard_OnDemand",usage_ec2_Standard_OnDemand, valid_regions);
        expect(logger_spy.args[0][0]).to.equals('ERROR');
      }catch(err) {
        throw err;
      }
      logger_spy.restore();
    }))

  });

  describe('pushEventToEventbridge method', function() {

    afterEach(()=> {
      AWS.restore('EventBridge');
    })

    it('should be a function', function() {
      expect(new ServiceQuotasChecks().pushEventToEventbridge).to.be.a('function');
    })

    it('should put events on Event Bridge', (async function() {
      const _sq = new ServiceQuotasChecks();
      AWS.mock('EventBridge','putEvents', Promise.resolve({"FailedEntryCount":0,"Entries":[{"EventId":"2c701c02-12"}]}));
      try{
        let result = await _sq.pushEventToEventbridge("ec2_Standard_OnDemand","RED",120,"us-east-1","EC2","WARN",150);
      }catch(err) {
        throw err;
      }
    }));

  });

  describe('performLimitCheck method', function() {

    it('should be a function', function() {
      expect(new ServiceQuotasChecks().performLimitCheck).to.be.a('function');
    })

    it('should call the putEventToEventbrige method with ERROR status', (async function() {
      let limits_ec2_Standard_OnDemand = {};
      let usage_ec2_Standard_OnDemand = {};
      let putEventToEventbrige_spy = sinon.spy(ServiceQuotasChecks.prototype, 'pushEventToEventbridge');
      const _sq = new ServiceQuotasChecks();
      let getServiceLimits_stub = sinon.stub(_sq, "getServiceLimits");
      let getServiceUsage_stub = sinon.stub(_sq, "getServiceUsage");
      getServiceLimits_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      getServiceUsage_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      AWS.mock('EventBridge','putEvents', Promise.resolve());
      try{
        await _sq.performLimitCheck("ec2_Standard_OnDemand","EC2",limits_ec2_Standard_OnDemand, usage_ec2_Standard_OnDemand);
        expect(putEventToEventbrige_spy.calledOnce).to.equals(true);
        let argsReceived = putEventToEventbrige_spy.args[0];
        expect(argsReceived[5]).equals('ERROR');
        putEventToEventbrige_spy.restore();
        getServiceLimits_stub.reset();
        getServiceUsage_stub.reset();
      }catch(err) {
        putEventToEventbrige_spy.restore();
        getServiceLimits_stub.reset();
        getServiceUsage_stub.reset();
        throw err;
      }
    }));

    it('should call the putEventToEventbrige method with WARN status', (async function() {
      let limits_ec2_Standard_OnDemand = {};
      let usage_ec2_Standard_OnDemand = {};
      process.env.LIMIT_THRESHOLD = 0.8;
      let putEventToEventbrige_spy = sinon.spy(ServiceQuotasChecks.prototype, 'pushEventToEventbridge');
      const _sq = new ServiceQuotasChecks();
      let getServiceLimits_stub = sinon.stub(_sq, "getServiceLimits");
      let getServiceUsage_stub = sinon.stub(_sq, "getServiceUsage");
      getServiceLimits_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      getServiceUsage_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":180}});
      AWS.mock('EventBridge','putEvents', Promise.resolve());
      try{
        await _sq.performLimitCheck("ec2_Standard_OnDemand","EC2",limits_ec2_Standard_OnDemand, usage_ec2_Standard_OnDemand);
        expect(putEventToEventbrige_spy.calledOnce).to.equals(true);
        let argsReceived = putEventToEventbrige_spy.args[0];
        expect(argsReceived[5]).equals('WARN');
        putEventToEventbrige_spy.restore();
        getServiceLimits_stub.reset();
        getServiceUsage_stub.reset();
      }catch(err) {
        putEventToEventbrige_spy.restore();
        getServiceLimits_stub.reset();
        getServiceUsage_stub.reset();
        throw err;
      }
    }));

    it('should NOT call the putEventToEventbrige method', (async function() {
      let limits_ec2_Standard_OnDemand = {};
      let usage_ec2_Standard_OnDemand = {};
      let putEventToEventbrige_spy = sinon.spy(ServiceQuotasChecks.prototype, 'pushEventToEventbridge');
      const _sq = new ServiceQuotasChecks();
      let getServiceLimits_stub = sinon.stub(_sq, "getServiceLimits");
      let getServiceUsage_stub = sinon.stub(_sq, "getServiceUsage");
      getServiceLimits_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      getServiceUsage_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":50}});
      try{
        await _sq.performLimitCheck("ec2_Standard_OnDemand","EC2",limits_ec2_Standard_OnDemand, usage_ec2_Standard_OnDemand);
        expect(putEventToEventbrige_spy.called).to.equals(false);
        getServiceLimits_stub.reset();
        getServiceUsage_stub.reset();
      }catch(err) {
        throw err;
      }
    }));

  })

  describe('createCloudwatchParamsForInstanceTypes', function() {

    it('should be a function', function() {
      expect(new ServiceQuotasChecks().createCloudwatchParamsForInstanceTypes).to.be.a('function');
    })

    it('should return cloudwatch parameters', function() {
      let _sq = new ServiceQuotasChecks();
      let vCPU = { 
        ServiceCode: 'ec2',
        ServiceName: 'Amazon Elastic Compute Cloud (Amazon EC2)',
        QuotaArn: 'arn:aws:servicequotas:us-east-1:11223344:ec2/L-74FC7D96',
        QuotaCode: 'L-74FC7D96',
        QuotaName: 'Running On-Demand F instances',
        Value: 176,
        Unit: 'None',
        Adjustable: true,
        GlobalQuota: false,
        UsageMetric:
        { MetricNamespace: 'AWS/Usage',
          MetricName: 'ResourceCount',
          MetricDimensions:
            { Class: 'F/OnDemand',
              Resource: 'vCPU',
              Service: 'EC2',
              Type: 'Resource' },
        MetricStatisticRecommendation: 'Maximum' } 
      }
      let vcpu_params = _sq.createCloudwatchParamsForInstanceTypes(vCPU);
      expect(vcpu_params.MetricDataQueries[0].MetricStat.Metric.Dimensions[3].Value).equals(vCPU.UsageMetric.MetricDimensions.Class)
    })

    describe('createVCPUServiceQuotaParams', function() {

      it('should be a function', function() {
        expect(new ServiceQuotasChecks().createVCPUServiceQuotaParams).to.be.a('function');
      })
  
      it('should return vCPU parameters', function() {
        let _sq = new ServiceQuotasChecks();
        let vcpu_params = _sq.createVCPUServiceQuotaParams('L-74FC7D96');
        expect(vcpu_params).deep.equals({QuotaCode: 'L-74FC7D96', ServiceCode: 'ec2'})
      })
  
    })

  })

  describe('getEC2InstanceTypes', function() {
    afterEach(()=> {
      AWS.restore('ServiceQuotas');
    });

    it('should be a function', (async function() {
      expect(new ServiceQuotasChecks().getEC2InstanceTypes).to.be.a('function');
    }))

    it('should return the list of instance types', (async function() {
      const _sq = new ServiceQuotasChecks();
      AWS.mock('ServiceQuotas','listServiceQuotas',Promise.resolve(
        { Quotas:
          [ 
            {
              ServiceCode: 'ec2',
              ServiceName: 'Amazon Elastic Compute Cloud (Amazon EC2)',
              QuotaArn: 'arn:aws:servicequotas:us-east-1:11223344:ec2/L-74FC7D96',
              QuotaCode: 'L-74FC7D96',
              QuotaName: 'Running On-Demand F instances',
              Value: 176,
              Unit: 'None',
              Adjustable: true,
              GlobalQuota: false,
              UsageMetric: {
                  MetricNamespace: 'AWS/Usage',
                  MetricName: 'ResourceCount',
                  MetricDimensions: {
                      Class: 'F/OnDemand',
                      Resource: 'vCPU',
                      Service: 'EC2',
                      Type: 'Resource'
                  },
                  MetricStatisticRecommendation: 'Maximum'
              }
          },
            { ServiceCode: 'ec2',
              ServiceName: 'Amazon Elastic Compute Cloud (Amazon EC2)',
              QuotaArn:'arn:aws:servicequotas:us-east-1:11223344:ec2/L-DEF8E115',
              QuotaCode: 'L-DEF8E115',
              QuotaName: 'Running Dedicated x1e Hosts',
              Value: 1,
              Unit: 'None',
              Adjustable: true,
              GlobalQuota: false 
            }
          ]
        }
      ));

      let resp= await _sq.getEC2InstanceTypes();
      expect(resp[0]).deep.equals({
        ServiceCode: 'ec2',
        ServiceName: 'Amazon Elastic Compute Cloud (Amazon EC2)',
        QuotaArn: 'arn:aws:servicequotas:us-east-1:11223344:ec2/L-74FC7D96',
        QuotaCode: 'L-74FC7D96',
        QuotaName: 'Running On-Demand F instances',
        Value: 176,
        Unit: 'None',
        Adjustable: true,
        GlobalQuota: false,
        UsageMetric: {
            MetricNamespace: 'AWS/Usage',
            MetricName: 'ResourceCount',
            MetricDimensions: {
                Class: 'F/OnDemand',
                Resource: 'vCPU',
                Service: 'EC2',
                Type: 'Resource'
            },
            MetricStatisticRecommendation: 'Maximum'
        }
      })
    }))

    it('should handle error', (async function() {

    }))

  })

  describe('getRegionsForServiceQuotas', function() {
    
    afterEach(()=> {
      AWS.restore('ServiceQuotas');
    });

    it('should be a function', (async function() {
      expect(new ServiceQuotasChecks().getRegionsForServiceQuotas).to.be.a('function');
    }))

    it('should return a list of valid regions', (async function() {
      const _sq = new ServiceQuotasChecks();
      AWS.mock('EC2','describeRegions',Promise.resolve(
        { Regions:
          [ { Endpoint: 'ec2.eu-west-1.amazonaws.com',
              RegionName: 'eu-west-1',
              OptInStatus: 'opt-in-not-required' },
            { Endpoint: 'ec2.ap-south-1.amazonaws.com',
              RegionName: 'ap-south-1'}
          ]
        }
      ));
      
      AWS.mock('ServiceQuotas','getAWSDefaultServiceQuota',Promise.resolve(""));
      let result = await _sq.getRegionsForServiceQuotas();
      expect(result).to.deep.equal(['eu-west-1','ap-south-1'])
    }))


    it('should not return a region if service quotas is not found', (async function() {
      const _sq = new ServiceQuotasChecks();
      AWS.mock('EC2','describeRegions',Promise.resolve(
        { Regions:
          [ { Endpoint: 'ec2.eu-west-1.amazonaws.com',
              RegionName: 'eu-west-1',
              OptInStatus: 'opt-in-not-required' },
            { Endpoint: 'ec2.ap-south-1.amazonaws.com',
              RegionName: 'ap-south-1'}
          ]
        }
      ));
      
      AWS.mock('ServiceQuotas','getAWSDefaultServiceQuota',Promise.reject(""));
      try{
        let result = await _sq.getRegionsForServiceQuotas();
        expect(result).to.deep.equal([]);
      }catch(err){
        throw err;
      }
    }))

  })

  describe('checkForVCPULimits', function() {

    it('should be a function', (async function() {
      expect(new ServiceQuotasChecks().checkForVCPULimits).to.be.a('function');
    }))

    it('should call the nested functions', (async function() {
      const _sq = new ServiceQuotasChecks();
      let createVCPUServiceQuotaParams_spy = sinon.spy(ServiceQuotasChecks.prototype, 'createVCPUServiceQuotaParams');
      let createCloudwatchParamsForInstanceTypes_spy = sinon.spy(ServiceQuotasChecks.prototype, 'createCloudwatchParamsForInstanceTypes');
      let checkVCPUOptIn_stub = sinon.stub(_sq, "checkVCPUOptIn");
      let getEC2InstanceTypes_stub = sinon.stub(_sq, "getEC2InstanceTypes");
      let getRegionsForServiceQuotas_stub = sinon.stub(_sq, "getRegionsForServiceQuotas");
      let performLimitCheck_stub = sinon.stub(_sq, "performLimitCheck");

      getEC2InstanceTypes_stub.resolves([
        {
            "ServiceCode": "ec2",
            "ServiceName": "Amazon Elastic Compute Cloud (Amazon EC2)",
            "QuotaArn": "arn:aws:servicequotas:us-east-1:11223344:ec2/L-74FC7D96",
            "QuotaCode": "L-74FC7D96",
            "QuotaName": "Running On-Demand F instances",
            "Value": 176,
            "Unit": "None",
            "Adjustable": true,
            "GlobalQuota": false,
            "UsageMetric": {
                "MetricNamespace": "AWS/Usage",
                "MetricName": "ResourceCount",
                "MetricDimensions": {
                    "Class": "F/OnDemand",
                    "Resource": "vCPU",
                    "Service": "EC2",
                    "Type": "Resource"
                },
                "MetricStatisticRecommendation": "Maximum"
            }
        }]);

        getRegionsForServiceQuotas_stub.resolves(["ap-south-1", "eu-west-3"]);
        checkVCPUOptIn_stub.resolves("true");
        performLimitCheck_stub.resolves();

      await _sq.checkForVCPULimits();
      
      expect(checkVCPUOptIn_stub.calledOnce).to.equals(true);
      expect(getEC2InstanceTypes_stub.calledOnce).to.equals(true);
      expect(getRegionsForServiceQuotas_stub.calledOnce).to.equals(true);
      expect(createVCPUServiceQuotaParams_spy.args[0][0]).to.equal("L-74FC7D96");
      expect(createCloudwatchParamsForInstanceTypes_spy.args[0][0]).deep.equal(
        { ServiceCode: 'ec2',
          ServiceName: 'Amazon Elastic Compute Cloud (Amazon EC2)',
          QuotaArn:'arn:aws:servicequotas:us-east-1:11223344:ec2/L-74FC7D96',
          QuotaCode: 'L-74FC7D96',
          QuotaName: 'Running On-Demand F instances',
          Value: 176,
          Unit: 'None',
          Adjustable: true,
          GlobalQuota: false,
          UsageMetric:
          { MetricNamespace: 'AWS/Usage',
            MetricName: 'ResourceCount',
            MetricDimensions:
            { Class: 'F/OnDemand',
              Resource: 'vCPU',
              Service: 'EC2',
              Type: 'Resource' },
            MetricStatisticRecommendation: 'Maximum' } }
      );
      expect(performLimitCheck_stub.args[0][0]).to.equals("Running On-Demand F instances");
      expect(performLimitCheck_stub.args[0][1]).to.equals("EC2");
      expect(performLimitCheck_stub.args[0][2]).deep.equal({QuotaCode: 'L-74FC7D96',ServiceCode: 'ec2'});
      expect(performLimitCheck_stub.args[0][3].MetricDataQueries[0].MetricStat.Metric.Dimensions[3].Value).to.equals("F/OnDemand");
      expect(performLimitCheck_stub.args[0][4]).to.deep.eql(["ap-south-1", "eu-west-3"]);
      checkVCPUOptIn_stub.reset();
      getEC2InstanceTypes_stub.reset();
      getRegionsForServiceQuotas_stub.reset();

    }))
  })

});