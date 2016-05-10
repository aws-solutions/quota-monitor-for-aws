#!/usr/bin/python
# poll the AWS Trusted Advisor for resource limits and posts an SNS message to a topic with AZ and resource information
# Import the SDK
import boto3
import uuid
import json
import ConfigParser
from boto3 import Session

ta_message = ''

def publishSNS(sns_message, sns_arn, rgn):

	# publish message to the master SNS topic
	sns_client = boto3.client('sns', region_name=rgn)

	print "Publishing message to SNS topic..."
	sns_client.publish(
		TargetArn=sns_arn,
		Message=sns_message
		)
	return;

def trustedAlert(warn_list):
	#make the message that we send to the SNS topic
	
	ta_message = ''
	
	for rs in warn_list:
		ta_message += '\n' + rs 
	ta_message += '\n'
	return ta_message;


def ec2Alert(limit, usage, rgn):

	# Complie the SNS message for EC2 alerts
	ec2_message = "\nEC2 Limits"
	ec2_message += "\nRegion: " + rgn
	ec2_message += '\n------------------------'
	ec2_message += "\nInstance Limit: "
	ec2_message += limit 
	ec2_message += "\nActual Usage: "
	ec2_message += str(usage)
	ec2_message += "\n"
	print ec2_message
	return ec2_message;



def rdsAlert(limit, usage, rgn):

	# Complie the SNS message for rds alerts
	rds_message = "RDS Limits"
	rds_message += "\nRegion: " + rgn
	rds_message += '\n------------------------'
	rds_message += "\nInstance Limit: "
	rds_message += limit 
	rds_message += "\nActual Usage: "
	rds_message += usage
	rds_message += "\n"
	print rds_message
	return rds_message;



def cloudformationAlert(limit, usage, rgn):

	# Complie the SNS message for cloudformation alerts
	cfn_message = "Cloudformation Limits"
	cfn_message += "\nRegion: " + rgn
	cfn_message += '\n------------------------'
	cfn_message += "\nStack Limit: "
	cfn_message += str(limit) 
	cfn_message += "\nActual Usage: "
	cfn_message += str(usage)
	cfn_message += "\n"
	print cfn_message
	return cfn_message;


def assume_role(accountID, rgn, event):
	
	ec2_message = ""
	cfn_message = ""
	rds_message = ""

	client = boto3.client('sts')
	response = client.assume_role(RoleArn='arn:aws:iam::'+accountID+':role/'+event['CheckRoleName'],
		RoleSessionName='AWSLimits')
	
	session = Session(		
		aws_access_key_id=response['Credentials']['AccessKeyId'], 
		aws_secret_access_key=response['Credentials']['SecretAccessKey'], 
		aws_session_token=response['Credentials']['SessionToken'], 
		region_name=rgn
	)

	##############
	# call trusted advisor for the limit checks
	##############
	support_client = session.client('support', region_name='us-east-1')
	response = support_client.describe_trusted_advisor_check_result(
		checkId='eW7HH0l7J9',
		language='en'
	)
	print "Contacting Trusted Advisor..."

	# parse the json and find flagged resources that are in warning mode
	flag_list = response['result']['flaggedResources']
	warn_list=[]
	for fr in flag_list:
		if fr['metadata'][5] != "Green":
			warn_list.append(fr['metadata'][2]+'\n'+'Region: '+fr['metadata'][0]+'\n------------------------'+'\nResource Limit: '+fr['metadata'][3]+'\n'+'Resource Usage: '+fr['metadata'][4]+'\n')
	if not warn_list:
		print "TA all green"
	else:
		global ta_message 
		ta_message = trustedAlert(warn_list)


	###############
	#call EC2 limits for rgn
	###############
	ec2_client = session.client('ec2', region_name=rgn)
        response = ec2_client.describe_account_attributes()
        attribute_list = response['AccountAttributes']
        for att in attribute_list:
                if att['AttributeName'] == 'max-instances':
                        limit_of_instances = att['AttributeValues'][0]['AttributeValue']
			print"num of limit: "+limit_of_instances

        response = ec2_client.describe_instances()
        reservation_list = response['Reservations']
	num_of_instances = 0
	for rsrv in reservation_list:
		instance_list = rsrv['Instances']
		num_of_instances += len(instance_list)

	print "num of instances: "+str(num_of_instances)

	#calculate if limit is within threshold
	if (float(num_of_instances) / float(limit_of_instances)  >= 0.8):			
		ec2_message = ec2Alert(limit_of_instances, num_of_instances, rgn)
		print ec2_message

	###############
	#cfn resource limit
	###############	
	cfn_client = session.client('cloudformation', region_name=rgn)
        stack_limit = cfn_client.describe_account_limits()
	if  stack_limit['AccountLimits'][0]['Name'] == 'StackLimit':
                limit_of_stacks = stack_limit['AccountLimits'][0]['Value']
	
        stacks = cfn_client.describe_stacks()
        stack_list = stacks['Stacks']
        num_of_stacks = len(stack_list)

	if (float(num_of_stacks) / float(limit_of_stacks) >= 0.8):			
		cfn_message = cloudformationAlert(limit_of_stacks, num_of_stacks, rgn)
		print cfn_message

	################
	#call RDS Limits for rgn
	################
	rds_client = session.client('rds', region_name=rgn)
        instance_limit = rds_client.describe_account_attributes()
        service_limit = instance_limit['AccountQuotas'][0]['Max']
        service_usage = instance_limit['AccountQuotas'][0]['Used']	
	
	if (float(service_usage) / float(service_limit) >= 0.8):			
		rds_message = rdsAlert(service_limit, service_usage, rgn)
		print rds_message


	print "Assumed session for "+accountID+" in region "+rgn
 
	rgn_message = ec2_message + cfn_message + rds_message

	return rgn_message;
	
def lambda_handler(event, context):

	accountID = event['AccountId']
	print 'accountID: ' + str(accountID)
	header_message = "AWS account "+str(accountID)+" has limits approaching their upper threshold. Please take action accordingly.\n"
	sns_message = "" 

	for rgn in event['RegionList']:
		sns_message += assume_role(str(accountID), rgn, event)
		
	if sns_message == "" and ta_message == "":
		print "All systems green!"
	else:
		publishSNS(header_message + ta_message + sns_message, event['SNSArn'], event['Region']);

	return accountID;	
