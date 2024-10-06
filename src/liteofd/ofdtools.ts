import { OfdDocument } from "./ofdDocument"
import { OfdRender } from "./ofdRender"

// ofd的工具
export class OfdTools {
  private ofdDocument: OfdDocument
  private ofdRender: OfdRender | null = null
  private currentScale: number = 1
  
  constructor(ofdDocument: OfdDocument) {
    this.ofdDocument = ofdDocument
  }


  // 获取OFD文档结构
  getOfdStructure(): any {
    if (!this.ofdDocument) {
      console.error('OFD文档未加载');
      return null;
    }

    // 创建一个对象来存储OFD文档的结构
    const structure = {
      documentData: this.ofdDocument.documentData,
      pages: this.ofdDocument.pages,
      outlines: this.ofdDocument.outlines,
      signatures: this.ofdDocument.signatures,
      publicRes: this.ofdDocument.publicRes,
      documentRes: this.ofdDocument.documentRes,
      annots: this.ofdDocument.annots
    };

    console.log('OFD文档结构:', structure);
    return structure;
  }

}
