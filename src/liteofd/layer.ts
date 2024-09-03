
// 层基础类
import { XmlData } from "./ofdData"

export default abstract class Layer {
	/**
	 * 渲染的层的layer数据
	 * @param data 数据
	 * @param parent 父组件
	 */
	abstract render(data: XmlData, parent: Element)
}
