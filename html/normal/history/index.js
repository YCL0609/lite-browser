// 页面加载事件
document.addEventListener('DOMContentLoaded', async () => {
    const rawTxt = await litebrowser.getFile('history.txt', 'utf-8') ?? '';
    const pattern = /^\d+ [a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
    const fragment = document.createDocumentFragment();
    const dayList = {};

    for (const line of rawTxt.split(/\r?\n/).reverse()) {
        if (!pattern.test(line)) continue;

        // 分割字符串
        const index = line.indexOf(' ');
        if (index === -1) continue;
        const timeRaw = line.substr(0, index);
        const url = line.substr(index + 1);
        const time = new Date(Number(timeRaw));
        if (isNaN(time)) continue;

        // 分隔符插入
        const year = time.getFullYear();
        const month = time.getMonth() + 1;
        const day = time.getDate();
        dayList[year] ??= {};
        dayList[year][month] ??= {}
        if (!dayList[year][month][day]) { // 年份元素校验
            const hr = document.createElement('hr');
            hr.dataset.content = `${year}-${String(month).padStart(2, 0)}-${String(day).padStart(2, 0)}`;
            fragment.appendChild(hr);
            dayList[year][month][day] = true;
        }

        // 插入页面
        const div = document.createElement('div');
        const h4 = document.createElement('h4');
        const a = document.createElement('a');
        div.onclick = () => window.open(url, '_blank', 'noopener');
        a.innerText = `${String(time.getHours()).padStart(2, 0)}:${String(time.getMinutes()).padStart(2, 0)}:${String(time.getSeconds()).padStart(2, 0)}`;
        h4.innerText = url;
        div.appendChild(a);
        div.appendChild(h4);
        fragment.appendChild(div);
    }

    // 插入到页面
    document.getElementById('list').replaceChildren(fragment);

    // 语言切换
    const langRaw = await litebrowser.getLang();
    const lang = langRaw.history;
    if (langRaw.Info.lang != "zh") {
        document.title = lang.title;
        document.querySelectorAll('[data-langId]').forEach(e => {
            const langId = e.dataset.langid.replace(/@/g, 'history');
            const langTo = e.dataset.langTo ?? "innerText";
            const langIndex = langId.split('.');
            let value = langRaw;
            for (let i = 0; i < langIndex.length; i++) {
                value = value[langIndex[i]] ?? "[Translation missing]";
            }
            e[langTo] = value;
        });
    }

    // 绑定删除按钮事件
    document.getElementById('deleteBtn').addEventListener('click', async () => {
        if (!confirm(lang.confirmTip)) return;
        const isok = await litebrowser.setFile('history.txt', '');
        if (isok) {
            document.getElementById('list').replaceChildren();
        } else {
            alert(langRaw.permission.write.tip);
        }
    });
});


// 刷新按钮事件
document.getElementById('refresh').addEventListener('click', location.reload)