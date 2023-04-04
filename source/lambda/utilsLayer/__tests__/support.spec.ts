// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
  DescribeTrustedAdvisorChecksCommand,
  RefreshTrustedAdvisorCheckCommand,
  SupportClient,
  SupportServiceException,
} from "@aws-sdk/client-support";

import { SupportHelper } from "../lib/support";

describe("Support Client", () => {
  const supportMock = mockClient(SupportClient);
  let supportHelper: SupportHelper;

  beforeEach(() => {
    supportMock.reset();
    supportHelper = new SupportHelper();
  });

  it("should refresh a trusted advisor check", async () => {
    supportMock.on(RefreshTrustedAdvisorCheckCommand).resolves({});

    const testCase = async () => {
      await supportHelper.refreshTrustedAdvisorCheck("id1");
    };

    await expect(testCase).not.toThrow();
  });

  it("should throw an exception if RefreshTrustedAdvisorCheckCommand fails", async () => {
    supportMock.on(RefreshTrustedAdvisorCheckCommand).rejects(
      new SupportServiceException({
        name: "SupportServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await supportHelper.refreshTrustedAdvisorCheck("id1");
    };

    await expect(testCase).rejects.toThrow(SupportServiceException);
  });

  it("isTAEnabled should return false when refreshTA fails", async () => {
    supportMock.on(DescribeTrustedAdvisorChecksCommand).rejects(
      new SupportServiceException({
        name: "SupportServiceException",
        $fault: "server",
        $metadata: {},
      })
    );
    const result = await (async () => {
      return supportHelper.isTrustedAdvisorAvailable();
    })();
    expect(result).toEqual(false);
  });

  it("isTAEnabled should return true when refreshTA returns value", async () => {
    supportMock.on(DescribeTrustedAdvisorChecksCommand).resolves({});
    const result = await (async () => {
      return supportHelper.isTrustedAdvisorAvailable();
    })();
    expect(result).toEqual(true);
  });
});
