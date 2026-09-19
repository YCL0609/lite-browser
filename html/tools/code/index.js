const htmlInput = document.getElementById("htmlInput");
const cssInput = document.getElementById("cssInput");
const jsInput = document.getElementById("jsInput");
const codeCache = { html: '', css: '', js: '' };
let deleting = false;
let previewTimer = null;

// 快捷键保存
document.addEventListener('keydown', async (e) => {
    if (e.ctrlKey) {
        if (e.key.toLocaleLowerCase() === 's') {
            e.preventDefault();
            saveCode();
        } else if (e.key.toLocaleLowerCase() === 'd') {
            e.preventDefault();
            if (deleting) return;
            deleting = true;
            toolsFileControl.deleteFile().then((isok) => {
                if (isok) {
                    htmlInput.value = '';
                    cssInput.value = '';
                    jsInput.value = '';
                    updatePreview();
                    setTimeout(window.close, 1500);
                } else { deleting = false }
            });
        }
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    // 初始化文件控制器
    await toolsFileControl.init('code');
    // 实时预览和 Tab 键支持
    [htmlInput, cssInput, jsInput].forEach((textarea) => {
        textarea.addEventListener("input", () => {
            // 防抖
            clearTimeout(previewTimer);
            previewTimer = setTimeout(updatePreview, 250);
        });
        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Tab") {
                e.preventDefault();
                const { selectionStart, selectionEnd, value } = e.target;
                e.target.value =
                    value.substring(0, selectionStart) + "  " + value.substring(selectionEnd);
                e.target.selectionStart = e.target.selectionEnd = selectionStart + 2;
            }
        });
    });

    // 显示笔记内容
    toolsFileControl.getFile()
        .then(response => {
            if (!response) return;
            // 显示内容
            htmlInput.value = response.html;
            cssInput.value = response.css;
            jsInput.value = response.js;
            // 存入缓存
            codeCache.html = response.html;
            codeCache.css = response.css;
            codeCache.js = response.js;
            // 更新预览
            updatePreview();
            // 设置自动保存
            setInterval(() => saveCode(true), 5 * 1000)
        })
        .catch(err => console.error('Failed to load code content:', err));
});

// 更新预览区域
function updatePreview() {
    clearTimeout(previewTimer);
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport"content="width=device-width, initial-scale=1.0"><style>${cssInput.value}</style></head><body>${htmlInput.value}<script>${jsInput.value}</script></body></html>`
    document.getElementById('preview').srcdoc = html;
};

// 保存代码
function saveCode(isauto = false) {
    if (deleting) return;
    let changed = [];
    const input = { html: htmlInput, css: cssInput, js: jsInput };

    ['html', 'css', 'js'].forEach(e => {
        // 统一换行符，避免 CRLF/LF 导致的误判
        const cacheVal = (codeCache[e] || '').replace(/\r\n/g, '\n');
        const inputVal = (input[e].value || '').replace(/\r\n/g, '\n');
        if (cacheVal !== inputVal) changed.push(e);
    })
    if (!isauto) changed = ['html', 'css', 'js']; // 手动保存时，全部保存
    if (changed.length === 0) return;

    // 保存到文件
    changed.forEach(type => {
        toolsFileControl.saveFile(input[type].value, isauto, type)
            .then(isok => { if (isok) codeCache[type] = input[type].value })
    })
}