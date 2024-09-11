# LiteOfd 类方法说明文档

版本：0.0.1

## 1. 简介

LiteOfd 是一个用于处理 OFD（Open Fixed-layout Document）文件的轻量级库。它提供了解析、渲染和操作 OFD 文档的功能，使开发者能够在 Web 应用中轻松展示和操作 OFD 文档。

## 2. 核心方法

### 2.1 parseFile(file: File): PromiseCapability<OfdDocument>

描述：解析上传的 OFD 文件。

参数：
- file: File - 用户上传的 OFD 文件对象

返回值：
- PromiseCapability<OfdDocument>：一个 Promise，解析成功后返回 OfdDocument 对象

示例：
```typescript
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const file = fileInput.files?.[0];
if (file) {
  let ofdPromise = liteOfd.parseFile(file);
  ofdPromise.promise.then((data: OfdDocument) => {
    console.log('解析OFD文件成功:', data);
  }).catch((error) => {
    console.error('解析OFD文件失败:', error);
  });
}
```

### 2.2 renderOfd(): HTMLDivElement

描述：渲染 OFD 文档。

返回值：
- HTMLDivElement：渲染后的 div 元素

示例：
```typescript
const ofdDiv = liteOfd.renderOfd();
document.getElementById('content').appendChild(ofdDiv);
```

### 2.3 getCurrentPageIndex(): number

描述：获取当前页面索引。

返回值：
- number：当前页面的索引

示例：
```typescript
const currentPage = liteOfd.getCurrentPageIndex();
console.log(`当前页面：${currentPage}`);
```

### 2.4 getTotalPages(): number

描述：获取文档总页数。

返回值：
- number：文档的总页数

示例：
```typescript
const totalPages = liteOfd.getTotalPages();
console.log(`总页数：${totalPages}`);
```

### 2.5 nextPage()

描述：跳转到下一页。

示例：
```typescript
liteOfd.nextPage();
```

### 2.6 prevPage()

描述：跳转到上一页。

示例：
```typescript
liteOfd.prevPage();
```

### 2.7 scrollToPage(pageIndex: number)

描述：滚动到指定页面。

参数：
- pageIndex: number - 目标页面索引

示例：
```typescript
liteOfd.scrollToPage(1); // 跳转到第一页
```

### 2.8 zoomIn()

描述：放大文档。

示例：
```typescript
liteOfd.zoomIn();
```

### 2.9 zoomOut()

描述：缩小文档。

示例：
```typescript
liteOfd.zoomOut();
```

### 2.10 resetZoom()

描述：重置文档缩放比例。

示例：
```typescript
liteOfd.resetZoom();
```

### 2.11 searchText(keyword: string)

描述：搜索文档中的关键词。

参数：
- keyword: string - 要搜索的关键词

示例：
```typescript
liteOfd.searchText("示例关键词");
```

### 2.12 getContentText(pageIndex: number | null): string

描述：获取指定页面或全文的文本内容。

参数：
- pageIndex: number | null - 页面索引，如果为 null 则获取全文

返回值：
- string：指定页面或全文的文本内容

示例：
```typescript
const content = liteOfd.getContentText(null);
console.log("文档内容:", content);
```

### 2.13 executeAction(action: XmlData)

描述：执行指定的动作（如跳转到特定页面）。

参数：
- action: XmlData - 要执行的动作数据

示例：
```typescript
// 假设 action 是从大纲数据中获取的
liteOfd.executeAction(action);
```

## 3. 事件监听

LiteOfd 类会触发一些自定义事件，您可以监听这些事件来执行相应的操作：

### 3.1 ofdPageChange 事件

描述：当 OFD 文档页面发生变化时触发。

示例：
```typescript
window.addEventListener('ofdPageChange', (event: CustomEvent) => {
  // 更新页面信息显示
  updatePageInfo();
});
```

### 3.2 signature-element-click 事件

描述：当点击签名元素时触发。

示例：
```typescript
appContent.addEventListener('signature-element-click', (event: CustomEvent) => {
  const { nodeData, sealObject } = event.detail;
  console.log('Clicked Signature Element:', nodeData);
  console.log('Seal Object:', sealObject);
  // 显示签名详情
  displaySignatureDetails(nodeData, sealObject);
});
```

## 4. 注意事项

- 在使用 LiteOfd 类的方法之前，请确保已经成功解析了 OFD 文件。
- 某些方法（如 nextPage、prevPage 等）可能会触发 ofdPageChange 事件，请根据需要添加相应的事件监听器。
- 对于大型 OFD 文件，解析和渲染可能需要一些时间，建议添加适当的加载提示。
