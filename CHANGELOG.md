# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.3.4] - 2021-05-31

### Added

- Added cfn_nag suppress rules for Lambda VPC deployment and Reserved Concurrency

### Changed

- Removed moment dependecy in favor of using native javascipt date objects
- Removed check-ids fH7LL0l7J9 and aW9HH0l8J6, no longer supported by Trusted Advisor
- Removed global CDK install - now installs locally for build process
- Updated CDK from v1.64.0 to v1.101.0

## [5.3.3] - 2020-09-16

### Added

- Modified the solution to utilize cdk solution constructs.

### Fixed

- UUID Depenency changes

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
