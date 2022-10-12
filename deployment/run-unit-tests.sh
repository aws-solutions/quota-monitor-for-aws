#!/bin/bash
# This script runs all unit tests for the solution
#
# This script should be run from the repo's deployment directory
# cd deployment
# ./run-unit-tests.sh

[ "$DEBUG" == 'true' ] && set -x
set -e

template_dir="$PWD"
resource_dir="$template_dir/../source/resources"
source_dir="$template_dir/../source/lambda/services"
utils_dir="$template_dir/../source/lambda/utilsLayer"
root_dir="$template_dir/.."
maxrc=0

# function to print headers
function headline(){
  echo "------------------------------------------------------------------------------"
  echo "$1"
  echo "------------------------------------------------------------------------------"
}

headline "[Pre-Test] build binaries"
cd $root_dir
npm run build:all

headline "[Tests] Initiating unit tests on microservices"

cd $utils_dir
npm test

cd $source_dir/cwPoller
npm test

cd $source_dir/deploymentManager
npm test

cd $source_dir/helper
npm test

cd $source_dir/preReqManager
npm test

cd $source_dir/quotaListManager
npm test

cd $source_dir/reporter
npm test

cd $source_dir/slackNotifier
npm test

cd $source_dir/taRefresher
npm test

headline "[Tests] Initiating unit tests on resources"

cd $resource_dir
npm test
