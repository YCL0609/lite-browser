let renamedID;
let isAutoMode = false;
let isShowMenu = false;
const selstedJsId = new Set();
const listdiv = document.querySelector('.jslist');
const overlay = document.querySelector('.overlay');
const submitBtn = document.querySelector('.activate');
document.getElementById('id').innerText = litebrowser.parentID;
GetList();

// 语言切换
const langRaw = await litebrowser.getLang();
const lang = langRaw.jsinsert;
if (langRaw.Info.lang != "zh") {
    document.title = lang.title;
    document.querySelectorAll('[data-langId]').forEach(e => {
        const langId = e.dataset.langid.replace(/@/g, 'jsinsert');
        const langTo = e.dataset.langTo ?? "innerText";
        const langIndex = langId.split('.');
        let value = langRaw;
        for (let i = 0; i < langIndex.length; i++) {
            value = value[langIndex[i]] ?? "[Translation missing]";
        }
        e[langTo] = value;
    });
}

// 添加按钮
document.getElementById('add').addEventListener('click', litebrowser.addJS);

// 删除按钮
document.getElementById('delete').addEventListener('click', () => {
    if (selstedJsId.size === 0) {
        alert(lang.message.noselent);
        return;
    }
    if (confirm(lang.message.isdelete)) {
        litebrowser.removeJS([...selstedJsId]);
        [...selstedJsId].forEach(id => document.getElementById(id).remove());
        selstedJsId.clear()
    }
});

// 重命名按钮
document.getElementById('rename').addEventListener('click', () => {
    if (selstedJsId.size === 0) {
        alert(lang.message.noselent);
        return;
    } else if (selstedJsId.size !== 1) {
        alert(lang.message.rename);
        return;
    }
    renamedID = [...selstedJsId][0];
    const oldName = document.getElementById(renamedID).innerText;
    document.getElementById('rename-input').value = oldName;
    overlay.style.display = "flex";
});

// 重命名-应用按钮
document.getElementById('rename-apply').addEventListener('click', () => {
    const newName = document.getElementById('rename-input').value.trim();
    if (newName == "") return;
    const row = document.getElementById(renamedID);
    if (!row) return;
    litebrowser.renameJS(renamedID, newName);
    const bold = document.createElement('b');
    bold.textContent = newName;
    row.replaceChildren(bold);
    document.querySelectorAll('.jsrow').forEach(e => e.classList.remove('selected'));
    overlay.style.display = "none";
    renamedID = null;
})

// 重命名-取消按钮
document.getElementById('rename-cancel').addEventListener('click', () => {
    document.querySelectorAll('.jsrow').forEach(e => e.classList.remove('selected'));
    overlay.style.display = "none";
    renamedID = null;
})

// 打开目录按钮
document.getElementById('openDir').addEventListener('click', litebrowser.openDir);

// 刷新列表按钮
document.getElementById('refresh').addEventListener('click', GetList);

// 菜单按钮
document.querySelector('.menu-toggle').addEventListener('click', () => {
    isShowMenu = !isShowMenu;
    document.querySelector('.menu').style.display = isShowMenu ? 'flex' : 'none';
});

// 自动注入按钮
document.getElementById('auto').addEventListener('click', async () => {
    const autoBtn = document.getElementById('auto');
    const boxTitle = document.getElementById('box-title');
    isAutoMode = !isAutoMode;
    // 清理选择器
    selstedJsId.clear();
    document.querySelectorAll('.jsrow').forEach(e => e.classList.remove('selected'));
    // GUI
    if (isAutoMode) {
        boxTitle.innerText = lang.boxTitleAuto;
        submitBtn.innerText = lang.apply;
        autoBtn.classList.add('activated');
    } else {
        boxTitle.innerText = lang.boxTitle;
        submitBtn.innerText = lang.insert;
        autoBtn.classList.remove('activated');
        return;
    }
    // 获取当前列表并显示
    const autoList = await litebrowser.getAutoJS(litebrowser.parentID);
    if (autoList.errID === -1) return;
    autoList.hosts.forEach(id => {
        const row = document.getElementById(id);
        if (!row) return;
        row.classList.add('selected');
        selstedJsId.add(id);
    });
});

// 提交按钮
submitBtn.addEventListener('click', () => {
    if (isAutoMode) {
        // 应用自动注入配置
        litebrowser.changeAutoJS(litebrowser.parentID, [...selstedJsId]);
        document.querySelectorAll('.jsrow').forEach(e => e.classList.remove('selected'));
        submitBtn.innerText = lang.insert;
        document.getElementById('box-title').innerText = lang.boxTitle;
        document.getElementById('auto').classList.remove('activated');
        selstedJsId.clear();
        isAutoMode = false;
    } else {
        if (selstedJsId.size === 0) return;
        litebrowser.insertJS(litebrowser.parentID, [...selstedJsId]);
    }
})

// 获取脚本列表
async function GetList() {
    const date = new Date();
    const list = await litebrowser.getList();
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    document.getElementById('time').innerText = time;
    document.getElementById('used').innerText = Math.round(list.used * 100) / 100 + 'ms';
    // 处理错误
    if (list.error !== -1) {
        const errEl = document.createElement('a');
        errEl.style.cssText = 'display:block;text-align:center;color:red';
        errEl.textContent = String(list.error);
        listdiv.replaceChildren(errEl);
        return;
    }
    // 处理无列表
    if (list.list.length === 0) return;
    // 处理列表
    listdiv.innerHTML = '';
    for (const item in list.list) {
        const div = document.createElement('div');
        const b = document.createElement('b');

        div.classList.add('jsrow');
        b.innerText = list.list[item];
        div.id = item;
        div.onclick = (e) => {
            const id = e.currentTarget.id;
            if (selstedJsId.has(id)) {
                selstedJsId.delete(id);
                e.currentTarget.classList.remove('selected');
            } else {
                selstedJsId.add(id);
                e.currentTarget.classList.add('selected');
            }
        };

        div.appendChild(b);
        listdiv.appendChild(div);
    }
}