#!/usr/bin/python
"""
poll the AWS Trusted Advisor for resource limits
and posts an SNS message to a topic with AZ and resource information
"""

# Import the SDK
from boto3 import Session
from boto3 import client
from os import environ

def initiate_ta_refresh(account_id):
    """
    Assumes the specified role in account and initiates the TA refresh
    """
    # beginning the assume role process for account
    sts_client = client('sts')
    response = sts_client.assume_role(
        RoleArn='arn:aws:iam::'+account_id+':role/'+environ['CheckRoleName'],
        RoleSessionName='AWSLimits'
    )
    # storing STS credentials
    session = Session(
        aws_access_key_id=response['Credentials']['AccessKeyId'],
        aws_secret_access_key=response['Credentials']['SecretAccessKey'],
        aws_session_token=response['Credentials']['SessionToken'],
        region_name='us-east-1'
    )
    print "Assumed session for "+account_id+". Initiating TA Report refresh..."

    # now we create a TA client
    support_client = session.client('support', region_name='us-east-1')

    # requesting a new check for TA
    support_client.refresh_trusted_advisor_check(
        checkId='eW7HH0l7J9'
    )
    print "Initiated TA Report refresh"
    # create our CWE which will kick off the other lambda to retrieve
    # the report and check limits
    create_cwe(session, str(account_id))
def create_cwe(session, account_id):
    """
    Creating the CloudWatch Event that will kick off the secondary lambda
    which checks if the TA refresh is complete, and if so, calculate the limits
    """

    # creating the CWE rule
    cwe_client = session.client('events', region_name=environ['Region'])
    put_rule_response = cwe_client.put_rule(
        Name='LimitCheck-Secondary-'+account_id,
        ScheduleExpression='rate(5 minutes)',
        State='ENABLED',
        Description='This rule fires off the secondary lambda which will check if the TA refresh is complete, and if so check the limits in the account'
    )

    ruleArn = put_rule_response['RuleArn']
    # now we add the lambda target to the rule
    cwe_client.put_targets(
        Rule='LimitCheck-Secondary-'+account_id,
        Targets=[
            {
                'Id': 'LimitCheck-Secondary-'+account_id,
                'Arn': environ['RetrieveResultsLambda'],
                'Input': '{"AccountId":'+account_id+'}'
            },
        ]
    )

    # need to add invoke permission to lambda from CWE
    lambda_client = session.client('lambda', region_name=environ['Region'])
    lambda_client.add_permission(
        FunctionName=environ['RetrieveResultsLambda'],
        StatementId='GivingCWEPermission'+account_id,
        Action='lambda:InvokeFunction',
        Principal='events.amazonaws.com',
        SourceArn=ruleArn
    )
    print "Created Cloudwatch Rule"


def lambda_handler(event, context):
    """
    Kicks off the TA refresh and creates CloudWatch Event
    to fire off secondary lambda which will retrieve results
    """

    account_id = event['AccountId']
    print 'accountID: ' + str(account_id)
    
    # begin TA refresh
    initiate_ta_refresh(account_id)

    return account_id
