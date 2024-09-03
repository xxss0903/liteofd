import './style.css'
import LiteOfd from "./liteofd/liteOfd"
import PromiseCapability from './liteofd/promiseCapability';
import { OfdDocument } from './liteofd/ofdDocument';


const appContent = document.getElementById('content') as HTMLElement

const liteOfd = new LiteOfd()


export function uploadFile() {
  document.getElementById('fileInput')?.click();
}

export function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    console.log('选中的文件:', file);
    // 处理文件的逻辑
	parseOfdFile(file)
  }
}

function parseOfdFile(file: File) {
	appContent.innerHTML = ''
  let ofdPromise = liteOfd.parseFile(file) as PromiseCapability<OfdDocument>
  ofdPromise.promise.then((data: OfdDocument) => {
    console.log('解析OFD文件成功:', data);
	liteOfd.renderOfd(appContent)
  }).catch((error) => {
    console.error('解析OFD文件失败:', error);
  });
}


export function handleSaveOFD() {
  console.log('保存OFD文件');
  // 保存OFD文件的逻辑
  	appContent.innerHTML = ''
}

export function plus() {
  console.log('放大');
  // 放大的逻辑
}

export function minus() {
  console.log('缩小');
  // 缩小的逻辑
}

export function firstPage() {
  console.log('第一页');
  // 跳转到第一页的逻辑
}

export function prePage() {
  console.log('上一页');
  // 跳转到上一页的逻辑
}

export function nextPage() {
  console.log('下一页');
  // 跳转到下一页的逻辑
}

export function lastPage() {
  console.log('最后一页');
  // 跳转到最后一页的逻辑
}

// 将函数添加到window对象
Object.assign(window, {
  uploadFile,
  handleFileChange,
  handleSaveOFD,
  plus,
  minus,
  firstPage,
  prePage,
  nextPage,
  lastPage
});
