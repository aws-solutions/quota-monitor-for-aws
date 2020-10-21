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

let assert = require('chai').assert;
let expect = require('chai').expect;

let Logger = new (require('./logger'))();

describe('#Logger', function() {
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
  });
});
