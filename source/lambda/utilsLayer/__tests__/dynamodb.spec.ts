// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBHelper } from "../lib/dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

describe("Dynamo DB", () => {
  const ddbMock = mockClient(DynamoDBClient);
  const ddbDocMock = mockClient(DynamoDBDocumentClient);
  let ddbHelper: DynamoDBHelper;
  const tableName = "ddbTable";

  beforeEach(() => {
    ddbMock.reset();
    ddbDocMock.reset();
    ddbHelper = new DynamoDBHelper();
  });

  it("should put an item", async () => {
    ddbDocMock.on(PutCommand).resolves({});
    const item = {};

    await ddbHelper.putItem(tableName, item);

    expect(ddbDocMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });

  it("should get an item", async () => {
    ddbDocMock.on(GetCommand).resolves({ Item: { data: "data" } });

    const response = await ddbHelper.getItem(tableName, {
      ServiceCode: "dynamodb",
    });
    expect(ddbDocMock).toHaveReceivedCommandTimes(GetCommand, 1);
    expect(response).toEqual({ data: "data" });
  });

  it("should query for service items", async () => {
    ddbDocMock
      .on(QueryCommand)
      .resolves({ Items: [{ data: "data1" }, { data: "data2" }] });

    const response = await ddbHelper.queryQuotasForService(
      tableName,
      "dynamodb"
    );

    expect(ddbDocMock).toHaveReceivedCommandTimes(QueryCommand, 1);
    expect(response).toEqual([{ data: "data1" }, { data: "data2" }]);
  });

  it("should batch delete", async () => {
    ddbDocMock.on(BatchWriteCommand).resolves({});

    ddbHelper.batchDelete(tableName, [{}]);
    expect(ddbDocMock).toHaveReceivedCommandTimes(BatchWriteCommand, 1);
  });

  it("should skip deleting if no delete requests", async () => {
    ddbDocMock.on(BatchWriteCommand).resolves({});

    ddbHelper.batchDelete(tableName, []);
    expect(ddbDocMock).toHaveReceivedCommandTimes(BatchWriteCommand, 0);
  });
});
