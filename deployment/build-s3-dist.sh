#!/bin/bash
#
# This script packages your project into a solution distributable that can be
# used as an input to the solution builder validation pipeline.
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
# - solutions-source-code-bucket - lambda source code bucket (template will suffix region to this)
# - solutions-template-bucket - cloudformation template bucket
# - solution-name: name of the solution for consistency
# - version-code: version of the package

[ "$DEBUG" == 'true' ] && set -x
set -e

# Check to see if the required parameters have been provided:
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then
    echo "Please provide the base source bucket name, trademark approved solution name, version and template bucket name where the lambda code will eventually reside."
    echo "For example: ./build-s3-dist.sh solutions solutions-reference quota-monitor-for-aws v1.0.0"
    exit 1
fi

# function to print headers
function headline(){
  echo "------------------------------------------------------------------------------"
  echo "$1"
  echo "------------------------------------------------------------------------------"
}

headline "[Init] Setting up paths"
template_dir="$PWD"
staging_dist_dir="$template_dir/staging"
template_dist_dir="$template_dir/global-s3-assets"
build_dist_dir="$template_dir/regional-s3-assets"
source_dir="$template_dir/../source"


headline "[Init] Clean old folders"
rm -rf $staging_dist_dir
mkdir -p $staging_dist_dir
rm -rf $template_dist_dir
mkdir -p $template_dist_dir
rm -rf $build_dist_dir
mkdir -p $build_dist_dir

headline "[Build] Building lambda zips"
cd $template_dir/../
npm run build:all

headline "[Build] CDK Project"
cd $source_dir/resources
rm -rf cdk.out
npm ci
npm run cdk -- synth --output=$staging_dist_dir
cd $staging_dist_dir
rm tree.json manifest.json cdk.out

headline "[Packing] Templates"
cp $staging_dist_dir/*.template.json $template_dist_dir/
rm *.template.json

# Rename all *.template.json files to *.template
for f in $template_dist_dir/*.template.json; do
    mv -- "$f" "${f%.template.json}.template"
done

# Run the helper to clean-up the templates and remove unnecessary CDK elements
cd $template_dir
node $template_dir/cdk-solution-helper/index

# Find and replace bucket_name, solution_name, and version
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Mac OS
    echo "Updating variables in template with $1"
    replace="s/%%LAMBDA_BUCKET%%/$1/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
    replace="s/%%TEMPLATE_BUCKET%%/$2/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
    replace="s/%%SOLUTION_NAME%%/$3/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
    replace="s/%%VERSION%%/$4/g"
    echo "sed -i '' -e $replace $template_dist_dir/*.template"
    sed -i '' -e $replace $template_dist_dir/*.template
else
    # Other linux
    echo "Updating variables in template with $1"
    replace="s/%%LAMBDA_BUCKET%%/$1/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
    replace="s/%%TEMPLATE_BUCKET%%/$2/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
    replace="s/%%SOLUTION_NAME%%/$3/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
    replace="s/%%VERSION%%/$4/g"
    echo "sed -i -e $replace $template_dist_dir/*.template"
    sed -i -e $replace $template_dist_dir/*.template
fi

headline "[Packing] Source code artifacts"
find $staging_dist_dir -iname "node_modules" -type d -exec rm -rf "{}" \; 2> /dev/null

# ... For each asset.* source code artifact in the temporary /staging folder...
cd $staging_dist_dir
# shellcheck disable=SC2044
for i in `find . -mindepth 1 -maxdepth 1 -type f \( -iname "*.zip" \) -or -type d`; do

    # Rename the artifact, removing the period for handler compatibility
    pfname="$(basename -- $i)"
    fname="$(echo $pfname | sed -e 's/\.//')"
    mv $i $fname

    if [[ $fname != *".zip" ]]
    then
        # Zip the artifact
        echo "zip -rj $fname.zip $fname/*"
        zip -rj $fname.zip $fname
    fi

# ... repeat until all source code artifacts are zipped
done

cp -R *.zip $build_dist_dir

# the spoke templates need to be in a regional S3 bucket for GovCloud and China regions
# copy all templates to regional assets folder (less brittle against refactoring ...)
cp $template_dist_dir/* $build_dist_dir

headline "[Cleanup] Remove temporary files"
rm -rf *.zip
rm -rf $staging_dist_dir
