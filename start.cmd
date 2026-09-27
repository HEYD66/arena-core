@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
npm start
if errorlevel 1 pause
