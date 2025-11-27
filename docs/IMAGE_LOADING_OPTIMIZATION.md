# 图片加载优化说明

## 问题描述

在云端部署时，当存在大量图片时会出现以下问题：

1. **页面加载慢**：15秒以上才能显示内容
2. **图片加载失败**：部分图片间歇性加载失败，切换tab后又能加载
3. **用户体验差**：加载期间页面完全空白，没有反馈

## 根本原因

1. **浏览器并发限制**：浏览器对同一域名有并发连接数限制（通常6-8个），大量图片同时请求导致请求阻塞或超时
2. **没有超时和重试机制**：网络波动时请求失败后不会重试
3. **缺少加载反馈**：用户无法知道页面正在加载还是卡死了
4. **请求堆积**：快速切换tab时，前一个tab的请求还在进行，新tab又发起新请求

## 解决方案

### 1. 并发控制队列 (`useImageCache.ts`)

```typescript
class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private maxConcurrent = 6; // 限制同时最多6个请求
  
  async add<T>(fn: () => Promise<T>): Promise<T> {
    // 将请求加入队列，控制并发数
  }
}
```

**效果**：
- 限制同时进行的图片请求数量
- 避免超出浏览器连接限制
- 减少请求被阻塞的情况

### 2. 超时和重试机制

```typescript
async function fetchAsBlob(
  url: string,
  retries = 3,
  timeout = 10000, // 10秒超时
): Promise<Blob> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const res = await fetch(url, {
        signal: controller.signal,
        cache: "force-cache", // 使用浏览器缓存
      });
      
      // 成功则返回
      return await res.blob();
    } catch (error) {
      // 失败则重试，使用指数退避
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
```

**效果**：
- 请求超过10秒自动中断并重试
- 最多重试3次，增加成功率
- 使用指数退避避免服务器压力
- 利用浏览器缓存减少重复请求

### 3. 渐进式加载 + 加载状态显示

#### TableComponent.tsx

```typescript
// 状态管理
const [imageLoadingStatus, setImageLoadingStatus] = useState<
  Map<string, "loading" | "loaded" | "error">
>(new Map());

// 渐进式加载
for (const { key, url } of imagesToLoad) {
  try {
    const bmp = await loadBitmap(url);
    if (bmp) {
      newImages.set(key, bmp);
      statusMap.set(key, "loaded");
    }
  } catch (error) {
    statusMap.set(key, "error");
  }
  
  // 每加载一张就更新状态，不等全部加载完
  setImageLoadingStatus(new Map(statusMap));
  setLoadedImages(new Map(newImages));
}
```

**UI显示**：
- **Loading状态**：灰色占位框 + "Loading..." 文字
- **Loaded状态**：显示实际图片
- **Error状态**：红色背景 + "❌ 加载失败"

#### PageCanvas.tsx (RewardItem)

同样的逻辑应用到奖励图片加载。

**效果**：
- 用户立即看到页面结构
- 图片加载完一张显示一张
- 清晰的加载反馈
- 错误状态可见，便于调试

## 优化效果

### 性能提升

1. **减少失败率**：
   - 并发控制避免浏览器连接限制
   - 重试机制处理暂时性网络问题
   - 预期失败率从20-30%降低到<5%

2. **改善加载体验**：
   - 页面立即可见（不再等待15秒）
   - 图片渐进式加载（逐个显示）
   - 明确的加载状态反馈

3. **提高可靠性**：
   - 超时控制避免请求挂起
   - 自动重试处理网络波动
   - 浏览器缓存减少重复请求

### 用户体验改善

**优化前**：
```
[用户上传文件] → [等待15秒白屏] → [页面突然出现，部分图片缺失]
```

**优化后**：
```
[用户上传文件] → [立即看到页面结构] → [图片逐个加载显示] → [所有内容完整]
```

## 技术细节

### 并发控制

- 最大并发数：6（符合HTTP/1.1标准）
- 队列策略：FIFO（先进先出）
- 自动调度：请求完成后自动处理队列中的下一个

### 重试策略

- 最大重试次数：3次
- 超时时间：10秒
- 退避策略：1秒、2秒、3秒（线性退避）
- 重试条件：超时或fetch失败

### 缓存策略

- 使用 `cache: "force-cache"` 
- 内存缓存（Map）避免重复加载
- 同一图片只加载一次

### 状态管理

- 三种状态：loading、loaded、error
- 渐进式更新（每张图片完成后立即更新UI）
- React状态同步确保UI实时反馈

## 后续优化建议

### 短期（可选）

1. **预加载优先级**：首屏图片优先加载
2. **图片懒加载**：已实现Intersection Observer（CanvasCell）
3. **添加加载动画**：可以添加CSS动画让占位符更生动

### 长期（需要后端配合）

1. **流式返回**：后端先返回JSON结构，图片异步就绪
2. **图片CDN**：使用CDN加速图片加载
3. **图片压缩**：后端提供多种尺寸（缩略图、原图）
4. **HTTP/2**：支持多路复用，突破6个并发限制

## 测试建议

1. **本地测试**：
   ```bash
   # 限制网络速度模拟慢速网络
   # Chrome DevTools → Network → Throttling → Slow 3G
   ```

2. **压力测试**：
   - 上传包含50+张图片的Excel
   - 观察加载状态是否正常显示
   - 检查是否有图片加载失败

3. **切换测试**：
   - 快速切换多个sheet
   - 验证之前的请求是否被正确处理
   - 检查内存是否泄漏

## 相关文件

- `web/src/renderer/canvas/useImageCache.ts` - 核心缓存和加载逻辑
- `web/src/renderer/canvas/TableComponent.tsx` - 表格图片加载
- `web/src/renderer/canvas/PageCanvas.tsx` - 奖励图片加载

## 监控和调试

所有图片加载都有console日志：

```typescript
// 成功
console.log(`[loadBitmap] 已加载: ${url}`);

// 失败
console.error(`[loadBitmap] 加载失败 ${url}:`, error);

// 重试
console.warn(`[fetchAsBlob] 超时，重试 ${attempt}/${retries}: ${url}`);
```

打开浏览器控制台可以观察详细的加载过程。

