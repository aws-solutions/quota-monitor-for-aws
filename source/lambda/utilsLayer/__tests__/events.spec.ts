// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import {
  CloudWatchEventsClient,
  CloudWatchEventsServiceException,
  PutEventsCommand,
  PutEventsRequestEntry,
  PutPermissionCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-cloudwatch-events";

import { EventsHelper } from "../lib/events";

describe("Event Helper", () => {
  const eventsClient = mockClient(CloudWatchEventsClient);
  let eventsHelper: EventsHelper;
  const eventBusName = "MyBus";
  const eventBusArn = "arn:aws:events:us-east-1:000000000000:event-bus/MyBus";
  const principalOrg = "o-0000000000";
  const principalOU = "ou-0000-00000000";
  const principalOU2 = "ou-0000-00000002";
  const principalAccount = "000000000000";
  const principalAccount2 = "123456789012";
  const orgId = "o-00000000";

  beforeEach(() => {
    eventsClient.reset();
    eventsHelper = new EventsHelper();
  });

  it("should create a resource based policy for an org", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});
    const expectedCommand = {
      EventBusName: eventBusName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "allowed_orgIds",
            Effect: "Allow",
            Principal: "*",
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
            Condition: {
              StringEquals: {
                "aws:PrincipalOrgID": [principalOrg],
              },
            },
          },
        ],
      }),
    };

    await eventsHelper.createEventBusPolicy(
      [principalOrg],
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a resource based policy for an ou", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});
    const expectedCommand = {
      EventBusName: eventBusName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "allowed_ouIds",
            Effect: "Allow",
            Principal: "*",
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
            Condition: {
              "ForAnyValue:StringLike": {
                "aws:PrincipalOrgPaths": [orgId + "/*/" + principalOU + "/*"],
              },
            },
          },
        ],
      }),
    };

    await eventsHelper.createEventBusPolicy(
      [principalOU],
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a resource based policy for multiple ous", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});
    const expectedCommand = {
      EventBusName: eventBusName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "allowed_ouIds",
            Effect: "Allow",
            Principal: "*",
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
            Condition: {
              "ForAnyValue:StringLike": {
                "aws:PrincipalOrgPaths": [
                  orgId + "/*/" + principalOU + "/*",
                  orgId + "/*/" + principalOU2 + "/*",
                ],
              },
            },
          },
        ],
      }),
    };

    await eventsHelper.createEventBusPolicy(
      [principalOU, principalOU2],
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a resource based policy for an account", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});
    const expectedCommand = {
      EventBusName: eventBusName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "allowed_accounts",
            Effect: "Allow",
            Principal: {
              AWS: [principalAccount],
            },
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
          },
        ],
      }),
    };

    await eventsHelper.createEventBusPolicy(
      [principalAccount],
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a resource based policy for multiple accounts", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});
    const expectedCommand = {
      EventBusName: eventBusName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "allowed_accounts",
            Effect: "Allow",
            Principal: {
              AWS: [principalAccount, principalAccount2],
            },
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
          },
        ],
      }),
    };

    await eventsHelper.createEventBusPolicy(
      [principalAccount, principalAccount2],
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a resource based policy for multiple ous and accounts", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});
    const expectedCommand = {
      EventBusName: eventBusName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "allowed_ouIds",
            Effect: "Allow",
            Principal: "*",
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
            Condition: {
              "ForAnyValue:StringLike": {
                "aws:PrincipalOrgPaths": [
                  orgId + "/*/" + principalOU + "/*",
                  orgId + "/*/" + principalOU2 + "/*",
                ],
              },
            },
          },
          {
            Sid: "allowed_accounts",
            Effect: "Allow",
            Principal: {
              AWS: [principalAccount, principalAccount2],
            },
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
          },
        ],
      }),
    };

    await eventsHelper.createEventBusPolicy(
      [principalOU, principalOU2, principalAccount, principalAccount2],
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should create a resource based policy for org and accounts", async () => {
    eventsClient.on(PutPermissionCommand).resolves({});
    const expectedCommand = {
      EventBusName: eventBusName,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "allowed_orgIds",
            Effect: "Allow",
            Principal: "*",
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
            Condition: {
              StringEquals: {
                "aws:PrincipalOrgID": [principalOrg],
              },
            },
          },
          {
            Sid: "allowed_accounts",
            Effect: "Allow",
            Principal: {
              AWS: [principalAccount, principalAccount2],
            },
            Action: "events:PutEvents",
            Resource: "arn:aws:events:us-east-1:000000000000:event-bus/MyBus",
          },
        ],
      }),
    };

    await eventsHelper.createEventBusPolicy(
      [principalOrg, principalAccount, principalAccount2],
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      PutPermissionCommand,
      expectedCommand
    );
  });

  it("should try to remove existing policy for empty/invalid inputs", async () => {
    eventsClient.on(RemovePermissionCommand).resolves({});
    const expectedRemoveCommand = {
      EventBusName: eventBusName,
      RemoveAllPermissions: true,
    };

    await eventsHelper.createEventBusPolicy(
      [principalOrg, principalAccount, principalAccount2].map(
        (s) => "INVALID_" + s
      ),
      orgId,
      eventBusArn,
      eventBusName
    );
    expect(eventsClient).toHaveReceivedCommandWith(
      RemovePermissionCommand,
      expectedRemoveCommand
    );
  });

  it("should throw an exception if PutPermissionCommand fails", async () => {
    eventsClient.on(PutPermissionCommand).rejectsOnce(
      new CloudWatchEventsServiceException({
        name: "CloudWatchEventsServiceException",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await eventsHelper.createEventBusPolicy(
        [principalOrg],
        orgId,
        eventBusArn,
        eventBusName
      );
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
