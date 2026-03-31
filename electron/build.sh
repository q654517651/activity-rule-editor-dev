#!/bin/bash
# Electron 完整构建脚本

set -e  # 遇到错误立即退出

echo "🚀 Activity Rule Editor - Electron 构建"
echo "========================================="
echo ""

# 检查参数
PLATFORM=${1:-mac}

if [ "$PLATFORM" != "mac" ] && [ "$PLATFORM" != "win" ] && [ "$PLATFORM" != "all" ]; then
  echo "用法: ./build.sh [mac|win|all]"
  echo ""
  echo "示例："
  echo "  ./build.sh mac   # 只构建 macOS 版本"
  echo "  ./build.sh win   # 只构建 Windows 版本"
  echo "  ./build.sh all   # 构建所有平台"
  exit 1
fi

echo "📦 目标平台: $PLATFORM"
echo ""

# 1. 构建 Python 后端单文件
echo "1️⃣  构建 Python 后端单文件..."
cd ..
./scripts/build-electron-backend.sh
echo ""

# 2. 构建前端
echo "2️⃣  构建前端..."
cd web

# 设置环境变量，让前端使用相对路径
export VITE_API_BASE=""

if [ ! -d "dist-electron" ] || [ "${FORCE_REBUILD:-0}" = "1" ]; then
  echo "   开始构建..."
  pnpm build:electron
  echo "   ✅ 前端构建完成"
else
  echo "   ✅ dist-electron 目录已存在（跳过构建）"
  echo "   提示：设置 FORCE_REBUILD=1 强制重新构建"
fi
echo ""

# 3. 安装 Electron 依赖
echo "3️⃣  安装 Electron 依赖..."
cd ../electron
if [ ! -d "node_modules" ]; then
  npm install
  echo "   ✅ 依赖安装完成"
else
  echo "   ✅ 依赖已存在"
fi
echo ""

# 4. 创建占位图标（如果不存在）
echo "4️⃣  检查应用图标..."
mkdir -p assets

if [ ! -f "assets/icon.icns" ] && [ "$PLATFORM" = "mac" -o "$PLATFORM" = "all" ]; then
  echo "   ⚠️  macOS 图标不存在，创建占位图标..."
  # 这里需要手动创建图标文件
  echo "   提示：请将 icon.icns 放置在 electron/assets/ 目录"
fi

if [ ! -f "assets/icon.ico" ] && [ "$PLATFORM" = "win" -o "$PLATFORM" = "all" ]; then
  echo "   ⚠️  Windows 图标不存在，创建占位图标..."
  echo "   提示：请将 icon.ico 放置在 electron/assets/ 目录"
fi

if [ ! -f "assets/icon.png" ]; then
  echo "   ⚠️  Linux 图标不存在"
  echo "   提示：请将 icon.png 放置在 electron/assets/ 目录"
fi
echo ""

# 5. 构建 Electron 应用
echo "5️⃣  打包 Electron 应用..."
echo ""

case $PLATFORM in
  mac)
    echo "   构建 macOS 版本（ARM64）..."
    npm run build:mac
    ;;
  win)
    echo "   构建 Windows 版本..."
    npm run build:win
    ;;
  all)
    echo "   构建所有平台..."
    npm run build:mac
    npm run build:win
    ;;
esac

echo ""
echo "✅ 构建完成！"
echo ""
echo "📦 输出目录: electron/dist/"
echo ""
ls -lh dist/ | grep -E '\.(dmg|exe|AppImage|zip)$' || echo "   (检查 dist/ 目录)"
echo ""
echo "🎉 打包完成！"
