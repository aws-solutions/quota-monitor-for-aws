#!/bin/bash

# Fixed path to run all unit tests
cd ../source/lambda/services/limitreport
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

cd ../servicequotaschecks
npm install
npm test