// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  CloudWatchEventsClient,
  CloudWatchEventsServiceException,
  DescribeEventBusCommand,
  PutEventsCommand,
  PutEventsRequestEntry,
  PutPermissionCommand,
  RemovePermissionCommand,
} from "@aws-sdk/client-cloudwatch-events";
import { catchDecorator } from "./catch";
import {
  ServiceHelper,
  IPolicyStatement,
  ORG_REGEX,
  ACCOUNT_REGEX,
  OU_REGEX,
  createChunksFromArray,
} from "./exports";
import { logger } from "./logger";

/**
 * @description helper class for Event Bridge
 */
export class EventsHelper extends ServiceHelper<CloudWatchEventsClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  constructor() {
    super();
    this.client = new CloudWatchEventsClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
  }

  /**
   * @description put permission for principal on the event bridge
   * @param principal
   * @param org_id
   * @param event_bus
   */
  @catchDecorator(CloudWatchEventsServiceException, false)
  async createTrust(
    principal: string,
    org_id: string,
    event_bus: string = <string>process.env.EVENT_BUS_NAME
  ) {
    let _cweCommandInput: PutPermissionCommand;

    if (principal.match(ORG_REGEX)) {
      // put permission for organization
      _cweCommandInput = new PutPermissionCommand({
        EventBusName: event_bus,
        Principal: "*",
        StatementId: principal,
        Action: "events:PutEvents",
        Condition: {
          Type: "StringEquals",
          Key: "aws:PrincipalOrgID",
          Value: principal,
        },
      });
      await this.client.send(_cweCommandInput);
    } else if (principal.match(OU_REGEX)) {
      // put permission for organizational unit
      const orgUnitPolicy = JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Sid: principal,
          Effect: "Allow",
          Principal: "*",
          Action: "events:PutEvents",
          Resource: <string>process.env.EVENT_BUS_ARN,
          Condition: {
            "ForAnyValue:StringLike": {
              "aws:PrincipalOrgPaths": [`${org_id}/*/${principal}/*`],
            },
          },
        },
      });
      _cweCommandInput = new PutPermissionCommand({
        EventBusName: event_bus,
        Policy: orgUnitPolicy,
      });
      await this.client.send(_cweCommandInput);
    } else if (principal.match(ACCOUNT_REGEX)) {
      // put permission for account
      _cweCommandInput = new PutPermissionCommand({
        EventBusName: event_bus,
        Principal: principal,
        StatementId: principal,
        Action: "events:PutEvents",
      });
      await this.client.send(_cweCommandInput);
    }
  }

  /**
   * @description remove permission from the event bridge
   * @param sid - statement id for the policy to remove
   * @param event_bus - name of the event bus
   */
  @catchDecorator(CloudWatchEventsServiceException, false)
  async removeTrust(
    sid: string,
    event_bus: string = <string>process.env.EVENT_BUS_NAME
  ) {
    logger.debug({
      label: this.moduleName,
      message: `removing permission on event bridge for principal ${sid.slice(
        -4
      )}`, // only logging last 4 characters for auditing purposes
    });
    const _cweCommandInput = new RemovePermissionCommand({
      EventBusName: event_bus,
      StatementId: sid,
    });
    await this.client.send(_cweCommandInput);
  }

  /**
   * @description - get permission on the bus
   * @param event_bus - the event bus name
   * @returns
   */
  @catchDecorator(CloudWatchEventsServiceException, true)
  async getPermissions(event_bus: string = <string>process.env.EVENT_BUS_NAME) {
    const response = await this.client.send(
      new DescribeEventBusCommand({ Name: event_bus })
    );
    return <IPolicyStatement[]>JSON.parse(<string>response.Policy)["Statement"];
  }

  /**
   * @description put custom events on the event bridge
   * @param entries
   */
  @catchDecorator(CloudWatchEventsServiceException, false)
  async putEvent(entries: PutEventsRequestEntry[]) {
    const entriesChunks = createChunksFromArray(entries, 10);
    await Promise.allSettled(
      entriesChunks.map(async (chunk) => {
        await this.client.send(new PutEventsCommand({ Entries: chunk }));
      })
    );
  }
}
