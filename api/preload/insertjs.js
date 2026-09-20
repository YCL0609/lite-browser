const { contextBridge, ipcRenderer } = require('electron');

let parentID = null;
const prefix = '--parent-window-id=';
const arg = process.argv.find(item => item.startsWith(prefix));
if (arg) {
    const id = Number.parseInt(arg.slice(prefix.length), 10);
    if (Number.isInteger(id)) parentID = id;
}

contextBridge.exposeInMainWorld('litebrowser', {
    parentID: parentID,
    getList: () => {
        if (!Number.isInteger(parentID)) return Promise.resolve({ time: { start: Date.now(), used: 0 }, error: "The parameter '--parent-window-id' is invalid!", list: [] });
        return ipcRenderer.invoke('insertjs-get-jslist');
    },
    addJS: () => ipcRenderer.send('insertjs-add-js'),
    renameJS: (jsID, newName) => ipcRenderer.send('insertjs-rename-js', jsID, newName),
    removeJS: (jsIDs) => ipcRenderer.send('insertjs-remove-js', jsIDs),
    openDir: () => ipcRenderer.send('insertjs-open-dir'),
    insertJS: (winID, jsIDs) => ipcRenderer.send('insertjs-insert-js', winID, jsIDs),
    getAutoJS: (winID) => ipcRenderer.invoke('insertjs-get-auto-js', winID),
    changeAutoJS: (winID, jsIDs) => ipcRenderer.send('insertjs-change-auto-js', winID, jsIDs),
    getLang: () => ipcRenderer.invoke('languageJson-get')
});
