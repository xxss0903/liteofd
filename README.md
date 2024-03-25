# liteofd.js
![-](https://img.shields.io/badge/language-js-orange.svg) [![license](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

本项目基于 [ofd.js](https://github.com/DLTech21/ofd.js) 修改定制开发，目前底层解析和渲染代码使用`ofd.js`，后期将作修改。
目前已经修复`ofd.js`部分解析和渲染的bug，将持续进行更新。
### 安装
`npm i liteofd.js`
### 使用
```js
import { parseOfdDocument, renderOfd } from "@/utils/ofd/ofd"
// 解析ofd文件，将文件渲染成div页面，然后设置到布局上面
function parseOfd(){
	parseOfdDocument({
		ofd: file,
		success(res) {
			let ofdObj = res[0];
			// 获取大纲，如果需要渲染大纲
			if ( outlines ) {
				let ofdOutlines = outlines["ofd:OutlineElem"]
			}
			let  pageCount = res[0].pages.length;
			let pageDivs = renderOfd(screenWidth, res[0]);
            renderOfd(pageDivs)
		},
		fail(error) {
			that.loading = false;
			that.$alert('OFD打开失败', error, {
				confirmButtonText: '确定',
				callback: action => {
					this.$message({
						type: 'info',
						message: `action: ${ action }`
					});
				}
			});
		}
	});
}
// 渲染ofd的页面
function displayOfdDiv(divs) {
	this.scale = getPageScale();
	let contentDiv = document.getElementById('content');
    // 置空之前的页面，将新的页面渲染
	contentDiv.innerHTML = '';
	for (const div of divs) {
		contentDiv.appendChild(div)
	}
}
```

### 修改bug
在ofd.js基础上修改bug优化，目前修复部分ofd文件显示报错无法渲染的问题。
### 更新日志
20240325
Bug Fixes
* 修复Unicode字符渲染常规字符错误的问题
* 修复部分文件内string是对象导致的解析报错
