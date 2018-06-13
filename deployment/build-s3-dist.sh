rm -r dist

mkdir dist

cp *.template dist/

replace="s/%%BUCKET_NAME%%/$1/g"
sed -i '' -e $replace dist/*.template

replace="s/%%TEMPLATE_BUCKET%%/$2/g"
sed -i '' -e $replace dist/*.template

replace="s/%%VERSION%%/$3/g"
sed -i '' -e $replace dist/*.template

cd ../source/services/limitreport
npm install
npm run build
npm run zip
cp dist/limtr-report-service.zip ../../../deployment/dist/limtr-report-service.zip

cd ../slacknotify
npm install
npm run build
npm run zip
cp dist/limtr-slack-service.zip ../../../deployment/dist/limtr-slack-service.zip

cd ../tarefresh
npm install
npm run build
npm run zip
cp dist/limtr-refresh-service.zip ../../../deployment/dist/limtr-refresh-service.zip

cd ../customhelper
npm install
npm run build
npm run zip
cp dist/limtr-helper-service.zip ../../../deployment/dist/limtr-helper-service.zip
