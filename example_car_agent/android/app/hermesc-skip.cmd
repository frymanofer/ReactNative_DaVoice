@echo off
rem Stand-in for hermesc with -PskipHermesc=true (see build.gradle): keeps the JS bundle as source; Hermes runs it.
rem Called as: -w -emit-binary -max-diagnostic-width=80 -out <output> <input>  (cmd also splits on "=", so find -out by name)
setlocal
:next
if "%~1"=="" goto copy
if "%~1"=="-out" (
  set "OUT=%~2"
  shift
) else (
  set "IN=%~1"
)
shift
goto next
:copy
copy /Y "%IN%" "%OUT%" >nul
