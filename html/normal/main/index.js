// import { NoteMessage } from '../../../libs/functions-front.js';
const cardTitle = document.getElementById('bookmark-card-title');
const cardTxt = document.getElementById('bookmark-card-name');
const cardUrl = document.getElementById('bookmark-card-url');
const listEl = document.getElementById('bookmark-list');
const card = document.getElementById('bookmark-card');
const langRaw = await litebrowser.getLang();
const lang = langRaw.mainWindow;
const imgMIME = {
    gif: 'image/gif',
    png: 'image/png',
    jpg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
    apng: 'image/apng',
    svg: 'image/svg+xml'
};
let imgBlobUrl = null;
let bookmarks = {};
let editID = null;

// 搜索或跳转url
function doSearch() {
    const inputEl = document.getElementById('search-input');
    if (!inputEl) return;

    const input = inputEl.value.trim();
    if (!input) return;
    const isUrl = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(input);

    const targetUrl = isUrl
        ? input
        : litebrowser.searchUrl.replace('%s', encodeURIComponent(input));

    litebrowser.newWindow(targetUrl);
}

// 渲染书签 (带动画)
function showBookmark(id, book) {
    if (!id || !book) return;
    // 卡片主体
    const cardDiv = document.createElement('div');
    cardDiv.className = 'bookmark-card';
    cardDiv.id = 'bookmark-' + id
    const infoDiv = document.createElement('div');
    infoDiv.className = 'bookmark-info';
    infoDiv.innerHTML = `<div class="bookmark-name">${book.name}</div>`;
    infoDiv.style.cursor = 'pointer';
    infoDiv.addEventListener('click', () => litebrowser.newWindow(book.url));
    const actionDiv = document.createElement('div');
    actionDiv.className = 'card-actions';
    // 编辑按钮
    const editBtn = document.createElement('button');
    editBtn.className = 'card-icon edit-icon';
    editBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 128 128" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="m36.11 110.47 70.43-70.43-18.58-18.58-70.43 70.43a3 3 0 0 0-.8 1.22l-5.48 20.8a2.5 2.5 0 0 0-.02.12 3 3 0 0 0-.04.25 2 2 0 0 0 0 .45 3 3 0 0 0 .04.25 2.5 2.5 0 0 0 .02.12l.03.08c.02.08.05.15.09.23s.05.13.09.2.08.12.12.19.08.12.13.18.1.11.15.16.1.1.16.15.12.09.18.13.13.08.19.12.13.06.2.09.15.06.23.09l.08.03.12.02a3 3 0 0 0 .25.04 2 2 0 0 0 .45 0 3 3 0 0 0 .25-.04l.12-.02 20.8-5.48c.38-.1.8-.39 1.1-.77m-16.46-2.12a1.8 1.8 0 0 0-1.96-.65l3.18-12.1 11.53 11.53-12.45 3.28a1.8 1.8 0 0 0-.64-1.96"/>
        <path d="m109.7 36.88-18.58-18.58 7.12-7.12s12.66 4.52 18.58 18.58z"/>
        </svg>`;
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cardTitle.innerText = lang.bookmark.changeTip;
        cardTxt.value = book.name;
        cardUrl.value = book.url;
        editID = id;
        card.classList.add('active');
    });
    // 删除按钮
    const delBtn = document.createElement('button');
    delBtn.className = 'card-icon';
    delBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" />
        </svg>`;
    delBtn.title = '删除';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(lang.bookmark.confirmDel.replace('$name$', book.name))) {
            delete bookmarks[id];
            document.getElementById('bookmark-' + id).remove();
            litebrowser.setBookmark(bookmarks);
        }
    });
    actionDiv.appendChild(editBtn);
    actionDiv.appendChild(delBtn);
    cardDiv.appendChild(infoDiv);
    cardDiv.appendChild(actionDiv);
    listEl.appendChild(cardDiv);
}

// 语言切换
if (langRaw.Info.lang != "zh") {
    document.querySelectorAll('[data-langId]').forEach(e => {
        const langId = e.dataset.langid.replace(/@/g, 'mainWindow');
        const langTo = e.dataset.langTo ?? "innerText";
        const langIndex = langId.split('.');
        let value = langRaw;
        for (let i = 0; i < langIndex.length; i++) {
            value = value[langIndex[i]] ?? "[Translation missing]";
        }
        e[langTo] = value;
    });
}

// 数据目录权限提示
if (!litebrowser.dataDirAccess.R || !litebrowser.dataDirAccess.W) {
    const tips = document.getElementById('tips');
    const txtR = !litebrowser.dataDirAccess.R ? langRaw.permission.read.tip : '';
    const txtW = !litebrowser.dataDirAccess.W ? langRaw.permission.write.tip : '';
    const sep = (txtR && txtW) ? ' --- ' : '';
    tips.innerText = txtR + sep + txtW;
    tips.className = 'show warning';
    setTimeout(() => {
        tips.classList.remove('show');
    }, 5000);
}

// 加载背景
if (litebrowser.backgroundName) litebrowser.getBackgroundURL(litebrowser.backgroundName)
    .then(url => {
        if (!url) return;
        const ext = url.split('.').pop()?.toLowerCase() || '';
        const mime = imgMIME[ext];
        if (!mime) return;
        document.body.style.backgroundImage = `url('${url}')`;
    })

// 加载书签
litebrowser.getBookmarks()
    .then(json => {
        listEl.innerHTML = '';
        bookmarks = (typeof json === 'object') ? json : {};
        for (const id in bookmarks) {
            if (
                typeof bookmarks[id]?.name === 'string' &&
                typeof bookmarks[id]?.url === 'string'
            ) {
                showBookmark(id, bookmarks[id])
            }
        };
    });

// 搜索事件绑定
document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch() });
document.getElementById('search-button').addEventListener('click', doSearch);

// 书签事件绑定
document.getElementById('bookmark-add-Btn').addEventListener('click', () => {
    if (editID !== null) return;
    editID = Date.now();
    card.classList.add('active');
});
document.getElementById('bookmark-card-noBtn').addEventListener('click', () => {
    if (editID === null) return;
    card.classList.remove('active');
    cardTitle.innerText = lang.bookmark.addTip;
    cardTxt.value = '';
    cardUrl.value = '';
    editID = null;
});
document.getElementById('bookmark-card-okBtn').addEventListener('click', () => {
    if (editID === null) return;
    const name = cardTxt.value.trim();
    const url = cardUrl.value.trim();
    if (name === '' || url === '') return;
    const oldDiv = document.getElementById('bookmark-' + editID);
    if (oldDiv) oldDiv.remove();

    bookmarks[editID] = { name, url };
    showBookmark(editID, bookmarks[editID]);
    litebrowser.setBookmarks(bookmarks);

    editID = null;
    card.classList.remove('active');
    cardTitle.innerText = lang.bookmark.addTip;
    cardTxt.value = '';
    cardUrl.value = '';
});

// 设置页面按钮
document.getElementById('settings-open').addEventListener('click', litebrowser.openSetings);