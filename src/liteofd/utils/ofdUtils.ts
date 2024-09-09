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
			if (fontFile && fontFile.value) {
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
				if(realFontName && isDefaultFont(realFontName)) {
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
	let documentData;
	if(ofdData) {
		ofdDocument.ofdXml = ofdData
		let docRoot = parser.findValueByTagName(ofdData, OFD_KEY.DocRoot)
		if(docRoot) {
			// 解析OFD的document文件
			let docRootPath = getOFDFilePath(docRoot.value)
			documentData = await parser.parseXmlByFileName(ofdFiles, docRootPath)
			documentData && (ofdDocument.documentData = documentData)
		}

		// 解析签名signatures
		await parseOFDSignatures(ofdDocument, ofdData, ofdFiles)
	}

	if(documentData) {
		// 解析pages页面数据
		let pagesObj = parser.findValueByTagName(documentData, OFD_KEY.Pages)
		pagesObj && (ofdDocument.pages = await parser.parseOFDPages(ofdDocument, pagesObj))

		// 解析OFD的documentres文件
		let documentResObj = parser.findValueByTagName(documentData, OFD_KEY.DocumentRes)
		if (documentResObj) {
			let documentResPath = `${RootDocPath}/${documentResObj.value}`
			// 查找publicres的数据
			let docRes = await parser.parseXmlByFileName(ofdFiles, documentResPath)
			docRes && (ofdDocument.documentRes = docRes)
		}

		// publicres的数据，可能没有
		let publicResObj = parser.findValueByTagName(documentData, OFD_KEY.PublicRes)
		if (publicResObj) {
			let publicResPath = `${RootDocPath}/${publicResObj.value}`
			// 查找publicres的数据
			let publicRes = await parser.parseXmlByFileName(ofdFiles, publicResPath)
			publicRes && (ofdDocument.publicRes = publicRes)

			// 解析publicres中的字体
			let ofdFonts = parser.findValueByTagName(ofdDocument.publicRes, OFD_KEY.Font)
			if (ofdFonts) {
				await loadOFDFonts(ofdFiles, ofdFonts)
			}
		}

		// 解析大纲数据
		let outlinesObj = parser.findValueByTagName(documentData, OFD_KEY.Outlines)
		if(outlinesObj) {
			await parser.parseOFDOutlines(ofdDocument, outlinesObj)
		}

		// 解析注释数据，需要在解析pages之后获取
		let annotationsObj = parser.findValueByTagName(documentData, OFD_KEY.Annotations)
		if (annotationsObj) {
			let annotePath = `${RootDocPath}/${annotationsObj.value}`
			let annoteRes = await parser.parseXmlByFileName(ofdFiles, annotePath)
			ofdDocument.annots = annoteRes
			await loadAnnots(ofdFiles, ofdDocument, annoteRes)			
		}
	}

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
			let signObjList: XmlData[] = []
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


/**
 * 解析注释数据
 * @param ofdDocument 
 * @param annoteRes 
 */
const loadAnnots = async (ofdFiles: any, ofdDocument: OfdDocument, annoteRes: XmlData) => {
	console.log("annoteRes", annoteRes, ofdDocument.pages)
	let pageObj = parser.findValueByTagName(annoteRes, OFD_KEY.Page)
	let annotDir = annoteRes.fileName.substring(0, annoteRes.fileName.lastIndexOf("/"))
	console.log("annot page ", pageObj)
	if(pageObj && pageObj.children.length > 0) {
		for(let i = 0; i < pageObj.children.length; i++) {
			let pageAnnotObj = pageObj.children[i]
			console.log("page annotObj", pageAnnotObj)
			let annotPageId = parser.findAttributeValueByKey(pageAnnotObj, AttributeKey.PageID)
			console.log("pageId", annotPageId)
			let fileLocObj = parser.findValueByTagName(pageAnnotObj, OFD_KEY.FileLoc)
			console.log("fileLocObj location", fileLocObj)
			if(fileLocObj) {
				let annotFilePath = fileLocObj.value
				if(!annotFilePath.startsWith(annotDir)) {
					annotFilePath = `${annotDir}/${annotFilePath}`
				}
				console.log("annotFilePath", annotFilePath, annotPageId)
				let annotPageObj = await parser.parseXmlByFileName(ofdFiles, annotFilePath)
				// 将带有注释的page数据添加到ofdDocument对应的page页面数据中
				for(let j = 0; j < ofdDocument.pages.length; j++) {
					let pageId = ofdDocument.pages[j].id
					if(pageId == annotPageId) {
						ofdDocument.pages[j].annots = annotPageObj
						console.log("load annotPageObj data", ofdDocument.pages[j])
					}
				}
			}
		}
	}

}

