@echo off
cd /d "C:\Users\leoga\Documents\Desenvolvimento\ThreeJS\network_tech_simulator\three-metaverse-low-poly"
start "" cmd /k "npm run dev"
timeout /t 5
start http://localhost:5173/
exit
