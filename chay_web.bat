@echo off
title SEE LAD - HE THONG CHAT & GOI DIEN THOAI (TRAN NGOC HIEU)
echo ===================================================================
echo      SEE LAD - HE THONG NHAN TIN VA CUOC GOI REAL-TIME 24/7
echo      Tac gia: TRAN NGOC HIEU
echo      Co so du lieu: seelad.db (SQLite)
echo ===================================================================
echo.
echo [1/3] Dang khoi dong Duong truyen Cloudflare 24/7 (Watchdog)...
start "SEE LAD Tunnel Manager" /min python tunnel_manager.py
echo.
echo [2/3] Dang mo ung dung tren trinh duyet...
start http://localhost:3000
echo.
echo ===================================================================
echo  CAC DUONG LINK TRUY CAP CHINH XAC (KHONG BAO GIO BI LOI):
echo.
echo  1. Tren may tinh nay (Coc Coc / Chrome / Edge):
echo     -> http://localhost:3000
echo.
echo  2. Tren dien thoai cua ban (Cung Wi-Fi) hoac BlueStacks:
echo     -> http://10.0.41.166:3000
echo.
echo  3. Gui cho ban be o xa (Qua Zalo / 4G / Internet):
echo     -> Mo file "public_url.txt" hoac xem cua so Tunnel Manager
echo     -> Da tu dong sao chep vao Clipboard, chi can Ctrl+V de gui!
echo ===================================================================
echo.
echo [3/3] Dang chay may chu Backend tai cong 3000...
echo (Vui long giu nguyen cua so nay de tin nhan va cuoc goi hoat dong)
echo.
python server.py 3000
pause

