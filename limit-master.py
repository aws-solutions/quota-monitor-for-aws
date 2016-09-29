#!bin/bash/python
"""
Master lambda function
"""

from json import dumps
from boto3 import client

def lambda_handler(event, context):
    """
    Initial lambda handler which runs through each account ID
    """
    lambda_client = client('lambda', region_name=event['Region'])
    for account_id in event['AccountList']:
        print "do stuff here with AWS account "+str(account_id)+"\n"
        event['AccountId'] = account_id
        eventbytes = dumps(event)
        response = lambda_client.invoke(
            FunctionName=event['ChildLambda'],
            InvocationType='Event',
            ClientContext='string',
            Payload=eventbytes
        )
        print response
    return
