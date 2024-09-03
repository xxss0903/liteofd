
import { XmlData } from "./ofdData"
import { OfdDocument } from "./ofdDocument"
import { OfdPageContainer } from "./elements/ofdPageContainer"
import { convertToDpiWithScale, setPageScal } from "./utils/utils"
import { OFD_KEY } from "./attrType"
import * as parser from "./parser"

/**
 * OfdRender 类用于渲染 OFD 文档。
 * 
 * @class OfdRender
 * @property {OfdDocument} ofdDocument - OFD 文档对象
 * @property {XmlData[]} pages - 文档的页面数据
 * @property {any} publicRes - 公共资源，包含字体等
 * @property {any} documentRes - 文档资源，包含多媒体数据等
 * @property {HTMLDivElement | null} rootContainer - 整个渲染的根容器
 */

export class OfdRender {
	ofdDocument: OfdDocument
	pages: XmlData[]
	publicRes = null // 公共资源，包含字体等
	documentRes = null // 文档资源，包含多媒体数据mediafile等
	rootContainer: HTMLDivElement | null = null // 整个渲染的根页面，要放置到这个上面来

	constructor(ofdDocument: OfdDocument) {
		this.ofdDocument = ofdDocument
		this.pages = this.ofdDocument.pages
		this.publicRes = this.ofdDocument.publicRes
		this.documentRes = this.ofdDocument.documentRes
	}

	getDefaultScale(): number {
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

	renderOfdWithSize(width: string, height: string, pageWrapStyle: string | null = null): HTMLDivElement {
		// 创建外层容器div
		const containerDiv = document.createElement('div');
		containerDiv.style.cssText = `height: ${height}; width: ${width};`;
		// 设置默认scale
		let scale = this.getDefaultScale();
		this.renderOfdWithScale(containerDiv, scale, pageWrapStyle);
		this.rootContainer = containerDiv
		return containerDiv
	}

	renderOfd(): HTMLDivElement {
		return this.renderOfdWithSize("", "", "background-color: #ffffff; margin-bottom: 12px;")
	}

	renderOfdWithCustomDiv(customDiv: HTMLDivElement, pageWrapStyle: string | null = null) {
		// 获取默认缩放比例
		let scale = this.getDefaultScale()
		this.renderOfdWithScale(customDiv, scale, pageWrapStyle)
	}

	changeScale(scale: number){
		setPageScal(scale)
	}

	renderOfdWithScale(rootDiv: Element, scale: number, pageWrapStyle: string | null = null) {
		setPageScal(scale)
		// 新建一个根的div来包裹整个渲染的ofd文档的内容
		this.ofdDocument.rootContainer = rootDiv
		this.render(rootDiv, pageWrapStyle)
	}

	render(rootContainer: Element, wrapStyle: string | null): Element {
		this.rootContainer = rootContainer as HTMLDivElement
		// 渲染页面
		this.#renderPages(wrapStyle)
		return this.rootContainer
	}

	/**
	 * 渲染页面内容，这里是根据每个page数据来渲染，而每个page包含了content和模板等
	 * @private
	 */
	#renderPages(wrapStyle: string | null) {
		try {
			for (let i = 0; i < this.pages.length; i++) {
				let pageData = this.pages[i]
				let pageContainer = new OfdPageContainer(this.ofdDocument, pageData, this.rootContainer)
				let pageView = pageContainer.getPageElement()
				if (wrapStyle) {
					let tempStyle = pageView.getAttribute("style") || ""
					tempStyle += wrapStyle
					pageView.setAttribute("style", tempStyle)
				}
				this.rootContainer!.appendChild(pageView)
			}
		} catch (error) {
			console.log("render error", error)
		}
	}

	zoomIn(): void {
		if (this.rootContainer) {
			const currentScale = parseFloat(this.rootContainer.dataset.scale || '1');
			const newScale = currentScale * 1.1; // 每次放大 10%
	
			if (!this.rootContainer.dataset.originalWidth) {
				this.rootContainer.dataset.originalWidth = this.rootContainer.offsetWidth.toString();
			}
			const originalWidth = parseFloat(this.rootContainer.dataset.originalWidth);
	
			// 应用缩放
			this.rootContainer.style.transform = `scale(${newScale})`;
			this.rootContainer.style.transformOrigin = 'top left';
			this.rootContainer.dataset.scale = newScale.toString();
	
			// 调整内容大小，但保持原始尺寸
			this.rootContainer.style.width = `${originalWidth}px`;
			this.rootContainer.style.height = 'auto';
	
			// 调整父容器
			if (this.rootContainer.parentElement) {
				const parentWidth = this.rootContainer.parentElement.offsetWidth;
				const scaledWidth = originalWidth * newScale;
				
				this.rootContainer.style.marginLeft = '0';
				this.rootContainer.parentElement.style.width = `${Math.max(scaledWidth, parentWidth)}px`;
				this.rootContainer.parentElement.style.height = `${this.rootContainer.offsetHeight * newScale}px`;
				this.rootContainer.parentElement.style.overflow = 'auto';
			}
		}
	}
	
	zoomOut(): void {
		if (this.rootContainer) {
			const currentScale = parseFloat(this.rootContainer.dataset.scale || '1');
			const newScale = Math.max(currentScale * 0.9, 0.1); // 每次缩小 10%，但不小于 0.1
	
			const originalWidth = parseFloat(this.rootContainer.dataset.originalWidth || this.rootContainer.offsetWidth.toString());
	
			// 应用缩放
			this.rootContainer.style.transform = `scale(${newScale})`;
			this.rootContainer.style.transformOrigin = 'top left';
			this.rootContainer.dataset.scale = newScale.toString();
	
			// 保持原始尺寸
			this.rootContainer.style.width = `${originalWidth}px`;
			this.rootContainer.style.height = 'auto';
	
			// 调整父容器
			if (this.rootContainer.parentElement) {
				const parentWidth = this.rootContainer.parentElement.offsetWidth;
				const scaledWidth = originalWidth * newScale;
				
				if (scaledWidth < parentWidth) {
					// 如果缩放后的宽度小于父容器宽度，居中显示内容
					this.rootContainer.style.marginLeft = `${(parentWidth - scaledWidth) / 2}px`;
					this.rootContainer.parentElement.style.width = '100%';
				} else {
					// 否则，设置父容器宽度为缩放后的宽度
					this.rootContainer.style.marginLeft = '0';
					this.rootContainer.parentElement.style.width = `${scaledWidth}px`;
				}
	
				this.rootContainer.parentElement.style.height = `${this.rootContainer.offsetHeight * newScale}px`;
				this.rootContainer.parentElement.style.overflow = 'auto';
			}
		}
	}

}
