// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  DynamoDBClient,
  DynamoDBServiceException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { catchDecorator } from "./catch";
import { ServiceHelper } from "./exports";
import { logger } from "./logger";
import { SQ_SERVICE_CODES } from "./services";

/**
 * @description helper class for Event Bridge
 */
export class DynamoDBHelper extends ServiceHelper<DynamoDBClient> {
  readonly client;
  /**
   * @description module name to be used in logging
   */
  protected readonly moduleName: string;
  /**
   * @description ddb doc client to work with JSON
   */
  readonly ddbDocClient;
  constructor() {
    super();
    this.client = new DynamoDBClient({
      customUserAgent: process.env.CUSTOM_SDK_USER_AGENT,
    });
    this.moduleName = <string>__filename.split("/").pop();
    this.ddbDocClient = DynamoDBDocumentClient.from(this.client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /**
   * @description put command using ddb document client
   * @param tableName
   * @param item JSON item to put on the table
   */
  @catchDecorator(DynamoDBServiceException, true)
  async putItem(tableName: string, item: Record<string, any>) {
    logger.debug({
      label: this.moduleName,
      message: `putting JSON item on ${tableName}: ${JSON.stringify(item)}`,
    });
    await this.ddbDocClient.send(
      new PutCommand({ TableName: tableName, Item: item })
    );
  }

  /**
   * @descrition get item from table
   * @param tableName
   * @param key
   * @returns
   */
  @catchDecorator(DynamoDBServiceException, false)
  async getItem(tableName: string, key: { [_: string]: string }) {
    logger.debug({
      label: this.moduleName,
      message: `getting item from ${tableName}`,
    });
    const response = await this.ddbDocClient.send(
      new GetCommand({
        TableName: tableName,
        Key: key,
      })
    );
    logger.debug({
      label: this.moduleName,
      message: `get item respone: ${JSON.stringify(response)}`,
    });
    return response.Item;
  }

  /**
   * @description query items using ddb document client for given service code
   * @param tableName - quota table name
   * @param serviceCode - service code for which to fetch quotas
   * @returns
   */
  @catchDecorator(DynamoDBServiceException, false)
  async queryQuotasForService(
    tableName: string,
    serviceCode: SQ_SERVICE_CODES
  ) {
    logger.debug({
      label: this.moduleName,
      message: `getting quota items from ${tableName} for ${serviceCode}`,
    });
    const response = await this.ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "ServiceCode = :value",
        ExpressionAttributeValues: {
          ":value": serviceCode,
        },
      })
    );
    return response.Items;
  }

  /**
   * @description deletes multiple quotas for a service from ddb
   * @param tableName
   * @param deleteRequests
   */
  @catchDecorator(DynamoDBServiceException, false)
  async batchDelete(tableName: string, deleteRequests: Record<string, any>[]) {
    logger.debug({
      label: this.moduleName,
      message: `deleting quotas`,
    });

    if (deleteRequests.length === 0) return;
    const batchWriteParams = {
      RequestItems: {
        [tableName]: deleteRequests,
      },
    };
    await this.ddbDocClient.send(new BatchWriteCommand(batchWriteParams));
  }
}
