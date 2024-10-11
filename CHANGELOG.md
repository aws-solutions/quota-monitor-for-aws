# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.2.11] - 2024-10-10

### Changed
- Add batching to getQuotasWithUtilizationMetrics function
- Refactor _putMonitoredQuotas function to use batch writes
- Changed the memory allocation for the QMListManager Lambda function to 256 MB
- Added better error handling for CloudWatch ValidationErrors, with attempt to identify problematic quotas

### Fixed
- GitHub Issues [#200](https://github.com/aws-solutions/quota-monitor-for-aws/issues/200) and [#201](https://github.com/aws-solutions/quota-monitor-for-aws/issues/201)

## [6.2.10] - 2024-09-18

### Fixed
- Update path-to-regexp to address [CVE-2024-45296](https://nvd.nist.gov/vuln/detail/CVE-2024-45296)
- Update micromatch to address [CVE-2024-4067](https://nvd.nist.gov/vuln/detail/CVE-2024-4067)

## [6.2.9] - 2024-07-31

### Fixed
- Update fast-xml-parser to address [CVE-2024-41818](https://nvd.nist.gov/vuln/detail/CVE-2024-41818)

## [6.2.8] - 2024-06-26

### Fixed
- Update dependency to address [CVE-2024-4068](https://avd.aquasec.com/nvd/cve-2024-4068)

## [6.2.7] - 2024-06-10

### Fixed
- Added batching to get getMetricData calls to avoid limits
- Added quotaCode to metric Ids to avoid duplicate Ids.

## [6.2.6] - 2024-03-18

### Changed
- First of month schedule for quotaListManager Lambda function changed to every 30 days
- Add rate limiting delay between listServiceQuota API calls
- Add page size to Service Quotas API calls

### Fixed
- GitHub Issue [#183](https://github.com/aws-solutions/quota-monitor-for-aws/issues/183), PR [#147](https://github.com/aws-solutions/quota-monitor-for-aws/pull/47) - fix expiration of DynamoDB records

## [6.2.5] - 2024-01-08

### Changed
- Made reporting of OK Messages optional
- Added percentage marker on Service Quota notifications

### Fixed
- Added manual resource cleanup after sqs message consumption

## [6.2.4] - 2023-11-09

### Changed
- Scoped permissions down for Stackset operations

### Fixed
- [Error](https://github.com/aws-solutions/quota-monitor-for-aws/issues/172) in saving notifications to summary table

## [6.2.3] - 2023-10-24

### Changed

- Update dependencies to address [CVE-2023-45133](https://github.com/advisories/GHSA-67hx-6x53-jw92)

## [6.2.2] - 2023-08-16

### Added
- Service Quotas spoke template parameters exposed in the hub template too

### Changed
- Lambda run times upgraded to Node.js18
- Dependency updates


## [6.2.1] - 2023-06-28
### Changed
- Dependency updates addressing [CVE-2023-26920](https://cwe.mitre.org/data/definitions/1321.html)

## [6.2.0] - 2023-06-01

### Added
- Support for monitoring resources with Service Catalog AppRegistry

### Changed
- Customer Managed Keys for the resources in hub stacks

### Fixed
- Bugs resulting in dynamoDb tables not being populated

## [6.1.0] - 2023-04-05

### Added
- Support for monitoring all usage reporting quotas from all services supported by Service Quotas
- Ability to mute selected notifications
- Support for GovCloud regions
- Ability to select regions for stackset instances
- Check if Trusted Advisor is available before deploying the corresponding stacks
- Allow customization to Stack Set deployments configuration

### Changed
- Use AWS Managed keys for the resources in the templates to help reduce the cost of deployment.

## [6.0.0] - 2022-10-14

### Added

- Support for AWS CDK v2
- Support for AWS SDK v3
- Support for AWS Lambda runtime Node.js v16
- Support for CloudWatch quotas usage monitoring using Service Quotas
- Support for DynamoDB quotas usage monitoring using Service Quotas
- Support for EC2 quotas usage monitoring using Service Quotas
- Support for ECR quotas usage monitoring using Service Quotas
- Support for Firehose quotas usage monitoring using Service Quotas
- Support for AWS Organizations wide usage monitoring using CloudFormation StackSets
- Hub stack to support Organization deployment scenarios
- Hub-no-ou stack to support non-Organization deployment scenarios
- Pre-requisite stack to deploy in management account to fulfill pre-requisites for AWS Organizations
- Trusted Advisor spoke template to provision resources for quota-usage monitoring using Trusted Advisor
- Service Quotas spoke template to provision resources for quota-usage monitoring using Service Quotas
- Utility Lambda layer for generic solution utils

## [5.3.5] - 2022-07-08

### Changed

- Updated error handling in service-quotas-check microservice, raising the error for `listServiceQuotas` API exceptions

### Added

- Unit tests for service-quotas-check module

## [5.3.4] - 2021-05-31

### Added

- Added cfn_nag suppress rules for Lambda VPC deployment and Reserved Concurrency

### Changed

- Removed moment dependency in favor of using native javascript date objects
- Removed check-ids fH7LL0l7J9 and aW9HH0l8J6, no longer supported by Trusted Advisor
- Removed global CDK install - now installs locally for build process
- Updated CDK from v1.64.0 to v1.101.0

## [5.3.3] - 2020-09-16

### Added

- Modified the solution to utilize cdk solution constructs.

### Fixed

- UUID Dependency changes

## [5.3.2] - 2020-01-21

### Fixed

- SQS KMS key
- Typo in primary template

### Added

- service limit check - ELB Application Load Balancers 'EM8b3yLRTr'
- service limit check - ELB Network Load Balancers '8wIqYSt25K'
- service limit check - EBS Throughput Optimized HDD (st1) Volume Storage 'wH7DD0l3J9'
- service limit check - EBS Cold HDD (sc1) Volume Storage 'gH5CC0e3J9'

## [5.3.1] - 2019-12-17

### Changed

- upgraded lambda runtime to nodejs 12.x

## [5.3.0] - 2019-08-28

### Added

- added support for EC2 vCPU limit
