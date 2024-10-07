import LiteOfd from './liteofd/liteOfd';
import { XmlData } from './liteofd/ofdData';
import { OfdDocument } from './liteofd/ofdDocument';

let selectedFile: File | null = null;

const liteOfd = new LiteOfd()

// 选择 OFD 文件
export function selectOfdFile() {
    const fileInput = document.getElementById('ofdFileInput') as HTMLInputElement;
    fileInput.click();
}

function parseOfdFile(file: File) {
    liteOfd.parse(file).then((data: OfdDocument) => {
        console.log('解析OFD文件成功:', data);
        // 显示ofd的结构
        showOfdStructure(data)
    }).catch((error) => {
        console.error('解析OFD文件失败:', error);
    });
}

// 处理文件选择
function handleFileChange(event: Event) {
    const fileInput = event.target as HTMLInputElement;
    const file = fileInput.files?.[0];
    
    if (file) {
        if (file.name.toLowerCase().endsWith('.ofd')) {
            console.log('选中的 OFD 文件:', file.name);
            selectedFile = file;
            // 显示选中的文件名
            const fileNameElement = document.getElementById('selectedFileName');
            if (fileNameElement) {
                fileNameElement.textContent = file.name;
            }

        // 解析 OFD 文件
        parseOfdFile(file)

        } else {
            alert('请选择 .ofd 文件');
            // 清除文件名显示
            const fileNameElement = document.getElementById('selectedFileName');
            if (fileNameElement) {
                fileNameElement.textContent = '';
            }
        }
        
        // 清除文件输入，允许选择相同的文件
        fileInput.value = '';
    }
}

// 渲染数组的树形结构
function renderTreeView(data: any, parentElement: HTMLElement) {
  const ul = document.createElement('ul');
  ul.className = 'tree-view';

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const li = document.createElement('li');
      li.className = 'tree-item';

      const span = document.createElement('span');
      span.textContent = key;
      li.appendChild(span);

      if (typeof data[key] === 'object' && data[key] !== null) {
        renderTreeView(data[key], li);
      } else {
        span.textContent += `: ${data[key]}`;
      }

      ul.appendChild(li);
    }
  }

  parentElement.appendChild(ul);
}

// 使用示例
function showTreeStructure(data: any[]) {
  const container = document.createElement('div');
  if (container) {
    container.innerHTML = '';
    renderTreeView(data, container);
    return container
  }
}

let previewEle;

// 渲染ofd的对应页面
function renderOfdPage(pageIndex: number){
    if(!previewEle) {
        previewEle = document.getElementById("ofd-preview")
    }
    previewEle.innerHTML = ''
    let pageEle = liteOfd.renderPage(pageIndex, 'background-color: white')
    console.log("page ele", pageEle)
    previewEle?.appendChild(pageEle)
}

function renderPageTreeView(pages: XmlData[]) {
    const container = document.createElement('div');
    if (container) {
        container.innerHTML = '';
        pages.forEach((page, index) => {
            const pageItem = document.createElement('li');
            pageItem.textContent = `第 ${index + 1} 页`;
            pageItem.className = 'tree-item';
            pageItem.addEventListener('click', () => {
                renderOfdPage(index)
            });

            container.appendChild(pageItem);
        });
        return container
    }
}


// 显示OFD结构
export function showOfdStructure(data: OfdDocument) {
    if (!selectedFile) {
        alert('请先选择一个 OFD 文件');
        return;
    }
    if (!data) {
        alert('OFD 文件结构为空');
        return;
    }
    console.log('OFD 文件结构:', data);
    // 将data中的pages显示为树形结构，pages是数组，每个数组元素是一个XmlData
    const ofdStructureDisplay = document.getElementById('ofdStructureDisplay') as HTMLDivElement;
    if (ofdStructureDisplay) {
        ofdStructureDisplay.innerHTML = '';
        let treeView = renderPageTreeView(data.pages)
        if (treeView) {
            ofdStructureDisplay.appendChild(treeView)
        }
    }
}

// 显示签名信息
export function showSignatures() {
    if (!selectedFile) {
        alert('请先选择一个 OFD 文件');
        return;
    }
    
}

// 显示注释
export function showAnnotations() {
    if (!selectedFile) {
        alert('请先选择一个 OFD 文件');
        return;
    }
}

// 显示附件
export function showAttachments() {
    if (!selectedFile) {
        alert('请先选择一个 OFD 文件');
        return;
    }
}

// 将函数添加到 window 对象，使其可以从 HTML 中直接调用
Object.assign(window, {
    selectOfdFile,
    showOfdStructure,
    showSignatures,
    showAnnotations,
    showAttachments
});

// 添加文件选择事件监听器
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('ofdFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileChange);
    }
});
