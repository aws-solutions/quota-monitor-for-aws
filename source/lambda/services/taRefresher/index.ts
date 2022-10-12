// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * @author Solution Builders
 */

"use strict";

import { TAHelper } from "./lib/ta-helper";
import { logger } from "solutions-utils";

/**
 * @description interface for triggering events
 */
export interface IEvent {
  version: string;
  account: string;
  region: "us-east-2";
  detail: { [key: string]: any };
  "detail-type": "Scheduled Event";
  source: string;
  time: string;
  id: string;
  resources: string[];
}

/**
 * @description entry point for microservice
 */
export const handler = async (event: IEvent) => {
  logger.debug({
    label: "taRefresher/handler",
    message: JSON.stringify(event),
  });

  //user provided services for TA refresh
  const _services = (<string>process.env.AWS_SERVICES)
    .replace(/"/g, "")
    .split(",");

  const taRefresh = new TAHelper();
  await taRefresh.refreshChecks(_services);
};
