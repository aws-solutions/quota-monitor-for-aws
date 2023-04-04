// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

process.on("unhandledRejection", (reason) => {
  throw reason;
});
process.env.LOG_LEVEL = "none";
process.env.SEND_METRIC = "Yes";
process.env.SOLUTION_ID = "MyId";
process.env.SOLUTION_UUID = "Uuid";
process.env.METRICS_ENDPOINT = "MyEndpoint";
