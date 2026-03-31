#!/bin/bash
# 对比测试：Node.js vs Python 后端输出

echo "🧪 对比测试：Node.js vs Python 后端"
echo "=================================="
echo ""

# 测试文件
TEST_FILE="../test2.xlsx"

if [ ! -f "$TEST_FILE" ]; then
  echo "❌ 测试文件不存在: $TEST_FILE"
  exit 1
fi

echo "📄 测试文件: $TEST_FILE"
echo ""

# 1. 启动 Node.js 后端（后台）
echo "1️⃣  启动 Node.js 后端 (端口 3000)..."
npm start > /dev/null 2>&1 &
NODE_PID=$!
sleep 3

# 检查是否启动成功
if ! curl -s http://localhost:3000/health > /dev/null; then
  echo "❌ Node.js 后端启动失败"
  kill $NODE_PID 2>/dev/null
  exit 1
fi
echo "   ✅ Node.js 后端已启动"
echo ""

# 2. 启动 Python 后端（后台）
echo "2️⃣  启动 Python 后端 (端口 8000)..."
cd ../backend
uv run uvicorn backend.api.main:app --host 127.0.0.1 --port 8000 > /dev/null 2>&1 &
PYTHON_PID=$!
sleep 3

# 检查是否启动成功
if ! curl -s http://localhost:8000/health > /dev/null; then
  echo "❌ Python 后端启动失败"
  kill $NODE_PID 2>/dev/null
  kill $PYTHON_PID 2>/dev/null
  exit 1
fi
echo "   ✅ Python 后端已启动"
echo ""

# 3. 发送请求并保存结果
echo "3️⃣  发送测试请求..."

# Node.js 后端
curl -s -X POST http://localhost:3000/api/parse \
  -F "file=@$TEST_FILE" \
  -o /tmp/node-result.json

# Python 后端  
curl -s -X POST http://localhost:8000/api/parse \
  -F "file=@$TEST_FILE" \
  -o /tmp/python-result.json

echo "   ✅ 响应已保存"
echo ""

# 4. 对比结果
echo "4️⃣  对比结果..."
echo ""

# 检查文件大小
NODE_SIZE=$(wc -c < /tmp/node-result.json | tr -d ' ')
PYTHON_SIZE=$(wc -c < /tmp/python-result.json | tr -d ' ')

echo "   Node.js 响应大小: $NODE_SIZE bytes"
echo "   Python 响应大小: $PYTHON_SIZE bytes"
echo ""

# 使用 jq 格式化并对比（如果安装了 jq）
if command -v jq &> /dev/null; then
  echo "   使用 jq 格式化后对比..."
  jq -S . /tmp/node-result.json > /tmp/node-formatted.json
  jq -S . /tmp/python-result.json > /tmp/python-formatted.json
  
  if diff -q /tmp/node-formatted.json /tmp/python-formatted.json > /dev/null; then
    echo "   ✅ 输出完全一致！"
  else {
    echo "   ⚠️  输出有差异，详情："
    diff /tmp/node-formatted.json /tmp/python-formatted.json | head -50
  }
else
  echo "   ⚠️  未安装 jq，跳过格式化对比"
  echo "   提示：brew install jq"
fi

echo ""

# 5. 清理
echo "5️⃣  清理..."
kill $NODE_PID 2>/dev/null
kill $PYTHON_PID 2>/dev/null
echo "   ✅ 后端进程已停止"
echo ""

echo "📊 测试结果文件："
echo "   - Node.js: /tmp/node-result.json"
echo "   - Python: /tmp/python-result.json"
echo ""
echo "✨ 对比测试完成！"
