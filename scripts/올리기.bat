@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo.
echo ====================================
echo  Pushing to Git + Vercel auto-deploy
echo ====================================
echo.
git status --short
echo.
git add .
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd-HH-mm"') do set TS=%%i
git commit -m "update %TS%"
if errorlevel 1 (
  echo.
  echo === Nothing to commit, or commit failed.
  pause
  exit /b
)
git push origin main
if errorlevel 1 (
  echo.
  echo === Push failed. Check error above.
  pause
  exit /b
)
echo.
echo ====================================
echo  Done. Vercel deploy starts in ~1 min.
echo ====================================
echo.
pause
