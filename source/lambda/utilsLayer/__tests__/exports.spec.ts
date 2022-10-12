import { IncorrectConfigurationException } from "../lib/error";
import {
  createChunksFromArray,
  validateAccountInput,
  validateOrgInput,
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
});
