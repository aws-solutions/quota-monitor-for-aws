# AWS Limit Monitor Solution
The AWS Limit Monitor Solution is a reference implementation that provides a foundation for monitoring AWS service limits. Customers can leverage the solution to monitor limits across services supported by Amazon Trusted Advisor; in multiple regions and multiple AWS accounts. The solution integrates with Amazon SNS and Slack to notify customers for service limits approaching thresholds.

## Getting Started
To get started with the AWS Limit Monitor Solution, please review the solution documentation. [Documentation](https://aws.amazon.com/solutions/implementations/limit-monitor/)

## Running unit tests for customization
* Clone the repository, then make the desired code changes
* Next, run unit tests to make sure added customization passes the tests
```
cd ./deployment
chmod +x ./run-unit-tests.sh  
./run-unit-tests.sh 
```

## Building distributable for customization
* Configure the bucket name of your target Amazon S3 distribution bucket
```
export TEMPLATE_OUTPUT_BUCKET=my-bucket-name # bucket where cfn template will reside
export DIST_OUTPUT_BUCKET=my-bucket-name # bucket where customized code will reside
export SOLUTION_NAME=aws-limit-monitor # Solution name
export SOLUTION_VERSION=v5.3.3 # Solution version
```
_Note:_ You would have to create 2 buckets, one with prefix 'my-bucket-name' and another regional bucket with prefix 'my-bucket-name-<aws_region>'; aws_region is where you are testing the customized solution. Also, the assets  in bucket should be publicly accessible

* Now build the distributable:
```
chmod +x ./build-s3-dist.sh 
./build-s3-dist.sh $DIST_OUTPUT_BUCKET $SOLUTION_NAME $SOLUTION_VERSION $TEMPLATE_OUTPUT_BUCKET 
```

* Deploy the distributable to an Amazon S3 bucket in your account. _Note:_ you must have the AWS Command Line Interface installed.

```
aws s3 cp ../source/lambda/services/limitreport/dist/ s3://my-bucket-name/limit-monitor/latest/ --recursive --exclude "*" --include "*.template" --acl bucket-owner-full-control --profile aws-cred-profile-name 
aws s3 cp ../source/lambda/services/limitreport/dist/ s3://my-bucket-name-<aws_region>/limit-monitor/latest/ --recursive --exclude "*" --include "*.zip" --acl bucket-owner-full-control --profile aws-cred-profile-name 
```

* Get the link of the limit-monitor.template uploaded to your Amazon S3 bucket.
* Deploy the AWS Limit Monitor Solution to your account by launching a new AWS CloudFormation stack using the link of the limit-monitor.template.

## File Structure
The AWS Limit Monitor Solution project consists of 4 microservices which is deployed to a serverless environment in AWS Lambda.

```
|-source/
  |-bin
  |-lambda
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
  |-test
  |-lib
  |-cdk.json
  |-jest.config.js
  |-package.json
  |-README.md
  |-tsconfig.json
```

<a name="collection-of-operational-metrics"></a>
# Collection of operational metrics

This solution collects anonymous operational metrics to help AWS improve the
quality of features of the solution. For more information, including how to disable
this capability, please see the [implementation guide](https://docs.aws.amazon.com/solutions/latest/limit-monitor/operational-metrics.html).

<a name="license"></a>
# License

See license [here](https://github.com/awslabs/machine-downtime-monitor-on-aws/blob/master/LICENSE.txt) 
