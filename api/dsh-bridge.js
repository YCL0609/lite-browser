/**
 * DSH 本机浏览器桥接服务
 *
 * 该模块在 Lite Browser 主进程中启动一个仅监听 127.0.0.1 的 TCP 服务，让本机的
 * DSH / dsh-browser 能够：
 *   - 发现当前正在运行的 Lite Browser；
 *   - 列出普通网页窗口；
 *   - 接管（attach）用户已经打开的窗口，并通过该窗口真实的 WebContents 执行 CDP；
 *   - 通过 Lite Browser 自己的窗口创建流程新建页面（使用同一个 session.defaultSession）；
 *   - 聚焦、释放（不关闭）以及明确关闭页面。
 *
 * 设计约束：
 *   - 只绑定回环地址，认证令牌由 crypto.randomBytes 生成，写入权限为 0600 的端点文件；
 *   - 不向网页暴露令牌，也不接受任意主进程 JavaScript；
 *   - 释放与关闭是两种不同语义：release 只解除控制，close 才会关闭页面。
 *
 * 协议（与 dsh-browser 的 BridgeConnection 兼容）：
 *   - 首行 JSON `{ "token": "..." }`；
 *   - 之后每行一个 JSON 请求，请求可带 `bridgeRequestId`；
 *   - 应答为 `{ "ok": true, "result": ... }` 或 `{ "ok": false, "error": "...", "code": "..." }`，
 *     并把 `bridgeRequestId` 原样回传；
 *   - 订阅后的事件为 `{ "event": "pageClosed", ... }`。
 * @module lite-browser/dsh-bridge
 */

import { app, BrowserWindow, session } from 'electron';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { debugLog } from '../core/index.js';
import { openUrlWindow } from '../core/basic.js';

/** 协议版本；dsh-browser 端必须在握手时校验该值。 */
const PROTOCOL = 1;
/** 端点文件标识，防止误连到其他服务的端点文件。 */
const APP_TAG = 'lite-browser';
/** 端点文件名，默认放在 DSH 主目录下（与 dsh-browser 的发现位置一致）。 */
const ENDPOINT_FILE = 'lite-browser-bridge.json';
/** 首行认证与单个请求的最大字节数。 */
const MAX_AUTH_LINE_BYTES = 8 * 1024;
const MAX_LINE_BYTES = 8 * 1024 * 1024;
/** 未认证连接必须在此时间内送出令牌。 */
const AUTH_TIMEOUT_MS = 10_000;
/** 同时存在的桥接连接上限。 */
const MAX_CONNECTIONS = 16;
/** 每个连接允许的并发请求上限，防止单个客户端耗尽内存。 */
const MAX_IN_FLIGHT = 32;
/** CDP 单条命令的超时。截图和导航可能较慢，但不应无限等待。 */
const CDP_TIMEOUT_MS = 30_000;
/** 端点文件刷新周期；dsh-browser 在 60 秒未刷新时判定实例已退出。 */
const KEEPALIVE_MS = 15_000;
/** 允许转发的 CDP 域白名单。 */
const CDP_DOMAINS = new Set(['Page', 'Runtime', 'Input', 'Network', 'Storage']);

/** 带错误码的桥接错误。 */
class BridgeError extends Error {
    /**
     * @param {string} code - 稳定错误码，供 dsh-browser 分类。
     * @param {string} message - 可诊断但不含秘密的说明。
     */
    constructor(code, message) {
        super(message);
        this.name = 'BridgeError';
        this.code = code;
    }
}

/** 当前运行状态。 */
const state = {
    server: null,
    token: '',
    instanceId: '',
    endpointPath: '',
    keepalive: null,
    started: false,
    /** @type {Set<import('node:net').Socket>} */
    sockets: new Set(),
    /** pageId -> { socket, webContents, owner, borrowed } */
    claims: new Map(),
    /** pageId -> { owner, createdAt }，记录 DSH 明确要求创建的页面。 */
    owned: new Map(),
    /** @type {Set<import('node:net').Socket>} */
    subscribers: new Set(),
    /** pageId -> WebContents，只保存当前窗口中的普通网页。 */
    pages: new Map(),
    /** 已注册生命周期的 WebContents，避免重复监听。 */
    tracking: new WeakSet(),
    /** 由桥接层 attach 的 WebContents id，用于只 detach 自己建立的调试器。 */
    bridgeAttached: new Set(),
};

/**
 * 计算端点文件路径。
 * @returns {string} 绝对路径。
 */
export function dshBridgeEndpointPath() {
    if (process.env.LB_DSH_BRIDGE_PATH) return path.resolve(process.env.LB_DSH_BRIDGE_PATH);
    const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    return path.join(home, ENDPOINT_FILE);
}

/**
 * 判断 URL 是否为允许自动化的普通网页。
 * 内部页面（设置、工具、主界面）使用其他 session，不会通过该判断。
 * @param {string} raw - 待检查 URL。
 * @returns {boolean} 是否允许。
 */
function isWebUrl(raw) {
    try {
        const url = new URL(String(raw));
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

/**
 * 判断一个 WebContents 是否属于应当暴露给 DSH 的普通网页。
 * @param {Electron.WebContents} wc - 待检查的 WebContents。
 * @returns {boolean} 是否可暴露。
 */
function isEligible(wc) {
    if (!wc || wc.isDestroyed()) return false;
    try {
        // 硬性要求：普通网页必须位于 session.defaultSession。
        if (wc.session !== session.defaultSession) return false;
        if (typeof wc.getType === 'function' && wc.getType() !== 'window') return false;
        // 嵌入式 WebContents（例如 WebContentsView）不在这里暴露。
        if (wc.hostWebContents) return false;
        // 已登记为桥接页面的窗口即使正处于 about:blank 或加载失败页也仍然有效。
        return isWebUrl(wc.getURL()) || state.pages.has(pageIdFor(wc));
    } catch (_) {
        return false;
    }
}

/**
 * 生成稳定的页面标识。WebContents.id 在页面导航期间保持不变，页面销毁后不再复用。
 * @param {Electron.WebContents} wc - 目标 WebContents。
 * @returns {string} 页面标识。
 */
function pageIdFor(wc) {
    return `p${wc.id}`;
}

/**
 * 从页面标识中取出数字 id。
 * @param {unknown} pageId - 外部传入的标识。
 * @returns {number|null} 数字 id，非法时返回 null。
 */
function parsePageId(pageId) {
    if (typeof pageId !== 'string') return null;
    const match = /^p(\d+)$/.exec(pageId);
    if (match === null) return null;
    const id = Number(match[1]);
    return Number.isSafeInteger(id) ? id : null;
}

/**
 * 取得页面所属窗口。
 * @param {Electron.WebContents} wc - 目标 WebContents。
 * @returns {Electron.BrowserWindow|null} 窗口或 null。
 */
function windowFor(wc) {
    try {
        const win = BrowserWindow.fromWebContents(wc);
        return win && !win.isDestroyed() ? win : null;
    } catch (_) {
        return null;
    }
}

/**
 * 为页面建立生命周期监听，确保页面关闭后句柄、调试器和所有权信息都被清理。
 * @param {Electron.WebContents} wc - 目标 WebContents。
 * @returns {void}
 */
function trackPage(wc) {
    if (state.tracking.has(wc)) return;
    state.tracking.add(wc);
    const id = pageIdFor(wc);
    state.pages.set(id, wc);

    wc.once('destroyed', () => {
        cleanupPage(id);
    });
    wc.on('did-navigate', (_event, url) => {
        broadcast({ event: 'pageNavigated', pageId: id, url: String(url) }, id);
    });
    wc.on('did-navigate-in-page', (_event, url) => {
        broadcast({ event: 'pageNavigated', pageId: id, url: String(url) }, id);
    });
    wc.on('render-process-gone', (_event, details) => {
        broadcast({ event: 'pageCrashed', pageId: id, reason: String(details?.reason ?? 'unknown') }, id);
        // A crashed renderer is not the page DSH attached to any more. Release the claim
        // and invalidate the handle; the window itself is left for the user (reload/close).
        if (details?.reason !== 'clean-exit') cleanupPage(id);
    });
    const win = windowFor(wc);
    if (win !== null) {
        win.once('closed', () => {
            cleanupPage(id);
        });
    }
}

/**
 * 清理已经销毁的页面。
 * @param {string} pageId - 页面标识。
 * @returns {void}
 */
function cleanupPage(pageId) {
    // 事件必须在占用记录仍然存在时发出，否则订阅过滤会认为没有连接关心该页面。
    broadcast({ event: 'pageClosed', pageId }, pageId);
    const claim = state.claims.get(pageId);
    if (claim !== undefined) {
        detachDebugger(claim.webContents, pageId);
        state.claims.delete(pageId);
    }
    state.owned.delete(pageId);
    const wc = state.pages.get(pageId);
    state.pages.delete(pageId);
    // The tracking set is a strong reference; a closed WebContents must not stay in it
    // forever (its own listeners die with the object, so the Set entry is the only leak).
    if (wc !== undefined) state.tracking.delete(wc);
}

/**
 * 只在调试器确实由桥接层附着时执行 detach。
 * @param {Electron.WebContents} wc - 目标 WebContents。
 * @param {string} pageId - 页面标识。
 * @returns {void}
 */
function detachDebugger(wc, pageId) {
    if (!state.bridgeAttached.has(pageId)) return;
    state.bridgeAttached.delete(pageId);
    try {
        if (!wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach();
    } catch (error) {
        debugLog('warn', 'DSH bridge: failed to detach debugger:', error?.message || error);
    }
}

/**
 * 附着调试器。若调试器已被其他功能占用则明确报错，绝不抢占。
 * @param {Electron.WebContents} wc - 目标 WebContents。
 * @param {string} pageId - 页面标识。
 * @returns {void}
 */
function attachDebugger(wc, pageId) {
    if (wc.isDestroyed()) {
        throw new BridgeError('PAGE_DESTROYED', `page ${pageId} has been destroyed`);
    }
    let attached = false;
    try {
        attached = wc.debugger.isAttached();
    } catch (error) {
        throw new BridgeError('DEBUGGER_UNAVAILABLE', `cannot inspect debugger for page ${pageId}: ${error?.message || error}`);
    }
    if (attached) {
        if (state.bridgeAttached.has(pageId)) return;
        throw new BridgeError(
            'DEBUGGER_BUSY',
            `page ${pageId} already has a debugger attached (DevTools or another automation); close it and retry`,
        );
    }
    try {
        wc.debugger.attach('1.3');
        state.bridgeAttached.add(pageId);
        wc.debugger.once('detach', () => {
            state.bridgeAttached.delete(pageId);
        });
    } catch (error) {
        throw new BridgeError(
            'DEBUGGER_ATTACH_FAILED',
            `cannot attach a debugger to page ${pageId}: ${error?.message || error}`,
        );
    }
}

/**
 * 从当前所有窗口中枚举可暴露的普通网页。
 * @returns {{ id: string, webContents: Electron.WebContents, window: Electron.BrowserWindow|null }[]} 页面列表。
 */
function enumeratePages() {
    const result = [];
    const seen = new Set();
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win || win.isDestroyed()) continue;
        let wc;
        try {
            wc = win.webContents;
        } catch (_) {
            continue;
        }
        if (!isEligible(wc)) continue;
        const id = pageIdFor(wc);
        if (seen.has(id)) continue;
        seen.add(id);
        trackPage(wc);
        result.push({ id, webContents: wc, window: win });
    }
    // 清理已经不在任何窗口中的页面记录。
    for (const [id, wc] of state.pages) {
        if (wc.isDestroyed()) cleanupPage(id);
    }
    return result;
}

/**
 * 枚举所有位于默认会话中的顶层窗口，包含尚未导航的 about:blank 页面。
 * 调用方仍要经过 {@link isEligible} 或桥接登记状态筛选。
 * @returns {{ id: string, webContents: Electron.WebContents, window: Electron.BrowserWindow|null }[]} 候选页面。
 */
function enumerateCandidates() {
    const result = [];
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win || win.isDestroyed()) continue;
        let wc;
        try {
            wc = win.webContents;
        } catch (_) {
            continue;
        }
        if (!wc || wc.isDestroyed()) continue;
        if (wc.session !== session.defaultSession) continue;
        if (typeof wc.getType === 'function' && wc.getType() !== 'window') continue;
        if (wc.hostWebContents) continue;
        result.push({ id: pageIdFor(wc), webContents: wc, window: win });
    }
    return result;
}

/**
 * 按页面标识查找当前允许访问的真实页面。
 * 只接受枚举结果中的页面，不能凭猜测的 id 操作内部页面。
 * @param {unknown} pageId - 外部传入的页面标识。
 * @returns {{ id: string, webContents: Electron.WebContents, window: Electron.BrowserWindow|null }} 页面。
 */
function resolvePage(pageId) {
    const numeric = parsePageId(pageId);
    if (numeric === null) {
        throw new BridgeError('PAGE_ID_INVALID', 'page id must look like "p<number>"');
    }
    const found = enumerateCandidates().find(page => page.webContents.id === numeric);
    if (found === undefined) {
        throw new BridgeError('PAGE_NOT_FOUND', `page ${String(pageId)} is not an open Lite Browser web page`);
    }
    // 只有普通网页，或已经由桥接层创建/接管的页面才可操作；不能凭 id 触碰内部页面。
    if (!isWebUrl(found.webContents.getURL()) && !state.pages.has(found.id)) {
        throw new BridgeError('PAGE_NOT_FOUND', `page ${String(pageId)} is not an open Lite Browser web page`);
    }
    return found;
}

/**
 * 页面描述。只返回标题、URL、状态与所有权，不返回 WebContents 引用。
 * @param {{ id: string, webContents: Electron.WebContents, window: Electron.BrowserWindow|null }} page - 页面。
 * @returns {Record<string, unknown>} 描述对象。
 */
function describePage(page) {
    const { id, webContents: wc, window: win } = page;
    let title = '';
    try {
        title = win !== null ? win.getTitle() : wc.getTitle();
    } catch (_) { /* 页面可能在读取过程中销毁 */ }
    return {
        id,
        url: wc.getURL(),
        title,
        kind: 'window',
        ownership: state.owned.has(id) ? 'owned' : 'borrowed',
        attached: state.claims.has(id),
        ownerLabel: state.claims.get(id)?.owner ?? state.owned.get(id)?.owner ?? null,
        loading: wc.isLoading(),
        crashed: wc.isCrashed(),
        focused: win !== null && win.isFocused(),
        visible: win !== null && win.isVisible(),
        // 会话核验证据：该页面是否真的位于 session.defaultSession。
        sessionIsDefault: wc.session === session.defaultSession,
        sessionPersistent: (() => {
            try { return wc.session.isPersistent(); } catch (_) { return null; }
        })(),
    };
}

/**
 * 取当前连接对页面的占用；未占用或属于其他连接时给出明确错误。
 * @param {string} pageId - 页面标识。
 * @param {import('node:net').Socket} socket - 发起请求的连接。
 * @returns {{ socket: import('node:net').Socket, webContents: Electron.WebContents, owner: string, borrowed: boolean }} 占用记录。
 */
function requireClaim(pageId, socket) {
    const claim = state.claims.get(pageId);
    if (claim === undefined) {
        throw new BridgeError('PAGE_NOT_ATTACHED', `page ${pageId} has not been attached by this connection`);
    }
    if (claim.socket !== socket) {
        throw new BridgeError('PAGE_BUSY', `page ${pageId} is controlled by another DSH connection`);
    }
    return claim;
}

/**
 * 通过 Lite Browser 的窗口创建流程创建新页面。
 * 与普通网页一样使用 session.defaultSession，并保持同一套 webPreferences。
 * @param {string} owner - DSH 任务标识。
 * @returns {Promise<{ id: string, webContents: Electron.WebContents, window: Electron.BrowserWindow }>} 新页面。
 */
async function createPage(owner) {
    let win;
    try {
        win = openUrlWindow('about:blank');
    } catch (error) {
        throw new BridgeError('PAGE_CREATE_FAILED', `cannot create a Lite Browser window: ${error?.message || error}`);
    }
    if (!win || win.isDestroyed()) {
        throw new BridgeError('PAGE_CREATE_FAILED', 'Lite Browser did not create a window');
    }
    const wc = win.webContents;
    // 等 about:blank 完成提交，避免 CDP 附着与首次导航互相竞争。
    await new Promise(resolve => {
        const timer = setTimeout(resolve, 3_000);
        const done = () => {
            clearTimeout(timer);
            resolve();
        };
        if (!wc.isLoading()) done();
        else wc.once('did-finish-load', done);
    });
    if (wc.isDestroyed() || win.isDestroyed()) {
        throw new BridgeError('PAGE_CREATE_FAILED', 'the new window was closed before it could be attached');
    }
    const id = pageIdFor(wc);
    trackPage(wc);
    state.owned.set(id, { owner, createdAt: Date.now() });
    return { id, webContents: wc, window: win };
}

/**
 * 将页面结果写入订阅者；只有与页面相关的连接会收到。
 * @param {Record<string, unknown>} payload - 事件内容。
 * @param {string} [pageId] - 关联页面；省略时广播给全部订阅者。
 * @returns {void}
 */
function broadcast(payload, pageId) {
    for (const socket of state.subscribers) {
        if (socket.destroyed) {
            state.subscribers.delete(socket);
            continue;
        }
        if (pageId !== undefined) {
            const claim = state.claims.get(pageId);
            if (claim === undefined || claim.socket !== socket) continue;
        }
        try {
            socket.write(JSON.stringify(payload) + '\n');
        } catch (_) {
            state.subscribers.delete(socket);
        }
    }
}

/**
 * 等待窗口真正关闭。
 * @param {Electron.BrowserWindow} win - 目标窗口。
 * @param {number} timeoutMs - 超时。
 * @returns {Promise<boolean>} 是否已关闭。
 */
function waitForWindowClosed(win, timeoutMs) {
    if (win.isDestroyed()) return Promise.resolve(true);
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(win.isDestroyed()), timeoutMs);
        win.once('closed', () => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}

/**
 * 校验 CDP 方法名与允许的域。
 * @param {unknown} method - CDP 方法名。
 * @returns {string} 合法方法名。
 */
function validateCdpMethod(method) {
    if (typeof method !== 'string' || method.length > 96) {
        throw new BridgeError('CDP_METHOD_INVALID', 'CDP method must be a short string');
    }
    const match = /^([A-Za-z]{1,32})\.([A-Za-z0-9]{1,64})$/.exec(method);
    if (match === null) {
        throw new BridgeError('CDP_METHOD_INVALID', `CDP method "${method}" is not well formed`);
    }
    if (!CDP_DOMAINS.has(match[1])) {
        throw new BridgeError(
            'CDP_METHOD_FORBIDDEN',
            `CDP domain "${match[1]}" is not allowed by the Lite Browser bridge (allowed: ${[...CDP_DOMAINS].join(', ')})`,
        );
    }
    return method;
}

/**
 * 处理一个已认证请求。
 * @param {string} op - 操作名。
 * @param {Record<string, unknown>} request - 请求体。
 * @param {import('node:net').Socket} socket - 发起请求的连接。
 * @returns {Promise<unknown>} 操作结果。
 */
async function handleOp(op, request, socket) {
    switch (op) {
        case 'ping':
            return {
                protocol: PROTOCOL,
                app: APP_TAG,
                version: app.getVersion(),
                pid: process.pid,
                instanceId: state.instanceId,
                ready: true,
                pageCount: enumeratePages().length,
                sessionIsDefault: true,
            };
        case 'list':
            return { pages: enumeratePages().map(describePage) };
        case 'attach': {
            const page = resolvePage(request.pageId);
            const existing = state.claims.get(page.id);
            if (existing !== undefined && existing.socket !== socket) {
                throw new BridgeError('PAGE_BUSY', `page ${page.id} is controlled by another DSH connection`);
            }
            attachDebugger(page.webContents, page.id);
            const owner = typeof request.owner === 'string' ? request.owner.slice(0, 200) : '';
            state.claims.set(page.id, {
                socket,
                webContents: page.webContents,
                owner,
                borrowed: !state.owned.has(page.id),
            });
            return { page: describePage(page), attached: true };
        }
        case 'create': {
            const owner = typeof request.owner === 'string' ? request.owner.slice(0, 200) : '';
            const page = await createPage(owner);
            attachDebugger(page.webContents, page.id);
            state.claims.set(page.id, {
                socket,
                webContents: page.webContents,
                owner,
                borrowed: false,
            });
            return { page: describePage(page), created: true, attached: true };
        }
        case 'cdp': {
            const page = resolvePage(request.pageId);
            const claim = requireClaim(page.id, socket);
            const method = validateCdpMethod(request.method);
            const params = request.params;
            if (params !== undefined && (params === null || typeof params !== 'object' || Array.isArray(params))) {
                throw new BridgeError('CDP_PARAMS_INVALID', 'CDP params must be an object');
            }
            if (claim.webContents.isDestroyed()) {
                cleanupPage(page.id);
                throw new BridgeError('PAGE_DESTROYED', `page ${page.id} has been destroyed`);
            }
            if (!claim.webContents.debugger.isAttached()) {
                attachDebugger(claim.webContents, page.id);
            }
            let timer;
            try {
                const result = await Promise.race([
                    claim.webContents.debugger.sendCommand(method, params ?? {}),
                    new Promise((_, reject) => {
                        timer = setTimeout(
                            () => reject(new BridgeError('CDP_TIMEOUT', `CDP command ${method} timed out after ${CDP_TIMEOUT_MS}ms`)),
                            CDP_TIMEOUT_MS,
                        );
                    }),
                ]);
                return result ?? {};
            } catch (error) {
                if (error instanceof BridgeError) throw error;
                throw new BridgeError('CDP_FAILED', `CDP command ${method} failed: ${error?.message || error}`);
            } finally {
                // A 30s timer left alive for every CDP call keeps the event loop (and the
                // closure over the page) alive long after the reply was sent.
                if (timer !== undefined) clearTimeout(timer);
            }
        }
        case 'focus': {
            const page = resolvePage(request.pageId);
            const win = page.window;
            if (win === null) {
                throw new BridgeError('PAGE_NOT_FOCUSABLE', `page ${page.id} has no window to focus`);
            }
            if (!win.isVisible()) win.show();
            win.focus();
            page.webContents.focus();
            return { focused: true, page: describePage(page) };
        }
        case 'release': {
            const page = resolvePage(request.pageId);
            requireClaim(page.id, socket);
            detachDebugger(page.webContents, page.id);
            state.claims.delete(page.id);
            return { released: true, page: describePage(page) };
        }
        case 'close': {
            const page = resolvePage(request.pageId);
            const claim = state.claims.get(page.id);
            if (claim !== undefined && claim.socket !== socket) {
                throw new BridgeError('PAGE_BUSY', `page ${page.id} is controlled by another DSH connection`);
            }
            const win = page.window;
            if (win === null) {
                throw new BridgeError('PAGE_NOT_CLOSABLE', `page ${page.id} has no window to close`);
            }
            win.close();
            const closed = await waitForWindowClosed(win, 3_000);
            if (!closed) {
                throw new BridgeError(
                    'PAGE_CLOSE_REFUSED',
                    `page ${page.id} refused to close (a beforeunload handler may be blocking it)`,
                );
            }
            return { closed: true, pageId: page.id };
        }
        case 'subscribe':
            state.subscribers.add(socket);
            return { subscribed: true };
        default:
            throw new BridgeError('UNSUPPORTED_OP', `unsupported bridge operation "${String(op)}"`);
    }
}

/**
 * 写入端点文件（原子替换 + 0600 权限）。
 * @returns {void}
 */
function publishEndpoint() {
    const file = state.endpointPath;
    const dir = path.dirname(file);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const address = state.server?.address();
    if (address === null || typeof address !== 'object') return;
    const body = JSON.stringify({
        app: APP_TAG,
        protocol: PROTOCOL,
        version: app.getVersion(),
        instanceId: state.instanceId,
        port: address.port,
        token: state.token,
        pid: process.pid,
        updatedAt: new Date().toISOString(),
    });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, body, { mode: 0o600 });
    try { chmodSync(temp, 0o600); } catch (_) { /* Windows 上可能不支持 */ }
    renameSync(temp, file);
    try { chmodSync(file, 0o600); } catch (_) { /* 同上 */ }
}

/**
 * 删除由本进程写出的端点文件；若文件已被其他实例替换则保留。
 * @returns {void}
 */
function removeEndpoint() {
    const file = state.endpointPath;
    if (!file) return;
    try {
        const current = JSON.parse(readFileSync(file, 'utf8'));
        if (current?.pid !== process.pid || current?.token !== state.token) return;
        rmSync(file, { force: true });
    } catch (_) {
        // 文件不存在或已损坏：无需处理。
    }
}

/**
 * 为一个连接安装协议解析。
 * @param {import('node:net').Socket} socket - 新连接。
 * @returns {void}
 */
function handleConnection(socket) {
    state.sockets.add(socket);
    /** @type {Buffer} */
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let closed = false;
    let inFlight = 0;
    socket.setNoDelay(true);
    socket.setEncoding('utf8');
    // An unauthenticated peer must not hold a slot forever. The limit is cleared once the
    // token line is accepted; authenticated calls have their own per-request caps.
    socket.setTimeout(AUTH_TIMEOUT_MS, () => {
        if (!authenticated) failAndClose('authentication timeout');
    });

    const failAndClose = message => {
        try {
            socket.write(JSON.stringify({ ok: false, error: message }) + '\n');
        } catch (_) { /* 连接可能已断开 */ }
        socket.end();
    };

    socket.on('data', chunk => {
        buffer = buffer.length === 0 ? Buffer.from(chunk, 'utf8') : Buffer.concat([buffer, Buffer.from(chunk, 'utf8')]);
        while (true) {
            const newline = buffer.indexOf(0x0a);
            if (newline === -1) {
                const cap = authenticated ? MAX_LINE_BYTES : MAX_AUTH_LINE_BYTES;
                if (buffer.length > cap) failAndClose('request line too large');
                return;
            }
            // Check the byte length BEFORE slicing/decoding: a line that is already in the
            // buffer must not be materialised as a string just to be rejected.
            if (newline > (authenticated ? MAX_LINE_BYTES : MAX_AUTH_LINE_BYTES)) {
                failAndClose('request line too large');
                return;
            }
            const line = buffer.subarray(0, newline).toString('utf8').trim();
            buffer = buffer.subarray(newline + 1);
            if (line === '') continue;
            if (!authenticated) {
                let token;
                try {
                    token = JSON.parse(line)?.token;
                } catch (_) {
                    failAndClose('malformed authentication line');
                    return;
                }
                if (typeof token !== 'string' || token.length !== state.token.length
                    || !timingSafeEqual(Buffer.from(token), Buffer.from(state.token))) {
                    failAndClose('bad token');
                    return;
                }
                authenticated = true;
                socket.setTimeout(0);
                continue;
            }
            let request;
            try {
                request = JSON.parse(line);
            } catch (_) {
                socket.write(JSON.stringify({ ok: false, code: 'BAD_REQUEST', error: 'request is not valid JSON' }) + '\n');
                continue;
            }
            if (request === null || typeof request !== 'object' || Array.isArray(request) || typeof request.op !== 'string') {
                socket.write(JSON.stringify({ ok: false, code: 'BAD_REQUEST', error: 'request must be an object with an "op" string' }) + '\n');
                continue;
            }
            const requestId = request.bridgeRequestId;
            if (inFlight >= MAX_IN_FLIGHT) {
                socket.write(JSON.stringify({
                    ok: false,
                    code: 'TOO_MANY_REQUESTS',
                    error: `at most ${MAX_IN_FLIGHT} concurrent requests are allowed`,
                    ...(requestId !== undefined ? { bridgeRequestId: requestId } : {}),
                }) + '\n');
                continue;
            }
            inFlight += 1;
            void handleOp(request.op, request, socket)
                .then(result => {
                    try {
                        socket.write(JSON.stringify({
                            ok: true,
                            result,
                            ...(requestId !== undefined ? { bridgeRequestId: requestId } : {}),
                        }) + '\n');
                    } catch (_) { /* 客户端可能已经断开 */ }
                })
                .catch(error => {
                    const code = error instanceof BridgeError ? error.code : 'INTERNAL_ERROR';
                    const message = error instanceof Error ? error.message : String(error);
                    debugLog('warn', `DSH bridge op "${request.op}" failed (${code}):`, message);
                    try {
                        socket.write(JSON.stringify({
                            ok: false,
                            code,
                            error: message,
                            ...(requestId !== undefined ? { bridgeRequestId: requestId } : {}),
                        }) + '\n');
                    } catch (_) { /* 客户端可能已经断开 */ }
                })
                .finally(() => {
                    inFlight -= 1;
                });
        }
    });

    const onClosed = () => {
        if (closed) return;
        closed = true;
        state.sockets.delete(socket);
        state.subscribers.delete(socket);
        // 连接断开只释放控制，不关闭任何页面。
        for (const [pageId, claim] of [...state.claims]) {
            if (claim.socket !== socket) continue;
            detachDebugger(claim.webContents, pageId);
            state.claims.delete(pageId);
        }
    };
    socket.on('close', onClosed);
    socket.on('error', error => {
        debugLog('warn', 'DSH bridge connection error:', error?.message || error);
    });
}

/**
 * 启动桥接服务。重复调用是幂等的。
 * @returns {Promise<void>} 启动完成。
 */
export async function startDshBridge() {
    if (state.started) return;
    if (process.env.LB_DSH_BRIDGE === '0' || process.env.LB_DSH_BRIDGE === 'false') {
        debugLog('info', 'DSH bridge disabled by LB_DSH_BRIDGE');
        return;
    }
    state.started = true;
    state.instanceId = randomBytes(8).toString('hex');
    state.token = randomBytes(32).toString('hex');
    state.endpointPath = dshBridgeEndpointPath();
    state.server = createServer(handleConnection);
    // A local bridge needs a handful of clients at most (DSH + a reconnect racing the old
    // socket). Unbounded sockets would turn a public token leak into a trivial resource
    // exhaustion primitive.
    state.server.maxConnections = MAX_CONNECTIONS;
    state.server.on('error', error => {
        debugLog('error', 'DSH bridge server error:', error?.message || error);
    });
    try {
        await new Promise((resolve, reject) => {
            state.server.once('error', reject);
            state.server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
                state.server.off('error', reject);
                resolve();
            });
        });
    } catch (error) {
        debugLog('error', 'DSH bridge could not listen:', error?.message || error);
        stopDshBridge();
        throw error;
    }
    try {
        publishEndpoint();
    } catch (error) {
        debugLog('error', 'DSH bridge could not publish its endpoint:', error?.message || error);
        stopDshBridge();
        return;
    }
    state.keepalive = setInterval(() => {
        try { publishEndpoint(); } catch (error) {
            debugLog('warn', 'DSH bridge could not refresh its endpoint:', error?.message || error);
        }
    }, KEEPALIVE_MS);
    state.keepalive.unref?.();
    const address = state.server.address();
    debugLog('info', `DSH bridge listening on 127.0.0.1:${typeof address === 'object' && address ? address.port : '?'}; endpoint: ${state.endpointPath}`);
}

/**
 * 停止桥接服务并清理端点文件。不会关闭任何网页。
 * @returns {void}
 */
export function stopDshBridge() {
    if (!state.started) return;
    state.started = false;
    if (state.keepalive !== null) clearInterval(state.keepalive);
    state.keepalive = null;
    for (const socket of state.sockets) {
        try { socket.destroy(); } catch (_) { /* 已断开 */ }
    }
    state.sockets.clear();
    state.subscribers.clear();
    for (const [pageId, claim] of [...state.claims]) {
        detachDebugger(claim.webContents, pageId);
        state.claims.delete(pageId);
    }
    try { state.server?.close(); } catch (_) { /* 已关闭 */ }
    state.server = null;
    removeEndpoint();
    debugLog('info', 'DSH bridge stopped');
}

// 应用退出时清理监听与端点文件。
app.on('will-quit', () => {
    stopDshBridge();
});
