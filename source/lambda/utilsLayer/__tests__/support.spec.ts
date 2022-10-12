import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
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
});
