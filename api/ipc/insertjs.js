import { debugLog, getFile, getLocale, DataPath } from '../../core/index.js';
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
const jsonPath_name = path.join(DataPath.insertjs, 'name.json');
const jsonPath_auto = path.join(DataPath.insertjs, 'auto.json');
const defaultJson_auto = '{"hosts":[]}';
const defaultJson_name = '{}';
const windowMap = new Map();
let autoJSCache = null;

const langRaw = getLocale();
const lang = langRaw.ipc.insertjs;

// 脚本 ID 白名单校验
const ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

// 读取脚本名映射
function readNameJson() {
    try {
        const data = JSON.parse(getFile(jsonPath_name, defaultJson_name));
        if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
        return data;
    } catch (err) {
        debugLog('warn', 'Failed to parse JS name list, using empty list:', err.message);
        return {};
    }
}

// 读取自动注入配置并规范化结构
function readAutoJson() {
    let raw;
    try {
        raw = JSON.parse(getFile(jsonPath_auto, defaultJson_auto));
    } catch (err) {
        debugLog('warn', 'Failed to parse auto inject config, using default:', err.message);
        raw = null;
    }

    // 格式化配置
    const data = { hosts: [] };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return data;
    const hosts = Array.isArray(raw.hosts) ? raw.hosts : [];
    for (const host of hosts) {
        if (typeof host !== 'string' || host === '') continue;
        data.hosts.push(host);
        const list = raw[host];
        data[host] = Array.isArray(list)
            ? list.filter((id) => typeof id === 'string' && ID_REGEX.test(id))
            : [];
    }
    return data;
}

// 窗口注册
ipcMain.on('insertjs-register-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    windowMap.set(win.id, win); // 保存窗口对象
    win.once('closed', () => windowMap.delete(win.id)) // 窗口销毁时删除保存的对象
});

// 获取脚本列表
ipcMain.handle('insertjs-get-jslist', () => {
    if (!DataPath.access.R) return { used: 0, error: lang.get.errorInfo, list: [] };
    const startat = performance.now();
    let json;
    try {
        const data = readNameJson();
        json = {
            used: performance.now() - startat,
            error: -1,
            list: data
        }
    } catch (err) {
        json = {
            used: performance.now() - startat,
            error: err.stack,
            list: []
        }
    }

    debugLog(json.error === -1 ? 'info' : 'warn', 'Get list of inserted JS files: Used:', json.used)
    return json
});

// 添加脚本
ipcMain.on('insertjs-add-js', async (event) => {
    try {
        if (!DataPath.access.W) throw new Error(lang.add.errorInfo);
        const win = BrowserWindow.fromWebContents(event.sender);
        // 打开文件选择对话框
        const options = {
            title: lang.add.title,
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: 'JavaScript', extensions: ['js'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        };
        const result = win
            ? await dialog.showOpenDialog(win, options)
            : await dialog.showOpenDialog(options);
        // 处理用户选择
        if (result.canceled || result.filePaths.length === 0) return;

        const idJson = readNameJson();
        for (const sourcePath of result.filePaths) {
            const fileName = path.basename(sourcePath);
            const ext = path.extname(fileName);
            const name = path.basename(fileName, ext);
            const nameID = crypto.randomUUID();
            const targetPath = path.join(DataPath.insertjs, nameID + '.js') ;
            // 复制文件
            try {
                await fs.promises.copyFile(sourcePath, targetPath);
            } catch (err) {
                debugLog('error', `Failed to copy JS file ${sourcePath}:`, err.message);
                dialog.showErrorBox(lang.add.copyError, err.message);
                return;
            }
            // 记录ID和名称对应关系
            idJson[nameID] = name;
        }
        try {
            fs.writeFileSync(jsonPath_name, JSON.stringify(idJson, null, 2), 'utf-8');
        } catch (err) {
            debugLog('error', 'Record ID mapping error:', err.message);
            dialog.showErrorBox(lang.add.IDError, err.message);
            return;
        }

        // 刷新列表
        if (win) win.reload();
    } catch (err) {
        debugLog('error', 'Add new entry error:', err.message);
        dialog.showErrorBox(lang.add.errorTitle, err.message);
    }
});

// 重命名脚本
ipcMain.on('insertjs-rename-js', (_, jsID, newName) => {
    try {
        if (!DataPath.access.RW) throw new Error(lang.rename.errorInfo);
        if (typeof jsID !== 'string' || !ID_REGEX.test(jsID)) throw new Error(lang.rename.errorInfo);
        if (typeof newName !== 'string') throw new Error(lang.rename.errorInfo);
        const name = newName.trim().slice(0, 200);
        if (name === '') return;
        // 更新配置文件
        const listJson = readNameJson();
        listJson[jsID] = name;
        fs.writeFileSync(jsonPath_name, JSON.stringify(listJson, null, 2), 'utf-8');
    } catch (err) {
        debugLog('error', 'Rename entry error:', err.message);
        dialog.showErrorBox(lang.rename.errorTitle, err.message);
    }
})

// 删除脚本
ipcMain.on('insertjs-remove-js', async (_, jsIDs) => {
    if (!Array.isArray(jsIDs)) return;
    const ids = jsIDs.filter((id) => typeof id === 'string' && ID_REGEX.test(id));
    if (ids.length === 0) return;

    // 删除文件
    try {
        if (!DataPath.access.W) throw new Error(lang.remove.errorInfo)
        for (const id of ids) {
            try {
                await fs.promises.unlink(path.join(DataPath.insertjs, id + '.js'));
            } catch (err) {
                if (err.code !== 'ENOENT') throw err;
            }
        }
    } catch (err) {
        debugLog('error', 'Failed to delete JS file:', err.message);
        dialog.showErrorBox(lang.remove.fileErrorTitle, err.message);
        return;
    }
    // 删除ID记录
    try {
        const idJson = readNameJson();
        for (const id of ids) delete idJson[id];
        fs.writeFileSync(jsonPath_name, JSON.stringify(idJson, null, 2), 'utf-8');
    } catch (err) {
        debugLog('error', 'Error deleting mapping record:', err.message);
        dialog.showErrorBox(lang.remove.IDErrorTitle, err.message);
    }
});

// 打开脚本存放目录
ipcMain.on('insertjs-open-dir', async () => {
    try {
        await fs.promises.mkdir(DataPath.insertjs, { recursive: true });
        await shell.openPath(DataPath.insertjs);
    } catch (err) {
        debugLog('warn', 'Can not open dir out side app:', DataPath.insertjs);
        dialog.showErrorBox(lang.opendir.errorTitle + DataPath.insertjs, err.message);
    }
});

// 注入脚本
ipcMain.on('insertjs-insert-js', (event, winid, jsIDs) => {
    const childwin = BrowserWindow.fromWebContents(event.sender);
    if (!childwin || childwin.isDestroyed()) return;
    try {
        if (!DataPath.access.R) throw new Error(lang.insert.errorInfo);
        if (!Array.isArray(jsIDs)) return;
        const mainWindow = Number.isInteger(winid) ? BrowserWindow.fromId(winid) : null;
        // 目标窗口已关闭时静默退出
        if (!mainWindow || mainWindow.isDestroyed()) return;
        for (const id of jsIDs.filter((value) => typeof value === 'string' && ID_REGEX.test(value))) {
            const content = fs.readFileSync(path.join(DataPath.insertjs, id + '.js'), 'utf-8');
            // 插入脚本
            mainWindow.webContents.executeJavaScript(content).catch(err => {
                debugLog('error', 'Script execution failed:', err?.message || err);
            });
        }
    } catch (err) {
        debugLog('error', 'Script injection error:', err.message);
        dialog.showErrorBox(lang.insert.errorTitle, err.message);
    } finally {
        // 关闭子窗口
        if (childwin) childwin.close();
    }
});

// 获取当前网址的自动注入脚本列表
ipcMain.handle('insertjs-get-auto-js', (_, winid) => {
    if (!DataPath.access.R) return { errID: -1, hosts: [] };
    try {
        const win = Number.isInteger(winid) ? BrowserWindow.fromId(winid) : null;
        if (!win || win.isDestroyed()) return { errID: -1, hosts: [] };
        const url = new URL(win.webContents.getURL());
        if (url.host === '') return { errID: -1, hosts: [] };
        const listJson = readAutoJson();
        return { errID: 0, hosts: (listJson.hosts.includes(url.host)) ? listJson[url.host] : [] };
    } catch (err) {
        debugLog('warn', 'Failed to get auto inject list:', err.message);
        return { errID: -1, hosts: [] };
    }
});

// 更新当前网址的自动注入脚本列表
ipcMain.on('insertjs-change-auto-js', (_, winid, jsIDs) => {
    try {
        if (!DataPath.access.RW) throw new Error(lang.changeAuto.errorInfo)
        if (!Array.isArray(jsIDs)) return;
        const ids = jsIDs.filter((id) => typeof id === 'string' && ID_REGEX.test(id));
        const win = Number.isInteger(winid) ? BrowserWindow.fromId(winid) : null;
        if (!win || win.isDestroyed()) return;
        const url = new URL(win.webContents.getURL());
        if (url.host === '') return;
        // 更新配置文件
        if (autoJSCache == null) autoJSCache = readAutoJson();
        if (autoJSCache.hosts.includes(url.host)) {
            if (ids.length === 0) {
                delete autoJSCache[url.host];
                autoJSCache.hosts.splice(autoJSCache.hosts.indexOf(url.host), 1);
            } else {
                autoJSCache[url.host] = ids;
            }
        } else {
            if (ids.length !== 0) {
                autoJSCache.hosts.push(url.host);
                autoJSCache[url.host] = ids;
            }
        }
        fs.writeFileSync(jsonPath_auto, JSON.stringify(autoJSCache, null, 2), 'utf-8');
    } catch (err) {
        debugLog('error', 'Error modifying the automatic injection list:', err.message);
        dialog.showErrorBox(lang.changeAuto.errorTitle, err.message);
    }
});

// 自动注入脚本
ipcMain.on('insertjs-auto-js-insert', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    try {
        if (!DataPath.access.R) throw new Error(lang.autoInsert.errorInfo);
        // 获取窗口网址
        const urlStr = win.webContents.getURL();
        if (urlStr === '') return;
        const urlObj = new URL(urlStr);
        // 获取host对应的脚本列表
        const host = urlObj.host;
        if (host === '') return;
        autoJSCache ??= readAutoJson();
        let changed = false;
        // 检查文件是否存在，不存在则移除
        if (autoJSCache.hosts.includes(host)) {
            const jsList = autoJSCache[host];
            for (let i = jsList.length - 1; i >= 0; i--) {
                if (!fs.existsSync(path.join(DataPath.insertjs, jsList[i] + '.js'))) {
                    jsList.splice(i, 1);
                    changed = true;
                }
            }
            // 插入剩余存在的脚本
            for (const jsid of jsList) {
                const content = fs.readFileSync(path.join(DataPath.insertjs, jsid + '.js'), 'utf-8');
                win.webContents.executeJavaScript(content).catch(err => {
                    debugLog('error', 'Auto script execution failed:', err?.message || err);
                }); // 插入脚本
            }
            // 如列表有变更则保存
            if (changed) {
                if (jsList.length === 0) {
                    delete autoJSCache[host];
                    autoJSCache.hosts.splice(autoJSCache.hosts.indexOf(host), 1);
                }
                fs.writeFileSync(jsonPath_auto, JSON.stringify(autoJSCache, null, 2), 'utf-8');
            }
        }
    } catch (err) {
        debugLog('error', 'Auto script injection error:', err.message);
        dialog.showErrorBox(lang.autoInsert.errorTitle, err.message);
    }
});
