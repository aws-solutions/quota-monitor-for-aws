// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  CloudWatchClient,
  CloudWatchServiceException,
} from "@aws-sdk/client-cloudwatch";
import { CloudWatchHelper } from "../lib/cloudwatch";

describe("Cloud Watch Helper", () => {
  const cwMock = mockClient(CloudWatchClient);
  let cwHelper: CloudWatchHelper;

  const startTime = new Date("01-01-20222");
  const endTime = new Date("02-02-2022");

  beforeEach(() => {
    cwHelper = new CloudWatchHelper();
    cwMock.reset();
  });

  it("should get metric data", async () => {
    cwMock.onAnyCommand().resolves({ MetricDataResults: [{}] });

    const metricDataResults = await cwHelper.getMetricData(startTime, endTime, [
      { Id: "1" },
    ]);

    expect(metricDataResults).toEqual([{}]);
  });

  it("should throw an exception if paginateGetMetricData fails", async () => {
    cwMock.onAnyCommand().rejectsOnce(
      new CloudWatchServiceException({
        name: "CloudWatchServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await cwHelper.getMetricData(startTime, endTime, [{ Id: "1" }]);
    };

    await expect(testCase).rejects.toThrow(CloudWatchServiceException);
  });
});
