#!/bin/bash
maxrc=0
# Fixed path to run all unit tests
cd ../source/lambda/services/limitreport
npm test
rc=$?
if [ "$rc" -ne "0" ]; then
  	echo "** UNIT TESTS FAILED **"
else
  	echo "Unit Tests Successful"
fi
if [ "$rc" -gt "$maxrc" ]; then
    maxrc=$rc
fi

cd ../slacknotify
npm test
rc=$?
if [ "$rc" -ne "0" ]; then
  	echo "** UNIT TESTS FAILED **"
else
  	echo "Unit Tests Successful"
fi
if [ "$rc" -gt "$maxrc" ]; then
    maxrc=$rc
fi

cd ../tarefresh
npm test
rc=$?
if [ "$rc" -ne "0" ]; then
  	echo "** UNIT TESTS FAILED **"
else
  	echo "Unit Tests Successful"
fi
if [ "$rc" -gt "$maxrc" ]; then
    maxrc=$rc
fi

cd ../customhelper
npm test
rc=$?
if [ "$rc" -ne "0" ]; then
  	echo "** UNIT TESTS FAILED **"
else
  	echo "Unit Tests Successful"
fi
if [ "$rc" -gt "$maxrc" ]; then
    maxrc=$rc
fi

cd ../servicequotaschecks
npm test
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
else
  echo "ALL UNIT TESTS PASSED"
fi

exit $maxrc
