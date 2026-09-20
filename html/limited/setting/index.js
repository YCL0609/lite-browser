let currentSettings = {};
let bgFileName = null;
let bgBase64 = null;
let lang = null
let langRoot = null
const imageMIME = { // 支持的图片MIME类型
    'image/gif': 'gif',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/apng': 'apng',
    'image/svg+xml': 'svg'
};

// 加载配置函数
async function loadSettings() {
    const settings = await litebrowser.getSettings();
    currentSettings = settings;
    const app = currentSettings.app;
    const mainWin = currentSettings.mainWin;
    document.getElementById('useGPU').checked = app.useGPU;
    document.getElementById('toolBox').checked = app.toolBox;
    document.getElementById('history').checked = app.history;
    document.getElementById('topMenu').checked = app.topMenu;
    document.getElementById('insertjs').checked = app.insertjs;
    document.getElementById('hwLimitMode').checked = !app.normalMode;
    document.getElementById('contentMenu').checked = app.contentMenu;
    document.getElementById('searchUrl').value = mainWin.searchUrl || '';
}

// 初始化
async function init() {
    // 语言切换
    const langRaw = await litebrowser.getLang();
    lang = langRaw.settingsChange;
    langRoot = langRaw;
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
    // 加载配置
    loadSettings()
}

init();

// 保存背景图片
document.getElementById('backgroundFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // MIME类型检查
    if (!imageMIME[file.type]) {
        alert(lang.unsupprrtMIME);
        e.target.value = '';
        return;
    }

    // 读取文件
    const reader = new FileReader();
    reader.onload = () => {
        if (!reader.result) return;
        bgBase64 = reader.result.split(',').pop();
        const ext = imageMIME[file?.type] || 'jpg';
        bgFileName = 'background.' + ext;
    };
    reader.onerror = () => {
        const errorMsg = reader.error?.message || 'Unknown error';
        alert(lang.fileError + errorMsg);
    };
    reader.readAsDataURL(file);
});

// 重置背景图片
document.getElementById('backgroundReset').addEventListener('click', () => {
    // 清空选择框
    document.getElementById('backgroundFile').value = '';
    currentSettings.mainWin.background = '';
    bgFileName = '';
})

// 保存配置
document.getElementById('saveBtn').addEventListener('click', async () => {
    const data = {
        app: {
            useGPU: document.getElementById('useGPU').checked,
            toolBox: document.getElementById('toolBox').checked,
            history: document.getElementById('history').checked,
            topMenu: document.getElementById('topMenu').checked,
            insertjs: document.getElementById('insertjs').checked,
            normalMode: !document.getElementById('hwLimitMode').checked,
            contentMenu: document.getElementById('contentMenu').checked,
        },
        mainWin: {
            searchUrl: document.getElementById('searchUrl').value,
            background: bgFileName || currentSettings.mainWin.background || '',
        }
    };

    // URL合规性校验
    const isUrl = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(data.mainWin.searchUrl);
    const haveS = data.mainWin.searchUrl.includes('%s');
    if (!isUrl || !haveS) return alert(lang.urlInvalid);


    // 保存
    if (bgBase64 && bgFileName) {
        const isok = await litebrowser.setFile(bgFileName, bgBase64);
        if (!isok) return alert(langRoot?.permission?.write?.tip);
    }
    litebrowser.setSettings(data);
});

// 加载配置
document.getElementById('reloadBtn').addEventListener('click', loadSettings);