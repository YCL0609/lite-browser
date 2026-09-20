import { getFile, getLocale, debugLog, DataPath, safeJoin } from '../../core/index.js';
import { ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
const langRaw = getLocale();
const lang = langRaw.ipc.file;

// 允许使用的读取编码白名单
const allowType = new Set([
    'utf-8', 'utf8', 'base64', 'base64url', 'hex',
    'latin1', 'binary', 'ascii', 'utf16le', 'utf-16le', 'ucs2', 'ucs-2'
]);

// 获取文件
ipcMain.handle('localFile-get', (_, name, type) => {
    if (!DataPath.access.R || typeof name !== 'string' || !allowType.has(String(type))) return '';
    const file = safeJoin(DataPath.basic, name);
    if (!file) {
        debugLog('warn', 'Rejected unsafe file name:', String(name));
        return '';
    }
    try {
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
    if (!DataPath.access.W || typeof name !== 'string' || typeof base64 !== 'string') return false;
    const file = safeJoin(DataPath.basic, name);
    if (!file) {
        debugLog('warn', 'Rejected unsafe file name:', String(name));
        return false;
    }
    try {
        const buffer = Buffer.from(base64, 'base64');
        debugLog('info', 'Setting file', name, ', data length', buffer.length)
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, buffer);
        return true;
    } catch (err) {
        debugLog('error', 'Failed to set file:', err.message);
        dialog.showErrorBox(lang.add.errorTitle, err.message);
        return false;
    }
});
