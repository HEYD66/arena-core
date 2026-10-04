@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
call npm start
set "startupExit=%errorlevel%"
if not "%startupExit%"=="0" pause
exit /b %startupExit%
