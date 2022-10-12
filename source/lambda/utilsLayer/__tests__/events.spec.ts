import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  CloudWatchEventsClient,
  CloudWatchEventsServiceException,
  DescribeEventBusCommand,
  PutEventsCommand,
  PutEventsRequestEntry,
  PutPermissionCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-cloudwatch-events";

import { EventsHelper } from "../lib/events";

describe("Event Helper", () => {
  const eventsClient = mockClient(CloudWatchEventsClient);
  let eventsHelper: EventsHelper;
  const event_bus = <string>process.env.EVENT_BUS_NAME;
  const principal_o = "o-0000000000";
  const principal_ou = "ou-0000-00000000";
  const principal_account = "000000000000";
  const org_id = "o-00000000";

  beforeEach(() => {
    eventsClient.reset();
    eventsHelper = new EventsHelper();
  });

  it("should create a trust for an org", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});

    const expectedCommand = {
      EventBusName: event_bus,
      Principal: "*",
      StatementId: principal_o,
      Action: "events:PutEvents",
      Condition: {
        Type: "StringEquals",
        Key: "aws:PrincipalOrgID",
        Value: principal_o,
      },
    };

    await eventsHelper.createTrust(principal_o, org_id, event_bus);
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a trust for an ou", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});

    const orgUnitPolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Sid: principal_ou,
        Effect: "Allow",
        Principal: "*",
        Action: "events:PutEvents",
        Resource: <string>process.env.EVENT_BUS_ARN,
        Condition: {
          "ForAnyValue:StringLike": {
            "aws:PrincipalOrgPaths": [`${org_id}/*/${principal_ou}/*`],
          },
        },
      },
    });

    const expectedCommand = {
      EventBusName: event_bus,
      Policy: orgUnitPolicy,
    };

    await eventsHelper.createTrust(principal_ou, org_id, event_bus);
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a trust for an account", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});

    const expectedCommand = {
      EventBusName: event_bus,
      Principal: principal_account,
      StatementId: principal_account,
      Action: "events:PutEvents",
    };

    await eventsHelper.createTrust(principal_account, org_id);
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should remove a trust", async () => {
    eventsClient.on(RemovePermissionCommand).resolves({});

    await eventsHelper.removeTrust("12345");

    expect(eventsClient).toHaveReceivedCommandTimes(RemovePermissionCommand, 1);
  });

  it("should get permissions", async () => {
    eventsClient.on(DescribeEventBusCommand).resolves({
      Policy: '{"Statement": "policy_statement"}',
    });

    const response = await eventsHelper.getPermissions();

    expect(response).toEqual("policy_statement");
  });

  it("should throw an exception if DescribeEventBusCommand fails", async () => {
    eventsClient.on(DescribeEventBusCommand).rejectsOnce(
      new CloudWatchEventsServiceException({
        name: "CloudWatchEventsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await eventsHelper.getPermissions();
    };

    await expect(testCase).rejects.toThrow(CloudWatchEventsServiceException);
  });

  it("should put an event", async () => {
    eventsClient.on(PutEventsCommand).resolves({});

    const entries: PutEventsRequestEntry[] = [];

    for (let i = 0; i < 15; i++) {
      entries.push({ Detail: `${i}` });
    }

    await eventsHelper.putEvent(entries);

    expect(eventsClient).toHaveReceivedCommandTimes(PutEventsCommand, 2);
  });
});
