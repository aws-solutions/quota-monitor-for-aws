#!/usr/bin/python
"""
Kick off the TA report refresh and setup the CloudWatch Event that will poll
every 5 minutes to see if refresh is complete.  If the account doesn't have
AWS Premium Support, then invoke the RetrieveResults lambda manually
"""

# Import the SDK
from boto3 import Session
from boto3 import client
from os import environ
import botocore
from json import dumps

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
    try:
        support_client.refresh_trusted_advisor_check(
            checkId='eW7HH0l7J9'
        )
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == "SubscriptionRequiredException":
            print "This account doesn't have AWS Premium Support and can't access the support API.  Continuing with other limit checks"
            payload={}
            payload['AccountId'] = account_id
            payload['Skip_TA'] = True
            payloadbytes = dumps(payload)
            # now we invoke the limit check lambda for the remaining services
            lambda_client = client('lambda', region_name=environ['Region'])
            lambda_client.invoke(
                FunctionName=environ['RetrieveResultsLambda'],
                InvocationType='Event',
                Payload=payloadbytes
            )
            # no need to continue and create the cloudwatch event since TA check will never complete
            # since it was never started
            return account_id
        else:
            print(e)
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
                'Input': '{"AccountId":'+account_id+', "Skip_TA":"False"}'
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
