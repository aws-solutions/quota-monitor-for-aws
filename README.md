# LimitMonitor

We have created a CloudFormation template that you can run to start receiving alerts with just a couple of clicks.  You can configure the LimitMonitor to alert you as you are approaching limits, all via Scheduled Lambda functions, so there is no additional infrastructure to monitor.  

## Basic Configuration

You will need to download the Lambda functions which are contained in a zip file, and place them in an S3 bucket in your account.
The template will create three Lambda functions, a master function which will spawn a child function for each account it is checking, along with a configuration Lambda which will be used when launching the CloudFormation template to complete some final setup steps.

The CloudFormation template will create roles with the required permissions to check your limits, an SNS topic for which you can provide an e-mail to send the alerts to, all of the Lambda functions, and schedule the Master Lambda for you to run once a day.  You will need to provide a list of accounts along with the regions you wish to check.  You will also need to specify where in S3 you have saved the Lambda function package.

If you are checking limits in a single account when the CloudFormation has completed running you will begin receiving alerts each day with any limits approaching the maximum.  If you are checking multiple accounts you will need to create an IAM role in the secondary accounts to trust the primary account to run the necessary describe calls across accounts using the Security Token Service.  You can check the Outputs page of the CloudFormation Stack where we have generated a set of CLI commands you can use in those accounts to create those roles, or you can create them yourself in the console.

You can test the function is working by running the limit check manually.  If you navigate to CloudWatch Events in the console, you will see a rule named “Limits” created by the CloudFormation Template. 

When looking at the rule you will see the “Constant (JSON text)” field which we use to pass configuration information to the Lambda function.  If you copy this information and then open your Master Lambda Function in the console you can use this to run a test by configuring a test event under Actions for the function.  You can also edit the information in the CloudWatch Events Target to add/remove accounts as your needs change without having to relaunch the CloudFormation template.

When you have configured your test event you can test the Master Lambda function which will run the check for each account and publish results to the SNS Topic.

## License

This sample application is distributed under the
[Amazon Software License](https://aws.amazon.com/asl/).

