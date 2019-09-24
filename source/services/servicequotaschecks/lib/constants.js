const limits_ec2_Standard_OnDemand = {
    QuotaCode: 'L-1216C47A',
    ServiceCode: 'ec2'
};

const limits_ec2_G_OnDemand = {
    QuotaCode: 'L-DB2E81BA',
    ServiceCode: 'ec2'
};

const limits_ec2_P_OnDemand = {
    QuotaCode: 'L-417A185B',
    ServiceCode: 'ec2'
};

const limits_ec2_F_OnDemand = {
    QuotaCode: 'L-74FC7D96',
    ServiceCode: 'ec2'
};
const limits_ec2_X_OnDemand = {
    QuotaCode: 'L-7295265B',
    ServiceCode: 'ec2'
};


const regions = [
    "us-east-2", "us-east-1", "us-west-1", "us-west-2", "ap-south-1", "ap-northeast-1",
    "ap-northeast-2", "ap-southeast-1", "ap-southeast-2", "ca-central-1", "eu-central-1",
    "eu-west-1", "eu-west-2", "eu-west-3", "sa-east-1"
];

module.exports = {
    limits_ec2_Standard_OnDemand,
    limits_ec2_G_OnDemand,
    limits_ec2_P_OnDemand,
    limits_ec2_F_OnDemand,
    limits_ec2_X_OnDemand,
    regions
}