<template>
  <el-container style="width:100vw; height: 100vh;">
    <el-header style="background:#F5F5F5;display: flex; height: 40px; border: 1px solid #e8e8e8; align-items: center;">
      <div class="upload-icon" @click="uploadFile">
        <div class="upload-icon">打开OFD</div>
        <font-awesome-icon icon="cloud-upload-alt"/>
        <input type="file" ref="file" class="hidden" accept=".ofd"
               @change="fileChanged">
      </div>

      <div class="upload-icon" @click="uploadPdfFile">
        <div class="upload-icon">PDF2OFD</div>
        <font-awesome-icon icon="cloud-upload-alt"/>
        <input type="file" ref="pdfFile" class="hidden" accept=".pdf"
               @change="pdfFileChanged">
      </div>

      <div style="display: flex;align-items: center" v-if="ofdObj">
        <div class="upload-icon" style="margin-left: 10px" @click="downPdf" v-if="ofdBase64">
          下载PDF
          <font-awesome-icon icon="download"/>
        </div>

        <div class="scale-icon" style="margin-left: 10px" @click="plus">
          <font-awesome-icon icon="search-plus"/>
        </div>

        <div class="scale-icon" @click="minus">
          <font-awesome-icon icon="search-minus" />
        </div>
        <div class="scale-icon">
          <font-awesome-icon icon="step-backward" @click="firstPage"/>
        </div>

        <div class="scale-icon" style="font-size: 18px" @click="prePage">
          <font-awesome-icon icon="caret-left"/>
        </div>

        <div class="scale-icon">
          {{pageIndex}}/{{pageCount}}
        </div>

        <div class="scale-icon" style="font-size: 18px" @click="nextPage">
          <font-awesome-icon icon="caret-right"/>
        </div>

        <div class="scale-icon" @click="lastPage">
          <font-awesome-icon icon="step-forward"/>
        </div>
      </div>
      <div style="display: flex; flex-direction: row">
        <input ref="keywordRef" type="text">
        <div class="upload-icon" @click="handleSearchClick">搜索</div>
      </div>
    </el-header>
    <el-main style="height: auto;background: #808080;;padding: 0" v-loading="loading">
      <div id="leftMenu"
           class="left-section">

      </div>
      <div class="main-section"
           id="content" ref="contentDiv" @mousewheel="scrool">
      </div>

    </el-main>
    <div class="SealContainer" id="sealInfoDiv" hidden="hidden" ref="sealInfoDiv">
      <div class="SealContainer-layout">
        <div class="SealContainer-content">
          <p class="content-title">签章信息</p>
          <div class="subcontent">
            <span class="title">签章人</span>
            <span class="value" id="spSigner">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">签章提供者</span>
            <span class="value" id="spProvider">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">原文摘要值</span>
            <span class="value" id="spHashedValue" @click="showMore('原文摘要值', 'spHashedValue')"
                  style="cursor: pointer">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">签名值</span>
            <span class="value" id="spSignedValue" @click="showMore('签名值', 'spSignedValue')"
                  style="cursor: pointer">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">签名算法</span>
            <span class="value" id="spSignMethod">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">版本号</span>
            <span class="value" id="spVersion">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">验签结果</span>
            <span class="value" id="VerifyRet">[无效的签章结构]</span>
          </div>

          <p class="content-title">印章信息</p>
          <div class="subcontent">
            <span class="title">印章标识</span>
            <span class="value" id="spSealID">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">印章名称</span>
            <span class="value" id="spSealName">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">印章类型</span>
            <span class="value" id="spSealType">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">有效时间</span>
            <span class="value" id="spSealAuthTime">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">制章日期</span>
            <span class="value" id="spSealMakeTime">[无效的签章结构]</span>
          </div>
          <div class="subcontent">
            <span class="title">印章版本</span>
            <span class="value" id="spSealVersion">[无效的签章结构]</span>
          </div>
        </div>
        <input style="position:absolute;right:1%;top:1%;" type="button" name="ddddddddddd" id="" value="X"
               @click="closeSealInfoDialog()"/>
      </div>
    </div>


    <el-dialog :title="title" :visible.sync="dialogFormVisible">
      <span style="text-align: left">
        {{value}}
      </span>
      <div slot="footer" class="dialog-footer">
        <el-button type="primary" @click="dialogFormVisible = false">确 定</el-button>
      </div>
    </el-dialog>
  </el-container>
</template>

<script>

import { parseOfdDocument, renderOfd, renderOfdByScale, digestCheck, getPageScale, setPageScale, renderSinglePage, renderOfdByScaleWithRedraw } from "@/utils/ofd/ofd"
import { converterDpi } from "@/utils/ofd/ofd_util"
import { searchKeywordFunc } from "@/utils/ofd/ofd_find_controller"

export default {
  data() {
    return {
      pdfFile: null,
      ofdBase64: null,
      loading: false,
      pageIndex: 1,
      pageCount: 0,
      scale: 0,
      title: null,
      value: null,
      dialogFormVisible: false,
      ofdObj: null,
      screenWidth: document.body.clientWidth,
      searchTextList: [], // 搜索的内容
      pageDivs: [], // 渲染的ofd的页面的div结构
      ofdOutlines: [] // 大纲
    }
  },

  created() {
    this.pdfFile = null;
    this.file = null;
  },

  mounted() {
    this.screenWidth = document.body.clientWidth - document.getElementById('leftMenu').getBoundingClientRect().width;
    let that = this;
    this.$refs.contentDiv.addEventListener('scroll', this.scrool);
    window.onresize = () => {
      return (() => {
        that.screenWidth = (document.body.clientWidth - 88);
        const divs = renderOfd(that.screenWidth, that.ofdObj);
        that.displayOfdDiv(divs);
      })()
    }

  },

  methods: {
    scrool() {
      let scrolled = this.$refs.contentDiv.firstElementChild?.getBoundingClientRect()?.top - 60;
      let top = 0
      let index = 0;
      for (let i=0;i<this.$refs.contentDiv.childElementCount; i ++) {
        top += (Math.abs(this.$refs.contentDiv.children.item(i)?.style.height.replace('px','')) + Math.abs(this.$refs.contentDiv.children.item(i)?.style.marginBottom.replace('px','')));
        if (Math.abs(scrolled) < top) {
          index = i;
          break;
        }
      }
      this.pageIndex = index+1;
    },

    closeSealInfoDialog() {
      this.$refs.sealInfoDiv.setAttribute('style', 'display: none');
      document.getElementById('spSigner').innerText = "[无效的签章结构]";
      document.getElementById('spProvider').innerText = "[无效的签章结构]";
      document.getElementById('spHashedValue').innerText = "[无效的签章结构]";
      document.getElementById('spSignedValue').innerText = "[无效的签章结构]";
      document.getElementById('spSignMethod').innerText = "[无效的签章结构]";
      document.getElementById('spSealID').innerText = "[无效的签章结构]";
      document.getElementById('spSealName').innerText = "[无效的签章结构]";
      document.getElementById('spSealType').innerText = "[无效的签章结构]";
      document.getElementById('spSealAuthTime').innerText = "[无效的签章结构]";
      document.getElementById('spSealMakeTime').innerText = "[无效的签章结构]";
      document.getElementById('spSealVersion').innerText = "[无效的签章结构]";
      document.getElementById('spVersion').innerText = "[无效的签章结构]";
      document.getElementById('VerifyRet').innerText = "[无效的签章结构]";
    },

    showMore(title, id) {
      this.dialogFormVisible = true;
      this.value = document.getElementById(id).innerText;
      this.title = title;
    },

    downOfd(pdfBase64) {
      let that = this;
      this.loading = true;
      this.$axios({
        method: "post",
        url: "https://51shouzu.xyz/api/ofd/convertOfd",
        data: {
          pdfBase64,
        }
      }).then(response => {
        that.loading = false;
        var binary = atob(response.data.data.replace(/\s/g, ''));
        var len = binary.length;
        var buffer = new ArrayBuffer(len);
        var view = new Uint8Array(buffer);
        for (var i = 0; i < len; i++) {
          view[i] = binary.charCodeAt(i);
        }
        var blob = new Blob( [view], null);
        var url = URL.createObjectURL(blob);
        let link = document.createElement('a')
        link.style.display = 'none'
        link.href = url
        link.setAttribute('download', 'ofd.ofd')
        document.body.appendChild(link)
        link.click()

      }).catch(error => {
        console.log(error, "error")
        that.$alert('PDF打开失败', error, {
          confirmButtonText: '确定',
          callback: action => {
            this.$message({
              type: 'info',
              message: `action: ${ action }`
            });
          }
        });
      });
    },

    downPdf() {
      let that = this;
      this.loading = true;
      this.$axios({
        method: "post",
        url: "https://51shouzu.xyz/api/ofd/convertPdf",
        data: {
          ofdBase64: this.ofdBase64
        }
      }).then(response => {
        that.loading = false;
        var binary = atob(response.data.data.replace(/\s/g, ''));
        var len = binary.length;
        var buffer = new ArrayBuffer(len);
        var view = new Uint8Array(buffer);
        for (var i = 0; i < len; i++) {
          view[i] = binary.charCodeAt(i);
        }
        var blob = new Blob( [view], { type: "application/pdf" });
        var url = URL.createObjectURL(blob);
        let link = document.createElement('a')
        link.style.display = 'none'
        link.href = url
        link.setAttribute('download', 'ofd.pdf')
        document.body.appendChild(link)
        link.click()

      }).catch(error => {
        console.log(error, "error")
        that.$alert('OFD打开失败', error, {
          confirmButtonText: '确定',
          callback: action => {
            this.$message({
              type: 'info',
              message: `action: ${ action }`
            });
          }
        });
      });
    },

    plus() {
      setPageScale(++this.scale);
      const divs = renderOfdByScale(this.ofdObj);
      this.displayOfdDiv(divs);
    },
    renderOfdPage(){
      const divs = renderOfdByScale(this.ofdObj);
      this.displayOfdDiv(divs);
    },
    minus() {
      setPageScale(--this.scale);
      const divs = renderOfdByScale(this.ofdObj);
      this.displayOfdDiv(divs);
    },

    prePage() {
      let contentDiv = document.getElementById('content');
      let ele = contentDiv.children.item(this.pageIndex-2);
      ele?.scrollIntoView(true);
      ele?this.pageIndex=this.pageIndex-1:'';
    },

    firstPage() {
      let contentDiv = document.getElementById('content');
      let ele = contentDiv.firstElementChild;
      ele?.scrollIntoView(true);
      ele?this.pageIndex=1:'';
    },

    nextPage() {
      let contentDiv = document.getElementById('content');
      let ele = contentDiv.children.item(this.pageIndex);
      ele?.scrollIntoView(true);
      ele?++this.pageIndex:'';
    },

    lastPage() {
      let contentDiv = document.getElementById('content');
      let ele = contentDiv.lastElementChild;
      ele?.scrollIntoView(true);
      ele?this.pageIndex=contentDiv.childElementCount:'';
    },

    uploadFile() {
      this.file = null;
      this.$refs.file.click();
    },
    fileChanged() {
      this.file = this.$refs.file.files[0];
      let ext = this.file.name.replace(/.+\./, "");
      if (["ofd"].indexOf(ext) === -1) {
        this.$alert('error', '仅支持ofd类型', {
          confirmButtonText: '确定',
          callback: action => {
            this.$message({
              type: 'info',
              message: `action: ${ action }`
            });
          }
        });
        return;
      }
      if (this.file.size > 100 * 1024 * 1024) {
        this.$alert('error', '文件大小需 < 100M', {
          confirmButtonText: '确定',
          callback: action => {
            this.$message({
              type: 'info',
              message: `action: ${ action }`
            });
          }
        });
        return;
      }
      let that = this;
      let reader = new FileReader();
      reader.readAsDataURL(this.file);
      reader.onload = function (e) {
        that.ofdBase64 = e.target.result.split(',')[1];
      }
      this.getOfdDocumentObj(this.file, this.screenWidth);
      this.$refs.file.value = null;
    },

    uploadPdfFile() {
      this.pdfFile = null;
      this.$refs.pdfFile.click();
    },
    pdfFileChanged() {
      this.pdfFile = this.$refs.pdfFile.files[0];
      let ext = this.pdfFile.name.replace(/.+\./, "");
      if (["pdf"].indexOf(ext) === -1) {
        this.$alert('error', '仅支持pdf类型', {
          confirmButtonText: '确定',
          callback: action => {
            this.$message({
              type: 'info',
              message: `action: ${ action }`
            });
          }
        });
        return;
      }
      if (this.pdfFile.size > 100 * 1024 * 1024) {
        this.$alert('error', '文件大小需 < 100M', {
          confirmButtonText: '确定',
          callback: action => {
            this.$message({
              type: 'info',
              message: `action: ${ action }`
            });
          }
        });
        return;
      }
      let that = this;
      let reader = new FileReader();
      reader.readAsDataURL(this.pdfFile);
      reader.onload = function (e) {
        let pdfBase64 = e.target.result.split(',')[1];
        that.downOfd(pdfBase64);
      }
      this.$refs.pdfFile.value = null;
    },


    getOfdDocumentObj(file, screenWidth) {
      let that = this;
      let t = new Date().getTime();
      this.loading = true;
      parseOfdDocument({
        ofd: file,
        success(res) {
          console.log(res)
          let t1 = new Date().getTime();
          console.log('解析ofd',t1 - t);
          that.ofdObj = res[0];
          // 获取大纲
          let outlines = that.ofdObj.document["ofd:Outlines"]
          if ( outlines ) {
            that.ofdOutlines = outlines["ofd:OutlineElem"]
          }
          that.pageCount = res[0].pages.length;
          that.pageDivs = renderOfd(screenWidth, res[0]);
          let t2 = new Date().getTime();
          console.log('xml转svg', t2 - t1, that.pageDivs)
          that.displayOfdDiv(that.pageDivs);
          let t3 = new Date().getTime();
          console.log('svg渲染到页面', t3 - t2);
          that.loading = false;

          console.log("page divs ", that.pageDivs)
        },
        fail(error) {
          that.loading = false;
          that.$alert('OFD打开失败', error, {
            confirmButtonText: '确定',
            callback: action => {
              this.$message({
                type: 'info',
                message: `action: ${ action }`
              });
            }
          });
        }
      });
    },

    displayOfdDiv(divs) {
      this.scale = getPageScale();
      let contentDiv = document.getElementById('content');
      contentDiv.innerHTML = '';
      for (const div of divs) {
        contentDiv.appendChild(div)
      }
      for(let ele of document.getElementsByName('seal_img_div')) {
        this.addEventOnSealDiv(ele, JSON.parse(ele.dataset.sesSignature), JSON.parse(ele.dataset.signedInfo));
      }
    },
    async checkDigest(signedInfo){
      return Promise.resolve(signedInfo)
        .then(res => {
          const signRetStr = global.VerifyRet?"签名值验证成功":"签名值验证失败";
          global.HashRet = digestCheck(global.toBeChecked.get(res.signatureID));
          const hashRetStr = global.HashRet?"文件摘要值验证成功":"文件摘要值验证失败";
          document.getElementById('VerifyRet').innerText = hashRetStr+" "+signRetStr;
        })

    },
    addEventOnSealDiv(div, SES_Signature, signedInfo) {
      try {
        global.HashRet=null;
        global.VerifyRet=signedInfo.VerifyRet;
        let that = this;
        div.addEventListener("click",function(){
          document.getElementById('sealInfoDiv').hidden = false;
          document.getElementById('sealInfoDiv').setAttribute('style', 'display:flex;align-items: center;justify-content: center;');
          console.log("signature data ", SES_Signature)
          if(SES_Signature.realVersion<4){
            document.getElementById('spSigner').innerText = SES_Signature.toSign.cert['commonName'].str;
            document.getElementById('spProvider').innerText = signedInfo.Provider['@_ProviderName'];
            document.getElementById('spHashedValue').innerText = SES_Signature.toSign.dataHash.replace(/\n/g,'');
            document.getElementById('spSignedValue').innerText = SES_Signature.signature.replace(/\n/g,'');
            document.getElementById('spSignMethod').innerText = SES_Signature.toSign.signatureAlgorithm.replace(/\n/g,'');
            document.getElementById('spSealID').innerText = SES_Signature.toSign.eseal.esealInfo.esID.str;
            document.getElementById('spSealName').innerText = SES_Signature.toSign.eseal.esealInfo.property.name.str;
            document.getElementById('spSealType').innerText = SES_Signature.toSign.eseal.esealInfo.property.type.str;
            document.getElementById('spSealAuthTime').innerText = "从 "+SES_Signature.toSign.eseal.esealInfo.property.validStart+" 到 "+SES_Signature.toSign.eseal.esealInfo.property.validEnd;
            document.getElementById('spSealMakeTime').innerText = SES_Signature.toSign.eseal.esealInfo.property.createDate;
            document.getElementById('spSealVersion').innerText = SES_Signature.toSign.eseal.esealInfo.header.version;
          }else{
            document.getElementById('spSigner').innerText = SES_Signature.cert['commonName'].str;
            document.getElementById('spProvider').innerText = signedInfo.Provider['@_ProviderName'];
            document.getElementById('spHashedValue').innerText = SES_Signature.toSign.dataHash.replace(/\n/g,'');
            document.getElementById('spSignedValue').innerText = SES_Signature.signature.replace(/\n/g,'');
            document.getElementById('spSignMethod').innerText = SES_Signature.signatureAlgID.replace(/\n/g,'');
            document.getElementById('spSealID').innerText = SES_Signature.toSign.eseal.esealInfo.esID.str;
            document.getElementById('spSealName').innerText = SES_Signature.toSign.eseal.esealInfo.property.name.str;
            document.getElementById('spSealType').innerText = SES_Signature.toSign.eseal.esealInfo.property.type;
            document.getElementById('spSealAuthTime').innerText = "从 "+SES_Signature.toSign.eseal.esealInfo.property.validStart+" 到 "+SES_Signature.toSign.eseal.esealInfo.property.validEnd;
            document.getElementById('spSealMakeTime').innerText = SES_Signature.toSign.eseal.esealInfo.property.createDate;
            document.getElementById('spSealVersion').innerText = SES_Signature.toSign.eseal.esealInfo.header.version;
          }
          document.getElementById('spVersion').innerText = SES_Signature.toSign.version;
          document.getElementById('VerifyRet').innerText = "文件摘要值后台验证中，请稍等... "+(global.VerifyRet?"签名值验证成功":"签名值验证失败");
          if(global.HashRet==null||global.HashRet==undefined||Object.keys(global.HashRet).length <= 0){
            setTimeout(function(){
              that.checkDigest(signedInfo)
              // const signRetStr = global.VerifyRet?"签名值验证成功1":"签名值验证失败2";
              // global.HashRet = digestCheck(global.toBeChecked.get(signedInfo.signatureID));
              // const hashRetStr = global.HashRet?"文件摘要值验证成功3":"文件摘要值验证失败4";
              // document.getElementById('VerifyRet').innerText = hashRetStr+" "+signRetStr;
            },1000);
          }
        });
      } catch (e) {
        console.log(e);
      }
      if (!global.VerifyRet) {
        div.setAttribute('class', 'gray');
      }
    },
    handleSearchClick(){
      console.log("divs ", this.pageDivs)
      let keyword = this.$refs.keywordRef.value
      this.searchImpl(keyword)
    },
    // ofd文档搜索内容
    searchImpl(keyword = ""){
      // 如果有搜索的内容，将搜索的内容先置空
      if ( this.searchTextList && this.searchTextList.length ) {
        this.pageDivs = renderOfdByScaleWithRedraw(this.ofdObj)
        this.displayOfdDiv(this.pageDivs)
      }

      if ( keyword.replace(/\s+/g,"") ) {
        this.searchTextList = searchKeywordFunc(this.ofdObj, keyword)
      } else {
        this.searchTextList = []
      }
      if ( this.searchTextList.length > 0 ) {
        // 分页进行渲染和替换显示，所以可以查找需要的分页进行重新替换
        this.searchTextList.forEach(value => {
          let pageDiv = this.pageDivs[value.pageIndex]
          renderSinglePage(pageDiv, value.page, this.ofdObj, keyword)
        })

        this.displayOfdDiv(this.pageDivs);
      } else {
        console.log("search empty")
        this.pageDivs = renderOfdByScaleWithRedraw(this.ofdObj)
        this.displayOfdDiv(this.pageDivs)
      }
    },
    gotoPage(pageIndex){
      this.pageIndex = pageIndex
      let contentDiv = document.getElementById('content');
      let ele = contentDiv.children.item(this.pageIndex);
      ele?.scrollIntoView(true);
      ele?this.pageIndex:'';
    },
    handleSearchObjClick(item){
      // 跳转到page
      this.gotoPage(item.pageIndex)

      // 渲染搜索到的文字的背景色
      this.markSearchText(item)

    },
    handleOutlineClick(item){
      // 跳转到page
      this.gotoPage(item.pageIndex)

      // 渲染搜索到的文字的背景色
      this.markSearchText(item)

    },
    markSearchText( item ) {
      let textObject = item.searchTextObject

      // 文本内容
      let boundary = textObject["@_Boundary"]
      let position = boundary.split(" ")
      let xPx = converterDpi(position[0])
      let yPx = converterDpi(position[1])
      let widthPx = converterDpi(position[2])
      let heightPx = converterDpi(position[3])

      console.log("search item ",item.pageIndex, item, boundary, position, xPx, yPx, widthPx, heightPx)

      // 将搜索到的文本的字体颜色修改

    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.upload-icon {
  display: flex;
  cursor: pointer;
  justify-content: center;
  align-items: center;
  height: 28px;
  padding-left: 10px;
  padding-right: 10px;
  background-color: rgb(59, 95, 232);
  border-radius: 1px;
  border-color: #5867dd;
  font-weight: 500;
  font-size: 12px;
  color: white;
  margin: 1px;
}

.scale-icon {
  display: flex;
  cursor: pointer;
  justify-content: center;
  align-items: center;
  width: 33px;
  height: 28px;
  background-color: #F5F5F5;;
  border-radius: 1px;
  font-weight: 500;
  font-size: 12px;
  color: #333333;
  text-align: center;
  padding: 2px;

}
.scale-icon :active {
  color: rgb(59, 95, 232);
}
.scale-icon :hover {
  color: rgb(59, 95, 232);
}

.text-icon {
  display: flex;
  cursor: pointer;
  justify-content: center;
  align-items: center;
  height: 28px;
  width: 90%;
  background-color: rgb(59, 95, 232);
  border-radius: 1px;
  border-color: #5867dd;
  font-weight: 500;
  font-size: 10px;
  color: white;
  margin-top: 20px;

}

.hidden {
  display: none !important;
}

.SealContainer {
  z-index: 99999;
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
}

.SealContainer .mask {
  background: #000000;
  opacity: 0.3;
}

.content-title {
  font-size: 16px;
  text-align: center;
  border-bottom: 1px solid rgb(59, 95, 232);
  color: rgb(59, 95, 232);
  margin-top: 10px;
}


.SealContainer-content {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: white;
  display: flex;
  flex-direction: column;
  padding: 10px;
  align-items: center;
}

.SealContainer-layout {
  position: relative;
  width: 60%;
  height: 80vh;
  overflow-y: auto;
  background: white;
  z-index: 100;
  display: flex;
  flex-direction: column;
  padding: 10px;
  align-items: center;
}

.subcontent {
  width: 80%;
  display: flex;
  flex-direction: column;
  text-align: left;
  margin-bottom: 10px;
  font-family: simsun;
}

.subcontent .title {
  font-weight: 600;
}

.subcontent .value {
  font-weight: 400;
  -webkit-line-clamp: 1;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.left-section {
  position: fixed;
  width: 188px;
  height: 100%;
  background:#F5F5F5;
  border: 1px solid #e8e8e8;
  align-items: center;
  display: flex;
  flex-direction: column
}

.main-section {
  padding-top: 20px;
  margin-left:188px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #808080;
  overflow: hidden
}

@media (max-width: 767px) {
  .SealContainer-layout {
    position: relative;
    width: 90%;
    height: 90vh;
    overflow-y: auto;
    background: white;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 10px;
    align-items: center;
  }

  .subcontent {
    width: 95%;
    display: flex;
    flex-direction: column;
    text-align: left;
    margin-bottom: 10px;
    font-family: simsun;
  }

  .left-section {
    position: fixed;
    width: 0px;
    height: 100%;
    background:#F5F5F5;
    border: 1px solid #e8e8e8;
    align-items: center;
    display: none;
    flex-direction: column;
  }

  .main-section {
    padding-top: 20px;
    margin-left:0px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #808080;
    overflow: hidden
  }
}
</style>
