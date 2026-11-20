@echo off
title Abrimela si podes - El Gran Golpe Cooperativo
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Iniciando servidor local en http://localhost:3000 ...
    start "" /b node server.js
    timeout /t 1 >nul 2>nul
    start "" "http://localhost:3000"
) else (
    echo Iniciando directamente en tu navegador...
    start "" "%~dp0index.html"
)
exit
