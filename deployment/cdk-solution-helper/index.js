// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Imports
const fs = require("fs");

// Paths
const global_s3_assets = "./global-s3-assets";

console.log(`Current directory: ${process.cwd()}`);

// For each template in global_s3_assets ...
fs.readdirSync(global_s3_assets).forEach((file) => {
  // Import and parse template file
  const raw_template = fs.readFileSync(`${global_s3_assets}/${file}`);
  let template = JSON.parse(raw_template);

  // Clean-up Lambda function code dependencies
  const resources = template.Resources ? template.Resources : {};
  const lambdaFunctions = Object.keys(resources).filter(function (key) {
    return (
      resources[key].Type === "AWS::Lambda::Function" ||
      resources[key].Type === "AWS::Lambda::LayerVersion"
    );
  });
  lambdaFunctions.forEach(function (f) {
    const fn = template.Resources[f];

    const assetProperty =
      fn.Type === "AWS::Lambda::Function"
        ? fn.Properties.Code
        : fn.Properties.Content;

    if (assetProperty.hasOwnProperty("S3Bucket")) {
      // Set the S3 key reference
      let artifactHash = Object.assign(assetProperty.S3Key);
      assetProperty.S3Key = `%%SOLUTION_NAME%%/%%VERSION%%/asset${artifactHash}`;
      // Set the S3 bucket reference
      assetProperty.S3Bucket = {
        "Fn::Sub": "%%LAMBDA_BUCKET%%-${AWS::Region}",
      };
    }
  });

  // Clean-up parameters section
  const parameters = template.Parameters ? template.Parameters : {};
  const assetParameters = Object.keys(parameters).filter(function (key) {
    return key.includes("AssetParameters") || key.includes("BootstrapVersion");
  });
  assetParameters.forEach((a) => {
    template.Parameters[a] = undefined;
  });

  // Clen-up bootstrap version rules
  template.Rules = undefined;

  // Output modified template file
  const output_template = JSON.stringify(template, null, 2);
  fs.writeFileSync(`${global_s3_assets}/${file}`, output_template);
});
