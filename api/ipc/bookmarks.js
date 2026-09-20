import { getFile, getLocale, debugLog, DataPath } from '../../core/index.js';
import { ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
const jsonPath = path.join(DataPath.basic, 'bookmarks.json');
const defaultJson = '{}';
const langRaw = getLocale();
const lang = langRaw.ipc.file;

// 合规性校验
function jsonFilter(data) {
  if (!data || typeof data !== 'object') return {};
  let result = {};
  for (const key in data) {
    if (!/^\d+$/.test(key)) continue;
    const item = data[key];
    if (!item || typeof item !== 'object') continue;
    if (typeof item.name !== 'string') continue;
    if (typeof item.url !== 'string') continue;
    if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(item.url)) continue;
    result[key] = {
      url: item.url,
      name: item.name,
    };
  }
  return result;
}

// 获取书签
ipcMain.handle('bookmarks-get', () => {
  if (!DataPath.access.R) return {};
  try {
    debugLog('info', 'Getting bookmark file \'bookmarks.json\'')
    const raw = getFile(jsonPath, defaultJson)
    const jsonRaw = JSON.parse(raw);
    return jsonFilter(jsonRaw);
  } catch (err) {
    debugLog('error', 'Failed to get bookmark list:', err.message);
    dialog.showErrorBox(lang.get.errorTitle, err.message);
    return {};
  }
});

// 添加书签
ipcMain.on('bookmarks-set', (_, data) => {
  try {
    if (!DataPath.access.W) throw new Error(lang.add.errorInfo);
    const filtered = jsonFilter(data);
    debugLog('info', 'Saving new bookmark list:')
    debugLog('table', filtered)
    const dir = path.dirname(jsonPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(filtered), 'utf-8');
  } catch (err) {
    debugLog('error', 'Failed to set bookmark:', err.message);
    dialog.showErrorBox(lang.add.errorTitle, err.message);
  }
});