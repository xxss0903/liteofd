import { OfdDocument } from "./ofdDocument"
import { OfdRender } from "./ofdRender"
import * as JSZipUtils from "jszip-utils"
import * as parser from "./parser"
import PromiseCapability from "./promiseCapability"
import { OfdWriter } from "./ofdWriter"
import { parseOFDFiles } from "./utils/ofdUtils"

/**
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

	renderOfdWithSize(width: string, height: string, pageWrapStyle: string | null = null): HTMLDivElement {
		this.ofdRender = new OfdRender(this.ofdDocument)
		return this.ofdRender.renderOfdWithSize(width, height, pageWrapStyle)
	}

	renderOfd(): HTMLDivElement {
		this.ofdRender = new OfdRender(this.ofdDocument)
		return this.ofdRender.renderOfd()
	}

	renderOfdWithCustomDiv(customDiv: HTMLDivElement, pageWrapStyle: string | null = null) {
		this.ofdRender = new OfdRender(this.ofdDocument)
		this.ofdRender.renderOfdWithCustomDiv(customDiv, pageWrapStyle)
	}

	changeScale(scale: number){
		this.ofdRender?.changeScale(scale)
	}

	zoomIn(): void {
		this.ofdRender?.zoomIn();
	}

	zoomOut(): void {
		this.ofdRender?.zoomOut();
	}

	zoomTo(scale: number): void {
		if (this.ofdRender) {
			// 确保缩放比例在合理范围内
			const newScale = Math.max(0.1, Math.min(scale, 5)); // 假设最小缩放为 10%，最大缩放为 500%
			this.ofdRender.applyZoom(newScale);
		}
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
			// 判断file是文件还是二进制数据
			file instanceof File || file instanceof ArrayBuffer
				? this.parseFileByArrayBuffer(file, promiseCap)
				: this.parseFileByPath(file, promiseCap)

			return promiseCap
		} catch (e) {
			console.error("解析文件错误", e)
			throw e
		}
	  }

	  /**
	   * 解析OFD文件二进制数据
	   * @param file
	   * @param promiseCap
	   */
	  private async parseFileByArrayBuffer(file: File | ArrayBuffer, promiseCap: PromiseCapability<OfdDocument>) {
		const data = file instanceof File ? await file.arrayBuffer() : file
		const ofdDoc = await this.processOfdData(data)
		promiseCap.resolve(ofdDoc)
	  }

	  /**
	   * 解析OFD文件路径
	   * @param file
	   * @param promiseCap
	   */
	  private parseFileByPath(file: string, promiseCap: PromiseCapability<OfdDocument>) {
		JSZipUtils.getBinaryContent(file, async (err: any, data: any) => {
		  if (err) {
			promiseCap.reject(err)
		  } else {
			try {
			  const ofdDoc = await this.processOfdData(data)
			  promiseCap.resolve(ofdDoc)
			} catch (error) {
			  promiseCap.reject(error)
			}
		  }
		})
	  }

	  /**
	   * 处理OFD数据
	   * @param data ofd文件的二进制数据
	   * @returns
	   */
	  private async processOfdData(data: ArrayBuffer): Promise<OfdDocument> {
		try {
			const zipData = await parser.unzipOfd(data)
			const ofdDoc = await parseOFDFiles(zipData)
			this.ofdDocument = ofdDoc
			return ofdDoc
		} catch (e) {
			console.log("processOfdData err", e)
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
	 * 重置缩放
	 */
	resetZoom(): void {
		this.ofdRender?.resetZoom();
	}
}