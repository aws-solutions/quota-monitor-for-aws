'use strict';

let assert = require('chai').assert;
let expect = require('chai').expect;
let sinon = require('sinon');
let path = require('path');
let AWS = require('aws-sdk-mock');
let MetricsHelper = require('./metrics-helper');

AWS.setSDK(path.resolve('./node_modules/aws-sdk'));

describe('#metricshelper', function() {
  describe('#postMethod', function() {
    xit('should return success if metrics posted successfully', function() {});
  });
});
