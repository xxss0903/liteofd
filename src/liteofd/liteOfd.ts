import { OfdDocument } from "./ofdDocument"
import { OfdRender } from "./ofdRender"

import * as parser from "./parser"
import PromiseCapability from "./promiseCapability"
import { OfdWriter } from "./ofdWriter"
import { parseOFDFiles } from "./utils/ofdUtils"
import { XmlData } from "./ofdData"
import * as ofdActions from "./ofdActions"

/**
 * LiteOfd 类是一个用于处理 OFD 文件的轻量级库。
 * 它提供了渲染 OFD 数据和解析 OFD 文件的功能。
 *
 * @class LiteOfd
 * @property {OfdDocument} ofdDocument - OFD 文档对象
 * @property {OfdRender | null} ofdRender - OFD 渲染器对象
 * @property {HTMLDivElement | null} ofdContainer - OFD 内容渲染的容器
 * @method renderOfd - 渲染 OFD 数据
 * @method parseFile - 解析 OFD 文件
 * @method parseFileByArrayBuffer - 解析 OFD 文件的二进制数据
 */
export default class LiteOfd {

	private ofdDocument: OfdDocument // OFD 文档对象
	private ofdRender: OfdRender | null = null // OFD 渲染器对象

	constructor() {
		this.ofdDocument = new OfdDocument()
	}


	/**
	 * 渲染OFD文档，使用默认的渲染方式
	 * @returns 渲染的div
	 */
	renderOfd(): HTMLDivElement {
		this.ofdRender = new OfdRender(this.ofdDocument)
		// 创建外层容器div
		const containerDiv = document.createElement('div');
		let pageWrapStyle = "background-color: #ffffff; margin-bottom: 44px;"
		return this.renderOfdWithCustomDiv(containerDiv, pageWrapStyle)
	}

	/**
	 * 使用自定义的div来渲染OFD文档
	 * @param customDiv 自定义的div
	 * @param pageWrapStyle 页面的样式
	 */
	renderOfdWithCustomDiv(customDiv: HTMLDivElement, pageWrapStyle: string | null = null) {
		this.ofdRender = new OfdRender(this.ofdDocument)
		return this.ofdRender.renderOfdWithCustomDiv(customDiv, pageWrapStyle)
	}

	/**
	 * 获取当前页面的索引
	 * @returns 当前页面的索引
	 */
	getCurrentPageIndex() {
		return this.ofdRender?.currentPageIndex || 1
	}

	/**
	 * 下一页
	 */
	nextPage() {
		this.ofdRender && this.scrollToPage(this.ofdRender.currentPageIndex + 1)
	}

	/**
	 * 上一页
	 */
	prevPage() {
		this.ofdRender && this.scrollToPage(this.ofdRender.currentPageIndex - 1)
	}

	/**
	 * 滚动到指定页面
	 * @param pageIndex 页面索引
	 */
	scrollToPage(pageIndex: number) {
		if (pageIndex < 1) {
			pageIndex = 1
		}
		if (pageIndex > this.getTotalPages()) {
			pageIndex = this.getTotalPages()
		}
		this.ofdRender && (this.ofdRender.currentPageIndex = pageIndex)
		let pageId = `ofd-page-${pageIndex}`
		let pageElement = document.getElementById(pageId)
		if (pageElement) {
			pageElement.scrollIntoView({ behavior: 'smooth' });
		}
	}

	/**
	 * 搜索文本
	 * @param keyword 要搜索的关键词
	 */
	searchText(keyword: string) {

	}

	/**
	 * 放大文档
	 */
	zoomIn(): void {
		this.ofdRender?.zoomIn();
	}

	/**
	 * 缩小文档
	 */
	zoomOut(): void {
		this.ofdRender?.zoomOut();
	}

	/**
	 * 将文档缩放到指定比例
	 * @param scale 目标缩放比例
	 */
	zoomTo(scale: number): void {
		if (this.ofdRender) {
			// 确保缩放比例在合理范围内
			const newScale = Math.max(0.1, Math.min(scale, 5)); // 假设最小缩放为 10%，最大缩放为 500%
			this.ofdRender.applyZoom(this.ofdRender.rootContainer, newScale);
		}
	}

	/**
	 * 执行OFD文档中的动作
	 * @param action 动作数据
	 */
	executeAction(action: XmlData) {
		ofdActions.executeAction(this, this.ofdDocument, action)
	}

	/**
	 * 重置文档缩放到初始比例
	 */
	resetZoom(): void {
		this.ofdRender?.resetZoom();
	}

	/**
	 * 获取文档的总页数
	 * @returns 文档的总页数，如果文档未加载则返回 0
	 */
	getTotalPages(): number {
		return this.ofdDocument.pages ? this.ofdDocument.pages.length : 0;
	}

	/**
	 * 解析 OFD 文件
	 * @param file OFD 文件（可以是文件路径、File 对象或 ArrayBuffer）
	 * @returns PromiseCapability
	 */
	 parseFile(file: string | File | ArrayBuffer): PromiseCapability<OfdDocument> {
		try {
			// 创建一个PromiseCapability对象，用于处理异步操作
			const promiseCap = new PromiseCapability<OfdDocument>()
			let tempPromise = parser.parseOFDFile(file)
			tempPromise.promise
				.then(res => {
					this.ofdDocument = res
					promiseCap.resolve(res)
				})
				.catch(err => {
					promiseCap.reject(err)
				})
			return promiseCap
		} catch(e) {
			console.log("parser file err", e)
			throw e
		}
	  }


	/**
	 * 保存当前ofd文件
	 * @param path
	 */
	saveOFDDocument(path: string) {
		let ofdWriter = new OfdWriter(this.ofdDocument)
		ofdWriter.saveTo(path)
	}

	/**
	 * 获取内容文本
	 * @param page 页码，如果为null，则获取全部文本
	 * @returns 
	 */
	getContentText(page: number | null): string {
		let content = this.ofdDocument.getContentText(page)
		return content
	}
}
