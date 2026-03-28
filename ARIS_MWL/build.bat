@echo off
REM ─────────────────────────────────────────────────────────────────────────
REM  ARIS MWL Server — Build script
REM  Produces:  dist\ARIS_MWL_Server_Setup.exe  (Windows installer)
REM
REM  Requirements:
REM    • Python 3.10  (recommended — use py -3.10)
REM    • Inno Setup 6  →  https://jrsoftware.org/isdl.php
REM      (default install path: C:\Program Files (x86)\Inno Setup 6\)
REM ─────────────────────────────────────────────────────────────────────────

REM ── Select Python ─────────────────────────────────────────────────────────
set PY=
python --version >nul 2>&1
if %errorlevel%==0 ( set PY=python & goto :found_py )
python3 --version >nul 2>&1
if %errorlevel%==0 ( set PY=python3 & goto :found_py )
py --version >nul 2>&1
if %errorlevel%==0 ( set PY=py & goto :found_py )

echo.
echo ERROR: Python not found. Install from https://python.org
echo        During install tick "Add Python to PATH"
echo.
pause & exit /b 1

:found_py
echo Using: %PY%
%PY% --version

echo.
echo === [1/3] Installing Python dependencies ===
%PY% -m pip install --upgrade pip
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install requirements.txt
    echo Check the error above — a package may not support your Python version.
    pause & exit /b 1
)
%PY% -m pip install pyinstaller
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install PyInstaller.
    pause & exit /b 1
)

echo.
echo === [2/3] Building application (PyInstaller) ===
REM --onedir    : extracts to install folder, not %%TEMP%% (avoids DLL hijack risk)
REM --uac-admin : embeds UAC manifest — Windows will auto-prompt for elevation
%PY% -m PyInstaller ^
  --onedir ^
  --windowed ^
  --uac-admin ^
  --name "ARIS_MWL_Server" ^
  --hidden-import "pystray._win32" ^
  --hidden-import "PIL._tkinter_finder" ^
  main.py
if errorlevel 1 (
    echo.
    echo ERROR: PyInstaller build failed. Check the error above.
    pause & exit /b 1
)

echo.
echo === [3/3] Building installer (Inno Setup) ===
set ISCC=
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set ISCC="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
)
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set ISCC="C:\Program Files\Inno Setup 6\ISCC.exe"
)

if "%ISCC%"=="" (
    echo.
    echo WARNING: Inno Setup not found.
    echo Download from: https://jrsoftware.org/isdl.php
    echo Then run:  iscc setup.iss
    echo.
    echo The application folder is ready at: dist\ARIS_MWL_Server\
    echo You can distribute that folder manually if needed.
    pause & exit /b 0
)

%ISCC% setup.iss
if errorlevel 1 (
    echo.
    echo ERROR: Inno Setup compilation failed. Check the error above.
    pause & exit /b 1
)

echo.
echo ═══════════════════════════════════════════════════════
echo  BUILD COMPLETE
echo  Installer:  dist\ARIS_MWL_Server_Setup.exe
echo ═══════════════════════════════════════════════════════
echo.
echo  Distribute  ARIS_MWL_Server_Setup.exe  to each center PC.
echo  Double-click to install — no configuration needed on the PC.
echo  After install, open the app and enter ERP URL + token + Center ID.
echo.
pause
