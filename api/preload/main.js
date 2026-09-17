const { ipcRenderer, contextBridge } = require('electron');
const access = { R: false, W: false }
let contextmenu = true;
let topmenu = true;
let cfg = {};

try {
  // 配置参数获取
  const configArg = process.argv.find(arg => arg.startsWith('--app-config='));
  const cfgRaw = configArg.substring(configArg.indexOf('=') + 1);
  cfg = JSON.parse(atob(cfgRaw));

  // 目录权限参数获取
  const accessArg = process.argv.find(arg => arg.startsWith('--dir-access='));
  const dirAccess = parseInt(accessArg.split('=')[1]) ?? 0;
  access.R = (dirAccess >> 0) & 1
  access.W = (dirAccess >> 1) & 1
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
      ipcRenderer.send('menu-contextmenu', { x: e.clientX, y: e.clientY });
    });
  }
});