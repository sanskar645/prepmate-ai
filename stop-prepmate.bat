@echo off
REM ============================================================
REM  PrepMate AI — stops the two server windows opened by
REM  run-prepmate.bat (Backend :8000, Frontend :3000)
REM ============================================================
taskkill /FI "WINDOWTITLE eq PrepMate AI - Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq PrepMate AI - Frontend*" /F >nul 2>&1
echo PrepMate AI servers stopped.
pause
