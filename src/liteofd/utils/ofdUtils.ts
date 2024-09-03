import * as parser from "../parser"
import { AttributeKey, OFD_KEY } from "../attrType"
import { getOFDFilePath } from "./elementUtils"
import { RootDocPath } from "../parser"
import { OfdDocument } from "../ofdDocument"
import { XmlData } from "../ofdData"
import { isDefaultFont, loadDefaultFont, loadSingleFont } from "../ofdFont"

const fontDefaultDir = "/Doc_0/Res"
/**
 * 加载字体
 * @param files
 * @param fonts
 */
const loadOFDFonts = async (files: any, fonts: XmlData) => {
	if (fonts && fonts.children) {
		for (let i = 0; i < fonts.children.length; i++) {
			let fontData = fonts.children[i]
			let fontName = parser.findAttributeValueByKey(fontData, AttributeKey.FontName)
			let familyName = parser.findAttributeValueByKey(fontData, AttributeKey.FamilyName)
			let fontFile = parser.findValueByTagName(fontData, OFD_KEY.FontFile)
			console.log("parse fontData", fontData)
			if (fontFile && fontFile.value) {
				console.log("fontFile data", fontData, fontFile)
				let fileName = fontFile.value
				let fontFilePath = fontDefaultDir + "/" + fileName
				let realFilePath = getOFDFilePath(fontFilePath)
				let nativeFontFile = files[realFilePath]
				if (nativeFontFile) {
					let fontRes = await loadSingleFont(nativeFontFile, fontData)
					// console.log("font res", fontRes)
				}
			} else {
				let realFontName = fontName || familyName
				console.log("realFontName", realFontName)
				if(isDefaultFont(realFontName)) {
				await loadDefaultFont(realFontName)
				}
			}
		}
	}
}

/**
 * 根据ofd的文件来解析出一个ofdDocument对象来
 * @param zipData 解压缩之后的zip数据，包含了files这个所有文件的列表组合
 */
export const parseOFDFiles = async (zipData: any) => {
	let ofdDocument = new OfdDocument()
	// 获取到了zip数据，开始解析ofd的内容到数据对象了
	// 首先是解析最外层的OFD.xml文件
	let ofdFiles = zipData.files
	ofdDocument.files = ofdFiles
	// 解析OFD文件的根文件
	let ofdData = await parser.parseXmlByFileName(ofdFiles, "OFD.xml")
	ofdDocument.ofdXml = ofdData
	let docRoot = parser.findValueByTagName(ofdData, OFD_KEY.DocRoot)
	// 解析OFD的document文件
	let docRootPath = getOFDFilePath(docRoot.value)
	let documentData = await parser.parseXmlByFileName(ofdFiles, docRootPath)
	ofdDocument.document = documentData

	// 解析签名signatures
	await parseOFDSignatures(ofdDocument, ofdData, ofdFiles)

	// 解析OFD的documentres文件
	let documentResObj = parser.findValueByTagName(documentData, OFD_KEY.DocumentRes)
	if (documentResObj) {
		let documentResPath = `${RootDocPath}/${documentResObj.value}`
		// 查找publicres的数据
		ofdDocument.documentRes = await parser.parseXmlByFileName(ofdFiles, documentResPath)
	}

	// publicres的数据，可能没有
	let publicResObj = parser.findValueByTagName(documentData, OFD_KEY.PublicRes)
	if (publicResObj) {
		let publicResPath = `${RootDocPath}/${publicResObj.value}`
		// 查找publicres的数据
		ofdDocument.publicRes = await parser.parseXmlByFileName(ofdFiles, publicResPath)

		// 解析publicres中的字体
		let ofdFonts = parser.findValueByTagName(ofdDocument.publicRes, OFD_KEY.Font)
		if (ofdFonts) {
			loadOFDFonts(ofdFiles, ofdFonts)
		}
	}

	// 解析pages页面数据
	let pagesObj = parser.findValueByTagName(documentData, OFD_KEY.Pages)
	ofdDocument.pages = await parser.parseOFDPages(ofdDocument, pagesObj)
	return ofdDocument
}


/**
 * 根据ofd.xml中的ofd:signatures来拿到签名的根文件
 * @param ofdDocument
 * @param ofdData
 * @param ofdFiles
 * @private
 */
export const parseOFDSignatures = async (ofdDocument: OfdDocument, ofdData: XmlData, ofdFiles) => {
	let signaturesObj = parser.findValueByTagName(ofdData, OFD_KEY.Signatures)
	if (signaturesObj) {
		// 签名文件的包含文件路径
		let signaturesPath = getOFDFilePath(signaturesObj.value)
		let signaturesDir = signaturesPath.substring(0, signaturesPath.lastIndexOf("/"))
		ofdDocument.signatures = await parser.parseXmlByFileName(ofdFiles, signaturesPath)
		// 将signatures中的签名xml全部提取出来
		let signatureFileObj = parser.findValueByTagName(ofdDocument.signatures, OFD_KEY.Signature)
		if (signatureFileObj && signatureFileObj.children.length > 0) {
			// 将每个signature的文件进行解析
			let signObjList = []
			for (let i = 0; i < signatureFileObj.children.length; i++) {
				let signatureFile = signatureFileObj.children[i]
				let signID = parser.findAttributeValueByKey(signatureFile, AttributeKey.ID)
				let tempPath = parser.findAttributeValueByKey(signatureFile, AttributeKey.BaseLoc)
				tempPath = getOFDFilePath(tempPath)
				if (!tempPath.startsWith(signaturesDir)) {
					tempPath = `${signaturesDir}/${tempPath}`;
				}
				let signFilePath = getOFDFilePath(tempPath)
				let signatureObj = await parser.parseXmlByFileName(ofdFiles, signFilePath)
				signID && (signatureObj.id = signID)
				signObjList.push(signatureObj)
			}
			ofdDocument.signatureList = signObjList
		}
	}
}
