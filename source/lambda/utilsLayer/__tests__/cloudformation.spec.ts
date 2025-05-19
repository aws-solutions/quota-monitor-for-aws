// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  CloudFormationClient,
  CloudFormationServiceException,
  CreateStackInstancesCommand,
  DeleteStackInstancesCommand,
  DescribeStackSetCommand,
} from "@aws-sdk/client-cloudformation";
import { CloudFormationHelper } from "../lib/cloudformation";

describe("Cloud Formation Helper", () => {
  const cfMock = mockClient(CloudFormationClient);

  let cfHelper: CloudFormationHelper;
  beforeEach(() => {
    cfHelper = new CloudFormationHelper("stackSetName");
    cfMock.reset();
  });

  it("should get Deployment Targets", async () => {
    cfMock.on(DescribeStackSetCommand).resolves({
      StackSet: {
        OrganizationalUnitIds: ["ou-1", "ou-2", "ou-3"],
      },
    });

    const deploymentTargets = await cfHelper.getDeploymentTargets();

    expect(deploymentTargets).toEqual(["ou-1", "ou-2", "ou-3"]);
  });

  it("should throw an exception when describeStackSet fails", async () => {
    cfMock.on(DescribeStackSetCommand).rejectsOnce(
      new CloudFormationServiceException({
        name: "CloudFormationServiceException",
        $fault: "server",
        $metadata: {},
      })
    );
    let deploymentTargets;

    const testCase = async () => {
      deploymentTargets = await cfHelper.getDeploymentTargets();
    };

    await expect(testCase).rejects.toThrow(CloudFormationServiceException);
    expect(deploymentTargets).toEqual(undefined);
  });

  it("should create stack set instances", async () => {
    const target = ["ou-1"];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(CreateStackInstancesCommand).resolves({});

    await cfHelper.createStackSetInstances(target, regions);
    expect(cfMock).toHaveReceivedCommandTimes(CreateStackInstancesCommand, 1);
  });

  it("should call createStackSetInstances with default percentage preferences", async () => {
    const target = ["ou-1"];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(CreateStackInstancesCommand).resolves({});

    await cfHelper.createStackSetInstances(target, regions);
    expect(cfMock).toHaveReceivedCommandWith(CreateStackInstancesCommand, {
      StackSetName: "stackSetName",
      CallAs: "DELEGATED_ADMIN",
    });
  });

  it("should call createStackSetInstances with overriden parameters", async () => {
    const target = ["ou-1"];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(CreateStackInstancesCommand).resolves({});
    const parameterOverrides = [
      {
        ParameterKey: "param1",
        ParameterValue: "value1",
      },
      {
        ParameterKey: "param2",
        ParameterValue: "value2",
      },
    ];

    await cfHelper.createStackSetInstances(target, regions, parameterOverrides);
    expect(cfMock).toHaveReceivedCommandWith(CreateStackInstancesCommand, {
      StackSetName: "stackSetName",
      CallAs: "DELEGATED_ADMIN",
      ParameterOverrides: parameterOverrides,
    });
  });

  it("should throw an exception when createStackSetInstances fails", async () => {
    const target = ["ou-1"];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(CreateStackInstancesCommand).rejectsOnce(
      new CloudFormationServiceException({
        name: "CloudFormationServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await cfHelper.createStackSetInstances(target, regions);
    };

    await expect(testCase).rejects.toThrow(CloudFormationServiceException);
  });

  it("should delete stack set instances", async () => {
    const target = ["ou-1"];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(DeleteStackInstancesCommand).resolves({});

    await cfHelper.deleteStackSetInstances(target, regions);
    expect(cfMock).toHaveReceivedCommandTimes(DeleteStackInstancesCommand, 1);
  });

  it("should throw an exception when deleteStackInstances fails", async () => {
    const target = ["ou-1"];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(DeleteStackInstancesCommand).rejectsOnce(
      new CloudFormationServiceException({
        name: "CloudFormationServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await cfHelper.deleteStackSetInstances(target, regions);
    };

    await expect(testCase).rejects.toThrow(CloudFormationServiceException);
  });

  it("should not create stack set instances if no targets present", async () => {
    const target: string[] = [];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(CreateStackInstancesCommand).resolves({});

    await cfHelper.createStackSetInstances(target, regions);
    expect(cfMock).toHaveReceivedCommandTimes(CreateStackInstancesCommand, 0);
  });

  it("should not create stack set instances if no regions present", async () => {
    const target = ["ou-1"];
    const regions: string[] = [];

    cfMock.on(CreateStackInstancesCommand).resolves({});

    await cfHelper.createStackSetInstances(target, regions);
    expect(cfMock).toHaveReceivedCommandTimes(CreateStackInstancesCommand, 0);
  });

  it("should not delete stack set instances if no targets present", async () => {
    const target: string[] = [];
    const regions = ["us-east-1", "us-east-2"];

    cfMock.on(DeleteStackInstancesCommand).resolves({});

    await cfHelper.deleteStackSetInstances(target, regions);
    expect(cfMock).toHaveReceivedCommandTimes(DeleteStackInstancesCommand, 0);
  });

  it("should not delete stack set instances if no regions present", async () => {
    const target = ["ou-1"];
    const regions: string[] = [];

    cfMock.on(DeleteStackInstancesCommand).resolves({});

    await cfHelper.deleteStackSetInstances(target, regions);
    expect(cfMock).toHaveReceivedCommandTimes(DeleteStackInstancesCommand, 0);
  });
});
