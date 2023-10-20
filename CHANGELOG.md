# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
