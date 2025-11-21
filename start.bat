@echo off
chcp 65001 >nul
title Activity Rule Editor - 主控制台
color 0A

echo ====================================
echo   Activity Rule Editor 启动脚本
echo ====================================
echo.

:: 检查 uv 是否安装
where uv >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 uv，请先安装 uv
    echo 安装方法: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
    echo 或访问: https://github.com/astral-sh/uv
    pause
    exit /b 1
)

:: 同步依赖（如果还没有安装）
echo [0/2] 检查并安装 Python 依赖...
uv sync --quiet
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo [成功] Python 依赖已就绪
echo.

:: 启动后端
echo [1/2] 启动后端服务...
start /B "" cmd /c "cd /d %~dp0 && uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul
echo [成功] 后端服务已在后台启动 (http://127.0.0.1:8000)
echo.

:: 启动前端
echo [2/2] 启动前端服务...
start /B "" cmd /c "cd /d %~dp0\web && pnpm dev"
timeout /t 3 /nobreak >nul
echo [成功] 前端服务已在后台启动 (http://localhost:5173)
echo.

echo ====================================
echo   所有服务已启动！
echo ====================================
echo.
echo 后端服务: http://127.0.0.1:8000
echo 前端服务: http://localhost:5173
echo.
echo 提示：
echo - 所有服务运行在后台
echo - 关闭此窗口将停止所有服务
echo - 或运行 stop.bat 停止所有服务
echo - 如需公网访问，请运行 cloudflare.bat 启动隧道
echo.
pause
