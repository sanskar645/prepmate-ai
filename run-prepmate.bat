@echo off
REM ============================================================
REM  PrepMate AI — double-click launcher (Windows)
REM  Opens Backend (port 8000) + Frontend (port 3000) in their
REM  own windows, then opens the site in your browser.
REM  To stop everything: close the two windows, or run
REM  stop-prepmate.bat
REM ============================================================
setlocal
cd /d "%~dp0"

echo [1/3] Starting backend  (http://localhost:8000) ...
start "PrepMate AI - Backend" cmd /k "cd /d ""%~dp0backend"" && venv\Scripts\python -X utf8 -m uvicorn main:app --port 8000"

echo [2/3] Starting frontend (http://localhost:3000) ...
if not exist "frontend\node_modules" (
  echo   node_modules missing - installing once, this takes a while ...
  pushd frontend
  call npm install
  popd
)
start "PrepMate AI - Frontend" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

echo [3/3] Waiting for servers, then opening the site ...
timeout /t 25 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo  Done. The site opens at http://localhost:3000
echo  API docs at           http://localhost:8000/docs
echo  If the page is still compiling, wait a few seconds and refresh.
echo  Keep this window open or close it - servers run in their own windows.
pause
