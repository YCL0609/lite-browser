import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

/**************** 程序基础 ****************/

// 调试相关
const _envDebug = (process.env.LB_DEBUG || '').trim().toLowerCase();
const _envTrace = (process.env.LB_DEBUG_TRACE || '').trim().toLowerCase();
const _envLog = (process.env.LB_LOG || '').trim().toLowerCase();
const isDebug = ['true', '1', 'yes'].includes(_envDebug);
const isTrace = ['true', '1', 'yes'].includes(_envTrace);
const isLog = isDebug || ['true', '1', 'yes'].includes(_envLog);

// 是否为 Mac 环境
const isMac = process.platform === 'darwin';

// 代码文件主目录
const AppPath = app.getAppPath();

// 支持的语言
const supportLang = ['en', 'zh'];

// 窗口图标
const _iconDir = app.isPackaged ? path.join(AppPath, '..', 'icons') : path.join(AppPath, 'extrares', 'icons');
const IconPath = (() => {
    const iconMap = {
        'win32': 'icon.ico',
        'darwin': 'icon.icns',
        'linux': 'icon.png'
    };
    const iconName = iconMap[process.platform] || 'icon.png';
    return path.join(_iconDir, iconName);
})();

// 小工具
const toolList = ["notepad", "paint", "code", "base64", "markdown"];

// 默认配置
const defaultSetting = {
    app: {
        useGPU: true,
        toolBox: true,
        history: true,
        topMenu: true,
        insertjs: true,
        normalMode: true,
        contentMenu: true,
    },
    mainWin: {
        searchUrl: 'https://www.bing.com/search?q=%s',
        background: '',
    },
};

/**************** 数据目录 ****************/

// 默认数据目录
const _defaultDataPath = (() => {
    // 生产环境
    if (app.isPackaged) {
        // macOS
        if (process.platform === 'darwin') {
            const pwd = path.normalize(AppPath).toLowerCase();
            const homeDir = os.homedir();
            const systemApps = path.normalize('/applications') + '/';
            const userApps = path.join(homeDir, 'applications').toLowerCase() + '/';
            if (pwd.startsWith(systemApps) || pwd.startsWith(userApps)) {
                // 位于系统或用户的 Applications 目录下 (使用 ~/Library/Application Support/LiteBrowser 文件夹)
                return path.join(homeDir, 'Library', 'Application Support', 'LiteBrowser');
            } else {
                // 便携版本使用 .app 同级目录的 Data 文件夹
                return path.resolve(AppPath, '../../../../Data');
            }
        }

        // Windows/Linux (主程序同级目录的 Data 文件夹)
        return path.resolve(AppPath, '../../Data');
    }

    // 开发环境
    return path.join(AppPath, 'resources');
})();

// 是否使用临时目录
let _useTempPath = false

// 最终主数据目录
const _dirPath = (() => {
    let dir = process.env.LB_DATA_PATH || _defaultDataPath;
    if (dir === '/dev/null') return dir;

    try {
        const stat = fs.statSync(dir);
        _useTempPath = !stat.isDirectory();
    } catch (err) {
        if (err.code === 'ENOENT') {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (_) { _useTempPath = true }
        } else { _useTempPath = true }
    }

    // 临时目录
    if (_useTempPath) {
        try {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-browser-'));
        } catch (err) { dir = "" }
    }
    return dir
})();

// 数据目录写权限检测
const _dirCanWrite = (() => {
    try {
        fs.accessSync(_dirPath, fs.constants.W_OK | fs.constants.X_OK);
        return true;
    } catch (_) { return false }
})();

// 数据目录读权限检测
const _dirCanRead = (() => {
    try {
        fs.accessSync(_dirPath, fs.constants.R_OK | fs.constants.X_OK);
        return true;
    } catch (_) { return false }
})();

// 数据目录
const DataPath = Object.freeze({
    basic: _dirPath,
    tools: path.join(_dirPath, 'tools'), // 小工具存储目录
    insertjs: path.join(_dirPath, 'insertjs'), // js插入相关文件存储目录
    userData: process.env.LB_USERDATA_PATH || path.join(_dirPath, 'userData'), // chromium用户数据存储目录
    usetmp: _useTempPath,
    access: Object.freeze({
        R: _dirCanRead,
        W: _dirCanWrite,
        RW: _dirCanRead && _dirCanWrite,
    }),
})

export {
    isMac,
    isLog,
    AppPath,
    isDebug,
    isTrace,
    toolList,
    DataPath,
    IconPath,
    supportLang,
    defaultSetting,
}