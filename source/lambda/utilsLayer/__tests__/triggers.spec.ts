import { LambdaTriggers } from "../lib/triggers";

describe("Lambda Triggers", () => {
  describe("DynamoDBStreamEvent", () => {
    it('hould return true if the event contains a field called "Records"', () => {
      const response = LambdaTriggers.isDynamoDBStreamEvent({ Records: [] });

      expect(response).toEqual(true);
    });

    it('should return false if the event does not contain a field called "Records"', () => {
      const response = LambdaTriggers.isDynamoDBStreamEvent({ NotRecords: [] });

      expect(response).toEqual(false);
    });
  });

  describe("CfnEvent", () => {
    it('hould return true if the event contains a field called "RequestType" and "ResourceType"', () => {
      const response = LambdaTriggers.isCfnEvent({
        RequestType: "request",
        ResourceType: "resource",
      });

      expect(response).toEqual(true);
    });

    it('should return false if the event does not contain a field called "RequestType" and "ResourceType"', () => {
      const response = LambdaTriggers.isCfnEvent({
        MissingFields: "",
      });

      expect(response).toEqual(false);
    });
  });

  describe("ScheduledEvent", () => {
    it('hould return true if the event contains a field called "detail-type" that is equal to "Scheduled Event"', () => {
      const response = LambdaTriggers.isScheduledEvent({
        "detail-type": "Scheduled Event",
      });

      expect(response).toEqual(true);
    });

    it('should return false if the event contains a field called "detail-type" that is not equal to "Scheduled Event"', () => {
      const response = LambdaTriggers.isScheduledEvent({
        "detail-type": "Non-Scheduled Event",
      });

      expect(response).toEqual(false);
    });

    it('should return false if the event does not contain a field called "detail-type"', () => {
      const response = LambdaTriggers.isScheduledEvent({
        MissingFields: "Scheduled Event",
      });

      expect(response).toEqual(false);
    });
  });
});
