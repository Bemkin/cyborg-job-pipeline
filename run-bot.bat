@echo off
title Cyborg Bot Daemon
cd /d "%~dp0"
echo ===================================================
echo   Starting Cyborg Telegram Bot Daemon (v2.1)
echo   Listening for One-Tap button taps & commands...
echo ===================================================
npm run bot
pause
