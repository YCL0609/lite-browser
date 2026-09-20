const listEl = document.getElementById('bookmark-list');
const card = document.getElementById('bookmark-card');
const cardTitle = document.getElementById('bookmark-card-title');
const cardTxt = document.getElementById('bookmark-card-name');
const cardUrl = document.getElementById('bookmark-card-url');
const langRaw = await litebrowser.getLang();
const lang = langRaw.mainWindow;
let bookmarks = {};
let editID = null;

// 搜索
function doSearch() {
    const inputEl = document.getElementById('search-input');
    const input = inputEl.value.trim();
    if (!input) return;
    const isUrl =
        /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(input);
    const targetUrl = isUrl
        ? input
        : litebrowser.searchUrl.replace('%s', encodeURIComponent(input));
    litebrowser.newWindow(targetUrl);
}

// 渲染书签
function showBookmark(id, book) {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.id = 'bookmark-' + id;
    const name = document.createElement('div');
    name.className = 'bookmark-name';
    name.innerText = book.name;
    name.onclick = () => { litebrowser.newWindow(book.url) };
    const actions = document.createElement('div');
    actions.className = 'bookmark-actions';
    const editBtn = document.createElement('button');
    editBtn.innerText = 'E';
    editBtn.onclick = () => {
        editID = id;
        cardTitle.innerText = lang.bookmark.changeTip;
        cardTxt.value = book.name;
        cardUrl.value = book.url;
        card.classList.add('active');
    };
    const delBtn = document.createElement('button');
    delBtn.innerText = 'X';
    delBtn.onclick = () => {
        if (!confirm(
            lang.bookmark.confirmDel
                .replace('$name$', book.name)
        )) return;
        delete bookmarks[id];
        litebrowser.setBookmarks(bookmarks);
        item.remove();
    };
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    item.appendChild(name);
    item.appendChild(actions);
    listEl.appendChild(item);
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
if (!litebrowser.dataDirAccess.R) alert(langRaw.permission.read.tip);
if (!litebrowser.dataDirAccess.W) alert(langRaw.permission.write.tip);

// 书签
litebrowser.getBookmarks()
    .then(json => {
        bookmarks = typeof json === 'object' ? json : {};
        listEl.innerHTML = '';
        for (const id in bookmarks) {
            const book = bookmarks[id];
            if (
                typeof book?.name === 'string' &&
                typeof book?.url === 'string'
            ) {
                showBookmark(id, book);
            }
        }
    });


// 搜索相关
document.getElementById('search-button').addEventListener('click', doSearch);
document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
});

// 书签相关
document.getElementById('bookmark-add-Btn').addEventListener('click', () => {
    editID = Date.now();
    cardTitle.innerText = lang.bookmark.addTip;
    cardTxt.value = '';
    cardUrl.value = '';
    card.classList.add('active');
});
document.getElementById('bookmark-card-noBtn').addEventListener('click', () => {
    editID = null;
    card.classList.remove('active');
});
document.getElementById('bookmark-card-okBtn').addEventListener('click', () => {
    if (editID == null) return;
    const name = cardTxt.value.trim();
    const url = cardUrl.value.trim();
    if (!name || !url) return;
    const old = document.getElementById('bookmark-' + editID);
    if (old) old.remove();
    bookmarks[editID] = { name, url };
    litebrowser.setBookmarks(bookmarks);
    showBookmark(editID, bookmarks[editID]);
    editID = null;
    card.classList.remove('active');
});

// 设置页面
document.getElementById('settings-open').addEventListener('click', litebrowser.openSetings);