@echo off
chcp 65001 >nul
title Activity Rule Editor - 停止脚本
color 0C

echo ====================================
echo   Activity Rule Editor 停止脚本
echo ====================================
echo.

echo 正在停止所有服务...
echo.

:: 停止 Python (后端)
echo [1/2] 停止后端服务...
taskkill /F /IM python.exe >nul 2>&1
if errorlevel 1 (
    echo [提示] 未找到运行中的 Python 进程
) else (
    echo [成功] 后端服务已停止
)
echo.

:: 停止 Node (前端)
echo [2/2] 停止前端服务...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo [提示] 未找到运行中的 Node 进程
) else (
    echo [成功] 前端服务已停止
)
echo.

echo ====================================
echo   所有服务已停止！
echo ====================================
echo.
echo 提示：
echo - cloudflared 隧道未被停止（如需停止请手动关闭其窗口）
echo - 这样可以避免重启开发服务器时域名变更
echo.
pause

