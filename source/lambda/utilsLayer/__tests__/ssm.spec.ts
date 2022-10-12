import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";
import {
  GetParameterCommand,
  ParameterType,
  SSMClient,
  SSMServiceException,
} from "@aws-sdk/client-ssm";

import { SSMHelper } from "../lib/ssm";

describe("SSM Helper", () => {
  const ssmMock = mockClient(SSMClient);
  let ssmHelper: SSMHelper;

  beforeEach(() => {
    ssmMock.reset();
    ssmHelper = new SSMHelper();
  });

  it("should get a parameter", async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "name",
        Value: "value",
      },
    });

    const response = await ssmHelper.getParameter("test", true);

    expect(response).toEqual(["value"]);
  });

  it("should get a parameter that is a STRING_LIST", async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Type: ParameterType.STRING_LIST,
        Name: "name",
        Value: "value1,value2,value3",
      },
    });

    const response = await ssmHelper.getParameter("test");

    expect(response).toEqual(["value1", "value2", "value3"]);
  });

  it("should throw an exception if GetParameterCommand fails", async () => {
    ssmMock.on(GetParameterCommand).rejectsOnce(
      new SSMServiceException({
        name: "GetParameterCommand",
        $fault: "server",
        $metadata: {},
      })
    );

    const testCase = async () => {
      await ssmHelper.getParameter("test");
    };

    await expect(testCase).rejects.toThrow(SSMServiceException);
  });
});
