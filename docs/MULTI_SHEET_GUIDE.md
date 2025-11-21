# 多 Sheet 支持使用指南

## 📋 功能概述

ActivityRuleEditor 现已支持同时处理 Excel 文件中的多个工作表。系统会自动扫描所有 sheet，只处理第一行包含 `REGION-` 标记的工作表。

## ✨ 核心特性

### 1. 智能识别
- ✅ 自动扫描 Excel 中的所有 sheet
- ✅ 只处理包含 `REGION-` 标记的有效 sheet
- ✅ 跳过说明、模板等辅助 sheet
- ✅ 在控制台显示处理和跳过的 sheet 列表

### 2. 统一架构
- **单 sheet 场景**：只有一个有效 sheet，不显示左侧导航
- **多 sheet 场景**：多个有效 sheet，显示左侧导航栏
- 前后端使用统一的数据结构，无需区分单/多模式

### 3. 用户界面
- **左侧导航**：仅在多 sheet 时显示，列出所有工作表
- **快速切换**：点击工作表名称即可切换查看
- **状态指示**：高亮显示当前选中的 sheet
- **页数统计**：每个 sheet 显示包含的页数

### 4. 导出功能
- **分文件夹打包**：每个 sheet 的图片存放在独立文件夹
- **批量导出**：一次导出所有 sheet 的所有页面
- **进度显示**：实时显示渲染、打包、写入进度
- **文件命名**：自动清理 sheet 名称中的非法字符

## 📝 使用步骤

### 步骤 1：准备 Excel 文件

确保你的 Excel 文件结构正确：

```
test.xlsx
├── Sheet1 (规则-CN)          ← 第一行有 REGION-，会被处理
│   └── REGION-A, REGION-B...
├── Sheet2 (规则-EN)          ← 第一行有 REGION-，会被处理
│   └── REGION-A, REGION-B...
├── 说明                      ← 第一行无 REGION-，会被跳过
└── 模板                      ← 第一行无 REGION-，会被跳过
```

### 步骤 2：启动应用

**后端：**
```bash
python -m uvicorn backend.api.main:app --reload --host 127.0.0.1 --port 8000
```

**前端：**
```bash
cd web
pnpm dev
```

### 步骤 3：上传文件

1. 访问 `http://localhost:5173`
2. 拖拽或选择 Excel 文件上传
3. 系统自动解析并显示结果

### 步骤 4：切换查看

**多 sheet 场景：**
- 左侧显示工作表导航
- 点击不同 sheet 名称切换查看
- 顶部显示当前 sheet 和总统计

**单 sheet 场景：**
- 无左侧导航（自动适配）
- 直接显示唯一的 sheet 内容

### 步骤 5：导出图片

1. 点击右下角"导出全部"按钮（多 sheet）或"导出 PNG"（单 sheet）
2. 等待渲染完成（实时显示进度）
3. 选择保存位置
4. 获得分文件夹的 ZIP 压缩包

## 📦 导出结构

**多 sheet 导出示例：**
```
export-multi-sheets.zip
├── 规则-CN/
│   ├── page-A-1.png
│   ├── page-A-2.png
│   └── page-B-1.png
├── 规则-EN/
│   ├── page-A-1.png
│   ├── page-A-2.png
│   └── page-B-1.png
└── 规则-JP/
    ├── page-A-1.png
    └── page-B-1.png
```

**单 sheet 导出示例：**
```
export.zip
├── page-A-1.png
├── page-A-2.png
└── page-B-1.png
```

## 🔍 后端 API 变化

### 请求（保持不变）
```bash
POST /api/parse
Content-Type: multipart/form-data

file: [Excel 文件]
sheet: [可选] 指定某个 sheet 名称
```

### 响应（统一为 sheets 结构）
```json
{
  "ok": true,
  "sheets": {
    "规则-CN": {
      "result": {
        "pages": [...]
      },
      "images": {
        "icon1.png": "/media/abc123..."
      }
    },
    "规则-EN": {
      "result": {
        "pages": [...]
      },
      "images": {}
    }
  },
  "skipped_sheets": ["说明", "模板"],
  "blob_store_size": 10
}
```

## 🎯 最佳实践

### 1. Excel 文件组织
- ✅ 有效的 sheet 放在前面
- ✅ 使用有意义的 sheet 名称（如"规则-CN"、"规则-EN"）
- ✅ 辅助 sheet（说明、模板）不要添加 `REGION-` 标记

### 2. 命名建议
- ✅ 避免使用特殊字符（`<>:"/\|?*`）
- ✅ 使用简短清晰的名称
- ✅ 考虑导出后的文件夹结构

### 3. 性能优化
- ✅ 单次导出建议不超过 10 个 sheet
- ✅ 每个 sheet 建议不超过 20 页
- ✅ 图片尺寸控制在合理范围

## ⚠️ 注意事项

1. **REGION- 标记必须在第一行**
   - 系统只检查每个 sheet 的第一行
   - 标记格式：`REGION-xxx`（大小写敏感）

2. **内存限制**
   - 图片暂存在内存中，重启后丢失
   - 建议及时导出，不要长时间保持

3. **兼容性**
   - 单 sheet 文件完全向后兼容
   - 旧的 JSON 文件需要手动转换

4. **导出文件名**
   - 特殊字符自动替换为下划线
   - Windows 和 macOS 都兼容

## 🐛 故障排查

### 问题：某个 sheet 没有被处理

**检查：**
1. 第一行是否包含 `REGION-` 标记？
2. 标记格式是否正确（注意大小写）？
3. 查看控制台的"跳过的 sheet"列表

### 问题：左侧导航没有显示

**原因：** 只有一个有效 sheet（单 sheet 模式）

**解决：** 这是正常的，系统自动适配

### 问题：导出后文件夹名称奇怪

**原因：** sheet 名称包含非法字符

**解决：** 
- 在 Excel 中重命名 sheet
- 避免使用特殊字符

### 问题：图片没有显示

**检查：**
1. 后端服务是否正常运行？
2. 浏览器控制台是否有 CORS 错误？
3. 图片是否正确嵌入在 Excel 中？

## 📚 相关文档

- [README.md](README.md) - 项目总览
- [API_SETUP.md](API_SETUP.md) - API 配置详解
- [README_EXCEL_PARSING.md](README_EXCEL_PARSING.md) - Excel 解析逻辑
- [CLAUDE.md](CLAUDE.md) - 开发指南

## 🎉 总结

多 Sheet 支持让 ActivityRuleEditor 更加强大和灵活：
- ✅ 一次处理多个语言版本
- ✅ 自动识别有效内容
- ✅ 统一的用户体验
- ✅ 高效的批量导出

享受更高效的工作流程！🚀

