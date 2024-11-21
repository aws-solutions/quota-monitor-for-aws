// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import { EC2Client, DescribeRegionsCommand, EC2ServiceException } from "@aws-sdk/client-ec2";
import { EC2Helper } from "../lib/ec2";

describe("EC2 Helper", () => {
  const ec2Mock = mockClient(EC2Client);
  let ec2Helper: EC2Helper;

  const regions = ["us-east-1", "us-east-2", ""];

  beforeEach(() => {
    ec2Mock.reset();
    ec2Helper = new EC2Helper();
  });

  it("should get enabled region names", async () => {
    ec2Mock.on(DescribeRegionsCommand).resolves({
      Regions: [
        {
          RegionName: "us-east-1",
        },
        {
          RegionName: "us-east-2",
        },
        {},
      ],
    });

    const response = await ec2Helper.getEnabledRegionNames();

    expect(response).toEqual(regions);
  });

  it("should return an empty array if no Regions returned", async () => {
    ec2Mock.on(DescribeRegionsCommand).resolves({});

    const response = await ec2Helper.getEnabledRegionNames();

    expect(response).toEqual([]);
  });

  it("should throw an exception if DescribeRegionCommand fails", async () => {
    ec2Mock.on(DescribeRegionsCommand).rejectsOnce(
      new EC2ServiceException({
        name: "EC2ServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await ec2Helper.getEnabledRegionNames();
    };

    await expect(testCase).rejects.toThrow(EC2ServiceException);
  });
});
