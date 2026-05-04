@echo off
chcp 65001 >nul
cd /d "%~dp0\.."

echo ============================================
echo  Cleanup: removing wrongly-tracked folders
echo ============================================
echo.

echo Step 1/4: Updating .gitignore
findstr /b /c:".claude" .gitignore >nul 2>&1
if errorlevel 1 echo .claude/>> .gitignore

findstr /b /c:"files-mentioned-by-the-user-20260422/" .gitignore >nul 2>&1
if errorlevel 1 echo files-mentioned-by-the-user-20260422/>> .gitignore

findstr /c:"복사본" .gitignore >nul 2>&1
if errorlevel 1 echo files-mentioned-by-the-user-20260422 - 복사본/>> .gitignore

echo.
echo Step 2/4: Removing from git index (disk files NOT touched)
git rm --cached -rf .claude 2>nul
git rm --cached -rf "files-mentioned-by-the-user-20260422" 2>nul
git rm --cached -rf "files-mentioned-by-the-user-20260422 - 복사본" 2>nul

echo.
echo Step 3/4: Committing cleanup
git add .gitignore
git commit -m "cleanup: ignore .claude and nested copy folders"
if errorlevel 1 (
  echo.
  echo === Commit failed. Maybe nothing to clean. ===
  pause
  exit /b
)

echo.
echo Step 4/4: Pushing
git push origin main
if errorlevel 1 (
  echo.
  echo === Push failed. Check error above. ===
  pause
  exit /b
)

echo.
echo ============================================
echo  Cleanup done. Vercel will redeploy in ~1 min.
echo ============================================
echo.
pause
