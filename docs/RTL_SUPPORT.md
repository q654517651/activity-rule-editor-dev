# RTL（从右到左）语言支持

本项目支持阿拉伯语和希伯来语等 RTL（Right-to-Left，从右到左）语言的排版。

## 功能特性

### 基于地区代码的语言判断

系统根据 Excel 文件中的 **地区代码（region）** 自动判断语言方向：

- **后端自动识别**：在解析 Excel 时，后端根据 `REGION-` 标记的地区代码判断语言方向
- **RTL 地区列表**：
  - `MECA`：中东
  - `ARAB`, `ARABIC`：阿拉伯地区
  - `SA`：沙特阿拉伯
  - `UAE`：阿联酋
  - `EG`：埃及
  - `IL`, `ISRAEL`：以色列（希伯来语）
  - `JO`：约旦
  - `LB`：黎巴嫩
  - `IQ`：伊拉克
  - `SY`：叙利亚
- **零配置**：前端直接使用后端提供的 `direction` 字段，无需额外配置

### RTL 布局调整

当检测到 RTL 语言时，系统会自动调整布局：

1. **文本对齐**：
   - Section 内容文本：右对齐（RTL）vs 左对齐（LTR）
   - 奖励描述文本：右对齐（RTL）vs 左对齐（LTR）
   - Section 标题和奖励名称：保持居中对齐

2. **奖励网格排列**：
   - **RTL 模式**：奖励从右到左排列（第一个奖励在最右边）
   - **LTR 模式**：奖励从左到右排列（第一个奖励在最左边）

## 支持的语言

### RTL 语言（自动检测）

- **阿拉伯语**（Arabic）
  - Unicode 范围：\u0600-\u06FF
  - Arabic Supplement：\u0750-\u077F
  - Arabic Extended-A：\u08A0-\u08FF
  - Arabic Presentation Forms：\uFB50-\uFDFF, \uFE70-\uFEFF

- **希伯来语**（Hebrew）
  - Unicode 范围：\u0590-\u05FF

### LTR 语言（默认）

- 英语、中文、日语、韩语等其他所有语言

## 后端 JSON 响应格式

后端解析 Excel 后会在每个 page 中自动添加 `direction` 字段：

```json
{
  "ok": true,
  "sheets": {
    "rules": {
      "result": {
        "pages": [
          {
            "region": "MECA",
            "direction": "rtl",
            "blocks": [...]
          },
          {
            "region": "EN",
            "direction": "ltr",
            "blocks": [...]
          }
        ]
      }
    }
  }
}
```

字段说明：
- `direction`: `"rtl"` 或 `"ltr"`
- 由后端根据 `region` 代码自动判断
- 前端直接使用，无需二次判断

## 实现细节

### 核心文件

**后端（Python）：**
1. **excel_parser.py**：
   - `RTL_REGIONS`：RTL 地区代码集合
   - `is_rtl_region(region_code)`：判断地区是否为 RTL
   - 在 `parse_sheet()` 中为每个 page 添加 `direction` 字段

**前端（TypeScript）：**
1. **PageCanvas.tsx**：画布渲染组件
   - 直接读取 `page.direction` 字段
   - 根据方向调整文本对齐和奖励网格排列
   - 为所有 Text 组件设置 `direction` 属性（Konva 原生支持）

2. **types.ts**：数据类型定义
   - Page 类型包含 `direction?: 'rtl' | 'ltr'` 字段

3. **konva-extensions.d.ts**：TypeScript 类型扩展
   - 为 react-konva 的 Text 组件添加 `direction` 属性的类型定义

### Konva direction 属性

Konva 9.3+ 原生支持 `direction` 属性：
- 底层使用 Canvas 2D Context 的 `direction` API
- 自动处理 BiDi（双向文本）渲染
- 正确显示阿拉伯语连写和字形变换

### 架构优势

- ✅ **准确性高**：基于明确的地区标识，无模糊性
- ✅ **性能最优**：后端判断一次，前端直接使用
- ✅ **易维护**：新增 RTL 地区只需更新后端列表
- ✅ **可预测**：同地区始终使用相同方向
- ✅ **零配置**：前端无需任何检测逻辑

## 测试

### 测试 RTL 排版

**方法 1：使用 Excel**

在 Excel 的第一行使用 RTL 地区代码作为 REGION 标记：
```
REGION-MECA    (中东地区)
REGION-ARAB    (阿拉伯地区)
REGION-SA      (沙特)
```

上传 Excel 后，对应页面会自动使用 RTL 排版。

**方法 2：使用测试 JSON**

本项目提供了测试数据文件：`docs/RTL_TEST_DATA.json`

上传后观察效果：
- **MECA 页面**：
  - ✅ 文本右对齐
  - ✅ 奖励从右到左排列（第一个奖励在最右边）
  - ✅ 字形正确显示（阿拉伯语连写正确）
  - ✅ 页面标题显示 "MECA"（不显示"页面"前缀）

- **EN 页面**：
  - ✅ 文本左对齐
  - ✅ 奖励从左到右排列
  - ✅ 标准 LTR 排版
  - ✅ 页面标题显示 "EN"

## 添加新的 RTL 地区

如需添加新的 RTL 地区，只需修改后端代码：

**文件：** `backend/services/excel_parser.py`

```python
# 在 RTL_REGIONS 集合中添加新地区代码
RTL_REGIONS = {'MECA', 'ARAB', 'ARABIC', 'SA', 'UAE', 'EG', 'IL', 'ISRAEL', 'JO', 'LB', 'IQ', 'SY', 'NEW_REGION'}
```

重启后端服务即可生效，前端无需任何修改。

## 高度测量优化

本项目使用 **Konva 实际渲染高度** 而非预测算法，确保所有语言的文本高度都准确：

- ✅ **实时测量**：使用 `useLayoutEffect` 在渲染后获取实际高度
- ✅ **多语言准确**：阿拉伯语、西班牙语、马来语等所有语言都准确
- ✅ **自动换行**：浏览器原生处理文本换行和 BiDi 算法
- ✅ **动态更新**：文本内容变化时自动重新测量

### 技术实现

```typescript
// 使用 ref 获取实际高度
const textRef = useRef<Konva.Text>(null);

useLayoutEffect(() => {
  if (textRef.current) {
    const actualHeight = textRef.current.height();
    // 使用实际高度更新布局
  }
}, [text, width]);
```

## 注意事项

1. **浏览器兼容性**：RTL 支持依赖于浏览器的 Unicode 渲染能力，现代浏览器都支持良好。

2. **字体选择**：确保使用的字体支持阿拉伯语或希伯来语字符，否则可能显示为方块或问号。

3. **地区代码准确性**：确保 Excel 中的 `REGION-` 标记准确反映语言地区。

4. **页面标题**：页面标题直接显示地区代码（如 "MECA"），不再添加"页面"前缀。

5. **高度测量**：首次渲染可能使用估算高度，渲染完成后会自动调整为实际高度（可能有轻微闪烁）。

