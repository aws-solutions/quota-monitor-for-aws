// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { handler } from "../index";
import { PreReqManager } from "../lib/preReqManager";
import { IncorrectConfigurationException } from "solutions-utils";

const getOrgDetailsMock = jest.fn();
const registerDelegatedAdministratorMock = jest.fn();

jest.mock("solutions-utils", () => {
  const originalModule = jest.requireActual("solutions-utils");
  return {
    ...originalModule,
    __esModule: true,
    OrganizationsHelper: function () {
      return {
        enableAWSServiceAccess: () => jest.fn(),
        registerDelegatedAdministrator: registerDelegatedAdministratorMock,
        getOrganizationDetails: getOrgDetailsMock,
      };
    },
  };
});

const MASTER_ACCOUNT_ID = "foo";
const QM_MONITORING_ACCOUNT_ID = "bar";
const CFN_EVENT = {
  ResourceType: "Custom::Resource",
  RequestType: "",
  ResourceProperties: {},
};

describe("PreReqManager", function () {
  // PreReq check only succeeds when the current account is the Org's master account

  beforeAll(() => {
    getOrgDetailsMock.mockResolvedValue({
      FeatureSet: "ALL",
      MasterAccountId: MASTER_ACCOUNT_ID,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Create event", function () {
    // Sample of a valid Create event
    const CREATE_EVENT = {
      ...CFN_EVENT,
      RequestType: "Create",
      ResourceProperties: {
        AccountId: MASTER_ACCOUNT_ID,
      },
    };

    it("succeeds if account setup is valid", async function () {
      // when
      await handler(CREATE_EVENT);
      // then
      expect(getOrgDetailsMock).toHaveBeenCalledTimes(1);
    });

    it("fails if current account is not from the org's master account", async function () {
      // given
      const event = {
        ...CREATE_EVENT,
        ResourceProperties: {
          QMMonitoringAccountId: QM_MONITORING_ACCOUNT_ID,
          AccountId: "arbitrary-account-id",
          Region: "baz",
        },
      };
      const testCase = async () => {
        await handler(event);
      };
      await expect(testCase).rejects.toMatch(/IncorrectConfigurationException/);
    });

    it("should succeed without doing anything if request type other than create or update", async () => {
      const event = {
        ...CREATE_EVENT,
        ResourceProperties: {
          QMMonitoringAccountId: QM_MONITORING_ACCOUNT_ID,
          AccountId: "arbitrary-account-id",
          Region: "baz",
        },
        RequestType: "Unknown",
      };
      await handler(event);
    });

    it("throws an error if mandatory fields are missing", async function () {
      // given
      const event = {
        ...CFN_EVENT,
        RequestType: "Create",
        ResourceProperties: {
          AccountId: null,
        },
      };
      const testCase = async () => {
        await handler(event);
      };
      await expect(testCase).rejects.toMatch(/IncorrectConfigurationException/);
    });
  });

  describe("Update event", function () {
    // Sample of a valid Update event
    const UPDATE_EVENT = {
      ...CFN_EVENT,
      RequestType: "Update",
      ResourceProperties: {
        QMMonitoringAccountId: QM_MONITORING_ACCOUNT_ID,
        AccountId: MASTER_ACCOUNT_ID,
      },
    };

    it("succeeds if account setup is valid", async function () {
      // when
      await handler(UPDATE_EVENT);
      // then
      expect(getOrgDetailsMock).toHaveBeenCalledTimes(1);
    });

    it("fails if FeatureSet of organisation is not 'ALL'", async function () {
      getOrgDetailsMock.mockResolvedValueOnce({
        FeatureSet: "NOT_ALL",
        MasterAccountId: MASTER_ACCOUNT_ID,
      });
      const testCase = async () => {
        await handler(UPDATE_EVENT);
      };
      await expect(testCase).rejects.toMatch(/IncorrectConfigurationException/);
    });

    it("fails if current account is not Organizations management account", async function () {
      // given
      const event = {
        ...UPDATE_EVENT,
        ResourceProperties: {
          QMMonitoringAccountId: QM_MONITORING_ACCOUNT_ID,
          AccountId: "arbitrary-account-id",
        },
      };
      const testCase = async () => {
        await handler(event);
      };
      await expect(testCase).rejects.toMatch(/IncorrectConfigurationException/);
    });
  });

  describe("Delete Event", () => {
    const DELETE_EVENT = {
      ...CFN_EVENT,
      RequestType: "Delete",
    };

    it("succeeds if delete type is received, but doesn't perform any actions", async function () {
      // when
      await handler(DELETE_EVENT);
      // then
      expect(getOrgDetailsMock).toHaveBeenCalledTimes(0);
    });
  });

  describe("PreReq Manager Class", () => {
    const preReqManager = new PreReqManager(MASTER_ACCOUNT_ID);
    it("should fail to register a delegated admin if the accountId matches management account", async () => {
      const testCase = async () => {
        await preReqManager.registerDelegatedAdministrator(MASTER_ACCOUNT_ID);
      };
      await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
    });

    it("should throw an exception if it fails to register the delegated admin due to a service failure", async () => {
      registerDelegatedAdministratorMock.mockRejectedValueOnce(new IncorrectConfigurationException("error"));
      const testCase = async () => {
        await preReqManager.registerDelegatedAdministrator(MASTER_ACCOUNT_ID);
      };
      await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
    });

    it("should throw an exception if it fails to check org details due to a service failure", async () => {
      getOrgDetailsMock.mockRejectedValueOnce(new IncorrectConfigurationException("error"));
      const testCase = async () => {
        await preReqManager.throwIfOrgMisconfigured();
      };
      await expect(testCase).rejects.toThrow(IncorrectConfigurationException);
    });
  });
});
