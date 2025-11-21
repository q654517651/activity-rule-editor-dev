#!/bin/bash
# 快速部署脚本

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "=========================================="
echo "  Activity Rule Editor 部署脚本"
echo "=========================================="
echo ""

# 检查是否在项目根目录
if [ ! -f "pyproject.toml" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 更新后端依赖
echo "[1/3] 更新后端依赖..."
if command -v uv &> /dev/null; then
    uv sync --extra production
else
    echo "警告: 未找到 uv，请先安装 uv"
    exit 1
fi
echo "✓ 后端依赖已更新"
echo ""

# 构建前端
echo "[2/3] 构建前端..."
cd web
if [ -z "$VITE_API_BASE" ]; then
    export VITE_API_BASE=""
    echo "提示: 使用默认 API 地址（相对路径，与后端同域）"
    echo "如需自定义，请设置环境变量: export VITE_API_BASE='https://api.example.com'"
fi

if command -v pnpm &> /dev/null; then
    pnpm install
    pnpm build
else
    echo "错误: 未找到 pnpm，请先安装 pnpm"
    exit 1
fi
cd ..
echo "✓ 前端构建完成"
echo ""

# 检查静态文件目录
if [ ! -d "web/dist" ]; then
    echo "错误: 前端构建失败，web/dist 目录不存在"
    exit 1
fi

# 重启服务（如果 supervisor 服务存在）
echo "[3/3] 检查服务状态..."
if sudo supervisorctl status activity-rule-editor >/dev/null 2>&1; then
    echo "重启服务..."
    sudo supervisorctl restart activity-rule-editor
    echo "✓ 服务已重启"
else
    echo "提示: supervisor 服务未配置，请手动配置:"
    echo "  sudo cp scripts/supervisor.conf /etc/supervisor/conf.d/activity-rule-editor.conf"
    echo "  sudo supervisorctl reread"
    echo "  sudo supervisorctl update"
    echo "  sudo supervisorctl start activity-rule-editor"
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "前端构建目录: web/dist/"
echo "服务状态: sudo supervisorctl status activity-rule-editor"
echo "查看日志: sudo supervisorctl tail -f activity-rule-editor"
echo ""

