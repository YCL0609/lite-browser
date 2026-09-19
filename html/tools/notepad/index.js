let noteID = 1;
let deleting = false;
let contentCache = '';
let tempNoteTip = "当前为临时笔记";

// Alt快捷键映射表 
const altShortcutMap = {
    Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6',
    Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5', Numpad6: '6',
    KeyI: 'i', KeyB: 'b', KeyU: 'u', KeyM: 'm',
    Digit0: '0', Numpad0: '0',
    Equal: '+', NumpadAdd: '+',
    Minus: '-', NumpadSubtract: '-'
};

// 已包裹元素标签组
const blockTags = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET',
    'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL'
]);

document.addEventListener('DOMContentLoaded', async () => {
    DOMPurify.setConfig({
        ALLOWED_URI_REGEXP: /^(?:(?:https?|file|ftp|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    });

    noteID = localStorage.noteID ?? 1;
    noteID = (isNaN(parseInt(noteID))) ? 1 : parseInt(noteID)
    // 语言切换
    const lang = await litebrowser.getLang();
    document.title = lang.tools.notepad.title;
    tempNoteTip = lang.tools.notepad.tempNote;
    // 数据目录权限检查
    await toolsFileControl.init('notepad', lang);
    // 显示笔记
    showNote(noteID);
    setInterval(() => saveNote(noteID, true), 5 * 1000); // 自动保存
});

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (e.ctrlKey) {
        switch (key) {
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9': // 读取对应笔记
                e.preventDefault();
                showNote(parseInt(e.key));
                break;

            case 's': // 保存当前笔记
                e.preventDefault();
                saveNote(noteID);
                break;

            case '0': // 切换临时笔记
                e.preventDefault();
                showNote(-1);
                break;

            case 'd': // 删除当前笔记
                e.preventDefault();
                if (noteID == -1 || deleting) break;
                deleting = true;
                toolsFileControl.deleteFile(noteID)
                    .then((isok) => {
                        if (isok) showNote(-1)
                        deleting = false;
                    })
                break;

            default:
                break;
        }
    } else if (e.altKey) { // 格式化快捷键
        const altKey = altShortcutMap[e.code] ?? key;
        switch (altKey) {
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6': // 切换标题
                e.preventDefault();
                formatText(`H${altKey}`);
                break;

            case 'i': // 斜体
                e.preventDefault();
                formatText('I');
                break;

            case 'b': // 粗体
                e.preventDefault();
                formatText('B');
                break;

            case 'u': // 下划线
                e.preventDefault();
                formatText('U');
                break;

            case '+': // 图片放大
                e.preventDefault();
                formatImages('+');
                break;

            case '-': // 图片缩小
                e.preventDefault();
                formatImages('-');
                break;

            case '0': // 图片还原
                e.preventDefault();
                formatImages('0');
                break;

            case 'm': // 渲染数学公式
                e.preventDefault();
                renderMathInElement(document.querySelector('.note'), {
                    delimiters: [
                        { left: "$$", right: "$$", display: true },
                        { left: "$", right: "$", display: false }
                    ]
                });
                break;

            default: break;
        }
    }
});

// 显示笔记
async function showNote(key) {
    if (key === -1) {
        noteID = -1;
        contentCache = '';
        localStorage.noteID = 1;
        document.querySelector('.note').innerHTML = tempNoteTip;
        return;
    }
    // 读取笔记内容
    const content = await toolsFileControl.getFile(key);
    if (content === null) return;

    // 清理HTML
    const rawSafeHtml = DOMPurify.sanitize(content);
    // 替换<a>标签跳转方法(新窗口打开)
    const safeHtml = rawSafeHtml.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, (match, href, rest) => {
        // 检查是否已经有 target 属性
        if (!/target\s*=\s*['"]?_blank['"]?/i.test(rest)) {
            return `<a href="${href}"${rest} target="_blank">`;
        }
        return match;
    });

    // 显示笔记内容
    document.querySelector('.note').innerHTML = safeHtml;
    contentCache = safeHtml;
    localStorage.noteID = key;
    noteID = key;

    // 渲染数学公式
    renderMathInElement(document.querySelector('.note'), {
        delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false }
        ]
    });
}

// 保存笔记
function saveNote(key, isauto = false) {
    if (noteID == -1 || deleting) return;
    const note = document.querySelector('.note');
    if (note.innerHTML === contentCache && isauto) return; // 内容未更改
    // 保存笔记内容
    toolsFileControl.saveFile(note.innerHTML, isauto, key)
        .then((isok) => { if (isok) contentCache = note.innerHTML })
}

// 是否为块级元素
function isBlockElement(node) {
    return node?.nodeType === 1 && blockTags.has(node.tagName);
}

// 获取节点的直接子节点索引
function topLevelIndexOf(container, node) {
    while (node && node.parentNode !== container) node = node.parentNode;
    return node ? Array.prototype.indexOf.call(container.childNodes, node) : -1;
}

// 格式化文本
function formatText(target) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const editableRoot = document.querySelector('.note');
    if (!editableRoot || !editableRoot.contains(range.startContainer)) return;

    // 找到选区所在的行级节点
    let blockNode = range.startContainer;
    while (blockNode && blockNode.nodeType !== 1) blockNode = blockNode.parentNode;
    while (blockNode && blockNode.parentNode !== editableRoot) {
        blockNode = blockNode.parentNode;
    }

    // 判断该行是否已被包裹
    const isWrapped = blockNode && blockNode !== editableRoot &&
        (isBlockElement(blockNode) || blockNode.tagName === target);

    // 如已经是目标格式，则切换回普通段落，否则切换到目标格式
    let newElement;
    if (isWrapped) {
        newElement = document.createElement(blockNode.tagName === target ? 'P' : target);
        newElement.innerHTML = blockNode.innerHTML;
        blockNode.parentNode.replaceChild(newElement, blockNode);
    } else {
        // 包裹整行
        const children = editableRoot.childNodes;
        const element = document.createElement(target);

        // 空编辑器: 插入一个空行供输入
        if (children.length === 0) {
            element.appendChild(document.createElement('br'));
            editableRoot.appendChild(element);
            newElement = element;
        } else {
            // 定位选区起点所在的根级子节点
            let index = topLevelIndexOf(editableRoot, range.startContainer);
            if (index === -1) {
                if (range.startContainer !== editableRoot) return; // 选区不在编辑器内
                const offset = range.startOffset;
                if (children[offset] && !isBlockElement(children[offset])) {
                    index = offset;
                } else if (offset > 0 && !isBlockElement(children[offset - 1])) {
                    index = offset - 1;
                } else {
                    index = Math.min(offset, children.length - 1);
                }
            }
            if (index < 0) return;

            // 已是块级元素的行, 无需包裹
            if (isBlockElement(children[index])) return;

            if (children[index].nodeName === 'BR') {
                const anchor = children[index + 1] ?? null;
                element.appendChild(children[index]);
                editableRoot.insertBefore(element, anchor);
            } else {
                // 找出当前行的首尾节点
                const isBreak = (node) => !node || isBlockElement(node) || node.nodeName === 'BR';
                let start = index;
                let end = index;
                while (start > 0 && !isBreak(children[start - 1])) start--;
                while (end < children.length - 1 && !isBreak(children[end + 1])) end++;

                // 插入位置需要在搬运节点之前确定
                const anchor = children[end + 1] ?? null;
                Array.from(children).slice(start, end + 1).forEach(node => element.appendChild(node));
                editableRoot.insertBefore(element, anchor);
            }
            newElement = element;
        }
    }

    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(newElement);
    selection.addRange(newRange);
}

// 修改图片大小
function formatImages(control) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    // 获取公共祖先容器
    const container = range.commonAncestorContainer;
    const root = container.nodeType === Node.ELEMENT_NODE
        ? container
        : container.parentElement;

    if (!root) return;
    root.querySelectorAll('img').forEach(img => {
        if (!range.intersectsNode(img)) return;
        const old = parseInt(img.style.width) || 100;
        if (control == "+") {
            img.style.width = (old + 1) + '%';
        } else if (control == "-" && old > 1) {
            img.style.width = (old - 1) + '%';
        } else if (control == "0") {
            img.style.width = '100%';
        }
    });
}