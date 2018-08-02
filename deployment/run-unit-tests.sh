# SO-Limit-M-41 - 07/30/2018 - Run ALL unit tests
# Fixed path to run all unit tests
cd ../source/services/limitreport
npm install
npm test

cd ../slacknotify
npm install
npm test

cd ../tarefresh
npm install
npm test

cd ../customhelper
npm install
npm test
