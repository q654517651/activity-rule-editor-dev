@echo off
chcp 65001 >nul
title Cloudflare Tunnel
color 0B

echo ====================================
echo   Cloudflare 隧道启动脚本
echo ====================================
echo.
echo 正在启动 cloudflared 隧道...
echo 目标: http://localhost:5173
echo.

:: 启动 cloudflared
cloudflared tunnel --url http://localhost:5173 --config NUL --no-autoupdate --protocol http2 --edge-ip-version auto

:: 如果 cloudflared 退出，显示提示
echo.
echo ====================================
echo   Cloudflare 隧道已停止
echo ====================================
echo.
pause

