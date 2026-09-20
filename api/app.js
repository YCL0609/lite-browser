import { AppPath, DataPath, IconPath, debugLog, getSettings } from '../core/index.js';
import { app, session, BrowserWindow } from 'electron';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs'
const settings = getSettings();
const errorPath = path.join(AppPath, 'html', settings.app.normalMode ? 'normal' : 'limited', 'error', 'index.html');
const historyPath = path.join(DataPath.basic, 'history.txt')

// 所有窗口在独立线程中打开
app.on('web-contents-created', (_, contents) => {
  const mainSession = session.fromPartition('persist:main');
  contents.setWindowOpenHandler((details) => {
    if (contents.session === mainSession) return { action: 'allow' };
    setImmediate(() => {
      const newWin = new BrowserWindow({
        width: 800,
        height: 600,
        icon: IconPath,
        webPreferences: {
          sandbox: true,
          spellcheck: false,
          webSecurity: true,
          nodeIntegration: false,
          contextIsolation: true,
          session: session.defaultSession
        }
      });
      newWin.loadURL(details.url).catch(err => {
        debugLog('warn', 'Failed to open new window URL:', details.url, err?.message || err);
      });
    });
    return { action: 'deny' }
  })
});

// 为所有窗口添加错误处理函数
app.on('browser-window-created', (_, window) => {
  window.webContents.on('did-fail-load', (event, code, desc, errURL, isMainFrame) => {
    if (!isMainFrame) return; // 仅处理主框架加载失败
    event.preventDefault();
    debugLog('warn', `URL Load failed: Code:${code} - Errdesc:${desc} - URL:${errURL}`);

    // 拼接 URL
    const url = new URL(pathToFileURL(errorPath).href);
    url.search = new URLSearchParams({
      code: String(code),
      desc: String(desc),
      time: new Date().toTimeString(),
      url: String(errURL)
    }).toString();

    // 加载本地错误页面
    window.loadURL(url.href).catch(err => {
      debugLog('error', 'Failed to load error page:', err?.message || err);
    });
  });
});

// 历史记录
app.on('web-contents-created', (_, webContents) => {
  if (settings.app.history) {
    webContents.on('did-navigate', (_, url, httpCode) => {
      if (url.startsWith('file://') || url.startsWith('devtools://')) return; // 本地文件不记录历史
      debugLog('info', 'NewUrl', httpCode, url);
      fs.appendFile(historyPath, `${Date.now()} ${url}\n`, (err) => {
        if (err) debugLog('warn', 'Failed to write history file:', err.message);
      });
    })
  }
});
