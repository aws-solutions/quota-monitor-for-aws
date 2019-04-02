'use strict';

console.log('Loading function');
let lib = require('./lib');
const LOGGER = new (require('./lib/logger'))();

exports.handler = function(event, context, callback) {
  //log received event
  LOGGER.log('DEBUG', `Received event: ${JSON.stringify(event, null, 2)}`);

  lib.respond(event, context, function(err, response) {
    if (err) return callback(null, err);
    return callback(null, response);
  });
};
