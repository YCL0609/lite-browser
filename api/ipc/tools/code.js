import { debugLog, getFile, getLocale, DataPath } from '../../../core/index.js';
import { isolateImage, parseJson } from './common.js';
import { pathToFileURL } from 'node:url';
import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
const langRaw = getLocale();
const lang = langRaw.ipc.tools;
const defaultCode = langRaw.tools.code.default;
const imgListFile = path.join(DataPath.tools, 'code', 'imglist.json');
const imgDir = path.join(DataPath.tools, 'code', 'imgs');
let imgIDsCache = null;
let codeFiles = [];
['html', 'css', 'js'].forEach(e => codeFiles[e] = path.join(DataPath.tools, 'code', 'index.' + e));

// 读取代码编辑器内容
ipcMain.handle('tools-code-get', async () => {
    // 存储目录权限检查
    if (!DataPath.access.R) return { status: true, message: { html: defaultCode.html, css: defaultCode.css, js: defaultCode.js } };

    try {
        const [rawHtml, css, js] = await Promise.all([
            getFile(codeFiles.html, defaultCode.html),
            getFile(codeFiles.css, defaultCode.css),
            getFile(codeFiles.js, defaultCode.js)
        ]);
        // 还原图像url
        const html = rawHtml.replace(/\$([^$]+)\$/g, (_, filename) => {
            const filePath = path.join(imgDir, path.basename(filename));
            return pathToFileURL(filePath).href;
        });
        return { status: true, message: { html: html, css: css, js: js } };
    } catch (err) {
        debugLog('error', 'Failed to get code tool content:', err.message);
        return { status: false, message: err.message };
    }
});


// 保存代码编辑器内容
ipcMain.handle('tools-code-set', (_, content, type) => {
    // 合规性和存储目录权限检查
    if (!['html', 'css', 'js'].includes(type)) return { status: false, message: lang.code.typeError };
    if (!DataPath.access.W) return { status: false, message: langRaw.permission.write.info };

    try {
        let output = content;
        if (type == 'html') {
            // 分离图像
            imgIDsCache ??= parseJson(getFile(imgListFile, '[]'), []);
            if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
            const resualt = isolateImage(content, imgDir, imgIDsCache);
            if (resualt.isUpdate) {
                imgIDsCache = resualt.IDCache;
                fs.writeFileSync(imgListFile, JSON.stringify(imgIDsCache));
            }
            output = resualt.html;
        }
        fs.writeFileSync(codeFiles[type], output, 'utf-8');
        return { status: true, message: 'OK' };
    } catch (err) {
        debugLog('error', `Code tool content '${type}' update failed:`, err.message);
        return { status: false, message: err.message };
    }
});

// 删除代码编辑器内容
ipcMain.handle('tools-code-del', () => {
    // 存储目录权限检查
    if (!DataPath.access.W) return { status: false, message: langRaw.permission.write.info };

    try {
        fs.rmSync(path.join(DataPath.tools, 'code'), { force: true, recursive: true });
        return { status: true, message: 'OK' };
    } catch (err) {
        debugLog('error', 'Failed to delete code tool content:', err.message);
        return { status: false, message: err.message };
    }
});