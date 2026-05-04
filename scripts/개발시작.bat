@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo.
echo ====================================
echo  Local dev server starting...
echo  Browser: http://localhost:3000
echo  (Ctrl+C to stop)
echo ====================================
echo.
npm run dev:vercel
