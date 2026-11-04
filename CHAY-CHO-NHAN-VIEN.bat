@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Lan dau chay: dang cai thu vien, doi 1-2 phut...
  call npm install
)
echo Dang dong goi ban chay that...
call npm run build
set PORT=3200
echo.
echo ===== Gui link nay cho nhan vien (cung Wi-Fi hoac mang noi bo) =====
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo     http://%%b:3200
echo.
echo Neu Windows hoi "Allow access" thi bam Allow. Dong cua so nay la tat web.
echo.
call npm start
pause
