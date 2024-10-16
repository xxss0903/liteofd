// 导入 liteofd 文件夹下的所有模块
import LiteOfd from './src/liteofd/liteOfd';
import { OfdRender } from './src/liteofd/ofdRender';
import { OfdDocument } from './src/liteofd/ofdDocument';
import { OfdPageContainer } from './src/liteofd/elements/ofdPageContainer';
import { PathSvg } from './src/liteofd/elements/PathSvg';
import { OfdPageRender } from './src/liteofd/elements/ofdPageRender';
import { SignatureElement } from './src/liteofd/elements/SignatureElement';
import { TextSvg } from './src/liteofd/elements/TextSvg';
import { ImageSvg } from './src/liteofd/elements/ImageSvg';
import { AnnotLayer } from './src/liteofd/annotLayer';
import { ContentLayer } from './src/liteofd/contentLayer';
import Layer from './src/liteofd/layer';
import * as parser from './src/liteofd/parser';
import { AttributeKey, OFD_KEY, OFD_ACTION, ANNOT_TYPE, MultiChildTagName } from './src/liteofd/attrType';
import * as ofdFont from './src/liteofd/ofdFont';

// 导出所有模块
export {
  LiteOfd,
  OfdRender,
  OfdDocument,
  OfdPageContainer,
  PathSvg,
  OfdPageRender,
  SignatureElement,
  TextSvg,
  ImageSvg,
  AnnotLayer,
  ContentLayer,
  Layer,
  parser,
  AttributeKey,
  OFD_KEY,
  OFD_ACTION,
  ANNOT_TYPE,
  MultiChildTagName,
  ofdFont
};
