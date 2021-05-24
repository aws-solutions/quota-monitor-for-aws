#!/bin/bash
#
# This script packages your project into a solution distributable that can be
# used as an input to the solution builder validation pipeline.
#
# Important notes and prereq's:
#   1. The initialize-repo.sh script must have been run in order for this script to
#      function properly.
#   2. This script should be run from the repo's /deployment folder.
# 
# This script will perform the following tasks:
#   1. Remove any old dist files from previous runs.
#   2. Install dependencies for the cdk-solution-helper; responsible for 
#      converting standard 'cdk synth' output into solution assets.
#   3. Build and synthesize your CDK project.
#   4. Run the cdk-solution-helper on template outputs and organize
#      those outputs into the /global-s3-assets folder.
#   5. Organize source code artifacts into the /regional-s3-assets folder.
#   6. Remove any temporary files used for staging.
#
# Parameters:
#  - source-bucket-base-name: Name for the S3 bucket location where the template will source the Lambda
#    code from. The template will append '-[region_name]' to this bucket name.
#    For example: ./build-s3-dist.sh solutions v1.0.0
#    The template will then expect the source code to be located in the solutions-[region_name] bucket
#  - solution-name: name of the solution for consistency
#  - version-code: version of the package

# Important: CDK global version number
cdk_version=1.101.0
maxrc=0
rc=0
export overrideWarningsEnabled=false

# Check to see if the required parameters have been provided:
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [-z "$4"]; then
    echo "Please provide the base source bucket name, trademark approved solution name, version and template bucket name where the lambda code will eventually reside."
    echo "For example: ./build-s3-dist.sh solutions trademarked-solution-name v1.0.0 template-bucket"
    exit 1
fi

export DIST_TEMPLATE_BUCKET=$4
export DIST_VERSION=$3
export DIST_OUTPUT_BUCKET=$1
export SOLUTION_ID=SO0005
export SOLUTION_NAME=$2
export SOLUTION_TRADEMARKEDNAME=$2

# Functions to reduce repetitive code
# do_cmd will exit if the command has a non-zero return code.
do_cmd () {
    echo "------ EXEC $*"
    $*
    rc=$?
    if [ $rc -gt 0 ]
    then
            echo "Aborted - rc=$rc"
            exit $rc
    fi
}

# Get reference for all important folders
template_dir="$PWD"
staging_dist_dir="$template_dir/staging"
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
source_dir="$template_dir/../source"

echo "------------------------------------------------------------------------------"
echo "[Init] Remove any old dist files from previous runs"
echo "------------------------------------------------------------------------------"

echo "rm -rf $template_dist_dir"
do_cmd rm -rf $template_dist_dir
echo "mkdir -p $template_dist_dir"
do_cmd mkdir -p $template_dist_dir
echo "rm -rf $build_dist_dir"
do_cmd rm -rf $build_dist_dir
echo "mkdir -p $build_dist_dir"
do_cmd mkdir -p $build_dist_dir
echo "rm -rf $staging_dist_dir"
do_cmd rm -rf $staging_dist_dir
echo "mkdir -p $staging_dist_dir"
do_cmd mkdir -p $staging_dist_dir

echo "------------------------------------------------------------------------------"
echo "[Synth] CDK Project"
echo "------------------------------------------------------------------------------"

# Install the global aws-cdk package
echo "cd $source_dir"
cd $source_dir
echo "npm install aws-cdk@$cdk_version"
do_cmd npm install
do_cmd npm install aws-cdk@$cdk_version
export PATH=$(npm bin):$PATH
# Check cdk version
cdkver=`cdk --version | grep -Eo '^[0-9]{1,2}\.[0-9]+\.[0-9]+'`
echo CDK version $cdkver
if [[ $cdkver != $cdk_version ]]; then 
    echo Required CDK version is $cdk_version, found $cdkver
    exit 255
fi

# Run npm run build && npm run test for the cdk component unit tests
echo "npm run build && npm run test"
npm run build && npm run test
rc=$?

if [ "$rc" -ne "0" ]; then
  echo "** UNIT TESTS FAILED **"
else
  echo "Unit Tests Successful"
fi
if [ "$rc" -gt "$maxrc" ]; then
    maxrc=$rc
fi

# Run all the lambda source code tests.
echo "$template_dir/run-unit-tests.sh"
$template_dir/run-unit-tests.sh 
rc=$?

if [ "$rc" -ne "0" ]; then
  echo "** UNIT TESTS FAILED **"
else
  echo "Unit Tests Successful"
fi
if [ "$rc" -gt "$maxrc" ]; then
    maxrc=$rc
fi

echo "========================================================================="
if [ "$maxrc" -ne "0" ]; then
  echo "** UNIT TESTS FAILED **"
  exit $maxrc
else
  echo "ALL UNIT TESTS PASSED"
fi

# Run 'cdk synth' to generate raw solution outputs
echo "cdk synth --output=$staging_dist_dir"
do_cmd cdk synth --output=$staging_dist_dir

# Remove unnecessary output files
echo "cd $staging_dist_dir"
cd $staging_dist_dir
echo "rm tree.json manifest.json cdk.out"
do_cmd rm tree.json manifest.json cdk.out

echo "------------------------------------------------------------------------------"
echo "[Packing] Template artifacts"
echo "------------------------------------------------------------------------------"

# Move outputs from staging to template_dist_dir
echo "Move outputs from staging to template_dist_dir"
echo "cp $template_dir/*.template $template_dist_dir/"
do_cmd cp $staging_dist_dir/*.template.json $template_dist_dir/
do_cmd rm *.template.json

# Rename all *.template.json files to *.template
echo "Rename all *.template.json to *.template"
echo "copy templates and rename"
for f in $template_dist_dir/*.template.json; do 
    mv -- "$f" "${f%.template.json}.template"
done

echo "------------------------------------------------------------------------------"
echo "[Packing] Source code artifacts"
echo "------------------------------------------------------------------------------"

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Resources - Logger" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda/resources/logger 
do_cmd npm run build

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Resources - CW Metric helper" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda//resources/cw-metric-poller
do_cmd npm run build

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Resources - Event Injector" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda/resources/event-injector 
do_cmd npm run build

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Limit Report" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda/services/limitreport
do_cmd npm install
do_cmd npm run build
do_cmd npm run zip
do_cmd cp dist/limtr-report-service.zip $build_dist_dir/limtr-report-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Slack Notify" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda/services/slacknotify
do_cmd npm install
do_cmd npm run build
do_cmd npm run zip
do_cmd cp dist/limtr-slack-service.zip $build_dist_dir/limtr-slack-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - TA Refresh" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda/services/tarefresh
do_cmd npm install
do_cmd npm run build
do_cmd npm run zip
do_cmd cp dist/limtr-refresh-service.zip $build_dist_dir/limtr-refresh-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Custom Helper" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda/services/customhelper
do_cmd npm install
do_cmd npm run build
do_cmd npm run zip
do_cmd cp dist/limtr-helper-service.zip $build_dist_dir/limtr-helper-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Service Quotas Checks" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/lambda/services/servicequotaschecks
do_cmd npm install
do_cmd npm run build
do_cmd npm run zip
do_cmd cp dist/service-quotas-checks-service.zip $build_dist_dir/service-quotas-checks-service.zip

# General cleanup of node_modules and package-lock.json files
echo "find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null"
find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null
echo "find $staging_dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null"
find $staging_dist_dir -iname "package-lock.json" -type f -exec rm -f "{}" \; 2> /dev/null

# ... For each asset.* source code artifact in the temporary /staging folder...
cd $staging_dist_dir
for d in `find . -mindepth 1 -maxdepth 1 -type d`; do

    # Rename the artifact, removing the period for handler compatibility
    pfname="$(basename -- $d)" 
    fname="$(echo $pfname | sed -e 's/\.//g')"
    echo "zip -r $fname.zip $fname"
    mv $d $fname
    
    # Zip the artifact
    echo "zip -r $fname.zip $fname"
    zip -r $fname.zip $fname
    
    # Copy the zipped artifact from /staging to /regional-s3-assets
    echo "cp $fname.zip $build_dist_dir"
    cp $fname.zip $build_dist_dir
    
    # Remove the old, unzipped artifact from /staging
    echo "rm -rf $fname"
    rm -rf $fname
    
    # Remove the old, zipped artifact from /staging
    echo "rm $fname.zip"
    rm $fname.zip
    
    # ... repeat until all source code artifacts are zipped and placed in the
    # ... /regional-s3-assets folder
    
done

echo "------------------------------------------------------------------------------"
echo "[Cleanup] Remove temporary files"
echo "------------------------------------------------------------------------------"

# Delete the temporary /staging folder
echo "rm -rf $staging_dist_dir"
rm -rf $staging_dist_dir
