// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  LambdaTriggers,
  logger,
  UnsupportedEventException,
} from "solutions-utils";
import { LimitReport } from "./lib/limit-report";

const moduleName = <string>__filename.split("/").pop();

export const handler = async (event: any) => {
  logger.debug({
    label: moduleName,
    message: `Received event: ${JSON.stringify(event)}`,
  });
  if (LambdaTriggers.isScheduledEvent(event)) {
    const limitReport = new LimitReport();
    await limitReport.readQueueAsync();
  } else throw new UnsupportedEventException("this event type is not support");
};
