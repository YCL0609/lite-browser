import { debugLog, getFile, getLocale, DataPath, defaultSetting, jsonCheck, openSettings } from '../../core/index.js';
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
    if (!DataPath.access.RW) return defaultCfg;
    try {
        const dataRaw = JSON.parse(getFile(jsonPath, defaultFileStr));
        const data = jsonCheck(dataRaw, defaultSetting)
        bgImgName = String(data.mainWin.background).trim();
        return data;
    } catch (err) {
        debugLog('error', 'Failed to get settings:', err.message);
        dialog.showErrorBox(lang.get, err.message);
    }
});

// 获取背景图像URL
ipcMain.handle('settings-get-img', (_, name) => {
    if (!DataPath.access.R || name == '') return '';
    try {
        return pathToFileURL(path.resolve(DataPath.basic, name)).href.trim();
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
        if (bgImgName !== '' && json.mainWin.background !== bgImgName) {
            fs.unlinkSync(path.join(DataPath.basic, bgImgName));
            bgImgName = json.mainWin.background;
        }
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