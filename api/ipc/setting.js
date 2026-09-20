import { debugLog, getFile, getLocale, DataPath, defaultSetting, jsonCheck, openSettings, safeJoin } from '../../core/index.js';
import { ipcMain, dialog } from 'electron';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const jsonPath = path.join(DataPath.basic, 'settings.json');
const langraw = getLocale();
const lang = langraw.ipc.setting;
const defaultFileStr = JSON.stringify(defaultSetting);
let bgImgName = '';

// 打开配置页面
ipcMain.on('settings-open-windows', openSettings);

// 获取配置
ipcMain.handle('settings-get', () => {
    if (!DataPath.access.RW) return defaultSetting;
    try {
        const dataRaw = JSON.parse(getFile(jsonPath, defaultFileStr));
        const data = jsonCheck(dataRaw, defaultSetting)
        bgImgName = String(data.mainWin.background).trim();
        return data;
    } catch (err) {
        debugLog('error', 'Failed to get settings:', err.message);
        dialog.showErrorBox(lang.get, err.message);
        return defaultSetting;
    }
});

// 解析背景图文件名
function resolveBgFile(name) {
    const file = safeJoin(DataPath.basic, String(name ?? '').trim());
    if (!file) return null;
    try {
        return fs.statSync(file).isFile() ? file : null;
    } catch (_) {
        return null;
    }
}

// 获取背景图像URL
ipcMain.handle('settings-get-img', (_, name) => {
    if (!DataPath.access.R || typeof name !== 'string' || name.trim() == '') return '';
    try {
        const file = resolveBgFile(name);
        if (!file) {
            debugLog('warn', 'Rejected background image name:', name);
            return '';
        }
        return pathToFileURL(file).href.trim();
    } catch (err) {
        debugLog('error', 'Failed to convent background img to local URL:', err.message)
        dialog.showErrorBox(lang.getImg, err.message);
        return '';
    }
})

// 修改配置
ipcMain.on('settings-set', (_, data) => {
    if (!DataPath.access.W || !data) return;
    try {
        const json = jsonCheck(data, defaultSetting);
        fs.writeFileSync(jsonPath, JSON.stringify(json));
        // 清理被替换掉的旧背景图 
        const newBg = String(json.mainWin.background ?? '').trim();
        if (bgImgName !== '' && newBg !== bgImgName) {
            const oldFile = resolveBgFile(bgImgName);
            if (oldFile) {
                try {
                    fs.rmSync(oldFile, { force: true });
                } catch (err) {
                    debugLog('warn', 'Failed to remove old background image:', err.message);
                }
            } else {
                debugLog('warn', 'Skip removing unsafe or missing background image:', bgImgName);
            }
        }
        bgImgName = newBg;
        debugLog('info', 'New app setting received:')
        debugLog('table', json.app);
        debugLog('info', 'New main windows setting received:')
        debugLog('table', json.mainWin);
        dialog.showMessageBox({
            type: 'info',
            title: 'Lite Browser',
            message: lang.message,
            buttons: ['OK'],
        })
    } catch (err) {
        debugLog('error', 'Failed to set settings:', err.message);
        dialog.showErrorBox(lang.set, err.message);
    }
});