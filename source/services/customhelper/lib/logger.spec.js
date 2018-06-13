'use strict';

let assert = require('chai').assert;
let expect = require('chai').expect;

let Logger = new(require('./logger'))();

describe("#Logger", function() {

  describe('#logger', function() {

    it('check with LOG_LEVEL=INFO', function() {
      Logger.loglevel = 'INFO';
      Logger.log('INFO', 'INFO_MESSAGE');
      Logger.log('WARN', 'WARN_MESSAGE');
      Logger.log('ERROR', 'ERROR_MESSAGE');
      Logger.log('DEBUG', 'DEBUG_MESSAGE');
    });

    it('check with LOG_LEVEL=WARN', function() {
      Logger.loglevel = 'WARN';
      Logger.log('INFO', 'INFO_MESSAGE');
      Logger.log('WARN', 'WARN_MESSAGE');
      Logger.log('ERROR', 'ERROR_MESSAGE');
      Logger.log('DEBUG', 'DEBUG_MESSAGE');
    });

    it('check with LOG_LEVEL=ERROR', function() {
      Logger.loglevel = 'ERROR';
      Logger.log('INFO', 'INFO_MESSAGE');
      Logger.log('WARN', 'WARN_MESSAGE');
      Logger.log('ERROR', 'ERROR_MESSAGE');
      Logger.log('DEBUG', 'DEBUG_MESSAGE');
    });

    it('check with LOG_LEVEL=DEBUG', function() {
      Logger.loglevel = 'DEBUG';
      Logger.log('INFO', 'INFO_MESSAGE');
      Logger.log('WARN', 'WARN_MESSAGE');
      Logger.log('ERROR', 'ERROR_MESSAGE');
      Logger.log('DEBUG', 'DEBUG_MESSAGE');
    });

  })
})
