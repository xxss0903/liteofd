/**
 * ofd的渲染
 */
import { XmlData } from "./ofdData"
import { OfdDocument } from "./ofdDocument"
import { OfdPageContainer } from "./elements/ofdPageContainer"

export class OfdRender {
	ofdDocument: OfdDocument
	pages: XmlData[]
	publicRes = null // 公共资源，包含字体等
	documentRes = null // 文档资源，包含多媒体数据mediafile等
	rootContainer = null // 整个渲染的根页面，要放置到这个上面来

	constructor(ofdDocument: OfdDocument) {
		this.ofdDocument = ofdDocument
	}

	render(rootContainer: Element, wrapStyle: string | null): HTMLDivElement {
		this.rootContainer = rootContainer
		this.pages = this.ofdDocument.pages
		this.publicRes = this.ofdDocument.publicRes
		this.documentRes = this.ofdDocument.documentRes

		// 渲染页面
		this.#renderPages(wrapStyle)
		return this.rootContainer
	}

	/**
	 * 渲染页面内容，这里是根据每个page数据来渲染，而每个page包含了content和模板等
	 * @private
	 */
	#renderPages(wrapStyle: string | null){
		try {
			for (let i = 0; i < this.pages.length; i++) {
				let pageData = this.pages[i]
				let pageContainer = new OfdPageContainer(this.ofdDocument, pageData, this.rootContainer)
				let pageView = pageContainer.getPageElement()
				if (wrapStyle) {
					let tempStyle = pageView.getAttribute("style")
					if (tempStyle) {
						tempStyle += wrapStyle
					}
					pageView.setAttribute("style", tempStyle)
				}
				this.rootContainer.appendChild(pageView)
			}
		} catch (error) {
			console.log("render error", error)
		}
	}
}
