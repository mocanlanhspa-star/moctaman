@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Lan dau chay: dang cai thu vien, doi 1-2 phut...
  call npm install
)
echo Dang bat Tam Tinh Tam An... Dong cua so nay la tat web.
set PORT=3200
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3200"
npm run dev
pause
