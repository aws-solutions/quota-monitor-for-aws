#!bin/bash/python
'''
custom resource
'''

from uuid import uuid4
from json import dumps
import boto3
import requests

def lambda_handler(event, context):
    '''
    main handler
    '''
    print "Event JSON: \n" + dumps(event) # Dump Event Data for troubleshooting
    response_status = 'SUCCESS'

    # If the CloudFormation Stack is being deleted, delete the limits and roles created
    if event['RequestType'] == 'Delete':
        detachpolicyresponsero = ''
        detachpolicyresponsesupport = ''
        deletepolicyresponse = ''
        roledeleteresponse = ''
        try: # Remove IAM Role
            iam_client = boto3.client('iam')
            detachpolicyresponsero = iam_client.detach_role_policy(RoleName=event['ResourceProperties']['CheckRoleName'], PolicyArn='arn:aws:iam::aws:policy/ReadOnlyAccess')
            detachpolicyresponsesupport = iam_client.detach_role_policy(RoleName=event['ResourceProperties']['CheckRoleName'], PolicyArn='arn:aws:iam::aws:policy/AWSSupportAccess')
            deletepolicyresponse = iam_client.delete_role_policy(RoleName=event['ResourceProperties']['CheckRoleName'], PolicyName='CloudFormationDescribe')
            roledeleteresponse = iam_client.delete_role(RoleName=event['ResourceProperties']['CheckRoleName'])
        except:
            print detachpolicyresponsero
            print detachpolicyresponsesupport
            print deletepolicyresponse
            print roledeleteresponse

        send_response(event, context, response_status)

    # If the CloudFormation Stack is being updated, do nothing, exit with success
    if event['RequestType'] == 'Update':
        send_response(event, context, response_status)

    # If the Cloudformation Stack is being created, create the
    if event['RequestType'] == 'Create':
        rolecreateresponse = ''
        putpolicyresponsero = ''
        putpolicyresponsesupport = ''
        putpolicyresponsecfn = ''
        try: # Create IAM Role for Child Lambda to assume
            iam_client = boto3.client('iam')
            rolecreateresponse = iam_client.create_role(RoleName=event['ResourceProperties']['CheckRoleName'], AssumeRolePolicyDocument='{"Version": "2012-10-17","Statement": [{"Effect": "Allow","Principal": {"AWS": "'+event['ResourceProperties']['AccountNumber']+'"},"Action": "sts:AssumeRole"}]}')
            putpolicyresponsero = iam_client.attach_role_policy(RoleName=event['ResourceProperties']['CheckRoleName'], PolicyArn='arn:aws:iam::aws:policy/ReadOnlyAccess')
            putpolicyresponsesupport = iam_client.attach_role_policy(RoleName=event['ResourceProperties']['CheckRoleName'], PolicyArn='arn:aws:iam::aws:policy/AWSSupportAccess')
            putpolicyresponsecfn = iam_client.put_role_policy(RoleName=event['ResourceProperties']['CheckRoleName'], PolicyName='CloudFormationDescribe', PolicyDocument='{"Version": "2012-10-17","Statement": [{"Sid": "Stmt1455149881000","Effect": "Allow","Action": ["cloudformation:DescribeAccountLimits", "dynamodb:DescribeLimits"],"Resource": ["*"]}]}')
        except:
            # Dump Response Data for troubleshooting
            print rolecreateresponse
            print putpolicyresponsero
            print putpolicyresponsesupport
            print putpolicyresponsecfn

        #Send response to CloudFormation to signal success so stack continues.  If there is an error, direct user at CloudWatch Logs to investigate responses
        send_response(event, context, response_status)

def send_response(event, context, response_status):
    '''
    sends UUID
    '''
    #Generate UUID for deployment
    try:
        UUID = uuid4()
    except:
        UUID = 'Failed'

    #Build Response Body
    responseBody = {'Status': response_status,
                    'Reason': 'See the details in CloudWatch Log Stream: ' + context.log_stream_name,
                    'PhysicalResourceId': context.log_stream_name,
                    'StackId': event['StackId'],
                    'RequestId': event['RequestId'],
                    'LogicalResourceId': event['LogicalResourceId'],
                    'Data': {'UUID': str(UUID)}}
    print 'RESPONSE BODY:\n' + dumps(responseBody)

    try:
        #Put response to pre-signed URL
        req = requests.put(event['ResponseURL'], data=dumps(responseBody))
        if req.status_code != 200:
            print req.text
            raise Exception('Recieved non 200 response while sending response to CFN.')
        return str(event)
    except requests.exceptions.RequestException as e:
        print req.text
        print e
        raise

if __name__ == '__main__':
    lambda_handler('event', 'handler')
