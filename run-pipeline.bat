@echo off
cd /d "%~dp0"
echo [%date% %time%] Pipeline started >> pipeline.log
npm start >> pipeline.log 2>&1
echo [%date% %time%] Pipeline finished >> pipeline.log
echo ------------------------------------ >> pipeline.log
