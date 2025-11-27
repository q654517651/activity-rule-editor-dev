# 表格 rowspan 渲染问题修复

## 问题描述

当Excel表格中有跨行合并的单元格时，部分数据行无法正确渲染。

### 原始数据示例

```
行1: physical rewards xcoins value (合并3列)
行2: reward | pic | xcoins value (表头)
行3: iPhone 17 pro max 256 | image1 | 13120000 (合并到行4)
行4: [被合并占用，应该为空]
行5: iPad air 11inch 128g | image2 | 4592000
行6: Apple Watch Series 11 | image3 | 3936000
```

### 问题现象

- iPad 这一行无法显示
- 控制台显示图片加载失败

## 问题根源

### 后端问题

在 `backend/services/excel_parser.py` 的 `collect_table` 函数中：

```python
# 旧代码（第285-286行）
if row_data:
    table_data["rows"].append(row_data)
```

**问题**：当整行都是合并单元格的子单元格时，`row_data` 为空数组，这一行被跳过了。

**结果**：
```json
rows[0]: physical rewards... (合并)
rows[1]: reward | pic | xcoins value (表头)
rows[2]: iPhone (rowspan:2) | image (rowspan:2) | 13120000 (rowspan:2)
rows[3]: iPad air...  ← 错误！应该是空行
rows[4]: Apple Watch...
```

### 数据结构不一致

- rows[2] 的单元格设置了 `rowspan: 2`，表示占据行2和行3
- 但 rows[3] 却有 iPad 的数据（应该在 rows[4]）
- 前端 cellLayout 逻辑认为 rows[3] 的所有列都被占用了
- 尝试渲染 rows[3] 的 iPad 数据时找不到可用列位置，被跳过

## 解决方案

### 修改后端代码

**位置**：`backend/services/excel_parser.py` 第285-288行

**修改前**：
```python
if row_data:
    table_data["rows"].append(row_data)

rr += 1
```

**修改后**：
```python
# 始终添加行数据，即使为空（被合并单元格占用的行）
# 这样可以保持行号的连续性，前端能正确处理 rowspan
table_data["rows"].append(row_data)

rr += 1
```

### 正确的数据结构

修复后，后端返回的数据结构：

```json
{
  "rows": [
    [/* 行0: physical rewards... (colspan:3) */],
    [/* 行1: reward | pic | xcoins value */],
    [/* 行2: iPhone (rowspan:2) | image (rowspan:2) | 13120000 (rowspan:2) */],
    [],  // ← 行3: 空数组（被行2占用）
    [/* 行4: iPad air... */],
    [/* 行5: Apple Watch... */]
  ]
}
```

## 原理说明

### rowspan 的语义

当一个单元格设置 `rowspan: 2` 时：
- 它在**视觉上**占据2行的高度
- 它在**数据结构上**占用2行的位置
- 被占用的第2行应该存在（作为空行）

### 为什么需要空行

1. **数据严谨性**：保持行号与Excel的对应关系
   - Excel行3被合并 → JSON rows[3] 应该存在（虽然为空）
   - Excel行4是iPad → JSON rows[4] 是iPad

2. **前端渲染逻辑**：cellLayout 使用 matrix 矩阵追踪占用情况
   - rows[2] 的 rowspan:2 → matrix[2][0/1/2] 和 matrix[3][0/1/2] 都标记为已占用
   - rows[3] 是空数组 → 不尝试渲染任何单元格
   - rows[4] 的数据 → 可以正常找到可用列位置

3. **视觉效果**：支持不统一的行高
   - rowspan:2 的单元格会自动占据2个行位置的高度
   - 每个单元格根据内容和padding自动撑开
   - 不需要所有行高度一致

## 测试验证

### 测试步骤

1. 重启后端服务器（或等待auto-reload）
2. 重新上传包含合并单元格的Excel文件
3. 检查表格渲染

### 预期结果

- 所有行都能正确显示
- 合并单元格占据正确的高度（跨越多行）
- iPad、Apple Watch等数据都能正确显示
- 图片能正常加载

### 后端日志验证

可以在解析日志中看到：
```
表格行数：6（包括空行）
```

### 前端控制台验证

```javascript
console.log('table.rows.length:', table.rows.length);  // 应该是6
console.log('table.rows[3]:', table.rows[3]);  // 应该是 []
console.log('table.rows[4]:', table.rows[4]);  // 应该是 iPad 数据
```

## 相关文件

- **后端**：`backend/services/excel_parser.py`（第285-288行）
- **前端**：`web/src/renderer/canvas/TableComponent.tsx`（cellLayout逻辑，第156-219行）

## 注意事项

1. **空行不会被渲染**：前端会跳过空行（`row.length === 0`），不会显示空白行
2. **matrix占用状态保持**：空行虽然不渲染，但matrix中的占用状态会保留
3. **行高自动计算**：每行根据实际内容计算高度，支持不统一的行高
4. **数据一致性**：Excel行号和JSON数组索引保持对应关系

## 其他改进

如果需要可视化空行（调试用），可以在前端添加：

```typescript
// 在 TableComponent 渲染时
{table.rows.map((row, rowIdx) => {
  if (row.length === 0) {
    // 空行：可以渲染一个灰色的占位行（可选）
    return (
      <Group key={`empty-row-${rowIdx}`}>
        <Rect
          fill="#f5f5f5"
          height={minRowHeight}
          width={width}
          x={0}
          y={rowY}
          opacity={0.3}
        />
      </Group>
    );
  }
  // ... 正常渲染
})}
```

但通常不需要可视化空行，因为合并单元格会自动填充这个空间。

