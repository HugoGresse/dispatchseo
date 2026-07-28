@echo off
rem Windows entry point: runs start.sh through the bash bundled with Git,
rem so install/restart work from PowerShell, cmd, or a double-click -
rem without opening Git Bash by hand. All real logic stays in start.sh.
setlocal
cd /d "%~dp0"
rem First choice: derive bash from the git.exe already on PATH (covers
rem non-standard installs - winget user-scope, portable, custom drive).
rem git lives in Git\cmd\, bash in the sibling Git\bin\.
set "BASH="
for /f "delims=" %%G in ('where git 2^>nul') do if not defined BASH if exist "%%~dpG..\bin\bash.exe" set "BASH=%%~dpG..\bin\bash.exe"
if not defined BASH if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "BASH=%LocalAppData%\Programs\Git\bin\bash.exe"
if not defined BASH (
  echo Git not found. Install it from https://git-scm.com/downloads/win
  echo and run this again - it includes the shell this script needs.
  rem Keep the window open when this was double-clicked, or the message
  rem vanishes before it can be read. Harmless in a real terminal.
  pause
  exit /b 1
)
"%BASH%" start.sh
