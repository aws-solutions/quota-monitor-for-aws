#!bin/bash/python

import boto3
import ConfigParser
import json

def lambda_handler(event, context):
	lambda_client = boto3.client('lambda', region_name=event['Region'])
	for id in event['AccountList']:
		print "do stuff here with AWS account "+id+"\n"
		event['AccountId'] = id
		eventbytes=json.dumps(event)
		response = lambda_client.invoke(
			FunctionName=event['ChildLambda'],
			InvocationType='Event',
			ClientContext='string',
			Payload=eventbytes
		)
		print response
	return;
