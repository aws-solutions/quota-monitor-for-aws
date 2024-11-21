// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
  DescribeOrganizationCommand,
  EnableAWSServiceAccessCommand,
  ListRootsCommand,
  OrganizationsClient,
  OrganizationsServiceException,
  RegisterDelegatedAdministratorCommand,
  ListAccountsCommand,
  ListAccountsForParentCommand,
} from "@aws-sdk/client-organizations";

import { OrganizationsHelper } from "../lib/organizations";

describe("Organizations Helper", () => {
  const orgMock = mockClient(OrganizationsClient);
  let orgHelper: OrganizationsHelper;

  beforeEach(() => {
    orgMock.reset();
    orgHelper = new OrganizationsHelper();
  });

  it("should get the organization information from DescribeOrganizationCommand", async () => {
    const org = {
      Id: "o-00000000",
    };
    const describeResponse = {
      Organization: org,
    };
    orgMock.on(DescribeOrganizationCommand).resolves(describeResponse);

    const response = await orgHelper.getOrganizationDetails();

    expect(response).toEqual(org);
  });

  it("should throw an exception if DescribeOrganizationCommandFails", async () => {
    orgMock.on(DescribeOrganizationCommand).rejectsOnce(
      new OrganizationsServiceException({
        name: "OrganizationsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await orgHelper.getOrganizationDetails();
    };

    await expect(testCase).rejects.toThrow(OrganizationsServiceException);
  });

  it("should get the Organization Id", async () => {
    orgMock.on(DescribeOrganizationCommand).resolves({
      Organization: {
        Id: "o-00000000",
      },
    });

    const response = await orgHelper.getOrganizationId();

    expect(response).toEqual("o-00000000");
  });

  it("should throw an exception when the DescribeOrganizationCommand fails", async () => {
    orgMock.on(DescribeOrganizationCommand).rejectsOnce(
      new OrganizationsServiceException({
        name: "OrganizationsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await orgHelper.getOrganizationId();
    };

    await expect(testCase).rejects.toThrow(OrganizationsServiceException);
  });

  it("should get the org root id", async () => {
    orgMock.on(ListRootsCommand).resolves({
      Roots: [{ Id: "o-root" }],
    });

    const response = await orgHelper.getRootId();

    expect(response).toEqual("o-root");
  });

  it("should throw an exception when the ListRootsCommand fails", async () => {
    orgMock.on(ListRootsCommand).rejectsOnce(
      new OrganizationsServiceException({
        name: "OrganizationsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await orgHelper.getRootId();
    };

    await expect(testCase).rejects.toThrow(OrganizationsServiceException);
  });

  const awsServiceTestCase = async () => {
    await orgHelper.enableAWSServiceAccess("member.org.stacksets.cloudformation.amazonaws.com");
  };

  it("should enable AWS Service Access", async () => {
    orgMock.on(EnableAWSServiceAccessCommand).resolves({});

    await expect(awsServiceTestCase).not.toThrow();
  });

  it("should throw an exception if EnableAWSServiceAccessCommand fails", async () => {
    orgMock.on(EnableAWSServiceAccessCommand).rejectsOnce(
      new OrganizationsServiceException({
        name: "OrganizationsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    await expect(awsServiceTestCase).rejects.toThrow(OrganizationsServiceException);
  });

  it("should register a delegated administrator", async () => {
    orgMock.on(RegisterDelegatedAdministratorCommand).resolves({});

    let error: Error | undefined;
    try {
      await orgHelper.registerDelegatedAdministrator(
        "123456789012",
        "member.org.stacksets.cloudformation.amazonaws.com"
      );
    } catch (err) {
      error = err;
    }

    expect(error).toEqual(undefined);
  });

  it("should throw an exception if RegisterDelegatedAdministratorCommand fails", async () => {
    orgMock.on(RegisterDelegatedAdministratorCommand).rejectsOnce(
      new OrganizationsServiceException({
        name: "OrganizationsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await orgHelper.registerDelegatedAdministrator(
        "123456789012",
        "member.org.stacksets.cloudformation.amazonaws.com"
      );
    };

    await expect(testCase).rejects.toThrow(OrganizationsServiceException);
  });

  it("should get the number of accounts in an org from ListAccountsCommand", async () => {
    const listAccountsResponse = {
      Accounts: [{}, {}],
    };
    orgMock.on(ListAccountsCommand).resolves(listAccountsResponse);

    const response = await orgHelper.getNumberOfAccountsInOrg();

    expect(response).toEqual(2);
  });

  it("should throw an exception if ListAccountsCommand fails", async () => {
    orgMock.on(ListAccountsCommand).rejectsOnce(
      new OrganizationsServiceException({
        name: "OrganizationsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await orgHelper.getNumberOfAccountsInOrg();
    };

    await expect(testCase).rejects.toThrow(OrganizationsServiceException);
  });

  it("should get the number of accounts in an org unit from ListAccountsForParentCommand", async () => {
    const listAccountsResponse = {
      Accounts: [{}, {}],
    };
    orgMock.on(ListAccountsForParentCommand).resolves(listAccountsResponse);

    const response = await orgHelper.getNumberOfAccountsInOU("");

    expect(response).toEqual(2);
  });

  it("should throw an exception if ListAccountsForParentCommand fails", async () => {
    orgMock.on(ListAccountsForParentCommand).rejectsOnce(
      new OrganizationsServiceException({
        name: "OrganizationsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await orgHelper.getNumberOfAccountsInOU("");
    };

    await expect(testCase).rejects.toThrow(OrganizationsServiceException);
  });
});
