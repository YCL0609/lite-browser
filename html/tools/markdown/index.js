const preview = document.getElementById('preview');
const input = document.getElementById('input');
let contentCache = '';
let BlobUrl = null;
let deleting = false;
let previewTimer = null;
let previewScroll = 0;

// 初始化
document.addEventListener("DOMContentLoaded", async () => {
    // 语言切换
    const langRaw = await litebrowser.getLang();
    const lang = langRaw.tools.markdown;
    if (langRaw.Info.lang != "zh") {
        document.title = lang.title;
        document.querySelectorAll('[data-langId]').forEach(e => {
            const langId = e.dataset.langid.replace(/@/g, 'tools.markdown');
            const langTo = e.dataset.langTo ?? "innerText";
            const langIndex = langId.split('.');
            let value = langRaw;
            for (let i = 0; i < langIndex.length; i++) {
                value = value[langIndex[i]] ?? "[Translation missing]";
            }
            e[langTo] = value;
        });
    }

    await toolsFileControl.init('markdown', langRaw);
    toolsFileControl.getFile()
        .then(response => {
            input.value = response;
            contentCache = response;
            // 渲染预览
            showMD();
            // 设置自动保存
            setInterval(() => saveMD(true), 5000)
        })
        .catch(err => console.error('Failed to load markdown content:', err));
});

// 页面卸载时清理 Blob URL
window.addEventListener('beforeunload', () => {
    if (BlobUrl) {
        try { URL.revokeObjectURL(BlobUrl) } catch (_) { }
        BlobUrl = null;
    }
});

// 预览页面加载成功
preview.addEventListener('load', () => {
    const body = preview.contentDocument?.body;
    if (!body) return;

    // 还原滚动位置
    if (previewScroll > 0) {
        try { preview.contentWindow.scrollTo(0, previewScroll) } catch (_) { }
    }

    // 数学公式渲染
    renderMathInElement(body, {
        delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
        ],
        throwOnError: false
    });
});

// 快捷键保存
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
        // 保存
        if (e.key.toLocaleLowerCase() === 's') {
            e.preventDefault();
            saveMD();
        }
        // 删除
        if (e.key.toLocaleLowerCase() === 'd') {
            e.preventDefault();
            if (deleting) return;
            deleting = true;
            toolsFileControl.deleteFile()
                .then((isok) => {
                    if (isok) {
                        input.value = '';
                        contentCache = '';
                        showMD();
                        setTimeout(window.close, 1500);
                    } else { deleting = false }
                });
        }
    }
});

// 输入时刷新预览
input.addEventListener('input', () => {
    // 防抖
    clearTimeout(previewTimer);
    previewTimer = setTimeout(showMD, 250);
});

// 渲染Markdown预览
function showMD() {
    clearTimeout(previewTimer);
    // 记录当前预览滚动位置
    previewScroll = preview.contentWindow?.scrollY ?? 0;
    // Marked 转换
    const rawHtml = marked.parse(input.value);
    // DOMPurify 清理
    const rawSafeHtml = DOMPurify.sanitize(rawHtml);

    // 替换<a>标签跳转方法(新窗口打开)
    const safeHtml = rawSafeHtml.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, (match, href, rest) => {
        // 检查是否已经有 target 属性
        if (!/target\s*=\s*['"]?_blank['"]?/i.test(rest)) {
            return `<a href="${href}"${rest} target="_blank">`;
        }
        return match;
    });

    // 清理上一个 Blob URL
    if (BlobUrl) {
        URL.revokeObjectURL(BlobUrl);
        BlobUrl = null;
    }

    // 构建css连接
    const maincss = new URL('./iframe.css', location.href).href;
    const katexcss = new URL('../common/katex/katex.min.css', location.href).href;
    const cssLinks = `<link rel="stylesheet" href="${maincss}"><link rel="stylesheet" href="${katexcss}">`;

    // 构建BLOB
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport"content="width=device-width, initial-scale=1.0">${cssLinks}</head><body>${safeHtml}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    BlobUrl = URL.createObjectURL(blob);
    // 设置 src 为 blob url
    preview.src = BlobUrl;
}

// 保存Markdown文件
function saveMD(isauto = false) {
    if (deleting) return;
    if (input.value === contentCache && isauto) return; // 内容未更改
    toolsFileControl.saveFile(input.value, isauto)
        .then(isok => { if (isok) contentCache = input.value });
}