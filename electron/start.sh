#!/bin/bash
# Electron 应用启动脚本（开发模式）

echo "🚀 启动 Activity Rule Editor - Electron 应用"
echo ""

# 检查依赖
if [ ! -d "node_modules" ]; then
  echo "📦 安装 Electron 依赖..."
  npm install
fi

if [ ! -d "../backend-node/node_modules" ]; then
  echo "📦 安装 Node.js 后端依赖..."
  cd ../backend-node
  npm install
  cd ../electron
fi

# 检查前端是否在运行
echo "⚠️  请确保前端开发服务器正在运行："
echo "   cd web && pnpm dev"
echo ""
read -p "按 Enter 继续启动 Electron..." 

# 启动 Electron
echo "✨ 启动 Electron..."
npm run dev
