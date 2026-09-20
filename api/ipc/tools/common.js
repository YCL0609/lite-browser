import fs from 'node:fs';
import path from 'node:path';
import { debugLog } from '../../../core/debug.js';

const _imgRegex = /<img[^>]*src="(data:image\/([a-zA-Z]+);base64,([^">]+))"[^>]*>/g;
const _fileRegex = /file:\/\/[^">]+\/([^">]+)/g;

// 还原 URL 编码的文件名
function decodeName(name) {
  try {
    return decodeURIComponent(name);
  } catch (_) {
    return name;
  }
}

/**
 * 从 HTML 内容中分离并保存内嵌的 base64 图像为文件，同时替换为占位符 `$<filename>$`
 * - 会把 `file://.../filename.ext` 形式的引用还原为 `$filename$`
 * - 保存新的 base64 图像到 `imgDir` 并返回新的 HTML
 * - 删除 `imgIDsCache` 中不再使用的旧文件
 * @param {string} [content=''] - 包含 image 标签或 file:// 引用的 HTML 内容
 * @param {string|null} imgDir - 保存图片的目标目录；无有效目录时不处理内容
 * @param {string[]} [imgIDsCache=[]] - 先前的图片 ID 列表，用于清理不再使用的文件
 * @returns {{html:string,isUpdate:boolean,IDCache:string[]}} 返回对象：新 HTML、图片列表是否变化、以及新的 ID 列表
 */
function isolateImage(content = '', imgDir = null, imgIDsCache = []) {
  const oldCache = Array.isArray(imgIDsCache) ? imgIDsCache : [];
  if (!imgDir) return { html: content, isUpdate: false, IDCache: oldCache };

  // 还原图片ID
  let imgIDs = [];
  const rawHtml = String(content).replace(_fileRegex, (_, filename) => {
    const name = decodeName(filename);
    imgIDs.push(name);
    return `$${name}$`;
  });
  const oldIDs = imgIDs.length;

  // 分离图片
  const newHtml = rawHtml.replace(_imgRegex, (match, fullBase64, ext, base64Data) => {
    // 生成唯一 ID
    const newImgID = crypto.randomUUID();
    const filename = `${newImgID}.${ext}`;
    const filePath = path.join(imgDir, filename);

    // 保存图像
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, buffer);
    imgIDs.push(filename);

    // 替换原base64
    return match.replace(fullBase64, `$${filename}$`);
  });

  // 图片列表未变化时无需清理与写盘
  const isUpdate = imgIDs.length !== oldCache.length || imgIDs.some((id, i) => id !== oldCache[i]);
  if (!isUpdate) return { html: newHtml, isUpdate: false, IDCache: oldCache };

  // 清理未使用的图像
  const newIDs = new Set(imgIDs);
  const deleted = oldCache.filter(x => !newIDs.has(x));
  const removed = [];
  for (const file of deleted) {
    // 仅允许删除图片目录内的直接文件名
    if (path.basename(file) !== file) continue;
    try {
      fs.rmSync(path.join(imgDir, file), { force: true });
      removed.push(file);
    } catch (err) {
      debugLog('warn', 'Failed to remove unused image:', file, err.message);
    }
  }

  debugLog('info', `Image isolation completed. New: ${imgIDs.length - oldIDs} Removed: ${removed.length} Total: ${imgIDs.length}`);
  return { html: newHtml, isUpdate: true, IDCache: imgIDs }
}

/**
 * 安全解析 JSON 文本，内容非法或类型与回退值不符时返回回退值
 * @param {string} raw - JSON 文本
 * @param {any} fallback - 解析失败时返回的回退值 (同时用于校验类型)
 * @returns {any} 解析后的对象或回退值
 */
function parseJson(raw, fallback) {
  try {
    const data = JSON.parse(raw);
    if (data === null || typeof data !== 'object') return fallback;
    if (Array.isArray(fallback) !== Array.isArray(data)) return fallback;
    return data;
  } catch (_) {
    return fallback;
  }
}

export {
  isolateImage,
  parseJson,
}
