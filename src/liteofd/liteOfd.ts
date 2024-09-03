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
 * @property {HTMLDivElement | null} ofdContainer - OFD 内容渲染的容器
 * @method renderOfd - 渲染 OFD 数据
 * @method parseFile - 解析 OFD 文件
 * @method parseFileByArrayBuffer - 解析 OFD 文件的二进制数据
 */
export default class LiteOfd {
	private ofdDocument: OfdDocument
	private ofdRender: OfdRender | null = null
	private ofdContainer: HTMLDivElement | null = null // ofd内容渲染的容器

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
	 * @param width 容器宽度，可选参数
	 * @param height 容器高度，可选参数
	 */
	renderOfdWithSize(width: string, height: string, pageWrapStyle: string | null = null): HTMLDivElement {
		// 创建外层容器div
		const containerDiv = document.createElement('div');
		containerDiv.style.cssText = `height: ${height}; width: ${width};`;
		// 设置默认scale
		let scale = this.getDefaultScale();
		this.renderOfdWithScale(containerDiv, scale, pageWrapStyle);
		this.ofdContainer = containerDiv
		return containerDiv
	}

	/**
	 * 放大
	 */
	zoomIn(): void {
		if (this.ofdContainer) {
			const currentScale = parseFloat(this.ofdContainer.dataset.scale || '1');
			const newScale = currentScale * 1.1; // 每次放大 10%

			if (!this.ofdContainer.dataset.originalWidth) {
				this.ofdContainer.dataset.originalWidth = this.ofdContainer.offsetWidth.toString();
			}
			const originalWidth = parseFloat(this.ofdContainer.dataset.originalWidth);

			// 应用缩放
			this.ofdContainer.style.transform = `scale(${newScale})`;
			this.ofdContainer.style.transformOrigin = 'top left';
			this.ofdContainer.dataset.scale = newScale.toString();

			// 调整内容大小，但保持原始尺寸
			this.ofdContainer.style.width = `${originalWidth}px`;
			this.ofdContainer.style.height = 'auto';

			// 调整父容器
			if (this.ofdContainer.parentElement) {
				const parentWidth = this.ofdContainer.parentElement.offsetWidth;
				const scaledWidth = originalWidth * newScale;
				
				this.ofdContainer.style.marginLeft = '0';
				this.ofdContainer.parentElement.style.width = `${Math.max(scaledWidth, parentWidth)}px`;
				this.ofdContainer.parentElement.style.height = `${this.ofdContainer.offsetHeight * newScale}px`;
				this.ofdContainer.parentElement.style.overflow = 'auto';
			}
		}
	}

	zoomOut(): void {
		if (this.ofdContainer) {
			const currentScale = parseFloat(this.ofdContainer.dataset.scale || '1');
			const newScale = Math.max(currentScale * 0.9, 0.1); // 每次缩小 10%，但不小于 0.1

			const originalWidth = parseFloat(this.ofdContainer.dataset.originalWidth || this.ofdContainer.offsetWidth.toString());

			// 应用缩放
			this.ofdContainer.style.transform = `scale(${newScale})`;
			this.ofdContainer.style.transformOrigin = 'top left';
			this.ofdContainer.dataset.scale = newScale.toString();

			// 保持原始尺寸
			this.ofdContainer.style.width = `${originalWidth}px`;
			this.ofdContainer.style.height = 'auto';

			// 调整父容器
			if (this.ofdContainer.parentElement) {
				const parentWidth = this.ofdContainer.parentElement.offsetWidth;
				const scaledWidth = originalWidth * newScale;
				
				if (scaledWidth < parentWidth) {
					// 如果缩放后的宽度小于父容器宽度，居中显示内容
					this.ofdContainer.style.marginLeft = `${(parentWidth - scaledWidth) / 2}px`;
					this.ofdContainer.parentElement.style.width = '100%';
				} else {
					// 否则，设置父容器宽度为缩放后的宽度
					this.ofdContainer.style.marginLeft = '0';
					this.ofdContainer.parentElement.style.width = `${scaledWidth}px`;
				}

				this.ofdContainer.parentElement.style.height = `${this.ofdContainer.offsetHeight * newScale}px`;
				this.ofdContainer.parentElement.style.overflow = 'auto';
			}
		}
	}


	/**
	 * 渲染ofd数据，给page页面添加默认的背景色白色和底部margin
	 */
	renderOfd(): HTMLDivElement {
		return this.renderOfdWithSize("", "", "background-color: #ffffff; margin-bottom: 12px;`")
	}

	/**
	 * 使用自定义 div 渲染 OFD 数据
	 * @param customDiv 自定义的 div 元素
	 */
	renderOfdWithCustomDiv(customDiv: HTMLDivElement, pageWrapStyle: string | null = null) {
		// 获取默认缩放比例
		let scale = this.getDefaultScale()
		this.renderOfdWithScale(customDiv, scale, pageWrapStyle)
	}

	changeScale(scale: number){
		setPageScal(scale)
	}

	/**
	 * 渲染ofd数据
	 * @param rootDiv 
	 * @param scale 
	 * @param pageWrapStyle 
	 * @returns 
	 */
	renderOfdWithScale(rootDiv: Element, scale: number, pageWrapStyle: string | null = null) {
		this.ofdRender = new OfdRender(this.ofdDocument)
		setPageScal(scale)
		// 新建一个根的div来包裹整个渲染的ofd文档的内容
		this.ofdDocument.rootContainer = rootDiv
		this.ofdRender.render(rootDiv, pageWrapStyle)
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
