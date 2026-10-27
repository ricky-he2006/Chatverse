@echo off
setlocal
cd /d "%~dp0"
set "CHATVERSE_NODE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined CHATVERSE_NODE set "CHATVERSE_NODE=%%I"
if not defined CHATVERSE_NODE set "CHATVERSE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%CHATVERSE_NODE%" (
  echo Install Node.js 24 LTS, then run this launcher again.
  pause
  exit /b 1
)
if not exist "node_modules\tsx" (
  echo Install dependencies first with pnpm install or npm install.
  pause
  exit /b 1
)
"%CHATVERSE_NODE%" node_modules\typescript\bin\tsc --noEmit
if errorlevel 1 goto failed
"%CHATVERSE_NODE%" node_modules\vite\bin\vite.js build
if errorlevel 1 goto failed
"%CHATVERSE_NODE%" --import tsx server\index.ts
if errorlevel 1 goto failed
exit /b 0
:failed
echo ChatVerse could not start. Check the message above. Another instance may already use port 3000.
pause
exit /b 1
