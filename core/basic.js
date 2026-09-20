import { AppPath, IconPath, supportLang, toolList, DataPath, defaultSetting } from './config.js';
import { BrowserWindow, dialog, app, session } from 'electron';
import { debugLog } from './debug.js';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 在新窗口中打开一个 URL
 * @param {string} url - 要打开的地址
 * @returns {void}
 */
function openUrlWindow(url) {
  const win = new BrowserWindow({
    width: 800, height: 600, icon: IconPath,
    webPreferences: {
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      nodeIntegration: false,
      contextIsolation: true,
      session: session.defaultSession
    }
  });
  win.loadURL(url).catch(err => {
    debugLog('warn', 'Failed to load URL from command line:', url, err?.message || err);
  });
}

/**
 * 处理命令行参数，支持直接打开 URL 和打开内置小工具
 * - 识别以 http(s):// 开头的 URL 并在新窗口中打开
 * - 识别以 `--<toolID>` 形式的小工具 id 并打开对应工具窗口
 * @param {string[]} [params=[]] - 命令行参数数组
 * @param {Function} [callback] - 当未检测到特殊参数时要调用的回调函数
 * @returns {void}
 */
function cmdLineHandle(params = [], callback) {
  const urlRegex = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
  const settings = getSettings();
  const Urls = [];
  const tools = [];
  debugLog('info', 'Command Line Parameters:', ...params);

  const argList = Array.isArray(params) ? params : [];
  for (const arg of argList) {
    if (typeof arg !== 'string') continue;
    // 提取URL
    if (urlRegex.test(arg)) Urls.push(arg);
    // 小工具参数
    if (settings?.app.toolBox && arg.startsWith('--')) {
      const cmd = arg.slice(2); // 去前缀
      if (toolList.includes(cmd) && !tools.includes(cmd)) {
        tools.push(cmd);
      }
    }
  }

  if (Urls.length === 0 && tools.length === 0) {
    // 无特殊参数时正常启动
    if (typeof callback === 'function') callback();
    return;
  }

  // 打开对应页面
  Urls.forEach(openUrlWindow);
  if (tools.length > 0) {
    // 动态导入以避免与 windows.js 形成循环依赖
    import('./windows.js')
      .then(mod => tools.forEach(tool => mod.openToolsWindow(tool)))
      .catch(err => debugLog('error', 'Failed to open tools window:', err?.message || err));
  }
}

/**
 * 在 `baseDir` 内安全地拼接 `name`
 * @param {string} baseDir - 基准目录
 * @param {string} name - 相对文件名 (不含路径分隔符)
 * @returns {string|null} 安全路径；当 `name` 非法或逃逸出基准目录时返回 `null`
 */
function safeJoin(baseDir, name) {
  if (typeof baseDir !== 'string' || typeof name !== 'string') return null;
  if (name.trim() === '' || name.includes('\0')) return null;
  const base = path.resolve(baseDir);
  const target = path.resolve(base, name);
  const rel = path.relative(base, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

let _localejson = null;
/**
 * 加载并返回本地化语言 JSON 对象 (缓存后复用)
 * @returns {Object} 本地化字符串映射对象
 */
function getLocale() {
  if (_localejson !== null) return _localejson;
  const preferredLangs = app.getPreferredSystemLanguages();
  const topLocale = (preferredLangs[0] || 'en').split('-')[0];
  const cmdLocale = process.env.LB_LANG;
  const usrlocale = supportLang.includes(topLocale) ? topLocale : 'en';
  const locale = supportLang.includes(cmdLocale) ? cmdLocale : usrlocale;

  let rawjson;
  try {
    // 尝试加载对应语言文件
    rawjson = fs.readFileSync(path.join(AppPath, 'lang', `${locale}.json`), 'utf-8');
    _localejson = JSON.parse(rawjson);
    debugLog('info', `Localization language: ${locale}`);
  } catch (err0) {

    // 首选语言不可用
    debugLog('warn', `Unable to load localization language file ${locale}.json, using default language instead.`);
    app.whenReady().then(() => dialog.showMessageBox({
      type: 'warning',
      title: 'Not use localization language',
      message: `Unable to load localization language file ${locale}.json, using default language instead.`,
      buttons: ['Confirm', 'Details'],
      defaultId: 0,
      cancelId: 0
    }).then(cho => { if (cho == 1) dialog.showErrorBox('Error Details', err0.stack) }));

    // 加载默认语言文件
    try {
      rawjson = fs.readFileSync(path.join(AppPath, 'lang', 'en.json'), 'utf-8');
      _localejson = JSON.parse(rawjson);
      debugLog('info', 'Localization language: en (fallback)');
    } catch (err1) {
      debugLog('error', 'Fatal Error: Language file load failed!');
      dialog.showErrorBox('Fatal Error: Language file missing', 'Unable to load default localization language file en.json. The application will exit.');
      process.exit(1);
    }
  }

  return _localejson;
}

/**
 * 读取并返回指定文件的文本内容
 * - 若文件或目录不存在且`defaultData`不为`null`则创建并写入默认值
 * @param {string|null} [filePath=null] - 要读取的文件路径
 * @param {string} [defaultData=''] - 当文件不存在时写入并返回的默认内容
 * @param {string} [type='utf-8'] - 读取时使用的编码格式
 * @returns {string|undefined} 文件内容；当 `filePath` 为 `null` 时返回 `undefined`
 * @throws fs 子函数调用时可能抛出的错误
 */
function getFile(filePath = null, defaultData = '', type = 'utf-8') {
  if (filePath === null || !DataPath.access.R) return defaultData;
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, type);
  } else {
    if (DataPath.access.W) {
      debugLog('info', 'File not exist, creating with default content - File:', filePath);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (defaultData !== null) fs.writeFileSync(filePath, defaultData);
    }
    return defaultData;
  }
}

/**
 * 递归校验配置对象并补全默认值
 *
 * @template T
 * @param {*} cfg 待校验配置
 * @param {T} defaultCfg 默认配置
 * @returns {T} 校验后的配置对象
 */
function jsonCheck(cfg, defaultCfg) {
  if (cfg == null) return defaultCfg;

  // 基础类型
  if (typeof cfg !== 'object') {
    return typeof cfg === typeof defaultCfg
      ? cfg
      : defaultCfg;
  }

  // 数组
  if (Array.isArray(cfg)) {
    return Array.isArray(defaultCfg)
      ? cfg
      : defaultCfg;
  }

  // default 不是 object
  if (
    defaultCfg == null ||
    typeof defaultCfg !== 'object' ||
    Array.isArray(defaultCfg)
  ) {
    return defaultCfg;
  }

  const result = {};
  for (const key of Object.keys(defaultCfg)) {
    result[key] = jsonCheck(cfg[key], defaultCfg[key]);
  }

  return result;
}

let _settings = null;
/**
 * 获取当前的程序配置，若不存在配置文件则会静默尝试写入默认配置 (缓存后复用)
 * @returns {Object} 当前的用户自定义配置或默认配置
 */
function getSettings() {
  if (_settings !== null) return _settings;
  const file = path.join(DataPath.basic, 'settings.json')

  // 获取配置文件
  if (DataPath.access.R) {
    try {
      let rawFile = getFile(file, JSON.stringify(defaultSetting))
      _settings = jsonCheck(JSON.parse(rawFile), defaultSetting);
    } catch (err) {
      debugLog('warn', 'Failed to load local configuration file, using default configuration file:', err.message);
      _settings = defaultSetting;
    }
  } else { _settings = defaultSetting }

  // 命令行参数处理
  const hwLimitMode = app.commandLine.hasSwitch('app-hw-limit-mode');
  const noGPUMode = hwLimitMode || app.commandLine.hasSwitch('app-disable-gpu');
  const noToolBox = app.commandLine.hasSwitch('app-disable-toolbox');
  const noHistory = app.commandLine.hasSwitch('app-disable-history-file');
  const noInsertjs = app.commandLine.hasSwitch('app-disable-insert-js');
  const menuAll = app.commandLine.hasSwitch('app-disable-menu-all');
  const menuTop = menuAll || app.commandLine.hasSwitch('app-disable-menu-top');
  const menuContent = menuAll || app.commandLine.hasSwitch('app-disable-menu-content');
  const cmdAppcfg = {
    useGPU: noGPUMode ? false : _settings.app.useGPU,
    toolBox: noToolBox ? false : _settings.app.toolBox,
    history: noHistory ? false : _settings.app.history,
    topMenu: menuTop ? false : _settings.app.topMenu,
    insertjs: noInsertjs ? false : _settings.app.insertjs,
    normalMode: hwLimitMode ? false : _settings.app.normalMode,
    contentMenu: menuContent ? false : _settings.app.contentMenu,
  }
  _settings.app = cmdAppcfg;

  // 覆写处理
  if (!_settings.app.normalMode) _settings.app.useGPU = false;

  return _settings
}



export {
  getFile,
  getLocale,
  safeJoin,
  jsonCheck,
  getSettings,
  cmdLineHandle,
};