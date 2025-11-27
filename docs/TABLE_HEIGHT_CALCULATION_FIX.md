# 表格高度计算修复

## 问题描述

**症状**：
- 首次加载时，包含图片的表格高度计算不正确
- 只有当画布移出屏幕或切换tab（触发重新渲染）时，高度才正确
- 多页面场景下，部分页面高度显示不正确

**根本原因**：
1. 图片加载是异步的
2. 初始渲染时使用估算高度
3. 图片加载完成后，虽然图片节点渲染了，但高度更新没有正确传播到父组件
4. `useLayoutEffect` 的依赖 `imageLoadingStatus`（Map对象）虽然更新了，但可能在 cellHeights 测量完成之前就触发了高度通知

## 解决方案

### 核心思路

使用**图片加载完成计数器**替代 `imageLoadingStatus` Map 作为依赖：
- 每次图片加载完成，计数器+1
- 计数器是原始类型（number），变化一定会触发 useLayoutEffect
- 确保测量和通知的时序正确

### 具体实现

#### 1. 添加图片加载完成计数器

**文件**：`web/src/renderer/canvas/TableComponent.tsx`

**第72-74行**：
```typescript
// 追踪图片加载完成数量，用于强制触发高度更新
const [loadedImageCount, setLoadedImageCount] = useState(0);
```

#### 2. 图片加载时更新计数器

**第115-135行**：
```typescript
// 按顺序加载图片（利用并发控制）
let completedCount = 0;
for (const { key, url } of imagesToLoad) {
  try {
    const bmp = await loadBitmap(url);

    if (bmp) {
      newImages.set(key, bmp as any);
      statusMap.set(key, "loaded");
    } else {
      statusMap.set(key, "error");
    }
  } catch (error) {
    console.error(`[TableComponent] 图片加载失败 ${url}:`, error);
    statusMap.set(key, "error");
  }

  completedCount++;  // ✅ 增加计数

  // 每加载一张图片就更新状态
  setImageLoadingStatus(new Map(statusMap));
  setLoadedImages(new Map(newImages));
  setLoadedImageCount(completedCount);  // ✅ 更新计数器，触发依赖
}
```

#### 3. 测量高度时依赖计数器

**第282行**：
```typescript
useLayoutEffect(() => {
  // ... 测量逻辑
}, [loadedImageCount]); // ✅ 依赖图片加载完成计数
```

#### 4. 通知高度时依赖计数器 + RAF

**第350-362行**：
```typescript
useLayoutEffect(() => {
  if (onHeightMeasuredRef.current && totalHeight > 0) {
    // ✅ 使用 requestAnimationFrame 确保DOM已经更新完成
    const rafId = requestAnimationFrame(() => {
      if (onHeightMeasuredRef.current) {
        onHeightMeasuredRef.current(totalHeight);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }
}, [totalHeight, loadedImageCount]); // ✅ 依赖计数器
```

## 工作原理

### 执行流程

```
1. 表格开始渲染
   ├─ 初始状态：loadedImageCount = 0
   ├─ 使用估算高度
   └─ 显示图片占位符

2. 图片1加载完成
   ├─ completedCount = 1
   ├─ setLoadedImageCount(1)  ← 触发重新渲染
   ├─ useLayoutEffect (测量) 触发
   │   └─ 测量图片1的实际高度
   ├─ totalHeight 重新计算
   ├─ useLayoutEffect (通知) 触发
   │   ├─ requestAnimationFrame
   │   └─ 通知父组件新高度
   └─ 画布高度更新

3. 图片2加载完成
   ├─ completedCount = 2
   ├─ setLoadedImageCount(2)  ← 再次触发
   └─ ... 重复上述流程

4. 所有图片加载完成
   └─ 最终高度正确
```

### 关键机制

#### 1. 计数器驱动更新

```typescript
// ❌ 之前：使用 Map 对象
const [imageLoadingStatus, setImageLoadingStatus] = useState(new Map());
// 问题：即使创建新 Map，依赖检查可能不够可靠

// ✅ 现在：使用数字计数器
const [loadedImageCount, setLoadedImageCount] = useState(0);
// 优点：原始类型，每次变化一定触发
```

#### 2. RAF 确保 DOM 更新

```typescript
// ❌ 之前：立即通知
onHeightMeasuredRef.current(totalHeight);
// 问题：DOM 可能还没有完全更新

// ✅ 现在：RAF 延迟通知
requestAnimationFrame(() => {
  onHeightMeasuredRef.current(totalHeight);
});
// 优点：确保浏览器已经完成布局和绘制
```

#### 3. useLayoutEffect vs useEffect

使用 `useLayoutEffect` 而不是 `useEffect`：
- `useLayoutEffect`：在 DOM 更新后、浏览器绘制前同步执行
- 可以立即测量到最新的高度
- 避免闪烁（先渲染错误高度，再更新为正确高度）

## 测试验证

### 测试场景1：单页多图片

**步骤**：
1. 上传包含表格的 Excel，表格中有5-10张图片
2. 观察初始加载

**预期结果**：
- ✅ 页面立即显示（使用估算高度）
- ✅ 图片逐个加载，高度逐步调整
- ✅ 所有图片加载完成后，高度正确
- ✅ 不需要移出屏幕或切换tab

### 测试场景2：多页多图片

**步骤**：
1. 上传包含多个地区的 Excel（3-5个页面）
2. 每个页面都有表格和图片
3. 检查所有页面

**预期结果**：
- ✅ 所有页面的高度都正确
- ✅ 不会出现某些页面高度不对的情况
- ✅ 滚动到任何页面，高度都正确

### 测试场景3：快速切换tab

**步骤**：
1. 上传多sheet Excel
2. 快速来回切换 tab
3. 检查每个 tab 的高度

**预期结果**：
- ✅ 每次切换后高度都正确
- ✅ 不会卡在错误的高度

### 测试场景4：慢速网络

**步骤**：
1. Chrome DevTools → Network → Throttling → Slow 3G
2. 上传图片较多的 Excel
3. 观察加载过程

**预期结果**：
- ✅ 图片慢速加载，高度渐进式更新
- ✅ 每张图片加载完成都触发高度更新
- ✅ 最终高度正确

## 调试技巧

### 添加日志

```typescript
// 在 useLayoutEffect 中添加日志
useLayoutEffect(() => {
  console.log('[TableComponent] 测量触发', {
    loadedImageCount,
    cellHeights: cellHeights.size,
    totalHeight
  });
}, [loadedImageCount]);

useLayoutEffect(() => {
  console.log('[TableComponent] 通知高度', {
    totalHeight,
    loadedImageCount
  });
}, [totalHeight, loadedImageCount]);
```

### 检查点

1. **计数器是否更新**：
   - 打开控制台
   - 观察 `loadedImageCount` 的变化
   - 应该从 0 逐步增加到图片总数

2. **高度是否通知**：
   - 在 `onHeightMeasured` 回调中添加日志
   - 检查是否每次图片加载完成都会通知

3. **RAF 是否执行**：
   - 在 RAF 回调中添加日志
   - 确认高度通知是在下一帧执行

## 性能考虑

### 优化点

1. **渐进式更新**：
   - 不需要等待所有图片加载完成
   - 每张图片加载完成立即更新
   - 用户体验更流畅

2. **RAF 节流**：
   - 高度通知使用 RAF
   - 自动合并同一帧内的多次更新
   - 避免过度重绘

3. **条件触发**：
   - 只有在 `totalHeight > 0` 时才通知
   - 避免无效的通知

### 潜在问题

如果图片数量极大（100+），可能的优化：

```typescript
// 可以考虑批量通知（每5张图片通知一次）
if (completedCount % 5 === 0 || completedCount === imagesToLoad.length) {
  setLoadedImageCount(completedCount);
}
```

但当前实现选择了更好的用户体验（实时更新）。

## 相关文件

- `web/src/renderer/canvas/TableComponent.tsx`
  - 图片加载计数器（第72-74行）
  - 加载逻辑（第115-135行）
  - 测量依赖（第228-282行）
  - 通知依赖（第350-362行）

## 后续改进

1. **批量更新策略**：根据图片数量动态调整更新频率
2. **虚拟化支持**：对于超大表格的优化
3. **加载优先级**：首屏图片优先加载

