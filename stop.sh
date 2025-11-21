#!/bin/bash

# Activity Rule Editor 停止脚本 (macOS/Linux)

echo "===================================="
echo "  Activity Rule Editor 停止脚本"
echo "===================================="
echo ""

echo "正在停止所有服务..."
echo ""

# 停止 Python (后端)
echo "[1/2] 停止后端服务..."
pkill -f "uvicorn backend.api.main:app" || echo "[提示] 未找到运行中的后端进程"
echo "[成功] 后端服务已停止"
echo ""

# 停止 Node (前端)
echo "[2/2] 停止前端服务..."
pkill -f "pnpm dev" || echo "[提示] 未找到运行中的前端进程"
echo "[成功] 前端服务已停止"
echo ""

echo "===================================="
echo "  所有服务已停止！"
echo "===================================="
echo ""

