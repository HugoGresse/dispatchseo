@echo off
rem Windows entry point: runs start.sh through the bash bundled with Git,
rem so install/restart work from PowerShell, cmd, or a double-click -
rem without opening Git Bash by hand. All real logic stays in start.sh.
setlocal
cd /d "%~dp0"
set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=%LocalAppData%\Programs\Git\bin\bash.exe"
if not exist "%BASH%" (
  echo Git not found. Install it from https://git-scm.com/downloads/win
  echo and run this again - it includes the shell this script needs.
  exit /b 1
)
"%BASH%" start.sh
