import { OfdDocument } from "./ofdDocument"
import { OfdRender } from "./ofdRender"
import * as JSZipUtils from "jszip-utils"
import * as parser from "./parser"
import PromiseCapability from "./promiseCapability"
import { OfdWriter } from "./ofdWriter"
import { parseOFDFiles } from "./utils/ofdUtils"
import { convertToDpiWithScale, setPageScal } from "./utils/utils"
import { OFD_KEY } from "./attrType"

/**
/**
 * LiteOfd 类是一个用于处理 OFD 文件的轻量级库。
 * 它提供了渲染 OFD 数据和解析 OFD 文件的功能。
 *
 * @class LiteOfd
 * @property {OfdDocument} ofdDocument - OFD 文档对象
 * @property {OfdRender | null} ofdRender - OFD 渲染器对象
 *
 * @method renderOfd - 渲染 OFD 数据
 * @method parseFile - 解析 OFD 文件
 * @method parseFileByArrayBuffer - 解析 OFD 文件的二进制数据
 */
export default class LiteOfd {
	private ofdDocument: OfdDocument
	private ofdRender: OfdRender | null = null

	constructor() {
		this.ofdDocument = new OfdDocument()
	}

	/**
	 * 获取默认的缩放比例
	 * @returns 
	 */
	getDefaultScale() {
		let screenWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
		let physicalBoxObj = parser.findValueByTagName(this.ofdDocument.document, OFD_KEY.PhysicalBox)
		console.log("physicalBoxObj", physicalBoxObj);
		if(physicalBoxObj){
			let physicalBox = physicalBoxObj.value.split(" ")
			let ofdWidth = parseFloat(physicalBox[2])

			let newofdWidth = convertToDpiWithScale(ofdWidth, 1)
			console.log("ofdWidth", ofdWidth, newofdWidth, screenWidth);
			// 计算缩放比例
			let scale = (screenWidth - 100) / ofdWidth   
			return scale
		}
		// 如果物理盒不存在，则返回1
		return 1
	}


	/**
	 * 渲染ofd数据
	 */
	renderOfd(rootDiv: Element): HTMLDivElement {
		// 设置默认scale
		let scale = this.getDefaultScale()
		return this.renderOfdWithScale(rootDiv, scale)
	}

	renderOfdWithScale(rootDiv: Element, scale: number): HTMLDivElement {
		this.ofdRender = new OfdRender(this.ofdDocument)
		console.log("set render scale", scale)
		setPageScal(scale)
		// 新建一个根的div来包裹整个渲染的ofd文档的内容
		this.ofdDocument.rootContainer = document.createElement("div")
		return this.ofdRender.render(rootDiv, "background-color: #ffffff; margin-top: 12px;")
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
}
