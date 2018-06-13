'use strict';

let assert = require('assert');
let expect = require('chai').expect;
let sinon = require('sinon');
let AWS = require('aws-sdk-mock');
let path = require('path')

let CustomResourceHelper = require('./index');

describe('#CustomResourceHelper', function() {

  describe('#events', function() {

    const sample_create_event = {
      "RequestType": "Create",
      "ResponseURL": "http://pre-signed-S3-url-for-response",
      "StackId": "arn:aws:cloudformation:us-west-2:EXAMPLE/stack-name/guid",
      "RequestId": "unique id for this create request",
      "ResourceType": "Custom::TestResource",
      "LogicalResourceId": "CreateUUID",
      "ResourceProperties": {}
    }

    const sample_context = {
      logStreamName : 'sample-log-stream-name'
    }

    beforeEach(function() {});
    afterEach(function() {});


    xit('check for CREATE', function() {});
    xit('check for UPDATE', function() {});
    xit('check for DELETE', function() {});

    it('should return error for sendResponse', function(){
      CustomResourceHelper.respond(sample_create_event, sample_context, function(data){
        assert(data.errno,'ENOTFOUND');
      });
    });

  });

});
