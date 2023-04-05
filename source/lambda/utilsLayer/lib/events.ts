// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import {
  CloudWatchEventsClient,
  CloudWatchEventsServiceException,
  PutEventsCommand,
  PutEventsRequestEntry,
  PutPermissionCommand,
  RemovePermissionCommand
} from "@aws-sdk/client-cloudwatch-events";
import { catchDecorator } from "./catch";
import {
  ServiceHelper,
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
   * @description put permission for principals on the event bridge bus
   * @param principals
   * @param orgId
   * @param eventBusArn
   * @param eventBusName
   */
  @catchDecorator(CloudWatchEventsServiceException, true)
  async createEventBusPolicy(
    principals: string[],
    orgId: string,
    eventBusArn: string,
    eventBusName: string
  ) {
    const policyStatements = [];
    const orgIds = principals.filter((principal) => principal.match(ORG_REGEX));
    const ouIds = principals.filter((principal) => principal.match(OU_REGEX));
    const accountIds = principals.filter((principal) =>
      principal.match(ACCOUNT_REGEX)
    );
    if (orgIds.length > 0) {
      //the caller shouldn't provide multiple orgIds, this is checked upstream
      policyStatements.push({
        Sid: "allowed_orgIds",
        Effect: "Allow",
        Principal: "*",
        Action: "events:PutEvents",
        Resource: eventBusArn,
        Condition: {
          StringEquals: {
            "aws:PrincipalOrgID": orgIds,
          },
        },
      });
    }
    if (ouIds.length > 0) {
      const orgPaths = ouIds.map((ouId) => `${orgId}/*/${ouId}/*`);
      policyStatements.push({
        Sid: "allowed_ouIds",
        Effect: "Allow",
        Principal: "*",
        Action: "events:PutEvents",
        Resource: eventBusArn,
        Condition: {
          "ForAnyValue:StringLike": {
            "aws:PrincipalOrgPaths": orgPaths,
          },
        },
      });
    }
    if (accountIds.length > 0) {
      policyStatements.push({
        Sid: "allowed_accounts",
        Effect: "Allow",
        Principal: { AWS: accountIds },
        Action: "events:PutEvents",
        Resource: eventBusArn,
      });
    }
    if (policyStatements.length !== 0) {
      const _cweCommandInput = new PutPermissionCommand({
        EventBusName: eventBusName,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: policyStatements,
        }),
      });
      await this.client.send(_cweCommandInput);
    } else {
      //no valid principals, remove all the permissions
      await this.removeAllPermissions(eventBusName);
    }
  }

  /**
   * @description remove permission from the event bridge
   * @param eventBusName - name of the event bus
   */
  @catchDecorator(CloudWatchEventsServiceException, false)
  async removeAllPermissions(eventBusName: string) {
    logger.debug({
      label: this.moduleName,
      message: `removing all permissions from the bus ${eventBusName}`,
    });
    const _cweCommandInput = new RemovePermissionCommand({
      EventBusName: eventBusName,
      RemoveAllPermissions: true,
    });
    await this.client.send(_cweCommandInput);
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
