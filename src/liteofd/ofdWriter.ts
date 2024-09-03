import { OfdDocument } from "./ofdDocument"
import { XmlData } from "./ofdData"
import { XmlDataToXmlStr } from "./utils/jsonToXml"
import JSZip from "jszip"
import * as parser from "./parser"
import { OFD_KEY } from "./attrType"

/**
 * 存储ofd的内容
 */
export class OfdWriter {
	private ofdDocument: OfdDocument
	private destPath = ""
	private jsZip: JSZip

	constructor(ofdDocument: OfdDocument) {
		this.ofdDocument = ofdDocument
		this.jsZip = new JSZip()
	}

	saveTo(path: string) {
		this.destPath = path
		this.convertDocumentToXml()
		this.#saveToZipFile()
	}

	/**
	 * 将xml内容保存
	 * @param fileContent
	 * @param path
	 */
	#saveXmlDataFile(fileContent: string, path: string) {
		this.jsZip.file(path, fileContent)
	}

	saveAs(data, type, name) {
		let link = document.createElement("a")
		let exportName = name ? name : 'data'
		link.href = URL.createObjectURL(data)
		link.download = exportName + ".ofd"
		link.click()
		// URL.revokeObjectURL(link.href)
		// document.body.removeChild(link)
	}

	/**
	 * 将zip的内容blobl打包压缩到zip文件中去
	 * @param data
	 * @param path
	 */
	saveZipBlobToFile(data: any, path: string) {
		this.saveAs(data, "zip", path)
	}

	#mockRemovePage(){
		let mockRemovePage = true
		let mockEditText = false
		if (mockRemovePage) {
			// 值取第一页，首先需要从document中去掉其他页面
			let pagesNode = parser.findValueByTagName(this.ofdDocument.document, OFD_KEY.Pages)
			let firstPage = pagesNode.children[0].children[0]
			pagesNode.children[0].children = [firstPage]
		}
		if (mockEditText) {
			// 值取第一页，首先需要从document中去掉其他页面
			let textCode = parser.findValueByTagName(this.ofdDocument.pages[0], OFD_KEY.TextCode)
			textCode.value = "Mock Edit"
		}
		console.log("editd document data", this.ofdDocument.document)
	}

	// 将ofd的文档document重新构建成xml的文件
	convertDocumentToXml() {
		console.log("save document", this.ofdDocument)
		// 将ofd.xml内容组合
		let ofdXmlStr = this.#convertXmlDataToXml(this.ofdDocument.ofdXml)
		this.#saveXmlDataFile(ofdXmlStr, this.ofdDocument.ofdXml.fileName)

		this.#mockRemovePage()

		// 将document.xml组合
		let documentXmlStr = this.#convertXmlDataToXml(this.ofdDocument.document)
		this.#saveXmlDataFile(documentXmlStr, this.ofdDocument.document.fileName)
		// documentres.xml组合
		debugger
		let documentResXmlStr = this.#convertXmlDataToXml(this.ofdDocument.documentRes)
		this.#saveXmlDataFile(documentResXmlStr, this.ofdDocument.documentRes.fileName)
		// 将publicres.xml组合
		let publicResXmlStr = this.#convertXmlDataToXml(this.ofdDocument.publicRes)
		this.#saveXmlDataFile(publicResXmlStr, this.ofdDocument.publicRes.fileName)
		// 将pages的页面写入xml
		this.#convertPagesXmlDataToXml(this.ofdDocument.pages)

		this.#saveToZipFile()
	}

	#saveToZipFile() {
		// 保存zip文件
		this.jsZip.generateAsync({ type: 'blob' })
			.then(res => {
				console.log("save res", res)
				this.saveZipBlobToFile(res, "test")
			})
			.catch(err => {
				console.log("save err", err)
			})
	}

	getAttrsMapJson(attrsMap: Map<string, any>) {
		let jsonObj = {}
		for (const [key, value] of attrsMap.entries()) {
			// let jsonKey = key.replace("@_", "")
			let jsonKey = key
			jsonObj[jsonKey] = value
		}
		return jsonObj
	}

	#mockEditPage(pageData: XmlData){
		let textCode = parser.findValueByTagName(pageData, OFD_KEY.TextCode)
		textCode.value = "edit this page"
	}

	#convertPagesXmlDataToXml(pages: XmlData[]) {
		let pagesXmlStrs = []
		for (let i = 0; i < pages.length; i++) {
			let pageData = pages[i]
			let pageXmlStr = this.#convertXmlDataToXml(pageData)
			this.#saveXmlDataFile(pageXmlStr, pageData.fileName)
			pagesXmlStrs.push(pageXmlStr)
		}
	}

	#convertXmlDataToXml(node: XmlData) {
		let str = XmlDataToXmlStr(node)
		console.log("convert xmldata", str)
		return str
	}

}
