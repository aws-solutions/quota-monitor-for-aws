// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { _Record } from "@aws-sdk/client-dynamodb-streams";

/**
 * @description interface for dynamodb stream event
 */
interface IDynamoDBStreamEvent {
  Records: _Record[];
}

/**
 * @description interface for cloudformation event
 */
interface ICloudFormationEvent extends Record<string, any> {}

/**
 * @description interface for cloudwatch scheduled event
 */
interface IScheduledEvent extends Record<string, any> {}

/**
 * @description supported triggering events
 */
type TriggerEvent = IDynamoDBStreamEvent | ICloudFormationEvent | IScheduledEvent;

/**
 * @description class with methods to check incoming trigger event
 */
export class LambdaTriggers {
  /**
   * @description check if event is dynamodb stream event
   */
  static isDynamoDBStreamEvent(event: TriggerEvent) {
    return "Records" in event;
  }

  /**
   * @description check if event is cloudformation event
   */
  static isCfnEvent(event: TriggerEvent) {
    return "RequestType" in event && "ResourceType" in event;
  }

  /**
   * @description check if event is scheduled event
   */
  static isScheduledEvent(event: TriggerEvent) {
    return "detail-type" in event && event["detail-type"] == "Scheduled Event";
  }

  static isQMLambdaTestEvent(event: TriggerEvent) {
    return "detail-type" in event && event["detail-type"] == "QM Lambda Test Event";
  }
}
