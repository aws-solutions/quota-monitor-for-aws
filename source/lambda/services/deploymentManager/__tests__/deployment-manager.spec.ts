import { handler } from "../index";
import { DEPLOYMENT_MODEL } from "../lib/deployment-manager";
import {
  IParameterChangeEvent,
  IncorrectConfigurationException,
} from "solutions-utils";

const getParameterMock = jest.fn();
const getOrganizationIdMock = jest.fn();
const getRootIdMock = jest.fn();
const createTrustMock = jest.fn();
const getPermissionsMock = jest.fn();
const removeTrustMock = jest.fn();
const getEnabledRegionNamesMock = jest.fn();
const createStackSetInstancesMock = jest.fn();
const deleteStackSetInstancesMock = jest.fn();
const getDeploymentTargetsMock = jest.fn();

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
      };
    },
    EventsHelper: function () {
      return {
        createTrust: createTrustMock,
        getPermissions: getPermissionsMock,
        removeTrust: removeTrustMock,
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
      };
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

const orgPolicyStatementMock = {
  Sid: "o-0000000000",
  Effect: "allow",
  Principal: {
    AWS: "arn:aws:iam::o-0000000000:root",
  },
  Action: "events:PutEvents",
  Resource: "arn:aws:events:us-east-1:o-0000000000:event-bus/QuotaMonitorBus",
};

describe("Deployment Manager", () => {
  beforeEach(async () => {
    getParameterMock.mockResolvedValue([]);
    getOrganizationIdMock.mockResolvedValue("o-0000000000");
    getRootIdMock.mockResolvedValue("r-0000");
    createTrustMock.mockResolvedValue({});
    getPermissionsMock.mockResolvedValue([]);
    removeTrustMock.mockResolvedValue({});
    getEnabledRegionNamesMock.mockResolvedValue(["us-east-1", "us-east-2"]);
    createStackSetInstancesMock.mockResolvedValue({});
    deleteStackSetInstancesMock.mockResolvedValue({});
    getDeploymentTargetsMock.mockResolvedValue([]);

    jest.clearAllMocks();
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
  });

  it("should manage deployments in Organization deployment mode with single Org Id", async () => {
    getParameterMock.mockResolvedValue(["o-0000000000"]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(2);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(createTrustMock).toHaveBeenCalledTimes(1);
    expect(getPermissionsMock).toHaveBeenCalledTimes(1);
    expect(removeTrustMock).toHaveBeenCalledTimes(0);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(0);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
  });

  it("should manage deployments in Organization deployment mode with multiple OU-Ids", async () => {
    getParameterMock.mockResolvedValue([
      "ou-0000-00000000",
      "ou-0000-00000001",
    ]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(2);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(createTrustMock).toHaveBeenCalledTimes(2);
    expect(getPermissionsMock).toHaveBeenCalledTimes(1);
    expect(removeTrustMock).toHaveBeenCalledTimes(0);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(1);
  });

  it("should manage deployments in Account deployment mode", async () => {
    getParameterMock.mockResolvedValueOnce(["000000000000"]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ACCOUNT;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(1);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(0);
    expect(createTrustMock).toHaveBeenCalledTimes(1);
    expect(getPermissionsMock).toHaveBeenCalledTimes(1);
    expect(removeTrustMock).toHaveBeenCalledTimes(0);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(0);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(0);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(0);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(0);
  });

  it("should manage deployments in Hybrid mode", async () => {
    getParameterMock
      .mockResolvedValueOnce(["ou-0000-00000000", "ou-0000-00000001"])
      .mockResolvedValueOnce(["000000000000"])
      .mockResolvedValueOnce(["ou-0000-00000000", "ou-0000-00000001"]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.HYBRID;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(3);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(createTrustMock).toHaveBeenCalledTimes(3);
    expect(getPermissionsMock).toHaveBeenCalledTimes(1);
    expect(removeTrustMock).toHaveBeenCalledTimes(0);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(1);
  });

  it("should remove unused permissions when updating permissions", async () => {
    getParameterMock.mockResolvedValue(["ou-0000-00000000"]);
    getPermissionsMock.mockResolvedValueOnce([orgPolicyStatementMock]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(2);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(createTrustMock).toHaveBeenCalledTimes(1);
    expect(getPermissionsMock).toHaveBeenCalledTimes(1);
    expect(removeTrustMock).toHaveBeenCalledTimes(1);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(1);
  });

  it("should delete unused stacksets when updating", async () => {
    getParameterMock.mockResolvedValue([
      "ou-0000-00000000",
      "ou-0000-00000001",
    ]);
    getDeploymentTargetsMock.mockResolvedValue([
      "ou-0000-00000002",
      "ou-0000-00000003",
    ]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;
    await handler(event);

    expect(getParameterMock).toHaveBeenCalledTimes(2);
    expect(getOrganizationIdMock).toHaveBeenCalledTimes(1);
    expect(createTrustMock).toHaveBeenCalledTimes(2);
    expect(getPermissionsMock).toHaveBeenCalledTimes(1);
    expect(removeTrustMock).toHaveBeenCalledTimes(0);
    expect(getEnabledRegionNamesMock).toHaveBeenCalledTimes(1);
    expect(createStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(deleteStackSetInstancesMock).toHaveBeenCalledTimes(2);
    expect(getDeploymentTargetsMock).toHaveBeenCalledTimes(1);
  });

  it("should throw an exception when the org id is malformed", async () => {
    getParameterMock.mockResolvedValue(["NOP"]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ORG;

    const testCase = async () => {
      await handler(event);
    };

    await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
  });

  it("should throw an exception when the account id is malformed", async () => {
    getParameterMock.mockResolvedValue(["NOP"]);
    process.env.DEPLOYMENT_MODEL = DEPLOYMENT_MODEL.ACCOUNT;

    const testCase = async () => {
      await handler(event);
    };

    await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
  });
});
