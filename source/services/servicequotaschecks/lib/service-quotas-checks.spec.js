'use strict';

const SerViceQuotasChecks = require('./service-quotas-checks.js');
const constants = require('./constants.js')
const expect = require('chai').expect;
const assert = require('chai').assert;
const sinon = require('sinon');
const AWS = require('aws-sdk-mock');

describe('service-quotas-checks module', function() {
  /**
   * @unit-test SerViceQuotasChecks
   */

  describe('checkCustomerOptIn method', function() {

    afterEach(()=> {
      AWS.restore('ServiceQuotas');
    });

    it('should be a function', function() {
      expect(new SerViceQuotasChecks().checkVCPUOptIn).to.be.a('function');
    });


    it('should return true when opted into vCPU limits', (async function() {
      const _sq = new SerViceQuotasChecks();
      AWS.mock('ServiceQuotas', 'getAWSDefaultServiceQuota', Promise.resolve({"Quota":{"ServiceCode":"ec2"}}));
      try {
        let result = await _sq.checkVCPUOptIn();
        expect(result).to.equals(true);
      }catch(err) {
        console.log("Unit test case for opt-in failed");
        throw err;
      }
    }));


    it('should return false when NOT opted into vCPU limits', (async function() {
      const _sq = new SerViceQuotasChecks();
      AWS.mock('ServiceQuotas', 'getAWSDefaultServiceQuota', Promise.reject("(NoSuchResourceException)"));
      try {
        let result = await _sq.checkVCPUOptIn();
        expect(result).to.equals(false);
      }catch(err) {
        console.log("Unit test case for opt-in failed ");
        throw err;
      }
    }));

  });


  describe('getServiceLimits method', function() {

    afterEach(()=> {
      AWS.restore('ServiceQuotas');
    });

    it('should be a function', function() {
      expect(new SerViceQuotasChecks().getServiceLimits).to.be.a('function');
    });

    it('should return service limits', (async function() {
      const _sq = new SerViceQuotasChecks();
      AWS.mock('ServiceQuotas', 'getServiceQuota', Promise.resolve({"Quota":{"QuotaArn": "arn:aws:servicequotas:us-east-1:WWWWWW:ec2/L-1216C47A","Value": 2688.0}}));
      try {
        let result = await _sq.getServiceLimits("ec2_Standard_OnDemand",constants.limits_ec2_Standard_OnDemand);
        expect(result.ec2_Standard_OnDemand['us-east-1']).equals(2688.0); 
      }catch(err) {
        console.log("unit test cases for limits map failed");
        throw err;
      }
    }));

  });

  describe('getServiceUsage method', function() {

    afterEach(()=> {
      AWS.restore('CloudWatch');
    });

    it('should be a function', function() {
      expect(new SerViceQuotasChecks().getServiceUsage).to.be.a('function');
    });

    it('should return service usage', (async function() {
      const _sq = new SerViceQuotasChecks();
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
        let result = await _sq.getServiceUsage("ec2_Standard_OnDemand",usage_ec2_Standard_OnDemand);
        expect(result.ec2_Standard_OnDemand['us-east-1']).equals(420); 
      }catch(err){
        throw err;
      }
    }));

  });

  describe('pushEventToEventbridge method', function() {

    afterEach(()=> {
      AWS.restore('EventBridge');
    })

    it('should be a function', function() {
      expect(new SerViceQuotasChecks().pushEventToEventbridge).to.be.a('function');
    })

    it('should put events on Event Bridge', (async function() {
      const _sq = new SerViceQuotasChecks();
      AWS.mock('EventBridge','putEvents', Promise.resolve({"FailedEntryCount":0,"Entries":[{"EventId":"2c701c02-12"}]}));
      try{
        let result = await _sq.pushEventToEventbridge("ec2_Standard_OnDemand","RED",120,"us-east-1","EC2","WARN",150);
      }catch(err) {
        throw err;
      }
    }));

  });

  describe('doLimitCheck method', function() {

    it('should be a function', function() {
      expect(new SerViceQuotasChecks().doLimitCheck).to.be.a('function');
    })

    it('should call the putEventToEventbrige method with ERROR status', (async function() {
      let putEventToEventbrige_spy = sinon.spy(SerViceQuotasChecks.prototype, 'pushEventToEventbridge');
      const _sq = new SerViceQuotasChecks();
      let getServiceLimits_stub = sinon.stub(_sq, "getServiceLimits");
      let getServiceUsage_stub = sinon.stub(_sq, "getServiceUsage");
      getServiceLimits_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      getServiceUsage_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      try{
        await _sq.doLimitCheck("ec2_Standard_OnDemand","EC2",constants.limits_ec2_Standard_OnDemand, constants.usage_ec2_Standard_OnDemand);
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
      process.env.LIMIT_THRESHOLD = 0.8;
      let putEventToEventbrige_spy = sinon.spy(SerViceQuotasChecks.prototype, 'pushEventToEventbridge');
      const _sq = new SerViceQuotasChecks();
      let getServiceLimits_stub = sinon.stub(_sq, "getServiceLimits");
      let getServiceUsage_stub = sinon.stub(_sq, "getServiceUsage");
      getServiceLimits_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      getServiceUsage_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":180}});
      try{
        await _sq.doLimitCheck("ec2_Standard_OnDemand","EC2",constants.limits_ec2_Standard_OnDemand, constants.usage_ec2_Standard_OnDemand);
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
      let putEventToEventbrige_spy = sinon.spy(SerViceQuotasChecks.prototype, 'pushEventToEventbridge');
      const _sq = new SerViceQuotasChecks();
      let getServiceLimits_stub = sinon.stub(_sq, "getServiceLimits");
      let getServiceUsage_stub = sinon.stub(_sq, "getServiceUsage");
      getServiceLimits_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":200}});
      getServiceUsage_stub.resolves({"ec2_Standard_OnDemand":{"us-east-1":50}});
      try{
        await _sq.doLimitCheck("ec2_Standard_OnDemand","EC2",constants.limits_ec2_Standard_OnDemand, constants.usage_ec2_Standard_OnDemand);
        expect(putEventToEventbrige_spy.called).to.equals(false);
        putEventToEventbrige_spy.restore();
        getServiceLimits_stub.reset();
        getServiceUsage_stub.reset();
      }catch(err) {
        throw err;
      }
    }));

  })

});