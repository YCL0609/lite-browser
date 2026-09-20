import { cmdLineHandle, debugLog, getSettings, AppPath, DataPath, IconPath } from './core/index.js';
import { app, session, BrowserWindow, Menu, dialog } from 'electron';
import { TopMenu } from './api/menu.js';
import path from "node:path";
import fs from "node:fs";
const settings = getSettings();
let mainWin = null;

// 设置数据路径
if (DataPath.basic === '') {
  debugLog('error', 'Fatal Error: Data directory initialization failed!');
  dialog.showErrorBox('Fatal Error: Data directory initialization failed', 'Failed to initialize the default data directory. The program tried to fall back to initialize the temporary directory but still failed. The program will exit.');
  process.exit(1);
}
try { fs.mkdirSync(DataPath.userData, { recursive: true }); } catch (_) { }
app.setPath('userData', DataPath.userData);

// 获取全局锁
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) process.exit(0);

// GPU加速禁用配置处理
if (!settings?.app.useGPU) {
  // 调用electron官方API
  app.disableHardwareAcceleration();

  // 关闭Chromium图形渲染管线与光栅化
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-gpu-compositing');

  // 屏蔽特定底层的驱动探测 (禁用 WebGPU、Vulkan、硬件视频解码以及 3D 物理沙盒的驱动访问)
  app.commandLine.appendSwitch('disable-features', 'Vulkan,Dawn,UseChromeOSDirectVideoDecoder,WebGPU');
  app.commandLine.appendSwitch('disable-gpu-sandbox');

  // 强制Chromium使用纯软件方案进行必要渲染
  app.commandLine.appendSwitch('use-gl', 'swiftshader');
}

// 日志输出
debugLog('info', 'Data path:')
debugLog('table', {
  ...DataPath,
  access: `R: ${DataPath.access.R} W:${DataPath.access.W}`
});
debugLog('info', 'App settings:')
debugLog('table', settings?.app)

// 主窗口实例
function createMainWindow() {
  const cfgTxt = JSON.stringify(settings);
  mainWin = new BrowserWindow({
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
      session: session.fromPartition('persist:main'),
      preload: path.join(AppPath, 'api', 'preload', 'main.js'),
      additionalArguments: [
        '--app-config=' + Buffer.from(String(cfgTxt), 'utf-8').toString('base64'),
        '--dir-access=' + ((DataPath.access.R ? 1 : 0) | (DataPath.access.W ? 2 : 0))
      ],
    }
  });
  mainWin.loadFile(path.join(AppPath, 'html', settings?.app.normalMode ? 'normal' : 'limited', 'main', 'index.html'));
  mainWin.on('closed', () => mainWin = null);
}

// 主逻辑
app.whenReady().then(() => {
  // 临时数据目录提示
  if (DataPath.usetmp) {
    debugLog('warn', 'Data path is not accessible. Using temporary directory instead.');
    dialog.showMessageBox({
      type: 'warning',
      title: 'Not use normal data path',
      message: 'Unable to use the specified data path. Using temporary directory instead.\n\nTemporary data path: ' + DataPath.basic,
      buttons: ['OK'],
    });
  }
  // 设置应用菜单
  Menu.setApplicationMenu(TopMenu);

  // 命令行参数处理
  cmdLineHandle(process.argv, createMainWindow);

  // 预加载脚本
  session.defaultSession.registerPreloadScript({
    type: 'frame',
    filePath: path.join(AppPath, 'api', 'preload', 'normal.js')
  });

  // 引入所有 ipc 事件
  import('./api/ipc/index.js');
});

// 处理第二实例
app.on('second-instance', (_, argv) => {
  debugLog('info', 'Second Instance Detected.');
  cmdLineHandle(argv, () => {
    if (mainWin && !mainWin.isDestroyed()) {
      if (!mainWin.isVisible()) mainWin.show();
      mainWin.focus();
    } else {
      createMainWindow();
    }
  })
});

// 关闭所有窗口时退出
app.on('window-all-closed', app.quit);

// 引入所有全局监听事件
import('./api/app.js');