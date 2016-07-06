#!bin/bash/python
# Copyright 2015-2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Amazon Software License (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at
#
#    http://aws.amazon.com/asl/
#
# or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and limitations under the License.

import boto3
import ConfigParser
import json

def lambda_handler(event, context):
	lambda_client = boto3.client('lambda', region_name=event['Region'])
	for id in event['AccountList']:
		print "do stuff here with AWS account "+str(id)+"\n"
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
