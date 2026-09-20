const { ipcRenderer, contextBridge } = require('electron');
const access = { R: false, W: false }
let contextmenu = true;
let topmenu = true;
let cfg = { app: {}, mainWin: {} };

// 读取命令行参数
function getArg(name) {
  const prefix = name + '=';
  const arg = process.argv.find(item => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

// 解码 base64 编码的 UTF-8 字符串 (atob 仅支持 Latin-1)
function decodeBase64(raw) {
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

try {
  // 配置参数获取
  const cfgRaw = getArg('--app-config');
  if (!cfgRaw) throw new Error("Missing the '--app-config' argument");
  cfg = JSON.parse(decodeBase64(cfgRaw));
  cfg.app ??= {};
  cfg.mainWin ??= {};

  // 目录权限参数获取
  const dirAccess = Number.parseInt(getArg('--dir-access') ?? '0', 10) || 0;
  access.R = (dirAccess & 1) === 1;
  access.W = (dirAccess & 2) === 2;
} catch (err) {
  alert('Preload script error: Unable to parse command line arguments!')
  console.error('Preload script error:', err.stack)
}

// 动态API生成
const api = {};
try {
  // 顶部菜单
  if (cfg.app.topMenu) api.switchTopMenu = () => {
    topmenu = !topmenu;
    ipcRenderer.send('menu-switch-top-menu', topmenu);
  }

  // JS 注入
  if (cfg.app.insertjs) api.registerWindow = () => ipcRenderer.send('insertjs-register-window');

  // 右键菜单
  if (cfg.app.contentMenu) api.switchContextMenu = () => contextmenu = !contextmenu;
} catch (err) {
  alert('Preload script error: Dynamic API generation failed!')
  console.error('Preload script error:', err.stack)
}

// 暴露接口
contextBridge.exposeInMainWorld('litebrowser', {
  // 主页面设置
  backgroundName: cfg.mainWin.background,
  getBackgroundURL: (name) => ipcRenderer.invoke('settings-get-img', name),
  searchUrl: cfg.mainWin.searchUrl,
  custom: cfg.mainWin.custom,
  // 数据目录权限
  dataDirAccess: access,
  // 新建窗口
  newWindow: (url) => ipcRenderer.send('window-open', url),
  // 打开设置
  openSetings: () => ipcRenderer.send('settings-open-windows'),
  // 书签相关
  getBookmarks: () => ipcRenderer.invoke('bookmarks-get'),
  setBookmarks: (data) => ipcRenderer.send('bookmarks-set', data),
  // 获取翻译文件
  getLang: () => ipcRenderer.invoke('languageJson-get'),
  // 获取文件
  getFile: (name, type) => ipcRenderer.invoke('localFile-get', name, type),
  // 动态api
  ...api,
});

// 页面加载完成事件
window.addEventListener('DOMContentLoaded', () => {
  if (cfg.app.contentMenu) {
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ipcRenderer.send('menu-contextmenu', e.clientX, e.clientY);
    });
  }
});
