# Lite Browser

**中文版: [README_ZH.md](README_ZH.md)**

***If the Chinese and English versions differ in meaning, the Chinese version takes precedence.***

A browser designed for lightweight network environments. The project is primarily built with Electron and can run on Windows, Linux, and macOS.

* The application includes several built-in HTML tools to assist with daily tasks;
* The application can inject JavaScript into web pages to perform custom operations (Tampermonkey APIs are not supported);
* Through command-line arguments or configuration files, the program can enter a "hardware performance limited mode" and switch to a low-performance UI;
* By default, the program uses a portable setup where all data is stored in the same directory as the executable. On macOS, when the app is placed in the Applications folder, the default macOS user data directory is used instead.

## Project Dependencies

* Electron - Core project dependency - [https://github.com/electron/electron](https://github.com/electron/electron)
* KaTeX - Math formula rendering library for tools - [https://github.com/KaTeX/KaTeX](https://github.com/KaTeX/KaTeX)
* DOMPurify - HTML sanitization library for tools - [https://github.com/cure53/DOMPurify](https://github.com/cure53/DOMPurify)
* Marked - Markdown rendering library for tools - [https://github.com/markedjs/marked](https://github.com/markedjs/marked)

## Built-in Tools

|  Tool ID  |      Name      |
| :-------: | :------------: |
|  notepad  |    Notepad     |
|   paint   |     Paint      |
|   code    |  Code Editor   |
|  base64   |  Base64 Tool   |
|  markdown | Markdown Editor |

Tools can be opened from the `Tools...` menu or via the `--<toolID>` command-line argument (see below).

## Run and Build

```bash
git clone https://github.com/YCL0609/Lite-browser
cd Lite-browser
npm i

## Run from command line
npm run getlibs
npm run start

## Build
npm run build
```

## Command Line Arguments and Environment Variables

### Command Line Arguments

|   Command Line Argument    |    Corresponding Config Key     |               Description                |
| :------------------------: | :-----------------------------: | :--------------------------------------: |
|    --app-hw-limit-mode     |         !app.normalMode         | Enable hardware performance limited mode |
|     --app-disable-gpu      |           app.useGPU            |      Disable hardware acceleration       |
|   --app-disable-toolbox    |           app.toolBox           |             Disable toolbox              |
| --app-disable-history-file |           app.history           |      Disable URL history recording       |
|  --app-disable-insert-js   |          app.insertjs           |       Disable JavaScript injection       |
|   --app-disable-menu-all   | app.topMenu and app.contentMenu |            Disable all menus             |
|   --app-disable-menu-top   |           app.topMenu           |             Disable top menu             |
| --app-disable-menu-content |         app.contentMenu         |           Disable context menu           |

The switches above override the corresponding keys in the configuration file (`DATA_DIR/settings.json`). The following arguments are also recognized:

* An `http(s)://` URL - opens it in a new window;
* `--<toolID>` - opens the corresponding built-in tool (requires the toolbox to be enabled).

During initialization, the program retrieves the user's preferred language list and uses the first preferred language. If the language is not supported, English will be used as the primary language. You can override this behavior using the `LB_LANG` environment variable. The list of supported language IDs is stored in the `supportLang` variable in `core/config.js`. Language files are stored in `lang/{lang}.json`. You can add custom language files and rebuild the application.

### Environment Variables

|  Variable Name   | Default Value |               Description                |
| :--------------: | :-----------: | :--------------------------------------: |
|      LB_LOG      |       0       |           Output runtime logs            |
|     LB_DEBUG     |       0       |            Enable debug mode             |
|  LB_DEBUG_TRACE  |       0       |         Print call stack traces          |
|      LB_LANG     |      auto     |         Override the UI language         |
|   LB_DATA_PATH   |       *       |  Set application main storage directory  |
| LB_USERDATA_PATH |      **      | Set Chromium user data storage directory |

\* By default, the `DATA_DIR` storage path is located in the `Data` folder beside the executable on Linux/Windows. On macOS, it is stored in the `Data` folder beside the `.app` directory.  
\** Chromium user data is stored in `DATA_DIR/userData` by default.

### Main Page Settings

|     Config Key     |                            Default Value                             |                    Description                     |
| :----------------: | :------------------------------------------------------------------: | :------------------------------------------------: |
| mainWin.searchUrl  | [https://www.bing.com/search?q=%s](https://www.bing.com/search?q=%s) |        Search engine used on the main page         |
| mainWin.background |                            (empty string)                            | Main page background filename (disabled if empty)* |

\* Background images are disabled when "hardware performance limited mode" is enabled.

## JavaScript Injection
User-defined JavaScript files are stored in the `DATA_DIR/insertjs` directory with filenames in the format `{32-character-random-string}.js`. The mapping between the generated filenames and original filenames is stored in `DATA_DIR/insertjs/name.json`, while automatic injection logic is stored in `DATA_DIR/insertjs/auto.json`.

You can enter the JavaScript injection window by clicking the `JavaScript Injection` menu button (on macOS: `"Control..." => "JavaScript Injection"`) or pressing the **F1** key. After selecting scripts, click the `Inject` button to inject all selected JavaScript files. In automatic injection mode, clicking `Apply List` records the current list as the automatic injection list for the current domain.

### Manual Injection into Pages
When the injection window is opened, the main process uses the `win.webContents.executeJavaScriptInIsolatedWorld()` function to execute the `litebrowser.registerWindow()` function exposed by the preload script in the currently focused window. This function registers the current window object in the renderer process and passes the current window ID to the selection window. When the user clicks apply, the selected JavaScript files are injected into the target window using the same function.

```javascript
/* core/windows.js */
function openInsertJS() {
  // ....
  mainWindow.webContents.executeJavaScriptInIsolatedWorld('litebrowser.registerWindow()') // Register window object in main process
  const childWindow = new BrowserWindow({
    // ....
    webPreferences: {
      additionalArguments: [`--parent-window-id=${mainWindow.id}`], // Pass target window ID to child selection window
      // ....
    }
  });
  // ....
  ipcMain.once('send-data-back', (_, data) => mainWindow.webContents.executeJavaScript(data)); // Listen and inject selected JS content
}
```

### Automatic Injection into Pages
Whenever a page in the default session loads, the preload script executes `ipcRenderer.send('insertjs-auto-js-insert')` to send an automatic injection signal to the backend. The backend checks whether the current domain exists in the `hosts` array of the configuration file. If matched, it loads the corresponding domain configuration, filters unnecessary logic, and injects the remaining scripts into the sender window in sequence.

```javascript
/* api/ipc/insertjs.js */

// Auto injection script
ipcMain.on('insertjs-auto-js-insert', (event) => {
    // ......
    // Get script list for current host
    const host = (urlObj.host === '') ? -1 : urlObj.host;
    if (host === -1) return;
    if (autoJSCache == null) autoJSCache = JSON.parse(getFile(jsonPath_auto, defaultJson_auto));
    let changed = false;

    // Remove missing files
    if (autoJSCache.hosts.includes(host)) {
      const jsList = autoJSCache[host];
      for (let i = jsList.length - 1; i >= 0; i--) {
        const jsid = jsList[i];
        const filepath = path.join(DataPath, 'insertjs', jsid + '.js');
        if (!fs.existsSync(filepath)) {
          jsList.splice(i, 1);
          changed = true;
        }
      }

      // Inject remaining scripts
      for (const jsid of jsList) {
        const filepath = path.join(DataPath, 'insertjs', jsid + '.js');
        const content = fs.readFileSync(filepath, 'utf-8');
        win.webContents.executeJavaScript(content); // Inject script
      }

      // Save if the list changed
      if (changed) {
          if (jsList.length === 0) {
              delete autoJSCache[host];
              autoJSCache.hosts.splice(autoJSCache.hosts.indexOf(host), 1);
          }
          fs.writeFileSync(jsonPath_auto, JSON.stringify(autoJSCache, null, 2), 'utf-8');
      }
    }
 //......
});
```

Structure of the `auto.json` file:
```json
{
  "hosts": [
    "example.net",
    "www.example.com"
  ],
  "example.net": [
    "fnuplcuj0hbhheceb3std5w9gnr1cp9d",
    "6df4zk44ub5mo1w59ix49yurcpwvfx8y",
    "eu9olax01oib7pwvjdxzjleabbc9w46o"
  ]
}
```
