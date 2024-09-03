import { XmlData } from "../ofdData"

const getAttrsMapJson = (attrsMap: Map<string, any>) => {
	let jsonObj = {}
	for (const [key, value] of attrsMap.entries()) {
		let jsonKey = key.replace("@_", "")
		jsonObj[jsonKey] = value
	}
	return jsonObj
}

const getAttrsString = (attrsMap: Map<string, any>) => {
	let attrsStr = ""
	for (const [key, value] of attrsMap.entries()) {
		let jsonKey = key.replace("@_", "")
		attrsStr += `${jsonKey}="${value}" `
	}
	return attrsStr
}

const isOFDTagName = (tagName: string) => {
	return tagName.startsWith("ofd:")
}

const isNumber = () => {

}

/**
 * 将xmldata对象转为xml字符串写入文件
 * @param node
 * @param parentNode
 * @constructor
 */
export const XmlDataToXmlStr = (node: XmlData, parentNode: XmlData | null = null) => {
	let tagName = node.tagName
	if (!isNaN(Number(tagName))) {
		tagName = parentNode  ? parentNode.tagName : ""
	}
	let value = node.value
	let attrsStr = getAttrsString(node.attrsMap)

	let xmlTagStart = `<${tagName} ${attrsStr}>`
	let xmlContent = ``
	let xmlStr = ""
	let addCurrentNode = true
	if (node.children && node.children.length > 0) {
		// 根据children中第一个的tagName来判断是否是数组，如果是数组那么tagName就是数字不是ofd开头的了
		let firstNode = node.children[0]
		let nodeChildren = node.children;
		// 这里表示第一个子节点没有tagName，然后就表示是数组
		let firstNodeNumberTag = Number(firstNode.tagName)
		if (!isNaN(firstNodeNumberTag)) {
			addCurrentNode = false
			tagName = node.tagName
			// 表示这个node是一个数组，下面的节点都是数组的方式来进行组合
			for (let i = 0; i < node.children.length; i++) {
				let subNode = node.children[i]
				xmlContent += XmlDataToXmlStr(subNode, node)
			}
		} else {
			if (!tagName) {
				addCurrentNode = false
			}
			// 包含了子的节点，这里因为xml解析的原因，需要把数组的子节点单独处理
			for (let i = 0; i < nodeChildren.length; i++) {
				let subNode = node.children[i]
				let subStr = XmlDataToXmlStr(subNode, node)
				xmlContent += subStr
			}
		}
	} else {
		if (value) {
			xmlContent = value
		}
	}

	if (tagName.startsWith("?xml")) {
		xmlStr = xmlTagStart.replace(">", "?>")
	} else {
		// 如果当前没有tagName，并且有children，那么就直接添加字符串，不需要添加tagle
		if (addCurrentNode) {
			let xmlTagEnd = `</${tagName}>`
			xmlStr = xmlTagStart + xmlContent + xmlTagEnd
		} else {
			xmlStr = xmlContent
		}
	}

	if (!xmlContent) {
		xmlStr = xmlStr.replace(`></${tagName}>`, `/>`)
	}

	return xmlStr
}
