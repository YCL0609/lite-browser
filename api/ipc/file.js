import { getFile, getLocale, debugLog, DataPath } from '../../core/index.js';
import { ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
const langRaw = getLocale();
const lang = langRaw.ipc.file;

// 获取文件
ipcMain.handle('localFile-get', (_, name, type) => {
    if (!DataPath.access.R || !name || !type) return '';
    try {
        const file = path.join(DataPath.basic, name);
        debugLog('info', `Getting file ${name} using mode '${type}'`)
        return getFile(file, null, type);
    } catch (err) {
        debugLog('error', 'Failed to get file:', err.message);
        dialog.showErrorBox(lang.get.errorTitle, err.message);
        return '';
    }
});

// 设置文件
ipcMain.handle('localFile-set', (_, name, base64) => {
    if (!DataPath.access.W || !name || !base64) return true;
    try {
        if (!DataPath.access.W) throw new Error(lang.add.errorInfo);
        const buffer = Buffer.from(base64, 'base64');
        debugLog('info', 'Setting file', name, ', data length', buffer.length)
        const file = path.join(DataPath.basic, name);
        fs.writeFileSync(file, buffer);
        return true;
    } catch (err) {
        debugLog('error', 'Failed to set file:', err.message);
        dialog.showErrorBox(lang.add.errorTitle, err.message);
        return false;
    }
});