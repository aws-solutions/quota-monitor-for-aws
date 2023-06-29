// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import got from "got";
import { logger } from "./logger";

/**
 * @description interface for metrics
 */
export interface IMetric {
  Solution: string;
  UUID: string;
  TimeStamp: string;
  Data: { [key: string]: string | number };
}

export async function sendAnonymizedMetric(endpoint: string, metric: IMetric) {
  try {
    await got(endpoint, {
      port: 443,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "" + JSON.stringify(metric).length,
      },
      body: JSON.stringify(metric),
    });
  } catch (error) {
    logger.warn({
      label: "metrics.ts",
      message: `errro in sending metrics: ${JSON.stringify(error)}`,
    });
  }
}
