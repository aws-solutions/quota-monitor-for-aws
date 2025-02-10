// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/*
How to run this script:

If running as part of the Quota Monitor for AWS solution code:
1. Ensure you have AWS CLI installed and configured with appropriate credentials.
   Run 'aws configure' to set up your AWS environment.

2. Navigate to the root directory of the Quota Monitor for AWS solution.

3. Install dependencies (if not already done or if there have been updates):
   npm install

4. Compile and run the script:
   - Compile TypeScript to JavaScript:
     npx tsc scripts/listQuotasWithLimitOne.ts
   - Run the compiled JavaScript:
     node scripts/listQuotasWithLimitOne.js

If running as a standalone script:

Prerequisites:
1. Ensure you have AWS CLI installed and configured with appropriate credentials.
   Run 'aws configure' to set up your AWS environment.

2. Install Node.js and npm (Node Package Manager) on your system.
   Download from: https://nodejs.org/ if not already installed.

3. Install required dependencies:
   - Create a package.json file in the same directory as this script (if not exists):
     npm init -y
   - Install required packages:
     npm install @aws-sdk/client-service-quotas
   - Install dev dependencies for TypeScript:
     npm install --save-dev typescript @types/node

4. Compile and run the script:
   - Compile TypeScript to JavaScript:
     npx tsc script_name.ts
   - Run the compiled JavaScript:
     node script_name.js

Note: Replace 'script_name' with the actual name of this file.

*/

import { ServiceQuotasClient, paginateListServiceQuotas, paginateListServices } from "@aws-sdk/client-service-quotas";
import * as fs from "fs";
import * as path from "path";

const CONFIG = {
  MAX_RETRIES: 5,
  BATCH_SIZE: 5,
  BATCH_DELAY_MS: 1500,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryWithExponentialBackoff<T>(operation: () => Promise<T>, retryCount: number = 0): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (error.name === "TooManyRequestsException" && retryCount < CONFIG.MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
      console.log(`Rate limited. Retrying in ${delay}ms...`);
      await sleep(delay);
      return retryWithExponentialBackoff(operation, retryCount + 1);
    }
    throw error;
  }
}

async function getServiceCodes(client: ServiceQuotasClient): Promise<string[]> {
  const codes: string[] = [];
  const servicesPaginator = paginateListServices({ client }, {});
  for await (const page of servicesPaginator) {
    if (page.Services) {
      codes.push(
        ...page.Services.map((service) => service.ServiceCode).filter((code): code is string => code !== undefined)
      );
    }
  }
  return codes;
}

interface QuotaInfo {
  quotaCode: string;
  quotaName: string;
}

async function getQuotasForService(client: ServiceQuotasClient, serviceCode: string): Promise<QuotaInfo[]> {
  try {
    const quotaInfo: QuotaInfo[] = [];
    const quotasPaginator = paginateListServiceQuotas({ client }, { ServiceCode: serviceCode });
    for await (const page of quotasPaginator) {
      if (page.Quotas) {
        const filteredQuotas = page.Quotas.filter(
          (quota) =>
            quota.Value === 1 &&
            quota.UsageMetric?.MetricNamespace === "AWS/Usage" &&
            quota.QuotaCode !== undefined &&
            quota.QuotaName !== undefined
        );
        quotaInfo.push(
          ...filteredQuotas.map((quota) => ({
            quotaCode: quota.QuotaCode as string,
            quotaName: quota.QuotaName as string,
          }))
        );
      }
    }
    return quotaInfo;
  } catch (error: any) {
    if (error.name === "TooManyRequestsException") {
      throw error;
    }
    console.error(`Error processing service ${serviceCode}:`, error);
    return [];
  }
}

async function getAllServicesQuotasWithLimitOne() {
  const client = new ServiceQuotasClient({});
  const result: { [serviceCode: string]: QuotaInfo[] } = {};

  try {
    const serviceCodes = await retryWithExponentialBackoff(() => getServiceCodes(client));
    console.log(`Total services found: ${serviceCodes.length}`);

    for (let i = 0; i < serviceCodes.length; i += CONFIG.BATCH_SIZE) {
      const batch = serviceCodes.slice(i, i + CONFIG.BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (serviceCode) => {
          try {
            const quotaInfo = await retryWithExponentialBackoff(() => getQuotasForService(client, serviceCode));
            return { serviceCode, quotaInfo };
          } catch (error) {
            console.error(`Error processing service ${serviceCode}:`, error);
            return { serviceCode, quotaInfo: [] };
          }
        })
      );

      batchResults.forEach(({ serviceCode, quotaInfo }) => {
        if (quotaInfo.length > 0) {
          result[serviceCode] = quotaInfo;
        }
        console.log(`  Quotas with limit 1 and metrics for ${serviceCode}: ${quotaInfo.length}`);
      });

      await sleep(CONFIG.BATCH_DELAY_MS);
    }

    return result;
  } catch (error) {
    console.error("Error fetching quotas:", error);
    return result;
  }
}

async function main() {
  console.time("Execution Time");
  const quotasWithLimitOne = await getAllServicesQuotasWithLimitOne();

  const outputPath = path.join(__dirname, "quotasWithLimitOne.json");
  fs.writeFileSync(outputPath, JSON.stringify(quotasWithLimitOne, null, 2));

  const totalQuotas = Object.values(quotasWithLimitOne).reduce((sum, quotaInfo) => sum + quotaInfo.length, 0);
  console.log(`Total quotas with limit 1 and usage metrics across all services: ${totalQuotas}`);
  console.log(`Results have been written to: ${outputPath}`);
  console.timeEnd("Execution Time");
}

main();
