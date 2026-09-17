import { AppPath, IconPath, DataPath } from './config.js';
import { BrowserWindow, session } from 'electron';
import { debugLog, debugMenu } from './debug.js';
import { pathToFileURL } from 'node:url';
import { getSettings } from './basic.js';
import path from 'node:path';
const settings = getSettings();
let _nomenuSession = null;

function _getNomenuSession() {
    return _nomenuSession ??= session.fromPartition('persist:nomenu');
}

/**
 * 打开工具窗口 (位于 `html/tools/<name>.html`)
 * @param {string} [name=''] - 工具页面的文件名，为空时不做任何操作
 * @returns {void}
 */
function openToolsWindow(name = '') {
    if (name.trim() == '' || !settings.app.toolsBox) return;
    debugLog('info', `Opening tools window: ${name}`);
    const newwin = new BrowserWindow({
        width: 1024,
        height: 600,
        icon: IconPath,
        webPreferences: {
            sandbox: true,
            spellcheck: false,
            webSecurity: true,
            nodeIntegration: false,
            contextIsolation: true,
            session: _getNomenuSession(),
            preload: path.join(AppPath, 'api', 'preload', 'tools.js'),
            additionalArguments: [
                '--dir-access=' + ((DataPath.access.R ? 1 : 0) | (DataPath.access.W ? 2 : 0))
            ],
        }
    });
    newwin.setMenu(debugMenu);
    newwin.loadURL(pathToFileURL(path.join(AppPath, 'html', 'tools', name, 'index.html')).href);
}

/**
 * 在当前聚焦窗口打开插入JS窗口，若无聚焦窗口或窗口已销毁则不执行任何操作
 * @returns {void}
 */
function openInsertJS() {
    if (!settings?.app.insertjs) return;
    const mainWindow = BrowserWindow.getFocusedWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    debugLog('info', 'Opening Insert JS Window for window: ID ', mainWindow.id);
    mainWindow.webContents.executeJavaScript('litebrowser.registerWindow()').catch(err => {
        debugLog('warn', 'executeJavaScript failed:', err?.message || err);
    });
    const childWindow = new BrowserWindow({
        parent: mainWindow,
        width: 500,
        height: 500,
        icon: IconPath,
        webPreferences: {
            sandbox: true,
            spellcheck: false,
            webSecurity: true,
            nodeIntegration: false,
            contextIsolation: true,
            session: _getNomenuSession(),
            preload: path.join(AppPath, 'api', 'preload', 'insertjs.js'),
            additionalArguments: [`--parent-window-id=${mainWindow.id}`]
        }
    });
    childWindow.setMenu(debugMenu);
    childWindow.loadFile(path.join(AppPath, 'html', settings.app.normalMode ? 'normal' : 'limited', 'insert', 'index.html'));
}

/**
 * 打开配置修改页面
 * @returns {void}
 */
function openSettings() {
    debugLog('info', 'Opening settings window.');
    const newwin = new BrowserWindow({
        width: 600,
        height: 600,
        icon: IconPath,
        webPreferences: {
            sandbox: true,
            spellcheck: false,
            webSecurity: true,
            nodeIntegration: false,
            contextIsolation: true,
            session: _getNomenuSession(),
            preload: path.join(AppPath, 'api', 'preload', 'setting.js'),
        }
    });
    newwin.setMenu(debugMenu);
    newwin.loadURL(pathToFileURL(path.join(AppPath, 'html', settings.app.normalMode ? 'normal' : 'limited', 'setting', 'index.html')).href);
}

/**
 * 打开历史记录页面
 */
function openHistory() {
    debugLog('info', 'Opening history window.')
    const newwin = new BrowserWindow({
        width: 1024,
        height: 600,
        minWidth: 640,
        minHeight: 360,
        icon: IconPath,
        webPreferences: {
            sandbox: true,
            spellcheck: false,
            webSecurity: true,
            nodeIntegration: false,
            contextIsolation: true,
            session: _getNomenuSession(),
            preload: path.join(AppPath, 'api', 'preload', 'setting.js'),
        }
    });
    newwin.setMenu(debugMenu);
    newwin.loadURL(pathToFileURL(path.join(AppPath, 'html', settings.app.normalMode ? 'normal' : 'limited', 'history', 'index.html')).href);
}

export {
    openHistory,
    openInsertJS,
    openSettings,
    openToolsWindow,
}