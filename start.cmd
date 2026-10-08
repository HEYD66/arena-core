@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the version listed in README.md, then try again.
  pause
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm.cmd was not found. Repair the Node.js installation, then try again.
  pause
  exit /b 1
)
node scripts\prepare-startup.cjs
if errorlevel 1 (
  echo Dependency setup failed. See the error above; the application was not started.
  pause
  exit /b 1
)
call npm.cmd start -- %*
set "startupExit=%errorlevel%"
if not "%startupExit%"=="0" pause
exit /b %startupExit%
