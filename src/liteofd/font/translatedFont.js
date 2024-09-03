// 转换后的字体数据
import { CMapCompressionType, FormatError, OPS, shadow, Util, warn, PromiseCapability, assert, AbortException, FONT_IDENTITY_MATRIX, stringToPDFString, TextRenderingMode } from "./util"
import { ImageResizer } from "./image_resizer"
import { LocalColorSpaceCache, LocalGStateCache, LocalImageCache, LocalTilingPatternCache, RegionalImageCache } from "./image_utils"
import { isPDFFunction, PDFFunctionFactory } from "./function"
import { Dict, isName, Name, Ref, RefSet } from "./primitives"
import { getFontNameToFileMap, getSerifFonts, getStandardFontName, getStdFontMap, getSymbolsFonts, isKnownFontName } from "./standard_fonts"
import { NullStream, Stream } from "./stream"
import { ColorSpace } from "./colorspace.js"
import { DecodeStream } from "./decode_stream"
import { BaseStream } from "./base_stream"
import { ErrorFont, Font } from "./fonts"
import { getTilingPatternIR, Pattern } from "./pattern"
import { FontFlags } from "./fonts_utils"
import { getFontSubstitution } from "./font_substitutions"
import { getXfaFontName, getXfaFontDict } from "./xfa_fonts"
import { CMapFactory, IdentityCMap } from "./cmap"
import { bidi } from "./bidi"
import { getEncoding, MacRomanEncoding, StandardEncoding, SymbolSetEncoding, WinAnsiEncoding, ZapfDingbatsEncoding } from "./encodings"
import { getGlyphsUnicode } from "./glyphlist"
import { getUnicodeForGlyph } from "./unicode"
import { IdentityToUnicodeMap, ToUnicodeMap } from "./to_unicode_map"
import { getMetrics } from "./metrics"
import { MurmurHash3_64 } from "./murmurhash3"
import { PDFImage } from "./image"

const PatternType = {
	TILING: 1,
	SHADING: 2,
};

const deferred = Promise.resolve();

const DefaultPartialEvaluatorOptions = Object.freeze({
	maxImageSize: -1,
	disableFontFace: false,
	ignoreErrors: false,
	isEvalSupported: true,
	isOffscreenCanvasSupported: false,
	canvasMaxAreaInBytes: -1,
	fontExtraProperties: false,
	useSystemFonts: true,
	cMapUrl: null,
	standardFontDataUrl: null
})


// Convert PDF blend mode names to HTML5 blend mode names.
function normalizeBlendMode(value, parsingArray = false) {
	if (Array.isArray(value)) {
		// Use the first *supported* BM value in the Array (fixes issue11279.pdf).
		for (const val of value) {
			const maybeBM = normalizeBlendMode(val, /* parsingArray = */ true);
			if (maybeBM) {
				return maybeBM;
			}
		}
		warn(`Unsupported blend mode Array: ${value}`);
		return "source-over";
	}

	if (!(value instanceof Name)) {
		if (parsingArray) {
			return null;
		}
		return "source-over";
	}
	switch (value.name) {
		case "Normal":
		case "Compatible":
			return "source-over";
		case "Multiply":
			return "multiply";
		case "Screen":
			return "screen";
		case "Overlay":
			return "overlay";
		case "Darken":
			return "darken";
		case "Lighten":
			return "lighten";
		case "ColorDodge":
			return "color-dodge";
		case "ColorBurn":
			return "color-burn";
		case "HardLight":
			return "hard-light";
		case "SoftLight":
			return "soft-light";
		case "Difference":
			return "difference";
		case "Exclusion":
			return "exclusion";
		case "Hue":
			return "hue";
		case "Saturation":
			return "saturation";
		case "Color":
			return "color";
		case "Luminosity":
			return "luminosity";
	}
	if (parsingArray) {
		return null;
	}
	warn(`Unsupported blend mode: ${value.name}`);
	return "source-over";
}

class PartialEvaluator {
	constructor( { xref, handler, pageIndex, idFactory, fontCache, builtInCMapCache, standardFontDataCache, globalImageCache, systemFontCache, options = null } ) {
		this.xref = xref
		this.handler = handler
		this.pageIndex = pageIndex
		this.idFactory = idFactory
		this.fontCache = fontCache
		this.builtInCMapCache = builtInCMapCache
		this.standardFontDataCache = standardFontDataCache
		this.globalImageCache = globalImageCache
		this.systemFontCache = systemFontCache
		this.options = options || DefaultPartialEvaluatorOptions
		this.parsingType3Font = false

		this._regionalImageCache = new RegionalImageCache()
		this._fetchBuiltInCMapBound = this.fetchBuiltInCMap.bind(this)
		ImageResizer.setMaxArea(this.options.canvasMaxAreaInBytes)
	}

	/**
	 * Since Functions are only cached (locally) by reference, we can share one
	 * `PDFFunctionFactory` instance within this `PartialEvaluator` instance.
	 */
	get _pdfFunctionFactory() {
		const pdfFunctionFactory = new PDFFunctionFactory({
			xref: this.xref,
			isEvalSupported: this.options.isEvalSupported
		})
		return shadow(this, "_pdfFunctionFactory", pdfFunctionFactory)
	}

	clone( newOptions = null ) {
		const newEvaluator = Object.create(this)
		newEvaluator.options = Object.assign(
			Object.create(null),
			this.options,
			newOptions
		)
		return newEvaluator
	}

	async fetchBuiltInCMap( name ) {
		const cachedData = this.builtInCMapCache.get(name)
		if ( cachedData ) {
			return cachedData
		}
		let data

		if ( this.options.cMapUrl !== null ) {
			// Only compressed CMaps are (currently) supported here.
			const url = `${ this.options.cMapUrl }${ name }.bcmap`
			const response = await fetch(url)
			if ( !response.ok ) {
				throw new Error(
					`fetchBuiltInCMap: failed to fetch file "${ url }" with "${ response.statusText }".`
				)
			}
			data = {
				cMapData: new Uint8Array(await response.arrayBuffer()),
				compressionType: CMapCompressionType.BINARY
			}
		} else {
			// Get the data on the main-thread instead.
			data = await this.handler.sendWithPromise("FetchBuiltInCMap", { name })
		}

		if ( data.compressionType !== CMapCompressionType.NONE ) {
			// Given the size of uncompressed CMaps, only cache compressed ones.
			this.builtInCMapCache.set(name, data)
		}
		return data
	}

	async fetchStandardFontData( name ) {
		const cachedData = this.standardFontDataCache.get(name)
		if ( cachedData ) {
			return new Stream(cachedData)
		}

		// The symbol fonts are not consistent across platforms, always load the
		// standard font data for them.
		if (
			this.options.useSystemFonts &&
			name !== "Symbol" &&
			name !== "ZapfDingbats"
		) {
			return null
		}

		const standardFontNameToFileName = getFontNameToFileMap(),
			filename = standardFontNameToFileName[name]
		let data

		if ( this.options.standardFontDataUrl !== null ) {
			const url = `${ this.options.standardFontDataUrl }${ filename }`
			const response = await fetch(url)
			if ( !response.ok ) {
				warn(
					`fetchStandardFontData: failed to fetch file "${ url }" with "${ response.statusText }".`
				)
			} else {
				data = new Uint8Array(await response.arrayBuffer())
			}
		} else {
			// Get the data on the main-thread instead.
			try {
				data = await this.handler.sendWithPromise("FetchStandardFontData", {
					filename
				})
			} catch (e) {
				warn(
					`fetchStandardFontData: failed to fetch file "${ filename }" with "${ e }".`
				)
			}
		}

		if ( !data ) {
			return null
		}
		// Cache the "raw" standard font data, to avoid fetching it repeatedly
		// (see e.g. issue 11399).
		this.standardFontDataCache.set(name, data)

		return new Stream(data)
	}

	async buildFormXObject(
		resources,
		xobj,
		smask,
		operatorList,
		task,
		initialState,
		localColorSpaceCache
	) {
		const dict = xobj.dict
		const matrix = dict.getArray("Matrix")
		let bbox = dict.getArray("BBox")
		bbox =
			Array.isArray(bbox) && bbox.length === 4
				? Util.normalizeRect(bbox)
				: null

		let optionalContent, groupOptions
		if ( dict.has("OC") ) {
			optionalContent = await this.parseMarkedContentProps(
				dict.get("OC"),
				resources
			)
		}
		if ( optionalContent !== undefined ) {
			operatorList.addOp(OPS.beginMarkedContentProps, ["OC", optionalContent])
		}
		const group = dict.get("Group")
		if ( group ) {
			groupOptions = {
				matrix,
				bbox,
				smask,
				isolated: false,
				knockout: false
			}

			const groupSubtype = group.get("S")
			let colorSpace = null
			if ( isName(groupSubtype, "Transparency") ) {
				groupOptions.isolated = group.get("I") || false
				groupOptions.knockout = group.get("K") || false
				if ( group.has("CS") ) {
					const cs = group.getRaw("CS")

					const cachedColorSpace = ColorSpace.getCached(
						cs,
						this.xref,
						localColorSpaceCache
					)
					if ( cachedColorSpace ) {
						colorSpace = cachedColorSpace
					} else {
						colorSpace = await this.parseColorSpace({
							cs,
							resources,
							localColorSpaceCache
						})
					}
				}
			}

			if ( smask?.backdrop ) {
				colorSpace ||= ColorSpace.singletons.rgb
				smask.backdrop = colorSpace.getRgb(smask.backdrop, 0)
			}

			operatorList.addOp(OPS.beginGroup, [groupOptions])
		}

		// If it's a group, a new canvas will be created that is the size of the
		// bounding box and translated to the correct position so we don't need to
		// apply the bounding box to it.
		const args = group ? [matrix, null] : [matrix, bbox]
		operatorList.addOp(OPS.paintFormXObjectBegin, args)

		await this.getOperatorList({
			stream: xobj,
			task,
			resources: dict.get("Resources") || resources,
			operatorList,
			initialState
		})
		operatorList.addOp(OPS.paintFormXObjectEnd, [])

		if ( group ) {
			operatorList.addOp(OPS.endGroup, [groupOptions])
		}

		if ( optionalContent !== undefined ) {
			operatorList.addOp(OPS.endMarkedContent, [])
		}
	}

	_sendImgData( objId, imgData, cacheGlobally = false ) {
		const transfers = imgData ? [imgData.bitmap || imgData.data.buffer] : null

		if ( this.parsingType3Font || cacheGlobally ) {
			return this.handler.send(
				"commonobj",
				[objId, "Image", imgData],
				transfers
			)
		}
		return this.handler.send(
			"obj",
			[objId, this.pageIndex, "Image", imgData],
			transfers
		)
	}

	async buildPaintImageXObject( {
																	resources,
																	image,
																	isInline = false,
																	operatorList,
																	cacheKey,
																	localImageCache,
																	localColorSpaceCache
																} ) {
		const dict = image.dict
		const imageRef = dict.objId
		const w = dict.get("W", "Width")
		const h = dict.get("H", "Height")

		if ( !(w && typeof w === "number") || !(h && typeof h === "number") ) {
			warn("Image dimensions are missing, or not numbers.")
			return
		}
		const maxImageSize = this.options.maxImageSize
		if ( maxImageSize !== -1 && w * h > maxImageSize ) {
			const msg = "Image exceeded maximum allowed size and was removed."

			if ( this.options.ignoreErrors ) {
				warn(msg)
				return
			}
			throw new Error(msg)
		}

		let optionalContent
		if ( dict.has("OC") ) {
			optionalContent = await this.parseMarkedContentProps(
				dict.get("OC"),
				resources
			)
		}

		const imageMask = dict.get("IM", "ImageMask") || false
		let imgData, args
		if ( imageMask ) {
			// This depends on a tmpCanvas being filled with the
			// current fillStyle, such that processing the pixel
			// data can't be done here. Instead of creating a
			// complete PDFImage, only read the information needed
			// for later.
			const interpolate = dict.get("I", "Interpolate")
			const bitStrideLength = (w + 7) >> 3
			const imgArray = image.getBytes(bitStrideLength * h)
			const decode = dict.getArray("D", "Decode")

			if ( this.parsingType3Font ) {
				imgData = PDFImage.createRawMask({
					imgArray,
					width: w,
					height: h,
					imageIsFromDecodeStream: image instanceof DecodeStream,
					inverseDecode: decode?.[0] > 0,
					interpolate
				})

				imgData.cached = !!cacheKey
				args = [imgData]

				operatorList.addImageOps(
					OPS.paintImageMaskXObject,
					args,
					optionalContent
				)

				if ( cacheKey ) {
					const cacheData = {
						fn: OPS.paintImageMaskXObject,
						args,
						optionalContent
					}
					localImageCache.set(cacheKey, imageRef, cacheData)

					if ( imageRef ) {
						this._regionalImageCache.set(
							/* name = */ null,
							imageRef,
							cacheData
						)
					}
				}
				return
			}

			imgData = await PDFImage.createMask({
				imgArray,
				width: w,
				height: h,
				imageIsFromDecodeStream: image instanceof DecodeStream,
				inverseDecode: decode?.[0] > 0,
				interpolate,
				isOffscreenCanvasSupported: this.options.isOffscreenCanvasSupported
			})

			if ( imgData.isSingleOpaquePixel ) {
				// Handles special case of mainly LaTeX documents which use image
				// masks to draw lines with the current fill style.
				operatorList.addImageOps(
					OPS.paintSolidColorImageMask,
					[],
					optionalContent
				)

				if ( cacheKey ) {
					const cacheData = {
						fn: OPS.paintSolidColorImageMask,
						args: [],
						optionalContent
					}
					localImageCache.set(cacheKey, imageRef, cacheData)

					if ( imageRef ) {
						this._regionalImageCache.set(
							/* name = */ null,
							imageRef,
							cacheData
						)
					}
				}
				return
			}

			const objId = `mask_${ this.idFactory.createObjId() }`
			operatorList.addDependency(objId)

			imgData.dataLen = imgData.bitmap
				? imgData.width * imgData.height * 4
				: imgData.data.length
			this._sendImgData(objId, imgData)

			args = [
				{
					data: objId,
					width: imgData.width,
					height: imgData.height,
					interpolate: imgData.interpolate,
					count: 1
				}
			]
			operatorList.addImageOps(
				OPS.paintImageMaskXObject,
				args,
				optionalContent
			)

			if ( cacheKey ) {
				const cacheData = {
					fn: OPS.paintImageMaskXObject,
					args,
					optionalContent
				}
				localImageCache.set(cacheKey, imageRef, cacheData)

				if ( imageRef ) {
					this._regionalImageCache.set(/* name = */ null, imageRef, cacheData)
				}
			}
			return
		}

		const SMALL_IMAGE_DIMENSIONS = 200
		// Inlining small images into the queue as RGB data
		if (
			isInline &&
			!dict.has("SMask") &&
			!dict.has("Mask") &&
			w + h < SMALL_IMAGE_DIMENSIONS
		) {
			const imageObj = new PDFImage({
				xref: this.xref,
				res: resources,
				image,
				isInline,
				pdfFunctionFactory: this._pdfFunctionFactory,
				localColorSpaceCache
			})
			// We force the use of RGBA_32BPP images here, because we can't handle
			// any other kind.
			imgData = await imageObj.createImageData(
				/* forceRGBA = */ true,
				/* isOffscreenCanvasSupported = */ false
			)
			operatorList.isOffscreenCanvasSupported =
				this.options.isOffscreenCanvasSupported
			operatorList.addImageOps(
				OPS.paintInlineImageXObject,
				[imgData],
				optionalContent
			)
			return
		}

		// If there is no imageMask, create the PDFImage and a lot
		// of image processing can be done here.
		let objId = `img_${ this.idFactory.createObjId() }`,
			cacheGlobally = false

		if ( this.parsingType3Font ) {
			objId = `${ this.idFactory.getDocId() }_type3_${ objId }`
		} else if ( cacheKey && imageRef ) {
			cacheGlobally = this.globalImageCache.shouldCache(
				imageRef,
				this.pageIndex
			)

			if ( cacheGlobally ) {
				assert( !isInline, "Cannot cache an inline image globally.")

				objId = `${ this.idFactory.getDocId() }_${ objId }`
			}
		}

		// Ensure that the dependency is added before the image is decoded.
		operatorList.addDependency(objId)
		args = [objId, w, h]
		operatorList.addImageOps(OPS.paintImageXObject, args, optionalContent)

		// For large images, at least 500x500 in size, that we'll cache globally
		// check if the image is still cached locally on the main-thread to avoid
		// having to re-parse the image (since that can be slow).
		if ( cacheGlobally && w * h > 250000 ) {
			const localLength = await this.handler.sendWithPromise("commonobj", [
				objId,
				"CopyLocalImage",
				{ imageRef }
			])

			if ( localLength ) {
				this.globalImageCache.setData(imageRef, {
					objId,
					fn: OPS.paintImageXObject,
					args,
					optionalContent,
					byteSize: 0 // Temporary entry, to avoid `setData` returning early.
				})
				this.globalImageCache.addByteSize(imageRef, localLength)
				return
			}
		}

		PDFImage.buildImage({
			xref: this.xref,
			res: resources,
			image,
			isInline,
			pdfFunctionFactory: this._pdfFunctionFactory,
			localColorSpaceCache
		})
			.then(async imageObj => {
				imgData = await imageObj.createImageData(
					/* forceRGBA = */ false,
					/* isOffscreenCanvasSupported = */ this.options
						.isOffscreenCanvasSupported
				)
				imgData.dataLen = imgData.bitmap
					? imgData.width * imgData.height * 4
					: imgData.data.length
				imgData.ref = imageRef

				if ( cacheGlobally ) {
					this.globalImageCache.addByteSize(imageRef, imgData.dataLen)
				}
				return this._sendImgData(objId, imgData, cacheGlobally)
			})
			.catch(reason => {
				warn(`Unable to decode image "${ objId }": "${ reason }".`)

				return this._sendImgData(objId, /* imgData = */ null, cacheGlobally)
			})

		if ( cacheKey ) {
			const cacheData = {
				fn: OPS.paintImageXObject,
				args,
				optionalContent
			}
			localImageCache.set(cacheKey, imageRef, cacheData)

			if ( imageRef ) {
				this._regionalImageCache.set(/* name = */ null, imageRef, cacheData)

				if ( cacheGlobally ) {
					this.globalImageCache.setData(imageRef, {
						objId,
						fn: OPS.paintImageXObject,
						args,
						optionalContent,
						byteSize: 0 // Temporary entry, note `addByteSize` above.
					})
				}
			}
		}
	}

	handleSMask(
		smask,
		resources,
		operatorList,
		task,
		stateManager,
		localColorSpaceCache
	) {
		const smaskContent = smask.get("G")
		const smaskOptions = {
			subtype: smask.get("S").name,
			backdrop: smask.get("BC")
		}

		// The SMask might have a alpha/luminosity value transfer function --
		// we will build a map of integer values in range 0..255 to be fast.
		const transferObj = smask.get("TR")
		if ( isPDFFunction(transferObj) ) {
			const transferFn = this._pdfFunctionFactory.create(transferObj)
			const transferMap = new Uint8Array(256)
			const tmp = new Float32Array(1)
			for (let i = 0; i < 256; i++) {
				tmp[0] = i / 255
				transferFn(tmp, 0, tmp, 0)
				transferMap[i] = (tmp[0] * 255) | 0
			}
			smaskOptions.transferMap = transferMap
		}

		return this.buildFormXObject(
			resources,
			smaskContent,
			smaskOptions,
			operatorList,
			task,
			stateManager.state.clone(),
			localColorSpaceCache
		)
	}

	handleTransferFunction( tr ) {
		let transferArray
		if ( Array.isArray(tr) ) {
			transferArray = tr
		} else if ( isPDFFunction(tr) ) {
			transferArray = [tr]
		} else {
			return null // Not a valid transfer function entry.
		}

		const transferMaps = []
		let numFns = 0,
			numEffectfulFns = 0
		for (const entry of transferArray) {
			const transferObj = this.xref.fetchIfRef(entry)
			numFns++

			if ( isName(transferObj, "Identity") ) {
				transferMaps.push(null)
				continue
			} else if ( !isPDFFunction(transferObj) ) {
				return null // Not a valid transfer function object.
			}

			const transferFn = this._pdfFunctionFactory.create(transferObj)
			const transferMap = new Uint8Array(256),
				tmp = new Float32Array(1)
			for (let j = 0; j < 256; j++) {
				tmp[0] = j / 255
				transferFn(tmp, 0, tmp, 0)
				transferMap[j] = (tmp[0] * 255) | 0
			}
			transferMaps.push(transferMap)
			numEffectfulFns++
		}

		if ( !(numFns === 1 || numFns === 4) ) {
			return null // Only 1 or 4 functions are supported, by the specification.
		}
		if ( numEffectfulFns === 0 ) {
			return null // Only /Identity transfer functions found, which are no-ops.
		}
		return transferMaps
	}

	handleTilingType(
		fn,
		color,
		resources,
		pattern,
		patternDict,
		operatorList,
		task,
		localTilingPatternCache
	) {
		// Create an IR of the pattern code.
		const tilingOpList = new OperatorList()
		// Merge the available resources, to prevent issues when the patternDict
		// is missing some /Resources entries (fixes issue6541.pdf).
		const patternResources = Dict.merge({
			xref: this.xref,
			dictArray: [patternDict.get("Resources"), resources]
		})

		return this.getOperatorList({
			stream: pattern,
			task,
			resources: patternResources,
			operatorList: tilingOpList
		})
			.then(function() {
				const operatorListIR = tilingOpList.getIR()
				const tilingPatternIR = getTilingPatternIR(
					operatorListIR,
					patternDict,
					color
				)
				// Add the dependencies to the parent operator list so they are
				// resolved before the sub operator list is executed synchronously.
				operatorList.addDependencies(tilingOpList.dependencies)
				operatorList.addOp(fn, tilingPatternIR)

				if ( patternDict.objId ) {
					localTilingPatternCache.set(/* name = */ null, patternDict.objId, {
						operatorListIR,
						dict: patternDict
					})
				}
			})
			.catch(reason => {
				if ( reason instanceof AbortException ) {
					return
				}
				if ( this.options.ignoreErrors ) {
					warn(`handleTilingType - ignoring pattern: "${ reason }".`)
					return
				}
				throw reason
			})
	}

	async handleSetFont(
		resources,
		fontArgs,
		fontRef,
		operatorList,
		task,
		state,
		fallbackFontDict = null,
		cssFontInfo = null
	) {
		const fontName = fontArgs?.[0] instanceof Name ? fontArgs[0].name : null

		if ( resources.objId === "6R" ) {
			// 加载sans-bold的字体
			// debugger
		}
		// 这里translated的data数据就是读取出来的字体数据，和liteofd中直接读取出来的文件内容一样了，看接下来怎么处理
		// 包装后的TranslatedFont对象，里面的font就是字体数据
		let translated = await this.loadFont(
			fontName,
			fontRef,
			resources,
			fallbackFontDict,
			cssFontInfo
		)

		if ( translated.font.isType3Font ) {
			try {
				await translated.loadType3Data(this, resources, task)
				// Add the dependencies to the parent operatorList so they are
				// resolved before Type3 operatorLists are executed synchronously.
				operatorList.addDependencies(translated.type3Dependencies)
			} catch (reason) {
				translated = new TranslatedFont({
					loadedName: "g_font_error",
					font: new ErrorFont(`Type3 font load error: ${ reason }`),
					dict: translated.font,
					evaluatorOptions: this.options
				})
			}
		}
		// zxlog("evaluator.js handleSetFont ", fontName)
		state.font = translated.font
		// 这里发送的是一个commobj的对象方法，是处理Font的
		translated.send(this.handler)
		return translated.loadedName
	}

	handleText( chars, state ) {
		const font = state.font
		// 这里是将字体的字形转换到对应的吗
		if ( state.font.name === "TACTGM+NimbusRomNo9L-Medi" ) debugger
		const glyphs = font.charsToGlyphs(chars)

		if ( font.data ) {
			const isAddToPathSet = !!(
				state.textRenderingMode & TextRenderingMode.ADD_TO_PATH_FLAG
			)
			if (
				isAddToPathSet ||
				state.fillColorSpace.name === "Pattern" ||
				font.disableFontFace ||
				this.options.disableFontFace
			) {
				PartialEvaluator.buildFontPaths(
					font,
					glyphs,
					this.handler,
					this.options
				)
			}
		}
		// zxlog("evaluator.js handleText ", glyphs);
		return glyphs
	}

	ensureStateFont( state ) {
		if ( state.font ) {
			return
		}
		const reason = new FormatError(
			"Missing setFont (Tf) operator before text rendering operator."
		)

		if ( this.options.ignoreErrors ) {
			warn(`ensureStateFont: "${ reason }".`)
			return
		}
		throw reason
	}

	async setGState( { resources, gState, operatorList, cacheKey, task, stateManager, localGStateCache, localColorSpaceCache } ) {
		const gStateRef = gState.objId
		let isSimpleGState = true
		// This array holds the converted/processed state data.
		const gStateObj = []
		let promise = Promise.resolve()
		for (const key of gState.getKeys()) {
			const value = gState.get(key)
			switch (key) {
				case "Type":
					break
				case "LW":
				case "LC":
				case "LJ":
				case "ML":
				case "D":
				case "RI":
				case "FL":
				case "CA":
				case "ca":
					gStateObj.push([key, value])
					break
				case "Font":
					isSimpleGState = false

					promise = promise.then(() =>
						this.handleSetFont(
							resources,
							null,
							value[0],
							operatorList,
							task,
							stateManager.state
						).then(function( loadedName ) {
							operatorList.addDependency(loadedName)
							gStateObj.push([key, [loadedName, value[1]]])
						})
					)
					break
				case "BM":
					gStateObj.push([key, normalizeBlendMode(value)])
					break
				case "SMask":
					if ( isName(value, "None") ) {
						gStateObj.push([key, false])
						break
					}
					if ( value instanceof Dict ) {
						isSimpleGState = false

						promise = promise.then(() =>
							this.handleSMask(
								value,
								resources,
								operatorList,
								task,
								stateManager,
								localColorSpaceCache
							)
						)
						gStateObj.push([key, true])
					} else {
						warn("Unsupported SMask type")
					}
					break
				case "TR":
					const transferMaps = this.handleTransferFunction(value)
					gStateObj.push([key, transferMaps])
					break
				// Only generate info log messages for the following since
				// they are unlikely to have a big impact on the rendering.
				case "OP":
				case "op":
				case "OPM":
				case "BG":
				case "BG2":
				case "UCR":
				case "UCR2":
				case "TR2":
				case "HT":
				case "SM":
				case "SA":
				case "AIS":
				case "TK":
					// TODO implement these operators.
					// info("graphic state operator " + key)
					break
				default:
					// info("Unknown graphic state operator " + key)
					break
			}
		}
		await promise

		if ( gStateObj.length > 0 ) {
			operatorList.addOp(OPS.setGState, [gStateObj])
		}

		if ( isSimpleGState ) {
			localGStateCache.set(cacheKey, gStateRef, gStateObj)
		}
	}

	loadFont(
		fontName,
		font,
		resources,
		fallbackFontDict = null,
		cssFontInfo = null
	) {
		// eslint-disable-next-line arrow-body-style
		// debugger
		// 加载字体，将文件中的本地字体加载出来，这里的加载字体是要将字体转为glyph吗，显示的时候
		const errorFont = async () => new TranslatedFont({
			loadedName: "g_font_error",
			font: new ErrorFont(`Font "${ fontName }" is not available.`),
			dict: font,
			evaluatorOptions: this.options
		})

		let fontRef
		if ( font ) {
			// Loading by ref.
			if ( font instanceof Ref ) {
				fontRef = font
			}
		} else {
			// Loading by name.
			const fontRes = resources.get("Font") // 获取字体资源，拿到字体在文件中的引用位置的map，比如4
			// 0，就是4 0 的交叉表中数据位置
			if ( fontRes ) {
				fontRef = fontRes.getRaw(fontName)
			}
		}
		if ( fontRef ) { // 字体的位置引用 num:4 gen:0 表示位置在4 0的字体
			if ( this.parsingType3Font && this.type3FontRefs.has(fontRef) ) {
				return errorFont()
			}

			if ( this.fontCache.has(fontRef) ) {
				return this.fontCache.get(fontRef)
			}
			// 这里fontRef拿到了也有一个ToUnicode是字体的渲染字符
			font = this.xref.fetchIfRef(fontRef) // 拿到交叉表对应的字体数据，也就是i交叉表已经把数据解析了，这里是拿到对应4R位置的数据，也就是字体的font数据了
		}

		if ( !(font instanceof Dict) ) {
			if ( !this.options.ignoreErrors && !this.parsingType3Font ) {
				warn(`Font "${ fontName }" is not available.`)
				return errorFont()
			}
			warn(
				`Font "${ fontName }" is not available -- attempting to fallback to a default font.`
			)

			// Falling back to a default font to avoid completely broken rendering,
			// but note that there're no guarantees that things will look "correct".
			font = fallbackFontDict || PartialEvaluator.fallbackFontDict
		}
		// zxlog("evaluator.js loadFont", fontName, font, resources);

		// We are holding `font.cacheKey` references only for `fontRef`s that
		// are not actually `Ref`s, but rather `Dict`s. See explanation below.
		if ( font.cacheKey && this.fontCache.has(font.cacheKey) ) {
			return this.fontCache.get(font.cacheKey)
		}

		const fontCapability = new PromiseCapability()

		let preEvaluatedFont
		try {
			preEvaluatedFont = this.preEvaluateFont(font) // 这里是将Font的字典预处理，加载为字体对象的第一步执行应该是
			// 对字体数据做了处理，拿到了hash是字体的内容，做了一次hash计算的处理，看看是什么样的数据
			if ( preEvaluatedFont.baseDict.objId === "6R" ) {
				// 这里的9R表示字体的跟字典的id，这里的9R是"AAAAAE+DejaVuSans-Bold"的字体
				// debugger
			}
			preEvaluatedFont.cssFontInfo = cssFontInfo
		} catch (reason) {
			warn(`loadFont - preEvaluateFont failed: "${ reason }".`)
			return errorFont()
		}
		const { descriptor, hash } = preEvaluatedFont

		const fontRefIsRef = fontRef instanceof Ref
		let fontID

		if ( hash && descriptor instanceof Dict ) {
			// 相当于给descriptor添加一个fontAliases，就是把字体的数据做成hash字符串来标记
			const fontAliases = (descriptor.fontAliases ||= Object.create(null))
			// 相当于把字体计算出一个hash值，来表示特定的字体，防止字体冲突？
			if ( fontAliases[hash] ) {
				const aliasFontRef = fontAliases[hash].aliasRef
				if ( fontRefIsRef && aliasFontRef && this.fontCache.has(aliasFontRef) ) {
					this.fontCache.putAlias(fontRef, aliasFontRef)
					return this.fontCache.get(fontRef)
				}
			} else {
				fontAliases[hash] = {
					fontID: this.idFactory.createFontId() // 根据字体顺序创造使用一个id
				}
			}

			if ( fontRefIsRef ) {
				fontAliases[hash].aliasRef = fontRef
			}
			fontID = fontAliases[hash].fontID
		} else {
			fontID = this.idFactory.createFontId()
		}
		assert(
			fontID?.startsWith("f"),
			"The \"fontID\" must be (correctly) defined."
		)

		// Workaround for bad PDF generators that reference fonts incorrectly,
		// where `fontRef` is a `Dict` rather than a `Ref` (fixes bug946506.pdf).
		// In this case we cannot put the font into `this.fontCache` (which is
		// a `RefSetCache`), since it's not possible to use a `Dict` as a key.
		//
		// However, if we don't cache the font it's not possible to remove it
		// when `cleanup` is triggered from the API, which causes issues on
		// subsequent rendering operations (see issue7403.pdf) and would force us
		// to unnecessarily load the same fonts over and over.
		//
		// Instead, we cheat a bit by using a modified `fontID` as a key in
		// `this.fontCache`, to allow the font to be cached.
		// NOTE: This works because `RefSetCache` calls `toString()` on provided
		//       keys. Also, since `fontRef` is used when getting cached fonts,
		//       we'll not accidentally match fonts cached with the `fontID`.
		if ( fontRefIsRef ) {
			this.fontCache.put(fontRef, fontCapability.promise) // 添加字体的缓存，用来获取字体数据，这里使用了一个异步的promise的对象来处理
		} else {
			font.cacheKey = `cacheKey_${ fontID }`
			this.fontCache.put(font.cacheKey, fontCapability.promise)
		}

		// Keep track of each font we translated so the caller can
		// load them asynchronously before calling display on a page.
		font.loadedName = `${ this.idFactory.getDocId() }_${ fontID }`
		// 转换为Font对象，这里加载完数据应该还是对数据做了处理，不然和直接加载完是不一样的，所以需要看看怎么处理，需要处理一下字体
		if ( preEvaluatedFont.baseDict.objId === "6R" ) {
			// 这里的9R表示字体的跟字典的id，这里的9R是"AAAAAE+DejaVuSans-Bold"的字体
			// debugger
		}
		// translateFont就是将PDF中的字体数据提取，然后转换成对应字体，比如Type1Font的字体
		// 然后将Type1Font的字体进行压缩CFF，之后再组装成为一个OTF的字体，保存再translatedFont的data
		// 数据里面就是OTF的数据，二进制数据组
		this.translateFont(preEvaluatedFont)
			.then(translatedFont => {
				// 这里是将字体转换之后的字体，就是再加载了原始的文件中的字体之后，经过转换形成的字体
				// 再将解析后的字体包装成TranslatedFont对象，这样就完成了字体的全部解析
				fontCapability.resolve(
					new TranslatedFont({
						loadedName: font.loadedName,
						font: translatedFont,
						dict: font,
						evaluatorOptions: this.options
					})
				)
			})
			.catch(reason => {
				// TODO fontCapability.reject?
				warn(`loadFont - translateFont failed: "${ reason }".`)

				fontCapability.resolve(
					new TranslatedFont({
						loadedName: font.loadedName,
						font: new ErrorFont(
							reason instanceof Error ? reason.message : reason
						),
						dict: font,
						evaluatorOptions: this.options
					})
				)
			})
		// 返回的是字体处理的，使用await之后获得的是TranslatedFont的对象
		return fontCapability.promise
	}

	buildPath( operatorList, fn, args, parsingText = false ) {
		const lastIndex = operatorList.length - 1
		if ( !args ) {
			args = []
		}
		if (
			lastIndex < 0 ||
			operatorList.fnArray[lastIndex] !== OPS.constructPath
		) {
			// Handle corrupt PDF documents that contains path operators inside of
			// text objects, which may shift subsequent text, by enclosing the path
			// operator in save/restore operators (fixes issue10542_reduced.pdf).
			//
			// Note that this will effectively disable the optimization in the
			// `else` branch below, but given that this type of corruption is
			// *extremely* rare that shouldn't really matter much in practice.
			if ( parsingText ) {
				warn(`Encountered path operator "${ fn }" inside of a text object.`)
				operatorList.addOp(OPS.save, null)
			}

			let minMax
			switch (fn) {
				case OPS.rectangle:
					const x = args[0] + args[2]
					const y = args[1] + args[3]
					minMax = [
						Math.min(args[0], x),
						Math.min(args[1], y),
						Math.max(args[0], x),
						Math.max(args[1], y)
					]
					break
				case OPS.moveTo:
				case OPS.lineTo:
					minMax = [args[0], args[1], args[0], args[1]]
					break
				default:
					minMax = [Infinity, Infinity, -Infinity, -Infinity]
					break
			}
			operatorList.addOp(OPS.constructPath, [[fn], args, minMax])

			if ( parsingText ) {
				operatorList.addOp(OPS.restore, null)
			}
		} else {
			const opArgs = operatorList.argsArray[lastIndex]
			opArgs[0].push(fn)
			opArgs[1].push(...args)
			const minMax = opArgs[2]

			// Compute min/max in the worker instead of the main thread.
			// If the current matrix (when drawing) is a scaling one
			// then min/max can be easily computed in using those values.
			// Only rectangle, lineTo and moveTo are handled here since
			// Bezier stuff requires to have the starting point.
			switch (fn) {
				case OPS.rectangle:
					const x = args[0] + args[2]
					const y = args[1] + args[3]
					minMax[0] = Math.min(minMax[0], args[0], x)
					minMax[1] = Math.min(minMax[1], args[1], y)
					minMax[2] = Math.max(minMax[2], args[0], x)
					minMax[3] = Math.max(minMax[3], args[1], y)
					break
				case OPS.moveTo:
				case OPS.lineTo:
					minMax[0] = Math.min(minMax[0], args[0])
					minMax[1] = Math.min(minMax[1], args[1])
					minMax[2] = Math.max(minMax[2], args[0])
					minMax[3] = Math.max(minMax[3], args[1])
					break
			}
		}
	}

	parseColorSpace( { cs, resources, localColorSpaceCache } ) {
		return ColorSpace.parseAsync({
			cs,
			xref: this.xref,
			resources,
			pdfFunctionFactory: this._pdfFunctionFactory,
			localColorSpaceCache
		}).catch(reason => {
			if ( reason instanceof AbortException ) {
				return null
			}
			if ( this.options.ignoreErrors ) {
				warn(`parseColorSpace - ignoring ColorSpace: "${ reason }".`)
				return null
			}
			throw reason
		})
	}

	parseShading( {
									shading,
									resources,
									localColorSpaceCache,
									localShadingPatternCache
								} ) {
		// Shadings and patterns may be referenced by the same name but the resource
		// dictionary could be different so we can't use the name for the cache key.
		let id = localShadingPatternCache.get(shading)
		if ( !id ) {
			var shadingFill = Pattern.parseShading(
				shading,
				this.xref,
				resources,
				this._pdfFunctionFactory,
				localColorSpaceCache
			)
			const patternIR = shadingFill.getIR()
			id = `pattern_${ this.idFactory.createObjId() }`
			if ( this.parsingType3Font ) {
				id = `${ this.idFactory.getDocId() }_type3_${ id }`
			}
			localShadingPatternCache.set(shading, id)

			if ( this.parsingType3Font ) {
				this.handler.send("commonobj", [id, "Pattern", patternIR])
			} else {
				this.handler.send("obj", [id, this.pageIndex, "Pattern", patternIR])
			}
		}
		return id
	}

	handleColorN(
		operatorList,
		fn,
		args,
		cs,
		patterns,
		resources,
		task,
		localColorSpaceCache,
		localTilingPatternCache,
		localShadingPatternCache
	) {
		// compile tiling patterns
		const patternName = args.pop()
		// SCN/scn applies patterns along with normal colors
		if ( patternName instanceof Name ) {
			const rawPattern = patterns.getRaw(patternName.name)

			const localTilingPattern =
				rawPattern instanceof Ref &&
				localTilingPatternCache.getByRef(rawPattern)
			if ( localTilingPattern ) {
				try {
					const color = cs.base ? cs.base.getRgb(args, 0) : null
					const tilingPatternIR = getTilingPatternIR(
						localTilingPattern.operatorListIR,
						localTilingPattern.dict,
						color
					)
					operatorList.addOp(fn, tilingPatternIR)
					return undefined
				} catch {
					// Handle any errors during normal TilingPattern parsing.
				}
			}

			const pattern = this.xref.fetchIfRef(rawPattern)
			if ( pattern ) {
				const dict = pattern instanceof BaseStream ? pattern.dict : pattern
				const typeNum = dict.get("PatternType")

				if ( typeNum === PatternType.TILING ) {
					const color = cs.base ? cs.base.getRgb(args, 0) : null
					return this.handleTilingType(
						fn,
						color,
						resources,
						pattern,
						dict,
						operatorList,
						task,
						localTilingPatternCache
					)
				} else if ( typeNum === PatternType.SHADING ) {
					const shading = dict.get("Shading")
					const matrix = dict.getArray("Matrix")
					const objId = this.parseShading({
						shading,
						resources,
						localColorSpaceCache,
						localShadingPatternCache
					})
					operatorList.addOp(fn, ["Shading", objId, matrix])
					return undefined
				}
				throw new FormatError(`Unknown PatternType: ${ typeNum }`)
			}
		}
		throw new FormatError(`Unknown PatternName: ${ patternName }`)
	}

	_parseVisibilityExpression( array, nestingCounter, currentResult ) {
		const MAX_NESTING = 10
		if ( ++nestingCounter > MAX_NESTING ) {
			warn("Visibility expression is too deeply nested")
			return
		}
		const length = array.length
		const operator = this.xref.fetchIfRef(array[0])
		if ( length < 2 || !(operator instanceof Name) ) {
			warn("Invalid visibility expression")
			return
		}
		switch (operator.name) {
			case "And":
			case "Or":
			case "Not":
				currentResult.push(operator.name)
				break
			default:
				warn(`Invalid operator ${ operator.name } in visibility expression`)
				return
		}
		for (let i = 1; i < length; i++) {
			const raw = array[i]
			const object = this.xref.fetchIfRef(raw)
			if ( Array.isArray(object) ) {
				const nestedResult = []
				currentResult.push(nestedResult)
				// Recursively parse a subarray.
				this._parseVisibilityExpression(object, nestingCounter, nestedResult)
			} else if ( raw instanceof Ref ) {
				// Reference to an OCG dictionary.
				currentResult.push(raw.toString())
			}
		}
	}

	async parseMarkedContentProps( contentProperties, resources ) {
		let optionalContent
		if ( contentProperties instanceof Name ) {
			const properties = resources.get("Properties")
			optionalContent = properties.get(contentProperties.name)
		} else if ( contentProperties instanceof Dict ) {
			optionalContent = contentProperties
		} else {
			throw new FormatError("Optional content properties malformed.")
		}

		const optionalContentType = optionalContent.get("Type")?.name
		if ( optionalContentType === "OCG" ) {
			return {
				type: optionalContentType,
				id: optionalContent.objId
			}
		} else if ( optionalContentType === "OCMD" ) {
			const expression = optionalContent.get("VE")
			if ( Array.isArray(expression) ) {
				const result = []
				this._parseVisibilityExpression(expression, 0, result)
				if ( result.length > 0 ) {
					return {
						type: "OCMD",
						expression: result
					}
				}
			}

			const optionalContentGroups = optionalContent.get("OCGs")
			if (
				Array.isArray(optionalContentGroups) ||
				optionalContentGroups instanceof Dict
			) {
				const groupIds = []
				if ( Array.isArray(optionalContentGroups) ) {
					for (const ocg of optionalContentGroups) {
						groupIds.push(ocg.toString())
					}
				} else {
					// Dictionary, just use the obj id.
					groupIds.push(optionalContentGroups.objId)
				}

				return {
					type: optionalContentType,
					ids: groupIds,
					policy:
						optionalContent.get("P") instanceof Name
							? optionalContent.get("P").name
							: null,
					expression: null
				}
			} else if ( optionalContentGroups instanceof Ref ) {
				return {
					type: optionalContentType,
					id: optionalContentGroups.toString()
				}
			}
		}
		return null
	}

	getOperatorList( { stream, task, resources, operatorList, initialState = null, fallbackFontDict = null } ) {
		// Ensure that `resources`/`initialState` is correctly initialized,
		// even if the provided parameter is e.g. `null`.
		resources ||= Dict.empty
		initialState ||= new EvalState()

		if ( !operatorList ) {
			throw new Error("getOperatorList: missing \"operatorList\" parameter")
		}

		const self = this
		const xref = this.xref
		let parsingText = false
		const localImageCache = new LocalImageCache()
		const localColorSpaceCache = new LocalColorSpaceCache()
		const localGStateCache = new LocalGStateCache()
		const localTilingPatternCache = new LocalTilingPatternCache()
		const localShadingPatternCache = new Map()

		const xobjs = resources.get("XObject") || Dict.empty
		const patterns = resources.get("Pattern") || Dict.empty
		const stateManager = new StateManager(initialState)
		const preprocessor = new EvaluatorPreprocessor(stream, xref, stateManager)
		const timeSlotManager = new TimeSlotManager()

		function closePendingRestoreOPS( argument ) {
			for (let i = 0, ii = preprocessor.savedStatesDepth; i < ii; i++) {
				operatorList.addOp(OPS.restore, [])
			}
		}

		return new Promise(function promiseBody( resolve, reject ) {
			const next = function( promise ) {
				Promise.all([promise, operatorList.ready]).then(function() {
					try {
						promiseBody(resolve, reject)
					} catch (ex) {
						reject(ex)
					}
				}, reject)
			}
			task.ensureNotTerminated()
			timeSlotManager.reset()

			const operation = {}
			let stop, i, ii, cs, name, isValidName
			while ( !(stop = timeSlotManager.check())) {
				// The arguments parsed by read() are used beyond this loop, so we
				// cannot reuse the same array on each iteration. Therefore we pass
				// in |null| as the initial value (see the comment on
				// EvaluatorPreprocessor_read() for why).
				operation.args = null
				if ( !preprocessor.read(operation) ) {
					break
				}
				let args = operation.args
				let fn = operation.fn

				switch (fn | 0) {
					case OPS.paintXObject:
						// eagerly compile XForm objects
						isValidName = args[0] instanceof Name
						name = args[0].name

						if ( isValidName ) {
							const localImage = localImageCache.getByName(name)
							if ( localImage ) {
								operatorList.addImageOps(
									localImage.fn,
									localImage.args,
									localImage.optionalContent
								)

								incrementCachedImageMaskCount(localImage)
								args = null
								continue
							}
						}

						next(
							new Promise(function( resolveXObject, rejectXObject ) {
								if ( !isValidName ) {
									throw new FormatError("XObject must be referred to by name.")
								}

								let xobj = xobjs.getRaw(name)
								if ( xobj instanceof Ref ) {
									const localImage =
										localImageCache.getByRef(xobj) ||
										self._regionalImageCache.getByRef(xobj)
									if ( localImage ) {
										operatorList.addImageOps(
											localImage.fn,
											localImage.args,
											localImage.optionalContent
										)

										incrementCachedImageMaskCount(localImage)
										resolveXObject()
										return
									}

									const globalImage = self.globalImageCache.getData(
										xobj,
										self.pageIndex
									)
									if ( globalImage ) {
										operatorList.addDependency(globalImage.objId)
										operatorList.addImageOps(
											globalImage.fn,
											globalImage.args,
											globalImage.optionalContent
										)

										resolveXObject()
										return
									}

									xobj = xref.fetch(xobj)
								}

								if ( !(xobj instanceof BaseStream) ) {
									throw new FormatError("XObject should be a stream")
								}

								const type = xobj.dict.get("Subtype")
								if ( !(type instanceof Name) ) {
									throw new FormatError("XObject should have a Name subtype")
								}

								if ( type.name === "Form" ) {
									stateManager.save()
									self
										.buildFormXObject(
											resources,
											xobj,
											null,
											operatorList,
											task,
											stateManager.state.clone(),
											localColorSpaceCache
										)
										.then(function() {
											stateManager.restore()
											resolveXObject()
										}, rejectXObject)
									return
								} else if ( type.name === "Image" ) {
									self
										.buildPaintImageXObject({
											resources,
											image: xobj,
											operatorList,
											cacheKey: name,
											localImageCache,
											localColorSpaceCache
										})
										.then(resolveXObject, rejectXObject)
									return
								} else if ( type.name === "PS" ) {
									// PostScript XObjects are unused when viewing documents.
									// See section 4.7.1 of Adobe's PDF reference.
									// info("Ignored XObject subtype PS")
								} else {
									throw new FormatError(
										`Unhandled XObject subtype ${ type.name }`
									)
								}
								resolveXObject()
							}).catch(function( reason ) {
								if ( reason instanceof AbortException ) {
									return
								}
								if ( self.options.ignoreErrors ) {
									warn(`getOperatorList - ignoring XObject: "${ reason }".`)
									return
								}
								throw reason
							})
						)
						return
					case OPS.setFont:
						var fontSize = args[1]
						// eagerly collect all fonts
						next(
							self
								.handleSetFont(
									resources,
									args,
									null,
									operatorList,
									task,
									stateManager.state,
									fallbackFontDict
								)
								.then(function( loadedName ) {
									operatorList.addDependency(loadedName)
									operatorList.addOp(OPS.setFont, [loadedName, fontSize])
								})
						)
						return
					case OPS.beginText:
						parsingText = true
						break
					case OPS.endText:
						parsingText = false
						break
					case OPS.endInlineImage:
						var cacheKey = args[0].cacheKey
						if ( cacheKey ) {
							const localImage = localImageCache.getByName(cacheKey)
							if ( localImage ) {
								operatorList.addImageOps(
									localImage.fn,
									localImage.args,
									localImage.optionalContent
								)

								incrementCachedImageMaskCount(localImage)
								args = null
								continue
							}
						}
						next(
							self.buildPaintImageXObject({
								resources,
								image: args[0],
								isInline: true,
								operatorList,
								cacheKey,
								localImageCache,
								localColorSpaceCache
							})
						)
						return
					case OPS.showText:
						if ( !stateManager.state.font ) {
							self.ensureStateFont(stateManager.state)
							continue
						}
						args[0] = self.handleText(args[0], stateManager.state)
						break
					case OPS.showSpacedText:
						if ( !stateManager.state.font ) {
							self.ensureStateFont(stateManager.state)
							continue
						}
						var combinedGlyphs = []
						var state = stateManager.state
						for (const arrItem of args[0]) {
							if ( typeof arrItem === "string" ) {
								combinedGlyphs.push(...self.handleText(arrItem, state))
							} else if ( typeof arrItem === "number" ) {
								combinedGlyphs.push(arrItem)
							}
						}
						// 这里是先将字符比如T转换成对应字体的符号fontChar，然后调用showText来绘制图形
						// 这里的Glyph对象包含了字符的图形显示 glyph
						args[0] = combinedGlyphs
						fn = OPS.showText
						break
					case OPS.nextLineShowText:
						if ( !stateManager.state.font ) {
							self.ensureStateFont(stateManager.state)
							continue
						}
						operatorList.addOp(OPS.nextLine)
						args[0] = self.handleText(args[0], stateManager.state)
						fn = OPS.showText
						break
					case OPS.nextLineSetSpacingShowText:
						if ( !stateManager.state.font ) {
							self.ensureStateFont(stateManager.state)
							continue
						}
						operatorList.addOp(OPS.nextLine)
						operatorList.addOp(OPS.setWordSpacing, [args.shift()])
						operatorList.addOp(OPS.setCharSpacing, [args.shift()])
						args[0] = self.handleText(args[0], stateManager.state)
						fn = OPS.showText
						break
					case OPS.setTextRenderingMode:
						stateManager.state.textRenderingMode = args[0]
						break

					case OPS.setFillColorSpace: {
						const cachedColorSpace = ColorSpace.getCached(
							args[0],
							xref,
							localColorSpaceCache
						)
						if ( cachedColorSpace ) {
							stateManager.state.fillColorSpace = cachedColorSpace
							continue
						}

						next(
							self
								.parseColorSpace({
									cs: args[0],
									resources,
									localColorSpaceCache
								})
								.then(function( colorSpace ) {
									if ( colorSpace ) {
										stateManager.state.fillColorSpace = colorSpace
									}
								})
						)
						return
					}
					case OPS.setStrokeColorSpace: {
						const cachedColorSpace = ColorSpace.getCached(
							args[0],
							xref,
							localColorSpaceCache
						)
						if ( cachedColorSpace ) {
							stateManager.state.strokeColorSpace = cachedColorSpace
							continue
						}

						next(
							self
								.parseColorSpace({
									cs: args[0],
									resources,
									localColorSpaceCache
								})
								.then(function( colorSpace ) {
									if ( colorSpace ) {
										stateManager.state.strokeColorSpace = colorSpace
									}
								})
						)
						return
					}
					case OPS.setFillColor:
						cs = stateManager.state.fillColorSpace
						args = cs.getRgb(args, 0)
						fn = OPS.setFillRGBColor
						break
					case OPS.setStrokeColor:
						cs = stateManager.state.strokeColorSpace
						args = cs.getRgb(args, 0)
						fn = OPS.setStrokeRGBColor
						break
					case OPS.setFillGray:
						stateManager.state.fillColorSpace = ColorSpace.singletons.gray
						args = ColorSpace.singletons.gray.getRgb(args, 0)
						fn = OPS.setFillRGBColor
						break
					case OPS.setStrokeGray:
						stateManager.state.strokeColorSpace = ColorSpace.singletons.gray
						args = ColorSpace.singletons.gray.getRgb(args, 0)
						fn = OPS.setStrokeRGBColor
						break
					case OPS.setFillCMYKColor:
						stateManager.state.fillColorSpace = ColorSpace.singletons.cmyk
						args = ColorSpace.singletons.cmyk.getRgb(args, 0)
						fn = OPS.setFillRGBColor
						break
					case OPS.setStrokeCMYKColor:
						stateManager.state.strokeColorSpace = ColorSpace.singletons.cmyk
						args = ColorSpace.singletons.cmyk.getRgb(args, 0)
						fn = OPS.setStrokeRGBColor
						break
					case OPS.setFillRGBColor:
						stateManager.state.fillColorSpace = ColorSpace.singletons.rgb
						args = ColorSpace.singletons.rgb.getRgb(args, 0)
						break
					case OPS.setStrokeRGBColor:
						stateManager.state.strokeColorSpace = ColorSpace.singletons.rgb
						args = ColorSpace.singletons.rgb.getRgb(args, 0)
						break
					case OPS.setFillColorN:
						cs = stateManager.state.fillColorSpace
						if ( cs.name === "Pattern" ) {
							next(
								self.handleColorN(
									operatorList,
									OPS.setFillColorN,
									args,
									cs,
									patterns,
									resources,
									task,
									localColorSpaceCache,
									localTilingPatternCache,
									localShadingPatternCache
								)
							)
							return
						}
						args = cs.getRgb(args, 0)
						fn = OPS.setFillRGBColor
						break
					case OPS.setStrokeColorN:
						cs = stateManager.state.strokeColorSpace
						if ( cs.name === "Pattern" ) {
							next(
								self.handleColorN(
									operatorList,
									OPS.setStrokeColorN,
									args,
									cs,
									patterns,
									resources,
									task,
									localColorSpaceCache,
									localTilingPatternCache,
									localShadingPatternCache
								)
							)
							return
						}
						args = cs.getRgb(args, 0)
						fn = OPS.setStrokeRGBColor
						break

					case OPS.shadingFill:
						var shadingRes = resources.get("Shading")
						if ( !shadingRes ) {
							throw new FormatError("No shading resource found")
						}

						var shading = shadingRes.get(args[0].name)
						if ( !shading ) {
							throw new FormatError("No shading object found")
						}
						const patternId = self.parseShading({
							shading,
							resources,
							localColorSpaceCache,
							localShadingPatternCache
						})
						args = [patternId]
						fn = OPS.shadingFill
						break
					case OPS.setGState:
						isValidName = args[0] instanceof Name
						name = args[0].name

						if ( isValidName ) {
							const localGStateObj = localGStateCache.getByName(name)
							if ( localGStateObj ) {
								if ( localGStateObj.length > 0 ) {
									operatorList.addOp(OPS.setGState, [localGStateObj])
								}
								args = null
								continue
							}
						}

						next(
							new Promise(function( resolveGState, rejectGState ) {
								if ( !isValidName ) {
									throw new FormatError("GState must be referred to by name.")
								}

								const extGState = resources.get("ExtGState")
								if ( !(extGState instanceof Dict) ) {
									throw new FormatError("ExtGState should be a dictionary.")
								}

								const gState = extGState.get(name)
								// TODO: Attempt to lookup cached GStates by reference as well,
								//       if and only if there are PDF documents where doing so
								//       would significantly improve performance.
								if ( !(gState instanceof Dict) ) {
									throw new FormatError("GState should be a dictionary.")
								}

								self
									.setGState({
										resources,
										gState,
										operatorList,
										cacheKey: name,
										task,
										stateManager,
										localGStateCache,
										localColorSpaceCache
									})
									.then(resolveGState, rejectGState)
							}).catch(function( reason ) {
								if ( reason instanceof AbortException ) {
									return
								}
								if ( self.options.ignoreErrors ) {
									warn(`getOperatorList - ignoring ExtGState: "${ reason }".`)
									return
								}
								throw reason
							})
						)
						return
					case OPS.moveTo:
					case OPS.lineTo:
					case OPS.curveTo:
					case OPS.curveTo2:
					case OPS.curveTo3:
					case OPS.closePath:
					case OPS.rectangle:
						self.buildPath(operatorList, fn, args, parsingText)
						continue
					case OPS.markPoint:
					case OPS.markPointProps:
					case OPS.beginCompat:
					case OPS.endCompat:
						// Ignore operators where the corresponding handlers are known to
						// be no-op in CanvasGraphics (display/canvas.js). This prevents
						// serialization errors and is also a bit more efficient.
						// We could also try to serialize all objects in a general way,
						// e.g. as done in https://github.com/mozilla/pdf.js/pull/6266,
						// but doing so is meaningless without knowing the semantics.
						continue
					case OPS.beginMarkedContentProps:
						if ( !(args[0] instanceof Name) ) {
							warn(`Expected name for beginMarkedContentProps arg0=${ args[0] }`)
							continue
						}
						if ( args[0].name === "OC" ) {
							next(
								self
									.parseMarkedContentProps(args[1], resources)
									.then(data => {
										operatorList.addOp(OPS.beginMarkedContentProps, [
											"OC",
											data
										])
									})
									.catch(reason => {
										if ( reason instanceof AbortException ) {
											return
										}
										if ( self.options.ignoreErrors ) {
											warn(
												`getOperatorList - ignoring beginMarkedContentProps: "${ reason }".`
											)
											return
										}
										throw reason
									})
							)
							return
						}
						// Other marked content types aren't supported yet.
						args = [
							args[0].name,
							args[1] instanceof Dict ? args[1].get("MCID") : null
						]

						break
					case OPS.beginMarkedContent:
					case OPS.endMarkedContent:
					default:
						// Note: Ignore the operator if it has `Dict` arguments, since
						// those are non-serializable, otherwise postMessage will throw
						// "An object could not be cloned.".
						if ( args !== null ) {
							for (i = 0, ii = args.length; i < ii; i++) {
								if ( args[i] instanceof Dict ) {
									break
								}
							}
							if ( i < ii ) {
								warn("getOperatorList - ignoring operator: " + fn)
								continue
							}
						}
				}
				operatorList.addOp(fn, args) // 这里args是要渲染的glyphs的数组，包括了字母，然后中间有数字
			}
			if ( stop ) {
				next(deferred)
				return
			}
			// Some PDFs don't close all restores inside object/form.
			// Closing those for them.
			closePendingRestoreOPS()
			resolve()
		}).catch(reason => {
			if ( reason instanceof AbortException ) {
				return
			}
			if ( this.options.ignoreErrors ) {
				warn(
					`getOperatorList - ignoring errors during "${ task.name }" ` +
					`task: "${ reason }".`
				)

				closePendingRestoreOPS()
				return
			}
			throw reason
		})
	}

	async extractDataStructures( dict, properties ) {
		const xref = this.xref
		let cidToGidBytes
		// 9.10.2
		const toUnicodePromise = this.readToUnicode(properties.toUnicode)

		if ( properties.composite ) {
			// CIDSystemInfo helps to match CID to glyphs
			const cidSystemInfo = dict.get("CIDSystemInfo")
			if ( cidSystemInfo instanceof Dict ) {
				properties.cidSystemInfo = {
					registry: stringToPDFString(cidSystemInfo.get("Registry")),
					ordering: stringToPDFString(cidSystemInfo.get("Ordering")),
					supplement: cidSystemInfo.get("Supplement")
				}
			}

			try {
				const cidToGidMap = dict.get("CIDToGIDMap")
				if ( cidToGidMap instanceof BaseStream ) {
					cidToGidBytes = cidToGidMap.getBytes()
				}
			} catch (ex) {
				if ( !this.options.ignoreErrors ) {
					throw ex
				}
				warn(`extractDataStructures - ignoring CIDToGIDMap data: "${ ex }".`)
			}
		}

		// Based on 9.6.6 of the spec the encoding can come from multiple places
		// and depends on the font type. The base encoding and differences are
		// read here, but the encoding that is actually used is chosen during
		// glyph mapping in the font.
		// TODO: Loading the built in encoding in the font would allow the
		// differences to be merged in here not require us to hold on to it.
		const differences = []
		let baseEncodingName = null
		let encoding
		// 这里是判断是否有Encoding这个属性，如果有则提取其中的differences和Encoding，如果没有这继续下面
		// 使用标准的encoding，比如StandardEncoding等，然后differences为空，ofd里面没有直接读取Encoding的
		// 所以直接不适用这里的代码，直接下面标准编码，并且有的文件里面包含了differences直接读取
		if ( dict.has("Encoding") ) {
			encoding = dict.get("Encoding")
			if ( encoding instanceof Dict ) {
				baseEncodingName = encoding.get("BaseEncoding")
				baseEncodingName =
					baseEncodingName instanceof Name ? baseEncodingName.name : null
				// Load the differences between the base and original
				if ( encoding.has("Differences") ) {
					const diffEncoding = encoding.get("Differences")
					let index = 0
					for (const entry of diffEncoding) {
						const data = xref.fetchIfRef(entry)
						if ( typeof data === "number" ) {
							index = data
						} else if ( data instanceof Name ) {
							differences[index++] = data.name
						} else {
							throw new FormatError(
								`Invalid entry in 'Differences' array: ${ data }`
							)
						}
					}
				}
			} else if ( encoding instanceof Name ) {
				baseEncodingName = encoding.name
			} else {
				const msg = "Encoding is not a Name nor a Dict"

				if ( !this.options.ignoreErrors ) {
					throw new FormatError(msg)
				}
				warn(msg)
			}
			// According to table 114 if the encoding is a named encoding it must be
			// one of these predefined encodings.
			if (
				baseEncodingName !== "MacRomanEncoding" &&
				baseEncodingName !== "MacExpertEncoding" &&
				baseEncodingName !== "WinAnsiEncoding"
			) {
				baseEncodingName = null
			}
		}

		const nonEmbeddedFont = !properties.file || properties.isInternalFont,
			isSymbolsFontName = getSymbolsFonts()[properties.name]
		// Ignore an incorrectly specified named encoding for non-embedded
		// symbol fonts (fixes issue16464.pdf).
		if ( baseEncodingName && nonEmbeddedFont && isSymbolsFontName ) {
			baseEncodingName = null
		}

		if ( baseEncodingName ) {
			properties.defaultEncoding = getEncoding(baseEncodingName)
		} else {
			const isSymbolicFont = !!(properties.flags & FontFlags.Symbolic)
			const isNonsymbolicFont = !!(properties.flags & FontFlags.Nonsymbolic)
			// According to "Table 114" in section "9.6.6.1 General" (under
			// "9.6.6 Character Encoding") of the PDF specification, a Nonsymbolic
			// font should use the `StandardEncoding` if no encoding is specified.
			encoding = StandardEncoding
			if ( properties.type === "TrueType" && !isNonsymbolicFont ) {
				encoding = WinAnsiEncoding
			}
			// The Symbolic attribute can be misused for regular fonts
			// Heuristic: we have to check if the font is a standard one also
			if ( isSymbolicFont || isSymbolsFontName ) {
				encoding = MacRomanEncoding
				if ( nonEmbeddedFont ) {
					if ( /Symbol/i.test(properties.name) ) {
						encoding = SymbolSetEncoding
					} else if ( /Dingbats/i.test(properties.name) ) {
						encoding = ZapfDingbatsEncoding
					} else if ( /Wingdings/i.test(properties.name) ) {
						encoding = WinAnsiEncoding
					}
				}
			}
			properties.defaultEncoding = encoding
		}

		properties.differences = differences
		properties.baseEncodingName = baseEncodingName
		properties.hasEncoding = !!baseEncodingName || differences.length > 0
		properties.dict = dict

		properties.toUnicode = await toUnicodePromise

		const builtToUnicode = await this.buildToUnicode(properties)
		properties.toUnicode = builtToUnicode

		if ( cidToGidBytes ) {
			properties.cidToGidMap = this.readCidToGidMap(
				cidToGidBytes,
				builtToUnicode
			)
		}
		return properties
	}

	/**
	 * @returns {Array}
	 * @private
	 */
	_simpleFontToUnicode( properties, forceGlyphs = false ) {
		assert( !properties.composite, "Must be a simple font.")

		const toUnicode = []
		const encoding = properties.defaultEncoding.slice()
		const baseEncodingName = properties.baseEncodingName
		// Merge in the differences array.
		const differences = properties.differences
		for (const charcode in differences) {
			const glyphName = differences[charcode]
			if ( glyphName === ".notdef" ) {
				// Skip .notdef to prevent rendering errors, e.g. boxes appearing
				// where there should be spaces (fixes issue5256.pdf).
				continue
			}
			encoding[charcode] = glyphName
		}
		const glyphsUnicodeMap = getGlyphsUnicode()
		for (const charcode in encoding) {
			// a) Map the character code to a character name.
			let glyphName = encoding[charcode]
			if ( glyphName === "" ) {
				continue
			}
			// b) Look up the character name in the Adobe Glyph List (see the
			//    Bibliography) to obtain the corresponding Unicode value.
			let unicode = glyphsUnicodeMap[glyphName]
			if ( unicode !== undefined ) {
				toUnicode[charcode] = String.fromCharCode(unicode)
				continue
			}
			// (undocumented) c) Few heuristics to recognize unknown glyphs
			// NOTE: Adobe Reader does not do this step, but OSX Preview does
			let code = 0
			switch (glyphName[0]) {
				case "G": // Gxx glyph
					if ( glyphName.length === 3 ) {
						code = parseInt(glyphName.substring(1), 16)
					}
					break
				case "g": // g00xx glyph
					if ( glyphName.length === 5 ) {
						code = parseInt(glyphName.substring(1), 16)
					}
					break
				case "C": // Cdd{d} glyph
				case "c": // cdd{d} glyph
					if ( glyphName.length >= 3 && glyphName.length <= 4 ) {
						const codeStr = glyphName.substring(1)

						if ( forceGlyphs ) {
							code = parseInt(codeStr, 16)
							break
						}
						// Normally the Cdd{d}/cdd{d} glyphName format will contain
						// regular, i.e. base 10, charCodes (see issue4550.pdf)...
						code = +codeStr

						// ... however some PDF generators violate that assumption by
						// containing glyph, i.e. base 16, codes instead.
						// In that case we need to re-parse the *entire* encoding to
						// prevent broken text-selection (fixes issue9655_reduced.pdf).
						if ( Number.isNaN(code) && Number.isInteger(parseInt(codeStr, 16)) ) {
							return this._simpleFontToUnicode(
								properties,
								/* forceGlyphs */ true
							)
						}
					}
					break
				case "u": // 'uniXXXX'/'uXXXX{XX}' glyphs
					unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap)
					if ( unicode !== -1 ) {
						code = unicode
					}
					break
				default:
					// Support (some) non-standard ligatures.
					switch (glyphName) {
						case "f_h":
						case "f_t":
						case "T_h":
							toUnicode[charcode] = glyphName.replaceAll("_", "")
							continue
					}
					break
			}
			if ( code > 0 && code <= 0x10ffff && Number.isInteger(code) ) {
				// If `baseEncodingName` is one the predefined encodings, and `code`
				// equals `charcode`, using the glyph defined in the baseEncoding
				// seems to yield a better `toUnicode` mapping (fixes issue 5070).
				if ( baseEncodingName && code === +charcode ) {
					const baseEncoding = getEncoding(baseEncodingName)
					if ( baseEncoding && (glyphName = baseEncoding[charcode]) ) {
						toUnicode[charcode] = String.fromCharCode(
							glyphsUnicodeMap[glyphName]
						)
						continue
					}
				}
				toUnicode[charcode] = String.fromCodePoint(code)
			}
		}
		return toUnicode
	}

	/**
	 * Builds a char code to unicode map based on section 9.10 of the spec.
	 * @param {Object} properties Font properties object.
	 * @returns {Promise} A Promise that is resolved with a
	 *   {ToUnicodeMap|IdentityToUnicodeMap} object.
	 */
	async buildToUnicode( properties ) {
		properties.hasIncludedToUnicodeMap = properties.toUnicode?.length > 0

		// Section 9.10.2 Mapping Character Codes to Unicode Values
		if ( properties.hasIncludedToUnicodeMap ) {
			// Some fonts contain incomplete ToUnicode data, causing issues with
			// text-extraction. For simple fonts, containing encoding information,
			// use a fallback ToUnicode map to improve this (fixes issue8229.pdf).
			if ( !properties.composite && properties.hasEncoding ) {
				properties.fallbackToUnicode = this._simpleFontToUnicode(properties)
			}
			return properties.toUnicode
		}

		// According to the spec if the font is a simple font we should only map
		// to unicode if the base encoding is MacRoman, MacExpert, or WinAnsi or
		// the differences array only contains adobe standard or symbol set names,
		// in pratice it seems better to always try to create a toUnicode map
		// based of the default encoding.
		if ( !properties.composite /* is simple font */ ) {
			return new ToUnicodeMap(this._simpleFontToUnicode(properties))
		}

		// If the font is a composite font that uses one of the predefined CMaps
		// listed in Table 118 (except Identity–H and Identity–V) or whose
		// descendant CIDFont uses the Adobe-GB1, Adobe-CNS1, Adobe-Japan1, or
		// Adobe-Korea1 character collection:
		if (
			properties.composite &&
			((properties.cMap.builtInCMap &&
					!(properties.cMap instanceof IdentityCMap)) ||
				(properties.cidSystemInfo.registry === "Adobe" &&
					(properties.cidSystemInfo.ordering === "GB1" ||
						properties.cidSystemInfo.ordering === "CNS1" ||
						properties.cidSystemInfo.ordering === "Japan1" ||
						properties.cidSystemInfo.ordering === "Korea1")))
		) {
			// Then:
			// a) Map the character code to a character identifier (CID) according
			// to the font’s CMap.
			// b) Obtain the registry and ordering of the character collection used
			// by the font’s CMap (for example, Adobe and Japan1) from its
			// CIDSystemInfo dictionary.
			const { registry, ordering } = properties.cidSystemInfo
			// c) Construct a second CMap name by concatenating the registry and
			// ordering obtained in step (b) in the format registry–ordering–UCS2
			// (for example, Adobe–Japan1–UCS2).
			const ucs2CMapName = Name.get(`${ registry }-${ ordering }-UCS2`)
			// d) Obtain the CMap with the name constructed in step (c) (available
			// from the ASN Web site; see the Bibliography).
			const ucs2CMap = await CMapFactory.create({
				encoding: ucs2CMapName,
				fetchBuiltInCMap: this._fetchBuiltInCMapBound,
				useCMap: null
			})
			const toUnicode = [],
				buf = []
			properties.cMap.forEach(function( charcode, cid ) {
				if ( cid > 0xffff ) {
					throw new FormatError("Max size of CID is 65,535")
				}
				// e) Map the CID obtained in step (a) according to the CMap
				// obtained in step (d), producing a Unicode value.
				const ucs2 = ucs2CMap.lookup(cid)
				if ( ucs2 ) {
					buf.length = 0
					// Support multi-byte entries (fixes issue16176.pdf).
					for (let i = 0, ii = ucs2.length; i < ii; i += 2) {
						buf.push((ucs2.charCodeAt(i) << 8) + ucs2.charCodeAt(i + 1))
					}
					toUnicode[charcode] = String.fromCharCode(...buf)
				}
			})
			return new ToUnicodeMap(toUnicode)
		}

		// The viewer's choice, just use an identity map.
		return new IdentityToUnicodeMap(properties.firstChar, properties.lastChar)
	}

	async readToUnicode( cmapObj ) {
		if ( !cmapObj ) {
			return null
		}
		if ( cmapObj instanceof Name ) {
			const cmap = await CMapFactory.create({
				encoding: cmapObj,
				fetchBuiltInCMap: this._fetchBuiltInCMapBound,
				useCMap: null
			})

			if ( cmap instanceof IdentityCMap ) {
				return new IdentityToUnicodeMap(0, 0xffff)
			}
			return new ToUnicodeMap(cmap.getMap())
		}
		if ( cmapObj instanceof BaseStream ) {
			try {
				const cmap = await CMapFactory.create({
					encoding: cmapObj,
					fetchBuiltInCMap: this._fetchBuiltInCMapBound,
					useCMap: null
				})

				if ( cmap instanceof IdentityCMap ) {
					return new IdentityToUnicodeMap(0, 0xffff)
				}
				const map = new Array(cmap.length)
				// Convert UTF-16BE
				// NOTE: cmap can be a sparse array, so use forEach instead of
				// `for(;;)` to iterate over all keys.
				cmap.forEach(function( charCode, token ) {
					// Some cmaps contain *only* CID characters (fixes issue9367.pdf).
					if ( typeof token === "number" ) {
						map[charCode] = String.fromCodePoint(token)
						return
					}
					const str = []
					for (let k = 0; k < token.length; k += 2) {
						const w1 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1)
						if ( (w1 & 0xf800) !== 0xd800 ) {
							// w1 < 0xD800 || w1 > 0xDFFF
							str.push(w1)
							continue
						}
						k += 2
						const w2 = (token.charCodeAt(k) << 8) | token.charCodeAt(k + 1)
						str.push(((w1 & 0x3ff) << 10) + (w2 & 0x3ff) + 0x10000)
					}
					map[charCode] = String.fromCodePoint(...str)
				})
				return new ToUnicodeMap(map)
			} catch (reason) {
				if ( reason instanceof AbortException ) {
					return null
				}
				if ( this.options.ignoreErrors ) {
					warn(`readToUnicode - ignoring ToUnicode data: "${ reason }".`)
					return null
				}
				throw reason
			}
		}
		return null
	}

	readCidToGidMap( glyphsData, toUnicode ) {
		// Extract the encoding from the CIDToGIDMap

		// Set encoding 0 to later verify the font has an encoding
		const result = []
		for (let j = 0, jj = glyphsData.length; j < jj; j++) {
			const glyphID = (glyphsData[j++] << 8) | glyphsData[j]
			const code = j >> 1
			if ( glyphID === 0 && !toUnicode.has(code) ) {
				continue
			}
			result[code] = glyphID
		}
		return result
	}

	extractWidths( dict, descriptor, properties ) {
		const xref = this.xref
		let glyphsWidths = []
		let defaultWidth = 0
		const glyphsVMetrics = []
		let defaultVMetrics
		let i, ii, j, jj, start, code, widths
		if ( properties.composite ) {
			defaultWidth = dict.has("DW") ? dict.get("DW") : 1000

			widths = dict.get("W")
			if ( widths ) {
				for (i = 0, ii = widths.length; i < ii; i++) {
					start = xref.fetchIfRef(widths[i++])
					code = xref.fetchIfRef(widths[i])
					if ( Array.isArray(code) ) {
						for (j = 0, jj = code.length; j < jj; j++) {
							glyphsWidths[start++] = xref.fetchIfRef(code[j])
						}
					} else {
						const width = xref.fetchIfRef(widths[++i])
						for (j = start; j <= code; j++) {
							glyphsWidths[j] = width
						}
					}
				}
			}

			if ( properties.vertical ) {
				let vmetrics = dict.getArray("DW2") || [880, -1000]
				defaultVMetrics = [vmetrics[1], defaultWidth * 0.5, vmetrics[0]]
				vmetrics = dict.get("W2")
				if ( vmetrics ) {
					for (i = 0, ii = vmetrics.length; i < ii; i++) {
						start = xref.fetchIfRef(vmetrics[i++])
						code = xref.fetchIfRef(vmetrics[i])
						if ( Array.isArray(code) ) {
							for (j = 0, jj = code.length; j < jj; j++) {
								glyphsVMetrics[start++] = [
									xref.fetchIfRef(code[j++]),
									xref.fetchIfRef(code[j++]),
									xref.fetchIfRef(code[j])
								]
							}
						} else {
							const vmetric = [
								xref.fetchIfRef(vmetrics[++i]),
								xref.fetchIfRef(vmetrics[++i]),
								xref.fetchIfRef(vmetrics[++i])
							]
							for (j = start; j <= code; j++) {
								glyphsVMetrics[j] = vmetric
							}
						}
					}
				}
			}
		} else {
			const firstChar = properties.firstChar
			widths = dict.get("Widths")
			if ( widths ) {
				j = firstChar
				for (i = 0, ii = widths.length; i < ii; i++) {
					glyphsWidths[j++] = xref.fetchIfRef(widths[i])
				}
				defaultWidth = parseFloat(descriptor.get("MissingWidth")) || 0
			} else {
				// 没有widths的情况，适用于ofd的情况，根据字体获取宽度
				// Trying get the BaseFont metrics (see comment above).
				const baseFontName = dict.get("BaseFont")
				if ( baseFontName instanceof Name ) {
					const metrics = this.getBaseFontMetrics(baseFontName.name)

					glyphsWidths = this.buildCharCodeToWidth(metrics.widths, properties)
					defaultWidth = metrics.defaultWidth
				}
			}
		}

		// Heuristic: detection of monospace font by checking all non-zero widths
		let isMonospace = true
		let firstWidth = defaultWidth
		for (const glyph in glyphsWidths) {
			const glyphWidth = glyphsWidths[glyph]
			if ( !glyphWidth ) {
				continue
			}
			if ( !firstWidth ) {
				firstWidth = glyphWidth
				continue
			}
			if ( firstWidth !== glyphWidth ) {
				isMonospace = false
				break
			}
		}
		if ( isMonospace ) {
			properties.flags |= FontFlags.FixedPitch
		} else {
			// Clear the flag.
			properties.flags &= ~FontFlags.FixedPitch
		}

		properties.defaultWidth = defaultWidth
		properties.widths = glyphsWidths
		properties.defaultVMetrics = defaultVMetrics
		properties.vmetrics = glyphsVMetrics
	}

	isSerifFont( baseFontName ) {
		// Simulating descriptor flags attribute
		const fontNameWoStyle = baseFontName.split("-", 1)[0]
		return (
			fontNameWoStyle in getSerifFonts() || /serif/gi.test(fontNameWoStyle)
		)
	}

	getBaseFontMetrics( name ) {
		let defaultWidth = 0
		let widths = Object.create(null)
		let monospace = false
		const stdFontMap = getStdFontMap()
		let lookupName = stdFontMap[name] || name
		const Metrics = getMetrics()

		if ( !(lookupName in Metrics) ) {
			// Use default fonts for looking up font metrics if the passed
			// font is not a base font
			lookupName = this.isSerifFont(name) ? "Times-Roman" : "Helvetica"
		}
		const glyphWidths = Metrics[lookupName]

		if ( typeof glyphWidths === "number" ) {
			defaultWidth = glyphWidths
			monospace = true
		} else {
			widths = glyphWidths() // expand lazy widths array
		}

		return {
			defaultWidth,
			monospace,
			widths
		}
	}

	buildCharCodeToWidth( widthsByGlyphName, properties ) {
		const widths = Object.create(null)
		const differences = properties.differences
		const encoding = properties.defaultEncoding
		for (let charCode = 0; charCode < 256; charCode++) {
			if ( charCode in differences && widthsByGlyphName[differences[charCode]] ) {
				widths[charCode] = widthsByGlyphName[differences[charCode]]
				continue
			}
			if ( charCode in encoding && widthsByGlyphName[encoding[charCode]] ) {
				widths[charCode] = widthsByGlyphName[encoding[charCode]]
				continue
			}
		}
		return widths
	}

	preEvaluateFont( dict ) {
		const baseDict = dict
		let type = dict.get("Subtype")
		if ( !(type instanceof Name) ) {
			throw new FormatError("invalid font Subtype")
		}

		let composite = false
		let hash
		// type0的字体，包含了子字体，他的内容再descendantFonts里面
		if ( type.name === "Type0" ) {
			// If font is a composite
			//  - get the descendant font
			//  - set the type according to the descendant font
			//  - get the FontDescriptor from the descendant font
			const df = dict.get("DescendantFonts")
			if ( !df ) {
				throw new FormatError("Descendant fonts are not specified")
			}
			dict = Array.isArray(df) ? this.xref.fetchIfRef(df[0]) : df // 这里从交叉表中能拿到本地字体的数据，就是在pdf中的字体数据

			if ( !(dict instanceof Dict) ) {
				throw new FormatError("Descendant font is not a dictionary.")
			}
			type = dict.get("Subtype")
			if ( !(type instanceof Name) ) {
				throw new FormatError("invalid font Subtype")
			}
			composite = true
		}

		const firstChar = dict.get("FirstChar") || 0,
			lastChar = dict.get("LastChar") || (composite ? 0xffff : 0xff) // 默认最后一个值是65535
		const descriptor = dict.get("FontDescriptor")
		const toUnicode = dict.get("ToUnicode") || baseDict.get("ToUnicode")

		if ( descriptor ) {
			hash = new MurmurHash3_64()

			const encoding = baseDict.getRaw("Encoding")
			if ( encoding instanceof Name ) {
				hash.update(encoding.name)
			} else if ( encoding instanceof Ref ) {
				hash.update(encoding.toString())
			} else if ( encoding instanceof Dict ) {
				for (const entry of encoding.getRawValues()) {
					if ( entry instanceof Name ) {
						hash.update(entry.name)
					} else if ( entry instanceof Ref ) {
						hash.update(entry.toString())
					} else if ( Array.isArray(entry) ) {
						// 'Differences' array (fixes bug1157493.pdf).
						const diffLength = entry.length,
							diffBuf = new Array(diffLength)

						for (let j = 0; j < diffLength; j++) {
							const diffEntry = entry[j]
							if ( diffEntry instanceof Name ) {
								diffBuf[j] = diffEntry.name
							} else if (
								typeof diffEntry === "number" ||
								diffEntry instanceof Ref
							) {
								diffBuf[j] = diffEntry.toString()
							}
						}
						hash.update(diffBuf.join())
					}
				}
			}

			hash.update(`${ firstChar }-${ lastChar }`) // Fixes issue10665_reduced.pdf

			// 这里是提前对字体数据做处理，将读取的unit8Array做hash处理
			if ( descriptor.objId === "29R" ) debugger
			if ( toUnicode instanceof BaseStream ) {
				const stream = toUnicode.str || toUnicode
				// 提取字体的数据，从start到end的位置数据，从buffer中读取
				const uint8array = stream.buffer
					? new Uint8Array(stream.buffer.buffer, 0, stream.bufferLength)
					: new Uint8Array(
						stream.bytes.buffer,
						stream.start,
						stream.end - stream.start
					)
				hash.update(uint8array)
			} else if ( toUnicode instanceof Name ) {
				hash.update(toUnicode.name)
			}

			const widths = dict.get("Widths") || baseDict.get("Widths")
			if ( Array.isArray(widths) ) {
				const widthsBuf = []
				for (const entry of widths) {
					if ( typeof entry === "number" || entry instanceof Ref ) {
						widthsBuf.push(entry.toString())
					}
				}
				hash.update(widthsBuf.join())
			}

			if ( composite ) {
				hash.update("compositeFont")

				const compositeWidths = dict.get("W") || baseDict.get("W")
				if ( Array.isArray(compositeWidths) ) {
					const widthsBuf = []
					for (const entry of compositeWidths) {
						if ( typeof entry === "number" || entry instanceof Ref ) {
							widthsBuf.push(entry.toString())
						} else if ( Array.isArray(entry) ) {
							const subWidthsBuf = []
							for (const element of entry) {
								if ( typeof element === "number" || element instanceof Ref ) {
									subWidthsBuf.push(element.toString())
								}
							}
							widthsBuf.push(`[${ subWidthsBuf.join() }]`)
						}
					}
					hash.update(widthsBuf.join())
				}

				const cidToGidMap =
					dict.getRaw("CIDToGIDMap") || baseDict.getRaw("CIDToGIDMap")
				if ( cidToGidMap instanceof Name ) {
					hash.update(cidToGidMap.name)
				} else if ( cidToGidMap instanceof Ref ) {
					hash.update(cidToGidMap.toString())
				} else if ( cidToGidMap instanceof BaseStream ) {
					hash.update(cidToGidMap.peekBytes())
				}
			}
		}

		return {
			descriptor,
			dict,
			baseDict,
			composite,
			type: type.name,
			firstChar,
			lastChar,
			toUnicode,
			hash: hash ? hash.hexdigest() : ""
		}
	}

	async translateFont( { descriptor, dict, baseDict, composite, type, firstChar, lastChar, toUnicode, cssFontInfo } ) {
		const isType3Font = type === "Type3"
		// 如果pdf中不包含descriptor，那么就创建一个心的，这里适合ofd文档，就是创建心的descriptor
		// 也就是新建properties对象
		if ( !descriptor ) {
			if ( isType3Font ) {
				// FontDescriptor is only required for Type3 fonts when the document
				// is a tagged pdf. Create a barbebones one to get by.
				descriptor = new Dict(null)
				descriptor.set("FontName", Name.get(type))
				descriptor.set("FontBBox", dict.getArray("FontBBox") || [0, 0, 0, 0])
			} else {
				// Before PDF 1.5 if the font was one of the base 14 fonts, having a
				// FontDescriptor was not required.
				// This case is here for compatibility.
				let baseFontName = dict.get("BaseFont")
				if ( !(baseFontName instanceof Name) ) {
					throw new FormatError("Base font is not specified")
				}

				// Using base font name as a font name.
				baseFontName = baseFontName.name.replaceAll(/[,_]/g, "-")
				const metrics = this.getBaseFontMetrics(baseFontName)

				// Simulating descriptor flags attribute
				const fontNameWoStyle = baseFontName.split("-", 1)[0]
				const flags =
					(this.isSerifFont(fontNameWoStyle) ? FontFlags.Serif : 0) |
					(metrics.monospace ? FontFlags.FixedPitch : 0) |
					(getSymbolsFonts()[fontNameWoStyle]
						? FontFlags.Symbolic
						: FontFlags.Nonsymbolic)

				// 没有descriptor情况下生成的properties内容，这里是ofd可以使用的，所以还是要加上properties
				const properties = {
					type,
					name: baseFontName,
					loadedName: baseDict.loadedName,
					systemFontInfo: null,
					widths: metrics.widths,
					defaultWidth: metrics.defaultWidth,
					isSimulatedFlags: true,
					flags,
					firstChar,
					lastChar,
					toUnicode,
					xHeight: 0,
					capHeight: 0,
					italicAngle: 0,
					isType3Font
				}
				const widths = dict.get("Widths")

				const standardFontName = getStandardFontName(baseFontName)
				let file = null
				if ( standardFontName ) {
					file = await this.fetchStandardFontData(standardFontName)
					properties.isInternalFont = !!file
				}
				if ( !properties.isInternalFont && this.options.useSystemFonts ) {
					properties.systemFontInfo = getFontSubstitution(
						this.systemFontCache,
						this.idFactory,
						this.options.standardFontDataUrl,
						baseFontName,
						standardFontName
					)
				}

				const newProperties = await this.extractDataStructures(
					dict,
					properties
				)
				if ( widths ) {
					const glyphWidths = []
					let j = firstChar
					for (const width of widths) {
						glyphWidths[j++] = this.xref.fetchIfRef(width)
					}
					newProperties.widths = glyphWidths
				} else {
					newProperties.widths = this.buildCharCodeToWidth(
						metrics.widths,
						newProperties
					)
				}
				return new Font(baseFontName, file, newProperties)
			}
		}

		// According to the spec if 'FontDescriptor' is declared, 'FirstChar',
		// 'LastChar' and 'Widths' should exist too, but some PDF encoders seem
		// to ignore this rule when a variant of a standard font is used.
		// TODO Fill the width array depending on which of the base font this is
		// a variant.

		let fontName = descriptor.get("FontName")
		let baseFont = dict.get("BaseFont")
		// Some bad PDFs have a string as the font name.
		if ( typeof fontName === "string" ) {
			fontName = Name.get(fontName)
		}
		if ( typeof baseFont === "string" ) {
			baseFont = Name.get(baseFont)
		}

		const fontNameStr = fontName?.name
		const baseFontStr = baseFont?.name
		if ( !isType3Font && fontNameStr !== baseFontStr ) {
			// info(
			// 	`The FontDescriptor's FontName is "${ fontNameStr }" but ` +
			// 	`should be the same as the Font's BaseFont "${ baseFontStr }".`
			// )
			// - Workaround for cases where e.g. fontNameStr = 'Arial' and
			//   baseFontStr = 'Arial,Bold' (needed when no font file is embedded).
			//
			// - Workaround for cases where e.g. fontNameStr = 'wg09np' and
			//   baseFontStr = 'Wingdings-Regular' (fixes issue7454.pdf).
			if (
				fontNameStr &&
				baseFontStr &&
				(baseFontStr.startsWith(fontNameStr) ||
					( !isKnownFontName(fontNameStr) && isKnownFontName(baseFontStr)))
			) {
				fontName = null
			}
		}
		fontName ||= baseFont

		if ( !(fontName instanceof Name) ) {
			throw new FormatError("invalid font name")
		}

		let fontFile, subtype, length1, length2, length3
		try {
			// 这里拿到的是FontFile的引用位置，还不是实际数据
			fontFile = descriptor.get("FontFile", "FontFile2", "FontFile3") // 从FontFile/FontFile2/FontFile3中取数据
		} catch (ex) {
			if ( !this.options.ignoreErrors ) {
				throw ex
			}
			warn(`translateFont - fetching "${ fontName.name }" font file: "${ ex }".`)
			fontFile = new NullStream()
		}
		let isInternalFont = false
		let glyphScaleFactors = null
		let systemFontInfo = null
		if ( fontFile ) {
			if ( fontFile.dict ) {
				const subtypeEntry = fontFile.dict.get("Subtype")
				if ( subtypeEntry instanceof Name ) {
					subtype = subtypeEntry.name
				}
				length1 = fontFile.dict.get("Length1")
				length2 = fontFile.dict.get("Length2")
				length3 = fontFile.dict.get("Length3")
			}
		} else if ( cssFontInfo ) {
			// We've a missing XFA font.
			const standardFontName = getXfaFontName(fontName.name)
			if ( standardFontName ) {
				cssFontInfo.fontFamily = `${ cssFontInfo.fontFamily }-PdfJS-XFA`
				cssFontInfo.metrics = standardFontName.metrics || null
				glyphScaleFactors = standardFontName.factors || null
				fontFile = await this.fetchStandardFontData(standardFontName.name)
				isInternalFont = !!fontFile

				// We're using a substitution font but for example widths (if any)
				// are related to the glyph positions in the font.
				// So we overwrite everything here to be sure that widths are
				// correct.
				baseDict = dict = getXfaFontDict(fontName.name)
				composite = true
			}
		} else if ( !isType3Font ) {
			const standardFontName = getStandardFontName(fontName.name)
			if ( standardFontName ) {
				fontFile = await this.fetchStandardFontData(standardFontName)
				isInternalFont = !!fontFile
			}
			if ( !isInternalFont && this.options.useSystemFonts ) {
				systemFontInfo = getFontSubstitution(
					this.systemFontCache,
					this.idFactory,
					this.options.standardFontDataUrl,
					fontName.name,
					standardFontName
				)
			}
		}

		const properties = {
			type,
			name: fontName.name,
			subtype,
			file: fontFile,
			length1,
			length2,
			length3,
			isInternalFont,
			loadedName: baseDict.loadedName,
			composite,
			fixedPitch: false,
			fontMatrix: dict.getArray("FontMatrix") || FONT_IDENTITY_MATRIX,
			firstChar,
			lastChar,
			toUnicode,
			bbox: descriptor.getArray("FontBBox") || dict.getArray("FontBBox"),
			ascent: descriptor.get("Ascent"),
			descent: descriptor.get("Descent"),
			xHeight: descriptor.get("XHeight") || 0,
			capHeight: descriptor.get("CapHeight") || 0,
			flags: descriptor.get("Flags"),
			italicAngle: descriptor.get("ItalicAngle") || 0,
			isType3Font,
			cssFontInfo,
			scaleFactors: glyphScaleFactors,
			systemFontInfo
		}

		if ( composite ) {
			const cidEncoding = baseDict.get("Encoding")
			if ( cidEncoding instanceof Name ) {
				properties.cidEncoding = cidEncoding.name
			}
			const cMap = await CMapFactory.create({
				encoding: cidEncoding,
				fetchBuiltInCMap: this._fetchBuiltInCMapBound,
				useCMap: null
			})
			properties.cMap = cMap
			properties.vertical = properties.cMap.vertical
		}
		if ( fontName.name === "TACTGM+NimbusRomNo9L-Medi" ) {
			// debugger
		}
		// 这里是提取Encoding和differences
		const newProperties = await this.extractDataStructures(dict, properties)
		// 这里是提取widths，字体的字符的宽度
		this.extractWidths(dict, descriptor, newProperties)
		// 这里是加载字体文件的数据，data里面包含字体数据
		if ( fontName.name === "TACTGM+NimbusRomNo9L-Medi" ) {
			// debugger
		}
		return new Font(fontName.name, fontFile, newProperties) // 这里是生成字体的描述文件，还没有开始加载，再Font的构造函数中会加载到字体的data数据
	}

	static buildFontPaths( font, glyphs, handler, evaluatorOptions ) {
		function buildPath( fontChar ) {
			const glyphName = `${ font.loadedName }_path_${ fontChar }`
			try {
				if ( font.renderer.hasBuiltPath(fontChar) ) {
					return
				}
				handler.send("commonobj", [
					glyphName,
					"FontPath",
					font.renderer.getPathJs(fontChar)
				])
			} catch (reason) {
				if ( evaluatorOptions.ignoreErrors ) {
					warn(`buildFontPaths - ignoring ${ glyphName } glyph: "${ reason }".`)
					return
				}
				throw reason
			}
		}

		for (const glyph of glyphs) {
			buildPath(glyph.fontChar)

			// If the glyph has an accent we need to build a path for its
			// fontChar too, otherwise CanvasGraphics_paintChar will fail.
			const accent = glyph.accent
			if ( accent?.fontChar ) {
				buildPath(accent.fontChar)
			}
		}
	}

	static get fallbackFontDict() {
		const dict = new Dict()
		dict.set("BaseFont", Name.get("Helvetica"))
		dict.set("Type", Name.get("FallbackType"))
		dict.set("Subtype", Name.get("FallbackType"))
		dict.set("Encoding", Name.get("WinAnsiEncoding"))

		return shadow(this, "fallbackFontDict", dict)
	}
}

class TranslatedFont {
	constructor( { loadedName, font, dict, evaluatorOptions } ) {
		this.loadedName = loadedName
		this.font = font
		this.dict = dict
		this._evaluatorOptions = evaluatorOptions || DefaultPartialEvaluatorOptions
		this.type3Loaded = null
		this.type3Dependencies = font.isType3Font ? new Set() : null
		this.sent = false
	}

	// 字体加载完成之后发送消息进行下一步处理
	send( handler ) {
		if ( this.sent ) {
			return
		}
		this.sent = true

		handler.send("commonobj", [
			this.loadedName,
			"Font",
			this.font.exportData(this._evaluatorOptions.fontExtraProperties)
		])
	}

	fallback( handler ) {
		if ( !this.font.data ) {
			return
		}
		// When font loading failed, fall back to the built-in font renderer.
		this.font.disableFontFace = true
		// An arbitrary number of text rendering operators could have been
		// encountered between the point in time when the 'Font' message was sent
		// to the main-thread, and the point in time when the 'FontFallback'
		// message was received on the worker-thread.
		// To ensure that all 'FontPath's are available on the main-thread, when
		// font loading failed, attempt to resend *all* previously parsed glyphs.
		PartialEvaluator.buildFontPaths(
			this.font,
			/* glyphs = */ this.font.glyphCacheValues,
			handler,
			this._evaluatorOptions
		)
	}
}

export {TranslatedFont};
