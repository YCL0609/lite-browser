import { getLocale, getSettings, IconPath, debugLog } from '../../core/index.js';
import { ipcMain, BrowserWindow, session } from 'electron';
const settingsRaw = getSettings();
const cfg = JSON.stringify(settingsRaw?.app)

// 正常新窗口
ipcMain.on('window-open', (_, url) => {
  if (typeof url !== 'string' || url.trim() === '') return;
  const target = url.trim();
  // URL 合规性校验 (避免 loadURL 抛出同步异常)
  try {
    const parsed = new URL(target);
    if (!parsed.protocol) return;
  } catch (err) {
    debugLog('warn', 'Rejected invalid URL:', target);
    return;
  }
  const newwin = new BrowserWindow({
    width: 800,
    height: 600,
    icon: IconPath,
    webPreferences: {
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      nodeIntegration: false,
      contextIsolation: true,
      session: session.defaultSession,
      additionalArguments: ['--app-config=' + cfg],
    },
  });
  newwin.loadURL(target).catch(err => {
    debugLog('warn', 'Failed to load URL:', target, err?.message || err);
  });
});

// 获取语言文件
const lang = getLocale();
ipcMain.handle('languageJson-get', () => lang);