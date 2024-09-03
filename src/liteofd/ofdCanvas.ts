

// 每个页面page是一个画布
export const createOFDCanvas = () => {
	let canvas = document.createElement("canvas");
	canvas.getContext("2d")

	return canvas
}

/**
 * 绘制文本
 * @param context canvas的上下文
 * @param text 文本
 * @param attrs 绘制的属性
 */
export const showText = (context: CanvasRenderingContext2D, text: string, attrs: any) => {

}
