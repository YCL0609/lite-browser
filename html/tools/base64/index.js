let errorTip = "处理错误:";
let processing = "正在处理...";
let errorString = "Base64 字符串格式不正确，无法解码为文本";

document.addEventListener('DOMContentLoaded', async () => {
    // 语言切换
    const langRaw = await litebrowser.getLang();
    const lang = langRaw.tools.base64;
    if (langRaw.Info.lang != "zh") {
        errorTip = lang.errorTip;
        processing = lang.processing;
        errorString = lang.errorString;
        document.title = lang.title;
        document.querySelectorAll('[data-langId]').forEach(e => {
            const langId = e.dataset.langid.replace(/@/g, 'tools.base64');
            const langTo = e.dataset.langTo ?? "innerText";
            const langIndex = langId.split('.');
            let value = langRaw;
            for (let i = 0; i < langIndex.length; i++) {
                value = value[langIndex[i]] ?? "[Translation missing]";
            }
            e[langTo] = value;
        });
    }
});

// 切换输入类型的显示/隐藏
function switchType() {
    const type = document.getElementById('inputType').value;
    document.getElementById('decodeBtn').style.display = type === 'text' ? '' : 'none';
    document.getElementById('textInputDiv').style.display = type === 'text' ? 'block' : 'none';
    document.getElementById('fileInputDiv').style.display = type === 'file' ? 'block' : 'none';
    // 清空输入和错误信息
    document.getElementById('textInput').value = '';
    document.getElementById('fileInput').value = '';
    document.getElementById('outputArea').value = '';
    document.getElementById('errorMsg').textContent = '';
}

// 读取内容的 DataURL, 失败时 reject (可在 try/catch 中被捕获)
function readAsDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error ?? new Error(errorString));
        reader.readAsDataURL(blob);
    });
}

// 处理输入并执行编码或解码
async function processInput(operation) {
    const errorMsg = document.getElementById('errorMsg');
    const outputArea = document.getElementById('outputArea');
    errorMsg.innerHTML = processing;
    try {
        const inputType = document.getElementById('inputType').value;
        if (inputType === 'text') {
            const text = document.getElementById('textInput').value.trim();
            if (!text) { errorMsg.textContent = ''; return; }
            if (operation === 'encode') {
                // 编码文本
                const utf8Bytes = new TextEncoder().encode(text);
                const dataUrl = await readAsDataURL(new Blob([utf8Bytes]));
                outputArea.value = dataUrl.split(',')[1];
            } else {
                // 解码文本
                try {
                    const base64 = text.replace(/^data:.*,/, '').trim();
                    const binaryString = atob(base64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    outputArea.value = new TextDecoder('utf-8').decode(bytes);
                } catch (e) {
                    throw new Error(errorString);
                }
            }
        } else if (inputType === 'file') {
            // 处理文件输入
            const file = document.getElementById('fileInput').files[0];
            if (!file) { errorMsg.textContent = ''; return; }

            if (operation === 'encode') {
                // 编码文件
                outputArea.value = await readAsDataURL(file);
            }
        }

        // 处理成功, 清除"正在处理..."提示
        errorMsg.textContent = '';
    } catch (e) {
        console.error(e);
        outputArea.value = '';
        // errorTip 在各语言中已自带冒号
        errorMsg.innerHTML = `<a style="color:red">${errorTip} ${e.message}</a>`;
    }
}