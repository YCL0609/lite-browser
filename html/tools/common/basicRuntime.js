class NoteMessage {
    static #isinit = false;

    static #init() {
        if (this.#isinit) return;
        const css = ".LB-notes-container{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}.LB-note{min-width:200px;max-width:90vw;padding:8px 14px;border-radius:10px;box-shadow:0 2px 8px #00000033;color:#000;pointer-events:auto;cursor:pointer}.LB-info{background-color:#00ffffbb}.LB-error{background-color:#ff0000bb}.LB-success{background-color:#00ff00bb}.LB-warning{background-color:#ffff00bb}";
        const style = document.createElement('style');
        style.innerText = css;
        document.head.appendChild(style);
        this.#isinit = true;
    }

    static showMessage(level, message) {
        if (!this.#isinit) this.#init();
        // 获取或创建消息容器
        let container = document.querySelector('.LB-notes-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'LB-notes-container';
            document.body.appendChild(container);
        }
        // 根据级别设置样式
        let levelClass;
        switch (level) {
            case 'success':
                levelClass = 'success';
                break;
            case 'warning':
                levelClass = 'warning';
                break;
            case 'error':
                levelClass = 'error';
                break;
            case 'info':
                levelClass = 'info';
                break;
            default:
                levelClass = 'info';
        }

        // 创建消息元素
        const messageDiv = document.createElement('div');
        messageDiv.className = `LB-note LB-${levelClass}`;
        messageDiv.id = `note-${crypto.randomUUID()}`;
        messageDiv.innerText = message;

        // 点击消息时移除
        messageDiv.addEventListener('click', () => {
            if (messageDiv.parentNode) messageDiv.parentNode.removeChild(messageDiv);
            if (!container.hasChildNodes()) document.body.removeChild(container);
        });

        container.appendChild(messageDiv);
        return messageDiv.id;
    }

    static closeMessage(id) {
        if (!this.#isinit || !id) return;
        const messageDiv = document.getElementById(id);
        const container = document.querySelector('.LB-notes-container');
        if (messageDiv && container) container.removeChild(messageDiv)
    }
}

class toolsFileControl {
    static #permission = { R: false, W: false };
    static #toolName = "";
    static #isInit = false;
    static #lang = null;
    static #noLangText = "[Translation missing]";

    static async init(toolName = "", lang = null) {
        if (this.#isInit) return;
        try {
            // 设置工具名称
            this.#toolName = toolName;
            // 获取权限信息
            this.#permission = {
                R: litebrowser.dataDirAccess.R ?? false,
                W: litebrowser.dataDirAccess.W ?? false
            };
            // 设置语言文件
            this.#lang = lang;
            this.#lang ??= await litebrowser.getLang();
            // 标记已初始化
            this.#isInit = true;
        } catch (err) {
            alert('toolsFileControl initialization failed!');
            console.error('toolsFileControl initialization failed: ', err.stack);
        }
    }

    // 读取文件
    static async getFile(name = null) {
        if (!this.#isInit) throw new Error('Uninitialized toolsFileControl!');
        const msgID = NoteMessage.showMessage('warning', this.#lang.toolsFileControl?.loading ?? this.#noLangText);
        const tool = litebrowser[this.#toolName];
        const content = await tool?.get(name);
        if (!content?.status) {
            const unknowTip = this.#lang.toolsFileControl?.unknow ?? this.#noLangText
            NoteMessage.closeMessage(msgID);
            NoteMessage.showMessage('error', content?.message || unknowTip);
            throw new Error(content?.message || unknowTip);
        }
        NoteMessage.closeMessage(msgID);
        const okID = NoteMessage.showMessage('success', this.#lang.toolsFileControl?.readOK ?? this.#noLangText);
        setTimeout(() => NoteMessage.closeMessage(okID), 500);
        return content.message;
    }

    // 保存文件
    static async saveFile(content = '', isauto = false, extparam = null) {
        if (!this.#isInit) throw new Error('Uninitialized toolsFileControl!');
        if (!this.#permission?.W) return;
        const msgID = !isauto ? NoteMessage.showMessage('warning', this.#lang.toolsFileControl?.saving ?? this.#noLangText) : null;
        const tool = litebrowser[this.#toolName];
        const response = await tool?.set(content, extparam);
        if (!isauto) NoteMessage.closeMessage(msgID);
        if (response?.status) {
            const OKTip = this.#lang.toolsFileControl?.saveOK ?? this.#noLangText;
            const autoOKTip = this.#lang.toolsFileControl?.autoSaveOK?? this.#noLangText;
            const okID = NoteMessage.showMessage('success', isauto ? autoOKTip : OKTip);
            setTimeout(() => NoteMessage.closeMessage(okID), isauto ? 500 : 2000);
            return true;
        } else {
            const unknowTip = this.#lang.toolsFileControl?.unknow ?? this.#noLangText;
            const errtext = response?.message || unknowTip;
            NoteMessage.showMessage('error', errtext);
            console.error(errtext);
            return false;
        }
    }

    // 删除文件
    static async deleteFile(name = null) {
        if (!this.#isInit) throw new Error('Uninitialized toolsFileControl!');
        if (!this.#permission?.W) return;
        const tool = litebrowser[this.#toolName];
        if (typeof tool?.del !== 'function') return;

        if (!confirm(this.#lang.toolsFileControl?.delCheck ?? this.#noLangText)) return;
        const msgID = NoteMessage.showMessage('warning', this.#lang.toolsFileControl?.deleting ?? this.#noLangText);
        try {
            const response = await tool.del(name);
            NoteMessage.closeMessage(msgID);
            if (response.status) {
                const okID = NoteMessage.showMessage('success', this.#lang.toolsFileControl?.deleteOK ?? this.#noLangText);
                setTimeout(() => NoteMessage.closeMessage(okID), 2000);
                return true;
            } else {
                NoteMessage.showMessage('error', response.message);
                console.error(response.message);
                return false;
            }
        } catch (err) {
            const Tip = this.#lang.toolsFileControl?.delError ?? this.#noLangText;
            NoteMessage.closeMessage(msgID);
            NoteMessage.showMessage('error', Tip + err.message);
            console.error(Tip, err.stack);
            return false;
        }
    }
}

export {
    NoteMessage,
    toolsFileControl,
}