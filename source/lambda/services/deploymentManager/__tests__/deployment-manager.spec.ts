// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler } from "../index";
import { DEPLOYMENT_MODEL } from "../lib/deployment-manager";
import {
  IParameterChangeEvent,
  IncorrectConfigurationException,
} from "solutions-utils";

const getParameterMock = jest.fn();
const getOrganizationIdMock = jest.fn();
const getRootIdMock = jest.fn();
const createEventBusPolicyMock = jest.fn();
const getEnabledRegionNamesMock = jest.fn();
const createStackSetInstancesMock = jest.fn();
const deleteStackSetInstancesMock = jest.fn();
const getDeploymentTargetsMock = jest.fn();
const isTAAvailableMock = jest.fn();
const getDeployedRegionsMock = jest.fn();
const getNumberOfAccountsInOrgMock = jest.fn();
const getNumberOfAccountsInOUMock = jest.fn();
const sendAnonymizedMetricMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    SSMHelper: function () {
      return {
        getParameter: getParameterMock,
      };
    },
    OrganizationsHelper: function () {
      return {
        getOrganizationId: getOrganizationIdMock,
        getRootId: getRootIdMock,
        getNumberOfAccountsInOrg: getNumberOfAccountsInOrgMock,
        getNumberOfAccountsInOU: getNumberOfAccountsInOUMock,
      };
    },
    EventsHelper: function () {
      return {
        createEventBusPolicy: createEventBusPolicyMock,
      };
    },
    EC2Helper: function () {
      return {
        getEnabledRegionNames: getEnabledRegionNamesMock,
      };
    },
    CloudFormationHelper: function () {
      return {
        createStackSetInstances: createStackSetInstancesMock,
        deleteStackSetInstances: deleteStackSetInstancesMock,
        getDeploymentTargets: getDeploymentTargetsMock,
        getDeployedRegions: getDeployedRegionsMock,
      };
    },
    SupportHelper: function () {
      return {
        isTrustedAdvisorAvailable: isTAAvailableMock,
      };
    },
    sendAnonymizedMetric: function () {
      sendAnonymizedMetricMock();
    },
  };
});

const event: IParameterChangeEvent = {
  version: "",
  id: "",
  "detail-type": "Parameter Store Change",
  source: "aws.ssm",
  account: "",
  time: "",
  region: "us-east-1",
  resources: [],
  detail: {
    operation: "",
    name: "",
    type: "",
    description: "",
  },
};

/**
 * An enum for the different test scenarios
 */
enum TestScenarios {
  SingleOU = "SingleOU",
  MultiOU = "MultiOU",
  Account = "Account",
  HybridSingleOU = "HybridSingleOU",
  HybridMultiOU = "HybridMultiOU",
  SingleOUInvalid = "SingleOUInvalid",
  AccountInvalid = "AccountInvalid",
  SingleOUSelectedRegions = "SingleOUSelectedRegions",
  MultiOUSelectedRegions = "MultiOUSelectedRegions",
  HybridSelectedRegions = "HybridSelectedRegions",
}

//populate the objects to be used for the different test scenarios
const orgsMap: { [key: string]: string[] } = {};
orgsMap[TestScenarios.SingleOU] = ["o-0000000000"];
orgsMap[TestScenarios.MultiOU] = ["ou-0000-00000000", "ou-0000-00000001"];
orgsMap[TestScenarios.HybridSingleOU] = ["o-0000000000"];
orgsMap[TestScenarios.HybridMultiOU] = ["ou-0000-00000000", "ou-0000-00000001"];
orgsMap[TestScenarios.SingleOUInvalid] = ["NOP"];
orgsMap[TestScenarios.SingleOUSelectedRegions] = ["o-0000000000"];
orgsMap[TestScenarios.MultiOUSelectedRegions] = [
  "ou-0000-00000000",
  "ou-0000-00000001",
];
orgsMap[TestScenarios.HybridSelectedRegions] = [
  "ou-0000-00000000",
  "ou-0000-00000001",
];

const accountsMap: { [key: string]: string[] } = {};
accountsMap[TestScenarios.Account] = ["000000000000"];
accountsMap[TestScenarios.HybridSingleOU] = ["000000000000"];
accountsMap[TestScenarios.HybridMultiOU] = ["000000000000"];
accountsMap[TestScenarios.AccountInvalid] = ["NOP"];
accountsMap[TestScenarios.HybridSelectedRegions] = ["000000000000"];

const regionsMap: { [key: string]: string[] } = {};
regionsMap[TestScenarios.SingleOU] = ["ALL"];
regionsMap[TestScenarios.MultiOU] = ["ALL"];
regionsMap[TestScenarios.Account] = ["ALL"];
regionsMap[TestScenarios.HybridSingleOU] = ["ALL"];
regionsMap[TestScenarios.HybridMultiOU] = ["ALL"];
regionsMap[TestScenarios.SingleOUSelectedRegions] = ["us-east-1", "us-west-2"];
regionsMap[TestScenarios.MultiOUSelectedRegions] = ["us-east-1", "us-west-2"];
regionsMap[TestScenarios.HybridSelectedRegions] = ["us-east-1", "us-west-2"];

/**
 * returns a mock implementation of getSSMParameter for the different test scenarios
 * @param testType
 */
const getParameterMockGenerator = (testType: TestScenarios) => {
  return (paramName: string) => {
    if (paramName === "/QuotaMonitor/OUs")
      return Promise.resolve(orgsMap[testType]);
    else if (paramName === "/QuotaMonitor/Accounts")
      return Promise.resolve(accountsMap[testType]);
    else if (paramName === "/QuotaMonitor/RegionsToDeploy")
      return Promise.resolve(regionsMap[testType]);
    else return Promise.reject("Error");
  };
};

describe("Deployment Manager", () => {
  beforeEach(async () => {
    getOrganizationIdMock.mockResolvedValue("o-0000000000");
    getRootIdMock.mockResolvedValue("r-0000");
    createEventBusPolicyMock.mockResolvedValue({});
    getEnabledRegionNamesMock.mockResolvedValue(["us-east-1", "us-east-2"]);
    createStackSetInstancesMock.mockResolvedValue({});
    deleteStackSetInstancesMock.mockResolvedValue({});
    getDeploymentTargetsMock.mockResolvedValue([]);
    isTAAvailableMock.mockResolvedValue(true);
    getDeployedRegionsMock.mockResolvedValue(["us-east-1", "us-east-2"]);

    jest.clearAllMocks();
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    process.env.REGIONS_LIST = "ALL";
    process.env.QM_ACCOUNT_PARAMETER = "/QuotaMonitor/Accounts";
    process.env.QM_OU_PARAMETER = "/QuotaMonitor/OUs";
    process.env.QM_REGIONS_LIST_PARAMETER = "/QuotaMonitor/RegionsToDeploy";
    process.env.SEND_METRIC = "No";
  });

  it("should manage deployments in Organization deployment mode with single Org Id", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.SingleOU)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(2);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Organization deployment mode with single Org Id, with SEND_METRICS yes", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.SingleOU)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    process.env.SEND_METRIC = "Yes";
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(2);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(1);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(2);
  });

  it("should manage deployments in Organization deployment mode with single Org Id with selected regions", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.SingleOUSelectedRegions)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(2);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(0);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Organization deployment mode with single Org Id with TA not available", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.SingleOU)
    );
    isTAAvailableMock.mockResolvedValue(false);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(1);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(1);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(1);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(1);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Organization deployment mode with multiple OU-Ids", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.MultiOU)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(2);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Organization deployment mode with multiple OU-Ids, with SEND_METRICS Yes", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.MultiOU)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    process.env.SEND_METRIC = "Yes";
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(2);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(2);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(2);
  });

  it("should manage deployments in Organization deployment mode with multiple OU-Ids with selected regions", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.MultiOUSelectedRegions)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(0);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(2);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Organization deployment mode with multiple OU-Ids with TA not available", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.MultiOU)
    );
    isTAAvailableMock.mockResolvedValue(false);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(1);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(1);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Account deployment mode", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.Account)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ACCOUNT;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(1);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(0);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(0);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(0);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(0);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(0);
  });

  it("should manage deployments in Hybrid single OU mode", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.HybridSingleOU)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.HYBRID;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(4);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(2);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Hybrid multi OU mode", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.HybridMultiOU)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.HYBRID;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(4);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(2);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Hybrid multi OU mode with selected regions", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.HybridSelectedRegions)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.HYBRID;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(4);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(0);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(2);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should delete unused stacksets when updating", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.MultiOU)
    );
    getDeploymentTargetsMock.mockResolvedValue([
      "ou-0000-00000002",
      "ou-0000-00000003",
    ]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(getRootIdMock).toHaveBeenCalledTimes(0);
    expect(createEventBusPolicyMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(4);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(2);
    expect(getDeployedRegionsMock).toHaveBeenCalledTimes(2);
    expect(getNumberOfAccountsInOrgMock).toHaveBeenCalledTimes(0);
    expect(getNumberOfAccountsInOUMock).toHaveBeenCalledTimes(0);
    expect(sendAnonymizedMetricMock).toHaveBeenCalledTimes(1);
  });

  it("should throw an exception when the org id is malformed", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.SingleOUInvalid)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;

    const testCase = async () => {
      await handler(event);
    };

    await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
  });

  it("should throw an exception when the account id is malformed", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.AccountInvalid)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ACCOUNT;

    const testCase = async () => {
      await handler(event);
    };

    await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
  });

  it("should throw an exception when trying to install in a partition where Trusted Advisor isn't available", async () => {
    getParameterMock.mockImplementation(
      getParameterMockGenerator(TestScenarios.SingleOU)
    );
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    getEnabledRegionNamesMock.mockResolvedValue([
      "us-iso-east-1",
      "us-iso-west-1",
    ]);

    const testCase = async () => {
      await handler(event);
    };

    await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
  });
});
