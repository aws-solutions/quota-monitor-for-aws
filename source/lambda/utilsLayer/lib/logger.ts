// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** 
 * {
     emerg: 0,
     alert: 1,
     crit: 2,
     error: 3,
     warning: 4,
     notice: 5,
     info: 6,
     debug: 7
    }
 */

import { createLogger, transports, format } from "winston";
const { combine, timestamp, printf } = format;

/*
 * Formatting the output as desired
 */
const myFormat = printf(({ level, label, message }) => {
  const _level = level.toUpperCase();
  if (label) return `[${_level}] [${label}] ${message}`;
  else return `[${_level}] ${message}`;
});

export const logger = createLogger({
  format: combine(
    //
    // Order is important here, the formats are called in the
    // order they are passed to combine.
    //
    timestamp(),
    myFormat
  ),

  transports: [
    //cw logs transport channel
    new transports.Console({
      level: process.env.LOG_LEVEL,
      handleExceptions: true, //handle uncaught exceptions
    }),
  ],
});
