import LiteOfd from './liteofd/liteOfd';
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

// 显示OFD结构
export function showOfdStructure() {
    if (!selectedFile) {
        alert('请先选择一个 OFD 文件');
        return;
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
