#!/bin/bash

# Activity Rule Editor 启动脚本 (macOS/Linux)

set -e

echo "===================================="
echo "  Activity Rule Editor 启动脚本"
echo "===================================="
echo ""

# 检查 uv 是否安装
if ! command -v uv &> /dev/null; then
    echo "[错误] 未检测到 uv，请先安装 uv"
    echo "安装方法: curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "或访问: https://github.com/astral-sh/uv"
    exit 1
fi

# 同步依赖（如果还没有安装）
echo "[0/2] 检查并安装 Python 依赖..."
uv sync --quiet
if [ $? -ne 0 ]; then
    echo "[错误] 依赖安装失败"
    exit 1
fi
echo "[成功] Python 依赖已就绪"
echo ""

# 启动后端
echo "[1/2] 启动后端服务..."
uv run uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000 > /dev/null 2>&1 &
BACKEND_PID=$!
sleep 2
echo "[成功] 后端服务已在后台启动 (http://127.0.0.1:8000) [PID: $BACKEND_PID]"
echo ""

# 启动前端
echo "[2/2] 启动前端服务..."
cd web
pnpm dev > /dev/null 2>&1 &
FRONTEND_PID=$!
cd ..
sleep 3
echo "[成功] 前端服务已在后台启动 (http://localhost:5173) [PID: $FRONTEND_PID]"
echo ""

echo "===================================="
echo "  所有服务已启动！"
echo "===================================="
echo ""
echo "后端服务: http://127.0.0.1:8000 [PID: $BACKEND_PID]"
echo "前端服务: http://localhost:5173 [PID: $FRONTEND_PID]"
echo ""
echo "提示："
echo "- 所有服务运行在后台"
echo "- 停止服务: kill $BACKEND_PID $FRONTEND_PID"
echo "- 或运行 ./stop.sh 停止所有服务"
echo ""

