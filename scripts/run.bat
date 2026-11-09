@echo off
setlocal
set ROOT=%~dp0..
set BUILD=%ROOT%\backend\build\classes
where javac >nul 2>nul
if errorlevel 1 (
  echo ERROR: JDK 21 is required. javac was not found in PATH.
  exit /b 1
)
if exist "%BUILD%" rmdir /s /q "%BUILD%"
mkdir "%BUILD%"
dir /s /b "%ROOT%\backend\src\main\java\*.java" > "%ROOT%\backend\build\sources.txt"
javac -encoding UTF-8 -d "%BUILD%" @"%ROOT%\backend\build\sources.txt"
if errorlevel 1 exit /b 1
xcopy "%ROOT%\backend\src\main\resources\*" "%BUILD%\" /E /I /Y >nul
cd /d "%ROOT%"
if "%PORT%"=="" set PORT=8080
echo Starting LeadOS MVP. Open http://localhost:%PORT%
java -cp "%BUILD%" com.leados.LeadOsApplication
endlocal
