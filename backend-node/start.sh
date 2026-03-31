#!/bin/bash
# Node.js 后端启动脚本

echo "🚀 启动 Activity Rule Editor - Node.js 后端"
echo "📍 端口: 3000"
echo ""

# 检查 node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 首次运行，安装依赖..."
  npm install
  echo ""
fi

# 启动服务器
echo "✨ 启动服务器..."
npm run dev
