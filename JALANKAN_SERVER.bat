@echo off
title Sistem Pembelian - Server Manager
color 0A

echo ============================================
echo   SISTEM MANAGEMENT PEMBELIAN - CV SAU
echo ============================================
echo.

:: Pindah ke folder proyek
cd /d "%~dp0"

:: Jalankan npm start di window baru
echo [1/2] Menjalankan server aplikasi...
start "Server Aplikasi" cmd /k "npm start"

:: Tunggu 4 detik agar server siap dulu
timeout /t 4 /nobreak > nul

:: Jalankan Cloudflare Tunnel di window baru
echo [2/2] Menjalankan Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000"

echo.
echo ============================================
echo   SERVER BERHASIL DIJALANKAN!
echo.
echo   Tunggu 10 detik lalu buka jendela
echo   "Cloudflare Tunnel" untuk melihat
echo   URL HTTPS yang bisa dibagikan.
echo ============================================
echo.
pause
