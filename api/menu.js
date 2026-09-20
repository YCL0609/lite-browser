import { openToolsWindow, openInsertJS, getLocale, getSettings, isMac, toolList, debugLog, openHistory } from '../core/index.js';
import { shell, clipboard, dialog, BrowserWindow, Menu } from 'electron';

// 获取翻译文件和配置文件
const lang = getLocale();
const settings = getSettings();

// 工具菜单
const toolsMenu = settings.app.toolBox ? {
  label: lang.menu.tools.index,
  submenu: toolList.map((id, index) => ({
    label: lang.tools.name[index],
    accelerator: `Alt+${index + 1}`,
    click: () => openToolsWindow(id),
  }))
} : null;

// 编辑菜单
const editText = lang.menu.edit;
const editMenu = {
  label: editText.index,
  submenu: [
    { label: editText.undo, accelerator: 'CmdOrCtrl+Z', role: 'undo' },
    { label: editText.redo, accelerator: 'CmdOrCtrl+Y', role: 'redo' },
    { label: editText.selectall, accelerator: 'CmdOrCtrl+A', role: 'selectall' },
    { type: 'separator' },
    { label: editText.cut, accelerator: 'CmdOrCtrl+X', role: 'cut' },
    { label: editText.copy, accelerator: 'CmdOrCtrl+C', role: 'copy' },
    { label: editText.paste, accelerator: 'CmdOrCtrl+V', role: 'paste' },
    { label: editText.pastetext, accelerator: 'CmdOrCtrl+Shift+V', role: 'pasteAndMatchStyle' }
  ]
};

// 控制菜单
const ctrlText = lang.menu.control;
const controlMenu_Page = [
  {
    label: ctrlText.back, accelerator: 'Alt+Left',
    click: () => {
      const win = BrowserWindow.getFocusedWindow()?.webContents?.navigationHistory;
      if (win && win.canGoBack()) win.goBack();
    }
  },
  { label: ctrlText.reload, accelerator: 'F5', role: 'reload' },
  { label: ctrlText.forceReload, accelerator: 'Shift+F5', role: 'forceReload' },
  {
    label: ctrlText.forward, accelerator: 'Alt+Right',
    click: () => {
      const win = BrowserWindow.getFocusedWindow()?.webContents?.navigationHistory;
      if (win && win.canGoForward()) win.goForward();
    }
  }
];
const controlMenu_Window = [
  { label: ctrlText.fullScreen, accelerator: 'F11', role: 'toggleFullScreen' },
  {
    label: ctrlText.showurl.index, accelerator: 'F10',
    click: async () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return;
      const url = win.webContents.getURL();
      dialog.showMessageBox({
        type: 'info',
        title: ctrlText.showurl.title,
        message: url,
        buttons: [ctrlText.showurl.copyBtn, lang.public.close],
        defaultId: 1,
        cancelId: 1
      }).then(code => {
        if (code.response === 0) {
          clipboard.writeText(url);
        }
      })
    }
  },
  { label: ctrlText.devTools, accelerator: 'F12', role: 'toggleDevTools' },
  {
    label: ctrlText.openOutside, accelerator: 'F9',
    click: () => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return;
      const url = win.webContents.getURL();
      if (url) shell.openExternal(url);
    }
  }, {
    label: ctrlText.openHistory,
    accelerator: 'Ctrl+H',
    click: openHistory,
  }
];

// 菜单切换
const menuSwitch = [{
  label: ctrlText.switchTopMenu, accelerator: 'F8',
  click: () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.executeJavaScript('litebrowser.switchTopMenu()')
      .catch(err => debugLog('warn', 'executeJavaScript error:', err?.message || err));
  }
}, {
  label: ctrlText.switchContentMenu, accelerator: 'F7',
  click: () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.executeJavaScript('litebrowser.switchContextMenu()')
      .catch(err => debugLog('warn', 'executeJavaScript error:', err?.message || err));
  }
}];

// JavaScript注入
const JSInsert = settings?.app.insertjs ? {
  label: ctrlText.insertJS,
  accelerator: 'F1',
  click: openInsertJS
} : null;

// 右键菜单
const contextMenu = settings?.app.contentMenu ? Menu.buildFromTemplate([
  editMenu,
  {
    label: ctrlText.index,
    submenu: [
      ...controlMenu_Window,
      ...(isMac ? [JSInsert] : [])
    ].filter(Boolean)
  },
  { type: 'separator' },
  ...controlMenu_Page,
  { type: 'separator' },
  ...menuSwitch,
  JSInsert,
].filter(Boolean)) : null;

// 顶部菜单
const topMenu = settings?.app.topMenu ? Menu.buildFromTemplate([
  toolsMenu,
  editMenu,
  {
    label: ctrlText.index,
    submenu: [
      ...controlMenu_Page,
      { type: 'separator' },
      ...controlMenu_Window,
      { type: 'separator' },
      ...menuSwitch,
      ...(isMac ? [JSInsert] : [])
    ].filter(Boolean)
  },
  ...(isMac ? [] : [JSInsert]),
].filter(Boolean)) : null;

export { contextMenu, topMenu as TopMenu };