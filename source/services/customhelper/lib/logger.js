'use strict';

class Logger {

  constructor() {
    this.loglevel = process.env.LOG_LEVEL;
    this.LOGLEVELS = {
      ERROR: 1,
      WARN: 2,
      INFO: 3,
      DEBUG: 4
    };
  }

  log(level, message) {
    if (this.LOGLEVELS[level] <= this.LOGLEVELS[this.loglevel])
      console.log(`[${level}]${message}`);
  }

}

module.exports = Object.freeze(Logger);
