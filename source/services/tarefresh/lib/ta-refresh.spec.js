'use strict';

let assert = require('chai').assert;
let expect = require('chai').expect;
let path = require('path');
let AWS = require('aws-sdk-mock');
AWS.setSDK(path.resolve('./node_modules/aws-sdk'));

let TARefresh = require('./ta-refresh.js');

describe('tarefresh', function() {
  describe('#getTARefreshStatus', function() {
    let params = {};

    beforeEach(function() {});

    afterEach(function() {
      AWS.restore('Support');
    });

    it('should return success when TA refresh is successful', function(done) {
      AWS.mock('Support', 'refreshTrustedAdvisorCheck', function(
        params,
        callback
      ) {
        callback(null, {
          result: 'success',
        });
      });

      let _taRefresh = new TARefresh();
      _taRefresh.getTARefreshStatus(params, function(err, data) {
        if (err) done('invalid failure for positive test: ', err);
        else {
          assert.equal(data.Result, 'TA refresh done');
          done();
        }
      });
    });

    it('should return success logging which TA check failed', function(done) {
      AWS.mock('Support', 'refreshTrustedAdvisorCheck', function(
        params,
        callback
      ) {
        callback('error', null);
      });

      let _taRefresh = new TARefresh();
      _taRefresh.getTARefreshStatus(params, function(err, data) {
        if (err) {
          //expect(err).to.equal('error');
          done('invalid failure for negative test: ', err);
        } else {
          assert.equal(data.Result, 'TA refresh done');
          done();
        }
      });
    });
  });
});
