// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler, IEvent } from "../index";
import { TAHelper } from "../lib/ta-helper";

const refreshTrustedAdvisorCheckMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    SupportHelper: function () {
      return {
        refreshTrustedAdvisorCheck: refreshTrustedAdvisorCheckMock,
      };
    },
  };
});

const mockEvent: IEvent = {
  version: "",
  account: "",
  region: "us-east-2",
  detail: {},
  "detail-type": "Scheduled Event",
  source: "",
  time: "",
  id: "",
  resources: [],
};

describe("tarefresh", () => {
  const services = ["AutoScaling", "CloudFormation"];
  const serviceIds = ["aW7HH0l7J9", "fW7HH0l7J9", "gW7HH0l7J9"];
  let taHelper: TAHelper;

  beforeAll(async () => {
    refreshTrustedAdvisorCheckMock.mockResolvedValue({
      status: {
        checkId: "",
        millisUntilNextRefreshable: 1,
        status: "success",
      },
    });
  });

  beforeEach(() => {
    process.env.LOG_LEVEL = "none";
    taHelper = new TAHelper();

    jest.clearAllMocks();
  });

  it("should refresh checks for services", async () => {
    const testCase = async () => {
      await taHelper.refreshChecks(services);
    };

    await expect(testCase).not.toThrow();
  });

  it("should refresh checks from the handler", async () => {
    process.env.AWS_SERVICES = "AutoScaling,CloudFormation";
    handler(mockEvent);

    expect(refreshTrustedAdvisorCheckMock).toHaveBeenNthCalledWith(
      1,
      serviceIds[0]
    );
    expect(refreshTrustedAdvisorCheckMock).toHaveBeenNthCalledWith(
      2,
      serviceIds[1]
    );
    expect(refreshTrustedAdvisorCheckMock).toHaveBeenNthCalledWith(
      3,
      serviceIds[2]
    );
  });
});
