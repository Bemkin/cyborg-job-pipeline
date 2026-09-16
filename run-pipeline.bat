@echo off
cd /d "C:\Users\bemne\.gemini\antigravity-ide\scratch\cyborg-job-pipeline"
echo [%date% %time%] Pipeline started >> pipeline.log
npm start >> pipeline.log 2>&1
echo [%date% %time%] Pipeline finished >> pipeline.log
echo ──────────────────────────────────── >> pipeline.log
