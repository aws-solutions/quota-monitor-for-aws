'use strict';

let assert = require('chai').assert;
let expect = require('chai').expect;
let path = require('path');
let AWS = require('aws-sdk-mock');
let sinon = require('sinon');
AWS.setSDK(path.resolve('./node_modules/aws-sdk'));
let SlackNotify = require('./slack-notify.js');

describe('slacknotify', function() {
  describe('#sendNotification', function() {
    let _ssmData = {
      Parameter: {
        Name: 'test',
        Type: 'SecureString',
        Value: 'https://test.com',
        Version: 2,
      },
    };

    beforeEach(function() {
      AWS.mock('SSM', 'getParameter', function(params, callback) {
        callback(null, _ssmData);
      });
    });

    afterEach(function() {
      AWS.restore('SSM');
    });

    xit('should return success when notification sent successfully', function() {});

    xit('should return fail when notification failed', function() {});
  });
});
