#!/usr/bin/python
"""
poll the AWS Trusted Advisor for resource limits
and posts an SNS message to a topic with AZ and resource information
"""

# Import the SDK
from urllib2 import urlopen
from urllib2 import Request
from datetime import datetime
from json import dumps
from uuid import uuid5
from uuid import NAMESPACE_DNS
from time import sleep
from boto3 import Session
from boto3 import client

import os
from pprint import pprint as pprint_cli
import json

TA_MESSAGE = ''

def u_decode(str):
    if str is not None:
        return str.encode('utf-8')
    else:
        return "None"

def extract_status(item):
    if u_decode(item['metadata'][0]) == 'us-east-1':
        return [u_decode(item['metadata'][2]),u_decode(item['metadata'][3]),u_decode(item['metadata'][4])]
    else:
        return None

def output_ta_check(lst):
    print "Trusted Advisors checks (service, limit, current)"
    pprint_cli(lst)
    return

def publish_sns(sns_message, sns_arn, rgn):
    """
    Publish message to the master SNS topic
    """

    sns_client = client('sns', region_name=rgn)

    print "Publishing message to SNS topic..."
    sns_client.publish(TargetArn=sns_arn, Message=sns_message)
    return

def trusted_alert(warn_list):
    """
    Compile the TrustedAdvisor message for TrustedAdvisor
    """

    ta_message = ''

    for ta_value in warn_list:
        ta_message += '\n' + ta_value
    ta_message += '\n'
    #print ta_message
    return ta_message

def ec2_alert(limit, usage, rgn):
    """
    Complie the SNS message for EC2 alerts
    """

    ec2_message = "\nEC2 Limits"
    ec2_message += "\nRegion: " + rgn
    ec2_message += '\n-----------------------'
    ec2_message += "\nInstance Limit: "
    ec2_message += limit
    ec2_message += "\nActual Usage: "
    ec2_message += str(usage)
    ec2_message += "\n"
    #print ec2_message
    return ec2_message

def cloudformation_alert(limit, usage, rgn):
    """
    Complie the SNS message for cloudformation alerts
    """

    cfn_message = "Cloudformation Limits"
    cfn_message += "\nRegion: " + rgn
    cfn_message += '\n-----------------------'
    cfn_message += "\nStack Limit: "
    cfn_message += str(limit)
    cfn_message += "\nActual Usage: "
    cfn_message += str(usage)
    cfn_message += "\n"
    #print cfn_message
    return cfn_message
def dynamodb_alert(warn_list):
    """
    Complie the SNS message for cloudformation alerts
    """

    dynamodb_message = ''

    for dynamo_value in warn_list:
        dynamodb_message += '\n' + dynamo_value
    dynamodb_message += '\n'
    #print dynamodb_message
    return dynamodb_message

def assume_role(account_id, rgn, event, alerts):
    """
    Assumes the specified role in account and runs checks limits
    from Trusted Advisor, EC2, CloudFormation, and DynamoDB
    """

    ec2_message = ""
    cfn_message = ""
    dynamodb_message = ""

    # beginning the assume role process for account
    sts_client = client('sts')
    response = sts_client.assume_role(
        RoleArn='arn:aws:iam::'+account_id+':role/'+event['CheckRoleName'],
        RoleSessionName='AWSLimits'
    )
    # storing STS credentials
    session = Session(
        aws_access_key_id=response['Credentials']['AccessKeyId'],
        aws_secret_access_key=response['Credentials']['SecretAccessKey'],
        aws_session_token=response['Credentials']['SessionToken'],
        region_name=rgn
    )
    print "Assumed session for "+account_id+" in region "+rgn+". Beginning checks..."
    ##############
    # call trusted advisor for the limit checks
    ##############
    # we only want to run trusted advisor in us-east-1
    if rgn == 'us-east-1':
        support_client = session.client('support', region_name='us-east-1')

        # requesting a new check for TA
        support_client.refresh_trusted_advisor_check(
            checkId='eW7HH0l7J9'
        )

        # now loop through till the check is complete
        done = False
        while not done:
            print "Waiting for updated TA results..."
            # calling Trusted Advisor to see if check is complete
            refresh_response = support_client.describe_trusted_advisor_check_refresh_statuses(
                checkIds=[
                    'eW7HH0l7J9',
                ]
            )
            # checking is the request is complete
            if refresh_response['statuses'][0]['status'] == 'success':
                done = True
            # so we don't hammer the API
            sleep(1)
        # getting results from TA check
        response = support_client.describe_trusted_advisor_check_result(
            checkId='eW7HH0l7J9',
            language='en'
        )
        print "Contacting Trusted Advisor..."

        # parse the json and find flagged resources that are in warning mode
        flag_list = response['result']['flaggedResources']
        warn_list = []
        status_list = []
        for flag_item in flag_list:
            ### Solution for dash validation in case it's a default region
            for x in range(0, 5):
                if flag_item['metadata'][x] == "-":
                    flag_item['metadata'][x] = "global"
            if flag_item['metadata'][5] != "Green":
                # if item is not Green, we add it to the warning list
                warn_list.append(flag_item['metadata'][1]+' - '+flag_item['metadata'][2]+'\n'+'Region: '+ \
                    flag_item['metadata'][0]+ '\n-----------------------'+ \
                    '\nResource Limit: ' + flag_item['metadata'][3]+'\n'+ \
                    'Resource Usage: '+flag_item['metadata'][4]+'\n')
                # flag_item['metadata'][0] is the region "us-west-2"
                # flag_item['metadata'][1] is the service "VPC"
                if flag_item['metadata'][1] in alerts[flag_item['metadata'][0]]:
                    alerts[flag_item['metadata'][0]][flag_item['metadata'][1]] += 1
                else:
                    alerts[flag_item['metadata'][0]][flag_item['metadata'][1]] = 1
            if extract_status(flag_item) is not None:
                status_list.append(extract_status(flag_item))
        if not warn_list:
            print "TA all green"
        else:
            global TA_MESSAGE
            TA_MESSAGE = trusted_alert(warn_list)
        output_ta_check(status_list)

    ###############
    #call EC2 limits for rgn
    ###############
    ec2_client = session.client('ec2', region_name=rgn)
    response = ec2_client.describe_account_attributes()
    attribute_list = response['AccountAttributes']
    for att in attribute_list:
        if att['AttributeName'] == 'max-instances':
            limit_of_instances = att['AttributeValues'][0]['AttributeValue']
    ec2_done = False
    ec2_aggregated_results = []
    ec2_response = ec2_client.describe_instances(
        Filters=[
            {
                'Name': 'instance-state-name',
                'Values': ['pending', 'running']
            }
        ]
    )
    # grabbing additional instances if next_token is sent

    while not ec2_done:
        ec2_aggregated_results = ec2_aggregated_results+ec2_response['Reservations']
        next_token = ec2_response.get("NextToken", None)
        if next_token is None:
            ec2_done = True
        else:
            ec2_response = ec2_client.describe_instances(
                Filters=[
                    {
                        'Name': 'instance-state-name',
                        'Values': ['pending', 'running']
                    }
                ],
                NextToken=next_token
            )
    num_of_instances = 0
    for rsrv in ec2_aggregated_results:
        instance_list = rsrv['Instances']
        num_of_instances += len(instance_list)
    # calculate if limit is within threshold
    if (float(num_of_instances) / float(limit_of_instances)) >= 0.8:
        ec2_message = ec2_alert(limit_of_instances, num_of_instances, rgn)
        if 'EC2' in alerts[rgn]:
            alerts[rgn]['EC2'] += 1
        else:
            alerts[rgn]['EC2'] = 1
        print ec2_message

    ###############
    #cfn resource limit
    ###############
    cfn_client = session.client('cloudformation', region_name=rgn)
    # grabbing all stacks except for DELETE_COMPLETE
    cfn_response = cfn_client.list_stacks(
        StackStatusFilter=[
            'CREATE_IN_PROGRESS', 'CREATE_FAILED', 'CREATE_COMPLETE',
            'ROLLBACK_IN_PROGRESS', 'ROLLBACK_FAILED', 'ROLLBACK_COMPLETE',
            'DELETE_IN_PROGRESS', 'DELETE_FAILED', 'UPDATE_IN_PROGRESS',
            'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', 'UPDATE_COMPLETE',
            'UPDATE_ROLLBACK_IN_PROGRESS', 'UPDATE_ROLLBACK_FAILED',
            'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
            'UPDATE_ROLLBACK_COMPLETE'
        ]
    )
    cfn_done = False
    cfn_aggregated_results = []
    while not cfn_done:
        cfn_aggregated_results = cfn_aggregated_results+cfn_response['StackSummaries']
        next_token = cfn_response.get("NextToken", None)
        if next_token is None:
            cfn_done = True
        else:
            cfn_response = cfn_client.list_stacks(
                StackStatusFilter=[
                    'CREATE_IN_PROGRESS', 'CREATE_FAILED', 'CREATE_COMPLETE',
                    'ROLLBACK_IN_PROGRESS', 'ROLLBACK_FAILED', 'ROLLBACK_COMPLETE',
                    'DELETE_IN_PROGRESS', 'DELETE_FAILED', 'UPDATE_IN_PROGRESS',
                    'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', 'UPDATE_COMPLETE',
                    'UPDATE_ROLLBACK_IN_PROGRESS', 'UPDATE_ROLLBACK_FAILED',
                    'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
                    'UPDATE_ROLLBACK_COMPLETE'
                ],
                NextToken=next_token
            )

    num_of_stacks = len(cfn_aggregated_results)
    # grabbing current account limits
    stack_limit = cfn_client.describe_account_limits()
    if  stack_limit['AccountLimits'][0]['Name'] == 'StackLimit':
        limit_of_stacks = stack_limit['AccountLimits'][0]['Value']
    # checking to see if user is approaching limits
    if (float(num_of_stacks) / float(limit_of_stacks)) >= 0.8:
        cfn_message = cloudformation_alert(limit_of_stacks, num_of_stacks, rgn)
        if 'cfn' in alerts[rgn]:
            alerts[rgn] += 1
        else:
            alerts[rgn]['cfn'] = 1
        print cfn_message

    ################
    #call DynamoDB Limits for rgn
    ################
    dynamo_client = session.client('dynamodb', region_name=rgn)
    # getting current limits
    # currently ap-northeast-2 fails on the describe-limits call.  TT 0082746946
    # has been filed. Until then, handle gracefully if it fails.
    try:
        dynamo_response = dynamo_client.describe_limits()
        # creating account limit vars
        max_table_write = dynamo_response['TableMaxWriteCapacityUnits']
        max_table_read = dynamo_response['TableMaxReadCapacityUnits']
        max_account_write = dynamo_response['AccountMaxWriteCapacityUnits']
        max_account_read = dynamo_response['AccountMaxReadCapacityUnits']
        table_iterator = dynamo_client.list_tables()
        dynamo_done = False
        dynamo_aggregated_results = []
        while not dynamo_done:
            dynamo_aggregated_results = dynamo_aggregated_results + table_iterator['TableNames']
            next_token = table_iterator.get("LastEvaluatedTableName", None)
            if next_token is None:
                dynamo_done = True
            else:
                table_iterator = dynamo_client.list_tables(ExclusiveStartTableName=next_token)

        total_rcu = 0
        total_wcu = 0
        # this will hold our warnings
        warn_list = []
        dynamo_counter = 0
        # iterating through all the user's tables
        for table_name in dynamo_aggregated_results:
            table = dynamo_client.describe_table(TableName=table_name)
            table_throughput = table['Table']['ProvisionedThroughput']
            # checking if RCU capacity for table is over account limit
            total_rcu += table_throughput['ReadCapacityUnits']
            if (float(table_throughput['ReadCapacityUnits'])/float(max_table_read)) >= 0.8:
                warn_list.append("Table - "+table['Table']['TableName']+'\n'+'RCUs\nRegion: '+rgn+ \
                    '\n-----------------------'+'\nResource Limit: '+str(max_table_read)+'\n'+ \
                    'Resource Usage: '+str(table_throughput['ReadCapacityUnits'])+'\n')
            # checking if WCU capacity for table is over account limit
                dynamo_counter += 1
            total_wcu += table_throughput['WriteCapacityUnits']
            if (float(table_throughput['WriteCapacityUnits'])/float(max_table_write)) >= 0.8:
                warn_list.append("Table - "+table['Table']['TableName']+'\n'+'WCUs\nRegion: '+rgn+ \
                    '\n-----------------------'+'\nResource Limit: '+str(max_table_write)+'\n'+ \
                    'Resource Usage: '+str(table_throughput['WriteCapacityUnits'])+'\n')
                dynamo_counter += 1

            try:
                # checking for any indexes that might be associated with the table
                for gsi in table['Table']['GlobalSecondaryIndexes']:
                    gsi_throughput = gsi['ProvisionedThroughput']
                    total_rcu += gsi_throughput['ReadCapacityUnits']
                    # checking if RCU capacity for table is over account limit
                    if (float(gsi_throughput['ReadCapacityUnits'])/float(max_table_read)) >= 0.8:
                        warn_list.append("Table - "+table['Table']['TableName']+":\nIndex - "+ \
                            gsi["IndexName"]+'\n'+'RCUs\nRegion: '+rgn+ \
                            '\n-----------------------'+ '\nResource Limit: '+ \
                            str(max_table_read)+'\n'+'Resource Usage: '+ \
                            str(gsi_throughput['ReadCapacityUnits'])+'\n')
                        dynamo_counter += 1

                    total_wcu += gsi_throughput['WriteCapacityUnits']
                    # checking if RCU capacity for table is over account limit
                    if (float(gsi_throughput['WriteCapacityUnits'])/float(max_table_write)) >= 0.8:
                        warn_list.append("Table - "+table['Table']['TableName']+":\nIndex - "+ \
                            gsi["IndexName"]+'\n'+'WCUs\nRegion: '+rgn+ \
                            '\n-----------------------'+'\nResource Limit: '+ \
                            str(max_table_write)+'\n'+'Resource Usage: '+ \
                            str(gsi_throughput['WriteCapacityUnits'])+'\n')
                        dynamo_counter += 1
            except:
                pass
        # need to check if read capacity is 80% or greater of account limit
        if (float(total_rcu) / float(max_account_read)) >= 0.8:
            warn_list.append("RCU"+'\n'+'Region: '+rgn+'\n-----------------------'+ \
                '\nResource Limit: '+str(max_account_read)+'\n'+'Resource Usage: '+ \
                str(total_rcu)+'\n')
            dynamo_counter += 1

        # need to check if read capacity is 80% or greater of account limit
        if (float(total_wcu) / float(max_account_write)) >= 0.8:
            warn_list.append("WCU"+'\n'+'Region: '+rgn+'\n-----------------------'+ \
                '\nResource Limit: '+ str(max_account_write)+'\n'+'Resource Usage: '+ \
                str(total_wcu)+'\n')
            dynamo_counter += 1

        # updating dynamo number
        if dynamo_counter > 0:
            alerts[rgn]['dynamodb'] = dynamo_counter
        if len(warn_list) > 0:
            dynamodb_message = dynamodb_alert(warn_list)
    except:
        print "Unable to describe DynamoDB limits in "+rgn

    # ALL CHECKS COMPLETE, returning information to user
    rgn_message = ec2_message + cfn_message + dynamodb_message
    if rgn_message != '':
        print rgn_message

    print "Total number of limits near breach:\n" + dumps(alerts)
    print "Checks complete for "+account_id+" in region "+rgn+".\n-----------------------"

    response = {'rgn_message':rgn_message, 'alerts':alerts, 'ta_status': str(status_list)}
    return response

def send_report(total_alerts, event):
    """
    Send anonymous reporting data to AWS
    Anonymous UUID + Total Limits in Alarm
    """

    time_now = datetime.utcnow().isoformat()
    timestamp = str(time_now)

    name = str(event['UUID']) + str(event['AccountId'])
    subuuid = uuid5(NAMESPACE_DNS, name)

    post_dict = {}
    post_dict['Data'] = {}
    post_dict['Data']['Alerts'] = total_alerts
    post_dict['Data']['SubUUID'] = str(subuuid)
    post_dict['TimeStamp'] = timestamp
    post_dict['Solution'] = 'SO0005'
    post_dict['UUID'] = event['UUID']

    url = 'https://5as186uhg7.execute-api.us-east-1.amazonaws.com/prod/generic'
    data = dumps(post_dict)
    print data
    headers = {'content-type': 'application/json'}
    response = Request(url, data, headers)
    rsp = urlopen(response)
    content = rsp.read()
    rspcode = rsp.getcode()
    print "Response Code:", rspcode
    print "Response Content:", content

def lambda_handler(event, context):
    """
    Handles the initial firing and invokes the
    assume_role() for each region
    """
    print("Received event: " + json.dumps(event, indent=2))

    account_id = event['AccountId']
    print 'accountID: ' + str(account_id)
    header_message = "AWS account "+str(account_id)
    header_message += " has limits approaching their upper threshold."
    header_message += "Please take action accordingly.\n"
    sns_message = ""
    ta_status = ""
    # this is the alerts object that will get passed through
    # each iteration
    alerts = {}
    # creating list of regions to check limits against later
    ec2_client = client('ec2')

    ########## this has been replaced by the env variable region_list #########
    # grabbing all regions
    # region_list = ec2_client.describe_regions()

    # initialize alerts
    # check only applicable regions
    if 'regions' in os.environ.keys():
        REGION_LIST=os.environ['regions'].replace(" ", "").split(",")
    else:
        REGION_LIST=['us-east-1']

    for rgn in REGION_LIST:
        alerts[rgn] = {}
    # adding global key for IAM
    alerts["global"] = {}
    # iterating through each
    for rgn in REGION_LIST:
        response = assume_role(str(account_id), rgn, event, alerts)
        sns_message += response['rgn_message']
        ta_status += response['ta_status']
        # updating local alerts to be passed and updated by next iteration
        alerts = response['alerts']
    if sns_message == "" and TA_MESSAGE == "":
        print "All systems green!"
    else:
        publish_sns(header_message + TA_MESSAGE + sns_message , event['SNSArn'], event['Region'])
        if event['SendAnonymousData'] == 'Yes':
            send_report(alerts, event)

    return account_id
