LiteOfd 类方法说明文档

1. 简介

LiteOfd 是一个用于处理 OFD（Open Fixed-layout Document）文件的轻量级库。它提供了渲染 OFD 数据和解析 OFD 文件的功能，使开发者能够轻松地在 Web 应用中展示和操作 OFD 文档。

2. 安装

目前，LiteOfd 库尚未发布到 npm。您可以通过以下方式将其集成到您的项目中：

- 克隆仓库：git clone [仓库URL]
- 复制 src/liteofd 目录到您的项目中
- 在您的项目中引入 LiteOfd 类

3. 使用方法

3.1 renderOfd()

描述：渲染OFD文档，使用默认的渲染方式。

返回值：
- HTMLDivElement：渲染后的div元素。

示例：
const liteOfd = new LiteOfd();
const renderedDiv = liteOfd.renderOfd();
document.body.appendChild(renderedDiv);

3.2 renderOfdWithCustomDiv(customDiv: HTMLDivElement, pageWrapStyle: string | null = null)

描述：使用自定义的div来渲染OFD文档。

参数：
- customDiv: HTMLDivElement - 自定义的div元素
- pageWrapStyle: string | null - 页面的样式，可选参数

返回值：
- HTMLDivElement：渲染后的div元素。

示例：
const liteOfd = new LiteOfd();
const customDiv = document.createElement('div');
const pageStyle = "background-color: #f0f0f0; margin: 10px;";
const renderedDiv = liteOfd.renderOfdWithCustomDiv(customDiv, pageStyle);
document.body.appendChild(renderedDiv);

3.3 getCurrentPageIndex()

描述：获取当前页面的索引。

返回值：
- number：当前页面的索引。

示例：
const liteOfd = new LiteOfd();
const currentPage = liteOfd.getCurrentPageIndex();
console.log(`当前页面索引：${currentPage}`);

3.4 nextPage()

描述：跳转到下一页。

示例：
const liteOfd = new LiteOfd();
liteOfd.nextPage();

3.5 prevPage()

描述：跳转到上一页。

示例：
const liteOfd = new LiteOfd();
liteOfd.prevPage();

3.6 scrollToPage(pageIndex: number)

描述：滚动到指定页面。

参数：
- pageIndex: number - 目标页面索引

示例：
const liteOfd = new LiteOfd();
liteOfd.scrollToPage(5); // 滚动到第5页


