import { DataPath, debugLog, getFile, getLocale } from '../../../core/index.js';
import { isolateImage, parseJson } from './common.js';
import { pathToFileURL } from 'node:url';
import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
const langRaw = getLocale();
const lang = langRaw.ipc.tools;
const defaultNote = langRaw.tools.notepad.default;
const imgListFile = path.join(DataPath.tools, 'notepad', 'imglist.json');
let imgIDsCache = null;
let notepadFiles = [];
for (let i = 0; i < 9; i++) notepadFiles.push(path.join(DataPath.tools, 'notepad', (i + 1) + '.txt'));

// 读取笔记内容
ipcMain.handle('tools-notepad-get', (_, id) => {
    // 合规性和存储目录权限检查
    if (typeof id !== 'number' || id < 1 || id > 9 || !Number.isInteger(id)) return { status: false, message: lang.notepad.IDError };
    if (!DataPath.access.R) return { status: true, message: defaultNote };

    try {
        const rawHtml = getFile(notepadFiles[id - 1], defaultNote);
        // 还原图像url
        const imgDir = path.join(DataPath.tools, 'notepad', id.toString());
        const content = rawHtml.replace(/\$([^$]+)\$/g, (_, filename) => {
            const filePath = path.join(imgDir, path.basename(filename));
            return pathToFileURL(filePath).href;
        });

        return { status: true, message: content };
    } catch (err) {
        debugLog('error', 'Failed to get notepad tool content - ID:', id, 'Error:', err.message);
        return { status: false, message: err.message };
    }
});


// 保存笔记内容
ipcMain.handle('tools-notepad-set', (_, content, id) => {
    // 合规性和存储目录权限检查
    if (typeof id !== 'number' || id < 1 || id > 9 || !Number.isInteger(id)) {
        debugLog('warn', `Invalid parameter 'id': ${String(id)}`)
        return { status: false, message: lang.notepad.IDError };
    }
    if (!DataPath.access.W) return { status: false, message: langRaw.permission.write.info };

    try {
        // 分离图像
        const imgDir = path.join(DataPath.tools, 'notepad', id.toString());
        if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
        imgIDsCache ??= parseJson(getFile(imgListFile, '{}'), {});
        imgIDsCache[id] ??= [];
        const resualt = isolateImage(content, imgDir, imgIDsCache[id]);
        if (resualt.isUpdate) {
            imgIDsCache[id] = resualt.IDCache;
            fs.writeFileSync(imgListFile, JSON.stringify(imgIDsCache), 'utf-8');
        }
        // 写入剩余文件
        fs.writeFileSync(notepadFiles[id - 1], resualt.html, 'utf-8');
        return { status: true, message: 'OK' };
    } catch (err) {
        debugLog('error', 'Code tool content update failed - ID:', id, 'Error:', err.message);
        return { status: false, message: err.message }
    }
});

// 删除笔记内容
ipcMain.handle('tools-notepad-del', (_, id) => {
    // 合规性和存储目录权限检查
    if (typeof id !== 'number' || id < 1 || id > 9 || !Number.isInteger(id)) return { status: false, message: lang.notepad.IDError };
    if (!DataPath.access.W) return { status: false, message: langRaw.permission.write.info };

    try {
        // 删除图片文件夹和id记录
        const imgDir = path.join(DataPath.tools, 'notepad', id.toString());
        if (fs.existsSync(imgDir)) fs.rmSync(imgDir, { force: true, recursive: true });
        imgIDsCache ??= parseJson(getFile(imgListFile, '{}'), {});
        if (imgIDsCache[id]) delete imgIDsCache[id];
        fs.writeFileSync(imgListFile, JSON.stringify(imgIDsCache), 'utf-8');
        // 删除笔记
        fs.unlinkSync(notepadFiles[id - 1]);

        return { status: true, message: 'OK' };
    } catch (err) {
        debugLog('error', 'Failed to delete notepad tool content - ID:', id, 'Error:', err.message);
        return { status: false, message: err.message }
    }
});