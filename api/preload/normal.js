const { ipcRenderer, contextBridge } = require('electron');
let contextmenu = true;
let topmenu = true;

// 参数获取
const configArg = process.argv.find(arg => arg.startsWith('--app-config='));
let passedConfig = {};
if (configArg) {
  try {
    const parsed = JSON.parse(configArg.substring(configArg.indexOf('=') + 1));
    if (parsed && typeof parsed === 'object') passedConfig = parsed;
  } catch (_) { }
}
const cfg = {
  topMenu: true,
  insertjs: true,
  contentMenu: true,
  ...passedConfig
};

let api = {};

// 顶部菜单
if (cfg.topMenu) api.switchTopMenu = () => {
  topmenu = !topmenu;
  ipcRenderer.send('menu-switch-top-menu', topmenu);
};

// JS 注入
if (cfg.insertjs) api.registerWindow = () => ipcRenderer.send('insertjs-register-window');

// 右键菜单
if (cfg.contentMenu) api.switchContextMenu = () => contextmenu = !contextmenu;

// 暴露接口
contextBridge.exposeInMainWorld('litebrowser', api);

// 页面加载完成事件
window.addEventListener('DOMContentLoaded', () => {
  // 自动化 JS 注入 (仅在顶层框架触发，避免 iframe 重复注入)
  if (cfg.insertjs && window.top === window.self) ipcRenderer.send('insertjs-auto-js-insert');

  // 右键菜单事件
  if (cfg.contentMenu) {
    window.addEventListener('contextmenu', (e) => {
      if (!contextmenu) return;
      e.preventDefault();
      ipcRenderer.send('menu-contextmenu', e.clientX, e.clientY);
    });
  }
});