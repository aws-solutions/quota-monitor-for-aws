# AWS Limit Monitor Solution
The AWS Limit Monitor Solution is a reference implementation that provides a foundation for monitoring AWS service limits. Customers can leverage the solution to monitor limits across services supported by Amazon Trusted Advisor; in multiple regions and multiple AWS accounts. The solution integrates with Amazon SNS and Slack to notify customers for service limits approaching thresholds.

## Getting Started
To get started with the AWS Limit Monitor Solution, please review the solution documentation. https://aws.amazon.com/answers/account-management/limit-monitor/

## Running unit tests for customization
* Clone the repository, then make the desired code changes
* Next, run unit tests to make sure added customization passes the tests
```
cd ./deployment
chmod +x ./run-unit-tests.sh  \n
./run-unit-tests.sh \n
```

## Building distributable for customization
* Configure the bucket name of your target Amazon S3 distribution bucket
```
export TEMPLATE_OUTPUT_BUCKET=my-bucket-name # bucket where cfn template will reside
export DIST_OUTPUT_BUCKET=my-bucket-name # bucket where customized code will reside
```
_Note:_ You would have to create 2 buckets, one with prefix 'my-bucket-name' and another regional bucket with prefix 'my-bucket-name-<aws_region>'; aws_region is where you are testing the customized solution. Also, the assets  in bucket should be publicly accessible

* Now build the distributable:
```
chmod +x ./build-s3-dist.sh \n
./build-s3-dist.sh $DIST_OUTPUT_BUCKET $TEMPLATE_OUTPUT_BUCKET \n
```

* Deploy the distributable to an Amazon S3 bucket in your account. _Note:_ you must have the AWS Command Line Interface installed.

```
aws s3 cp ./dist/ s3://my-bucket-name/limit-monitor/latest/ --recursive --exclude "*" --include "*.template" --acl bucket-owner-full-control --profile aws-cred-profile-name \n
aws s3 cp ./dist/ s3://my-bucket-name-<aws_region>/limit-monitor/latest/ --recursive --exclude "*" --include "*.zip" --acl bucket-owner-full-control --profile aws-cred-profile-name \n
```

* Get the link of the limit-monitor.template uploaded to your Amazon S3 bucket.
* Deploy the AWS Limit Monitor Solution to your account by launching a new AWS CloudFormation stack using the link of the limit-monitor.template.

## File Structure
The AWS Limit Monitor Solution project consists of 4 microservices which is deployed to a serverless environment in AWS Lambda.

```
|-source/
  |-services/
    |-customhelper/ [ microservice for handling cloudformation custom resources ]
      |-lib/
        |-[ service module unit tests ]
        |-index.js [main module]
        |-logger.js [logger module]
        |-metrics-helper.js [ helper module for sending anonymous metrics ]
      |-index.js [ injection point for microservice ]
      |-package.json
    |-limitreport/ [ microservice for summarizing service limits ]
      |-lib/
        |-[ service module unit tests ]
        |-index.js [main module]
        |-limit-report.js [message handling module]
        |-logger.js [logger module]
        |-metrics-helper.js [ helper module for sending anonymous metrics ]
      |-index.js [ injection point for microservice ]
      |-package.json
    |-slacknotify/ [ microservice for sending slack notifications ]
      |-lib/
        |-[ service module unit tests ]
        |-index.js [main module]
        |-logger.js [logger module]
        |-slack-notify.js [slack messaging module]  
      |-index.js [ injection point for microservice ]
      |-package.json
    |-tarefresh/ [ microservice for refreshing TA checks ]
      |-lib/
        |-[ service module unit tests ]
        |-index.js [main module]
        |-logger.js [logger module]
        |-ta-refresh.js [TA checks module]  
      |-index.js [ injection point for microservice ]
      |-package.json   
```
***

#### v5.0 changes

```bash
* Hub and Spoke model to support multiple accounts
* Service level granularity with Trusted Advisor service limit checks
* DynamoDB for storing current limit usage and details
* Slack workspace integration for notifications
```

#### v5.1.1 changes

```bash
* SlackHookURLKey and SlackChannelKey parameters added to primary template for slack workspace
* Slack ssm parameters will be created with the provided keys ONLY if they do not exist already
* Regex pattern matching for account id, allowing only 12 digit, coma separated and double quoted ids
* Fix in concurrent CW Event Bus put permission (PR #18)
```

#### v5.2 changes

```bash
* Added Trusted Advisor service limit checks for Route53 and DynamoDB
* Fixed mapping between DynamoDB attributes and TA keys 
* Fixed incorrect attribute mappings
```

***
***

Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
You may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
