#!/bin/bash 
# 
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned 
# 
# This script should be run from the repo's deployment directory 
# cd deployment 
# ./build-s3-dist.sh source-bucket-base-name trademarked-solution-name version-code 
# 
# Paramenters: 
#  - source-bucket-base-name: Name for the S3 bucket location where the template will source the Lambda 
#    code from. The template will append '-[region_name]' to this bucket name. 
#    For example: ./build-s3-dist.sh solutions my-solution v1.0.0 
#    The template will then expect the source code to be located in the solutions-[region_name] bucket 
# 
#  - trademarked-solution-name: name of the solution for consistency 
# 
#  - version-code: version of the package 
 
# Check to see if input has been provided: 
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then 
    echo "Please provide the base source bucket name, trademark approved solution name, version and template bucket name where the lambda code will eventually reside." 
    echo "For example: ./build-s3-dist.sh solutions trademarked-solution-name v1.0.0" 
    exit 1 
fi 

# Get reference for all important folders 
template_dir="$PWD" 
template_dist_dir="$template_dir/global-s3-assets" 
build_dist_dir="$template_dir/regional-s3-assets" 
source_dir="$template_dir/../source" 
 
echo "------------------------------------------------------------------------------" 
echo "[Init] Clean old dist folders" 
echo "------------------------------------------------------------------------------" 
echo "rm -rf $template_dist_dir" 
rm -rf $template_dist_dir 
echo "mkdir -p $template_dist_dir" 
mkdir -p $template_dist_dir 
echo "rm -rf $build_dist_dir" 
rm -rf $build_dist_dir 
echo "mkdir -p $build_dist_dir" 
mkdir -p $build_dist_dir 

echo "------------------------------------------------------------------------------" 
echo "[Packing] Templates" 
echo "------------------------------------------------------------------------------" 
echo "cp $template_dir/*.template $template_dist_dir" 
cp -R $template_dir/*.template $template_dist_dir/

echo "Updating code source bucket in template with $1" 
replace="s/%%BUCKET_NAME%%/$1/g"
sed -i '' -e $replace $template_dist_dir/*.template

replace="s/%%SOLUTION_NAME%%/$2/g"
sed -i '' -e $replace $template_dist_dir/*.template

replace="s/%%VERSION%%/$3/g"
sed -i '' -e $replace $template_dist_dir/*.template

replace="s/%%TEMPLATE_BUCKET_NAME%%/$4/g"
sed -i '' -e $replace $template_dist_dir/*.template

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Resources - Logger" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/resources/logger 
npm run build 

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Resources - CW Metric helper" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/resources/cw-metric-poller 
npm run build 

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Resources - Event Injector" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/resources/event-injector 
npm run build 

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Limit Report" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/services/limitreport
npm install
npm run build
npm run zip
cp dist/limtr-report-service.zip $build_dist_dir/limtr-report-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Slack Notify" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/services/slacknotify
npm install
npm run build
npm run zip
cp dist/limtr-slack-service.zip $build_dist_dir/limtr-slack-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - TA Refresh" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/services/tarefresh
npm install
npm run build
npm run zip
cp dist/limtr-refresh-service.zip $build_dist_dir/limtr-refresh-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Custom Helper" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/services/customhelper
npm install
npm run build
npm run zip
cp dist/limtr-helper-service.zip $build_dist_dir/limtr-helper-service.zip

echo "------------------------------------------------------------------------------" 
echo "[Rebuild] Services - Service Quotas Checks" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/services/servicequotaschecks
npm install
npm run build
npm run zip
cp dist/service-quotas-checks-service.zip $build_dist_dir/service-quotas-checks-service.zip
