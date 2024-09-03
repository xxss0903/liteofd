

// 将box的字符串转成数据对象
export const convertToBox = (valueStr: string) => {
	let size = valueStr.split(" ")
	let x = parseFloat(size[0])
	let y = parseFloat(size[1])
	let width = parseFloat(size[2])
	let height = parseFloat(size[3])

	return {
		x: convertToDpi(x),
		y: convertToDpi(y),
		width: convertToDpi(width),
		height: convertToDpi(height),
	}
}

let MaxScale = 10;

let Scale = 10;

export const setMaxPageScale = function (scale: number) {
	MaxScale = scale > 10 ? 10 : scale;
}

export const setPageScal = function (scale: number) {
	Scale = scale > 1 ? scale : 1;
	Scale = Scale > MaxScale ? MaxScale : Scale;
}

export const convertToDpiWithScale = function (width: number, currentScale: number) {
	return millimetersToPixel(width, currentScale * 25.4);
}

export const convertToDpi = function (width: number) {
	return millimetersToPixel(width, Scale * 25.4);
}

const millimetersToPixel = function (mm: number, dpi: number) {
	//毫米转像素：mm * dpi / 25.4
	return ((mm * dpi / 25.4));
}


export const convertPathAbbreviatedDatatoPoint = (abbreviatedData: string) => {
	let array = abbreviatedData.split(' ');
	let pointList = [];
	let i = 0;
	while (i < array.length) {
		if (array[i] === 'M' || array[i] === 'S') {
			let point = {
				'type': 'M',
				'x': parseFloat(array[i + 1]),
				'y': parseFloat(array[i + 2])
			}
			i = i + 3;
			pointList.push(point);
		}
		if (array[i] === 'L') {
			let point = {
				'type': 'L',
				'x': parseFloat(array[i + 1]),
				'y': parseFloat(array[i + 2])
			}
			i = i + 3;
			pointList.push(point);
		} else if (array[i] === 'C') {
			let point = {
				'type': 'C',
				'x': 0,
				'y': 0
			}
			pointList.push(point)
			i++;
		} else if (array[i] === 'B') {
			let point = {
				'type': 'B',
				'x1': parseFloat(array[i + 1]),
				'y1': parseFloat(array[i + 2]),
				'x2': parseFloat(array[i + 3]),
				'y2': parseFloat(array[i + 4]),
				'x3': parseFloat(array[i + 5]),
				'y3': parseFloat(array[i + 6])
			}
			i = i + 7;
			pointList.push(point);
		} else {
			i++;
		}
	}
	return pointList;
}

export const calPathPoint = function (abbreviatedPoint: any) {
	let pointList = [];

	for (let i = 0; i < abbreviatedPoint.length; i++) {
		let point = abbreviatedPoint[i];
		if (point.type === 'M' || point.type === 'L' || point.type === 'C') {
			let x = 0, y = 0;
			x = point.x;
			y = point.y;
			point.x = convertToDpi(x);
			point.y = convertToDpi(y);
			pointList.push(point);
		} else if (point.type === 'B') {
			let x1 = point.x1, y1 = point.y1;
			let x2 = point.x2, y2 = point.y2;
			let x3 = point.x3, y3 = point.y3;
			let realPoint = {
				'type': 'B', 'x1': convertToDpi(x1), 'y1': convertToDpi(y1),
				'x2': convertToDpi(x2), 'y2': convertToDpi(y2),
				'x3': convertToDpi(x3), 'y3': convertToDpi(y3)
			}
			pointList.push(realPoint);
		}
	}
	return pointList;
}

let decoder: any;
const
	haveU8 = (typeof Uint8Array == 'function');
export const decodeBase64String = (value: string) => {
	let i;
	if (decoder === undefined) {
		let b64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
			ignore = '= \f\n\r\t\u00A0\u2028\u2029';
		decoder = [];
		for (i = 0; i < 64; ++i)
			decoder[b64.charCodeAt(i)] = i;
		for (i = 0; i < ignore.length; ++i)
			decoder[ignore.charCodeAt(i)] = -1;
		// RFC 3548 URL & file safe encoding
		decoder['-'.charCodeAt(0)] = decoder['+'.charCodeAt(0)];
		decoder['_'.charCodeAt(0)] = decoder['/'.charCodeAt(0)];
	}
	let out = haveU8 ? new Uint8Array(value.length * 3 >> 2) : [];
	let bits = 0, char_count = 0, len = 0;
	for (i = 0; i < value.length; ++i) {
		let c = value.charCodeAt(i)
		if (c == 61) // '='.charCodeAt(0)
			break;
		c = decoder[c];
		if (c == -1)
			continue;
		if (c === undefined)
			throw 'Illegal character at offset ' + i;
		bits |= c;
		if (++char_count >= 4) {
			out[len++] = (bits >> 16);
			out[len++] = (bits >> 8) & 0xFF;
			out[len++] = bits & 0xFF;
			bits = 0;
			char_count = 0;
		} else {
			bits <<= 6;
		}
	}
	switch (char_count) {
		case 1:
			throw 'Base64 encoding incomplete: at least 2 bits missing';
		case 2:
			out[len++] = (bits >> 10);
			break;
		case 3:
			out[len++] = (bits >> 16);
			out[len++] = (bits >> 8) & 0xFF;
			break;
	}
	if (haveU8 && out.length > len) // in case it was originally longer because of ignored characters
		out = out.subarray(0, len);
	return out;
}


export const Uint8ArrayToHexString = (arr: any) => {
	let words: any[] = [];
	let j = 0;
	for (let i = 0; i < arr.length * 2; i += 2) {
		words[i >>> 3] |= parseInt(arr[j], 10) << (24 - (i % 8) * 4);
		j++;
	}

	// 转换到16进制
	let hexChars = [];
	for (let i = 0; i < arr.length; i++) {
		let bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
		hexChars.push((bite >>> 4).toString(16));
		hexChars.push((bite & 0x0f).toString(16));
	}

	return hexChars.join('');
}
