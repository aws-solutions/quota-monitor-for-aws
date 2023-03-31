import { IncorrectConfigurationException } from "../lib/error";
import {
  createChunksFromArray,
  validateAccountInput,
  validateOrgInput,
  arrayIncludesIgnoreCase,
  getNotificationMutingStatus,
  arrayIncludesAnyIgnoreCase,
  arrayDiff,
  stringEqualsIgnoreCase,
} from "../lib/exports";

describe("Exports", () => {
  describe("ValidateOrgInput", () => {});

  it("should validate correct org-ids", () => {
    const response = validateOrgInput(["o-0000000000"]);

    expect(response).toEqual(true);
  });

  it("should validate correct ou-ids", () => {
    const response = validateOrgInput(["ou-0000-00000000", "ou-0000-00000001"]);

    expect(response).toEqual(true);
  });

  it("should throw an IncorrectConfigurationException if org-id is invalid", () => {
    const testCase = () => {
      validateOrgInput(["bad-o-0001234"]);
    };

    expect(testCase).toThrow(IncorrectConfigurationException);
  });

  it("should throw an IncorrectConfigurationException if ou-id is invalid", () => {
    const testCase = () => {
      validateOrgInput(["bad-ou-0001234"]);
    };

    expect(testCase).toThrow(IncorrectConfigurationException);
  });

  it("should throw an IncorrectConfigurationException if multiple org-ids are received", () => {
    const testCase = () => {
      validateOrgInput(["o-0000000000", "o-0000000001"]);
    };

    expect(testCase).toThrow(IncorrectConfigurationException);
  });

  describe("Validate Account Input", () => {
    it("should validate correct account ids", () => {
      const testCase = () => {
        validateAccountInput(["000000000000"]);
      };

      expect(testCase).not.toThrow(IncorrectConfigurationException);
    });

    it("should throw an IncorrectConfigurationException if account id is invalid", () => {
      const testCase = () => {
        validateAccountInput(["badaccountid"]);
      };

      expect(testCase).toThrow(IncorrectConfigurationException);
    });
  });

  describe("CreateChunksFromArray", () => {
    it("should create chunks from an array", () => {
      const array = [{ item: 1 }, { item: 2 }, { item: 3 }];
      const chunkSize = 2;
      const expectedResponse = [[{ item: 1 }, { item: 2 }], [{ item: 3 }]];

      const response = createChunksFromArray(array, chunkSize);

      expect(response).toEqual(expectedResponse);
    });
  });

  describe("string compare case-insensitive", () => {
    it("should perform a case-insensitive comparison on strings", () => {
      expect(stringEqualsIgnoreCase("js", "java")).toEqual(false);
      expect(stringEqualsIgnoreCase("js", "js")).toEqual(true);
      expect(stringEqualsIgnoreCase("js", "JS")).toEqual(true);
      expect(stringEqualsIgnoreCase("js", "Js")).toEqual(true);
    });
  });

  describe("array contains case-insensitive", () => {
    it("should perform a case-insensitive contains on the array", () => {
      expect(arrayIncludesIgnoreCase(["js", "ts"], "java")).toEqual(false);
      expect(arrayIncludesIgnoreCase(["js", "ts"], "ts")).toEqual(true);
      expect(arrayIncludesIgnoreCase(["js", "ts"], "JS")).toEqual(true);
    });
  });

  describe("array contains elements of another array", () => {
    it("should perform a case-insensitive contains on the array for elements of another array", () => {
      expect(arrayIncludesAnyIgnoreCase(["js", "ts"], ["java"])).toEqual(false);
      expect(arrayIncludesAnyIgnoreCase(["js", "ts"], ["java", "ts"])).toEqual(
        true
      );
      expect(arrayIncludesAnyIgnoreCase(["js", "ts"], ["JS", "java"])).toEqual(
        true
      );
      expect(
        arrayIncludesAnyIgnoreCase(["js", "ts"], ["python", "java"])
      ).toEqual(false);
    });
  });

  describe("array difference", () => {
    it("should perform a case-insensitive contains on the array", () => {
      console.log(
        "diff",
        arrayDiff(["us-east-1"], ["us-east-1"])
      );
      expect(
        arrayDiff(["us-east-1", "us-west-1"], ["us-east-1", "us-west-1"])
      ).toEqual([]);
      expect(
        arrayDiff(["us-east-1", "us-west-1"], ["us-east-1-x", "us-west-1-s"])
      ).toEqual(["us-east-1", "us-west-1"]);
      expect(
        arrayDiff(["us-east-1", "us-west-1"], ["us-east-1-x", "us-west-1"])
      ).toEqual(["us-east-1"]);
    });
  });

  describe("check notification muting settings", () => {
    it("should check notification muting settings", () => {
      const testNotificationString = [
        "ec2:L-1216C47A",
        "ec2:Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances",
        "dynamodb",
        "logs:*",
        "geo:L-05EFD12D",
        "cloudwatch:", //wouldn't affect anything as it means nothing in cloudwatch is muted
        ":", //wouldn't affect anything
        ":ABC", //wouldn't affect anything
      ];
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "ec2",
          quotaName: "",
          quotaCode: "L-1216C47A",
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "EC2",
          quotaName: "",
          quotaCode: "L-1216C47A",
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "ec2",
          quotaName: "ABC",
          quotaCode: "L-1216C47A",
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "ec2",
          quotaName: "ABC",
          quotaCode: "L-1216C47A".toLowerCase(),
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "ec2",
          quotaName:
            "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances",
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "ec2",
          quotaName:
            "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances",
          quotaCode: "CODE123",
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
          service: "ec2",
          quotaName:
            "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances",
          quotaCode: "CODE123",
          resource: "resource1",
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
          service: "EC2",
          quotaName:
            "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances",
          quotaCode: "CODE123",
          resource: "resource1",
        })
      ).toEqual({
        muted: true,
        message:
          "ec2:L-1216C47A,Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "ec2",
          quotaName: "ABC",
          quotaCode: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(
          testNotificationString,{
          service: "ec2",
          quotaName: "ABC",
          quotaCode: "ABC",
          resource: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "dynamodb",
          quotaName: "ABC",
        })
      ).toEqual({
        muted: true,
        message:
          "dynamodb in the notification muting configuration; all quotas/limits in dynamodb muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "dynamodb",
          quotaName: "ABC",
          quotaCode: "ABC",
        })
      ).toEqual({
        muted: true,
        message:
          "dynamodb in the notification muting configuration; all quotas/limits in dynamodb muted",
      });
      expect(
        getNotificationMutingStatus(
          testNotificationString,{
          service: "dynamodb",
          quotaName: "ABC",
          quotaCode: "ABC",
          resource: "ABC",
        })
      ).toEqual({
        muted: true,
        message:
          "dynamodb in the notification muting configuration; all quotas/limits in dynamodb muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "logs",
          quotaName: "ABC",
        })
      ).toEqual({
        muted: true,
        message:
          "logs:* in the notification muting configuration, all quotas/limits in logs muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "Logs",
          quotaName: "ABC"
        })
      ).toEqual({
        muted: true,
        message:
          "logs:* in the notification muting configuration, all quotas/limits in logs muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "logs",
          quotaName: "ABC",
          quotaCode: "ABC",
        })
      ).toEqual({
        muted: true,
        message:
          "logs:* in the notification muting configuration, all quotas/limits in logs muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "logs",
          quotaName: "ABC",
          quotaCode: "ABC",
          resource: "ABC",
        })
      ).toEqual({
        muted: true,
        message:
          "logs:* in the notification muting configuration, all quotas/limits in logs muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "geo",
          quotaName: "",
          quotaCode: "L-05EFD12D",
        })
      ).toEqual({
        muted: true,
        message:
          "geo:L-05EFD12D in the notification muting configuration; those quotas/limits are muted",
      });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "geo",
          quotaName: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "geo",
          quotaName: "ABC",
          quotaCode: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
            service: "geo",
            quotaName: "ABC",
            quotaCode: "ABC",
            resource: "ABC",
          })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "lambda",
          quotaName: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
          service: "lambda",
          quotaName: "ABC",
          quotaCode: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
          service: "lambda",
          quotaName: "ABC",
          quotaCode: "ABC",
          resource: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
          service: "lambda",
          quotaName:
            "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances",
          quotaCode: "L-1216C47A",
          resource: "L-05EFD12D",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(testNotificationString, {
          service: "cloudwatch",
          quotaName: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
          service: "cloudwatch",
          quotaName: "ABC",
          quotaCode: "ABC",
        })
      ).toEqual({ muted: false });
      expect(
        getNotificationMutingStatus(
          testNotificationString, {
          service: "cloudwatch",
          quotaName: "ABC",
          quotaCode: "ABC",
          resource: "ABC",
        })
      ).toEqual({ muted: false });
    });
  });
});
