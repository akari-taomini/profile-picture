// 桃mini · 头像工具箱 1.0.7
// All feature code is bundled in this entry; disabled features are never started.
const W = window, D = document, KEY = '__taoAvatarToolbox';
W[KEY]?.dispose();
const loaders = {
  library: () => Promise.resolve(startLibrary),
  temporary: () => Promise.resolve(startTemporary),
  hd: () => Promise.resolve(startHD),
  color: () => Promise.resolve(startColor),
};
const defaults = { library: true, temporary: true, hd: true, color: false };
const running = {}, loading = {}, errors = {}, revisions = {}, rows = new Map();
let settings = { ...defaults }, initialized = false, disposed = false, panel;
let readySource = null, readyEvent = null;
const context = () => W.SillyTavern?.getContext();
function node(tag, text, className) {
  const el = D.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function persist() {
  if (initialized && !disposed) context()?.accountStorage?.setItem('tao-avatar-toolbox-v1', JSON.stringify(settings));
}
function externalActive(key) {
  if (key === 'color') return !!W.__tavern_avatar_safe_invert_v1__;
  if (key === 'library') return !!W.__taoAvatarLibraryV1;
  if (key === 'hd') return typeof W.__hdAvatar458Cleanup === 'function';
  return !!D.getElementById('temp-chat-identity-01-menu-item');
}
function refreshRows() {
  for (const [key, row] of rows) {
    row.toggle.checked = !!settings[key];
    const message = errors[key] || (loading[key] ? '正在加载内置模块…'
      : running[key] ? (key === 'hd' ? '内置高清 ' + running[key].version + ' 正在运行（插件 1.0.7）' : '正在使用内置模块')
      : externalActive(key) ? '内置模块已关闭，检测到对应独立脚本'
      : '内置模块已关闭；如需独立脚本，请在酒馆助手启用');
    if (row.status.textContent !== message) row.status.textContent = message;
    if (row.detail && panel?.open) {
      let description = '';
      try { description = running[key]?.editorStatus?.() || ''; }
      catch { description = '暂时无法读取简介页头像状态。'; }
      if (row.detail.textContent !== description) row.detail.textContent = description;
    }
    for (const action of row.actions) action.disabled = !running[key];
  }
}
function reconcile() {
  let changed = false;
  for (const key of Object.keys(running)) {
    if (running[key]?.isActive?.() === false) {
      // A standalone script took over. Do not dispose its replacement.
      delete running[key]; settings[key] = false; changed = true;
    }
  }
  if (changed) persist();
  refreshRows();
}
async function setEnabled(key, enabled) {
  if (disposed || !initialized) return;
  reconcile();
  if (!enabled && running[key]?.isBusy?.()) {
    errors[key] = '头像正在保存，请稍等再关闭模块。'; refreshRows(); return;
  }
  const revision = revisions[key] = (revisions[key] || 0) + 1;
  delete errors[key];
  if (!enabled) {
    delete loading[key];
    try {
      running[key]?.dispose();
      delete running[key]; settings[key] = false;
    } catch (error) {
      errors[key] = '关闭失败：' + error.message;
      settings[key] = !!running[key];
    }
    persist(); refreshRows(); return;
  }
  if (running[key]) { settings[key] = true; persist(); refreshRows(); return; }
  settings[key] = true; loading[key] = true; persist(); refreshRows();
  try {
    if (externalActive(key)) throw new Error('检测到对应独立脚本，内置模块保持关闭。要改用内置功能，请先停用同功能脚本。');
    const start = await loaders[key]();
    if (disposed || revisions[key] !== revision || !settings[key]) return;
    // Tavern Helper may have started the standalone script while this import was pending.
    if (externalActive(key)) throw new Error('检测到对应独立脚本，内置模块保持关闭。');
    running[key] = start();
  } catch (error) {
    if (disposed || revisions[key] !== revision) return;
    settings[key] = false;
    errors[key] = error.message || String(error);
    console.error('[头像工具箱]', key, error);
  } finally {
    if (!disposed && revisions[key] === revision) {
      delete loading[key]; persist(); refreshRows();
    }
  }
}
function launch(key, kind) {
  reconcile();
  if (!running[key]) return;
  try { panel?.close(); running[key].open?.(kind); }
  catch (error) { W.toastr?.error(error.message, '头像工具箱'); }
}
function button(text, fn, parent) {
  const b = node('button', text, 'menu_button'); b.type = 'button';
  b.addEventListener('click', fn); parent.append(b); return b;
}
function open() {
  if (disposed) return;
  if (!initialized) {
    W.toastr?.info('正在等待酒馆加载用户设置，请稍后再打开。', '头像工具箱'); return;
  }
  reconcile();
  if (panel?.open) return;
  panel?.remove(); rows.clear();
  panel = node('dialog'); panel.id = 'tao-avatar-toolbox-panel';
  panel.setAttribute('aria-label', '头像工具箱');
  const header = node('header'); header.append(node('strong', '头像工具箱 · 1.0.7'));
  button('关闭', () => panel.close(), header); panel.append(header);
  const specifications = [
    ['library', '头像库', '分别保存角色和用户头像，支持改名、情头绑定与备份。'],
    ['temporary', '临时头像与姓名', '调整聊天界面的显示；关闭模块时恢复。'],
    ['hd', '头像高清', '聊天头像与角色编辑页的头像优先读取原图，兼容临时头像。'],
    ['color', '美化反色', '沿用反色脚本的面板、色环、方案和悬浮窗。新安装默认关闭。'],
  ];
  for (const [key, name, detail] of specifications) {
    const section = node('section'), row = node('div', '', 'tat-row'), label = node('label');
    const toggle = node('input'); toggle.type = 'checkbox';
    label.append(toggle, D.createTextNode(' 使用内置' + name)); row.append(label);
    toggle.addEventListener('change', () => { void setEnabled(key, toggle.checked); });
    section.append(row, node('p', detail));
    const status = node('small'); status.setAttribute('role', 'status');
    const actions = [];
    if (key === 'library') {
      actions.push(button('角色头像库', () => launch(key, 'char'), row));
      actions.push(button('我的头像库', () => launch(key, 'user'), row));
    } else if (key !== 'hd') actions.push(button('打开设置', () => launch(key), row));
    else actions.push(button('重新应用高清', () => {
      try {
        const message = running.hd?.refreshEditor?.();
        if (message) W.toastr?.info(message, '头像高清');
        refreshRows();
      } catch (error) { W.toastr?.error(error.message, '头像高清'); }
    }, row));
    button('改用独立脚本', () => { void setEnabled(key, false); }, row);
    const detailStatus = key === 'hd' ? node('small') : null;
    rows.set(key, { toggle, status, actions, detail: detailStatus });
    section.append(status);
    if (detailStatus) section.append(detailStatus);
    panel.append(section);
  }
  panel.append(node('p', '同一功能任选内置模块或独立脚本；不同功能可以混用。', 'tat-note'));
  panel.append(node('p', '头像收藏保存在当前浏览器；换设备前，请在头像库中导出备份。', 'tat-note'));
  D.body.append(panel); panel.showModal(); refreshRows();
}
const style = node('style');
style.textContent = `
  [data-tao-toolbox-owned-menu]{display:none!important}
  #tao-avatar-toolbox-panel{box-sizing:border-box;width:min(650px,94vw);max-height:86vh;max-height:86dvh;overflow:auto;padding:18px;border-radius:16px;border:1px solid var(--SmartThemeBorderColor,#777);background:var(--SmartThemeBlurTintColor,#29292e);color:var(--SmartThemeBodyColor,#eee);font:inherit}
  #tao-avatar-toolbox-panel::backdrop{background:#0008}
  #tao-avatar-toolbox-panel header,#tao-avatar-toolbox-panel .tat-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  #tao-avatar-toolbox-panel header{justify-content:space-between;margin-bottom:16px}
  #tao-avatar-toolbox-panel section{padding:14px 0;border-top:1px solid var(--SmartThemeBorderColor,#7775)}
  #tao-avatar-toolbox-panel label{display:flex;align-items:center;gap:6px;margin-right:auto}
  #tao-avatar-toolbox-panel input[type=checkbox]{width:18px;height:18px;margin:0}
  #tao-avatar-toolbox-panel button{font:inherit;width:auto;min-height:36px;margin:0;padding:6px 10px;color:inherit}
  #tao-avatar-toolbox-panel button:disabled{opacity:.45;cursor:default}
  #tao-avatar-toolbox-panel p,#tao-avatar-toolbox-panel small{font-size:.88em;line-height:1.6;margin:10px 0 0;opacity:.8}
  #tao-avatar-toolbox-panel small{display:block}
`;
D.head.append(style);
function menuItem(id, parent) {
  if (!parent || D.getElementById(id)) return;
  const entry = node('div', '', 'list-group-item flex-container flexGap5 interactable');
  entry.id = id; entry.tabIndex = 0; entry.setAttribute('role', 'button');
  entry.append(node('i', '', 'fa-solid fa-images fa-fw'), node('span', '头像工具箱'));
  entry.addEventListener('click', open);
  entry.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  parent.append(entry);
}
function initialize() {
  if (initialized || disposed || !context()?.accountStorage || !D.body) return;
  try {
    const saved = JSON.parse(context().accountStorage.getItem('tao-avatar-toolbox-v1') || '{}');
    for (const key of Object.keys(defaults)) if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
  } catch { /* Unreadable old settings fall back to defaults. */ }
  initialized = true;
  for (const key of Object.keys(loaders)) {
    if (!settings[key]) continue;
    if (externalActive(key)) { settings[key] = false; continue; }
    void setEnabled(key, true);
  }
  persist();
}
function bindReady() {
  const c = context();
  if (readySource || !c?.eventSource?.on) return;
  readySource = c.eventSource; readyEvent = c.eventTypes?.APP_READY || 'app_ready';
  // Modern Tavern replays APP_READY for extensions enabled after startup.
  // Do not return an import promise to the event emitter or block Tavern's startup.
  readySource.on(readyEvent, initialize);
  if (!readySource.autoFireAfterEmit?.has(readyEvent)) {
    // Older versions lack replay. This fallback only initializes after settings load.
    import('/script.js').then(main => {
      if (!disposed && main.settingsReady === true) initialize();
    }).catch(error => console.warn('[头像工具箱] 等待 APP_READY', error));
  }
}
function mount() {
  if (disposed) return;
  bindReady();
  reconcile();
  menuItem('tao-avatar-toolbox-menu', D.getElementById('extensionsMenu'));
  menuItem('tao-avatar-toolbox-settings', D.getElementById('extensions_settings'));
}
function dispose() {
  if (disposed) return;
  disposed = true; W.clearInterval(timer);
  readySource?.removeListener?.(readyEvent, initialize);
  for (const key of ['color', 'temporary', 'hd', 'library']) {
    try { if (running[key]?.isActive?.() !== false) running[key]?.dispose(); }
    catch (error) { console.warn('[头像工具箱]', error); }
  }
  panel?.remove(); rows.clear(); style.remove();
  D.getElementById('tao-avatar-toolbox-menu')?.remove();
  D.getElementById('tao-avatar-toolbox-settings')?.remove();
  W.removeEventListener('pagehide', dispose);
  if (W[KEY]?.dispose === dispose) delete W[KEY];
}
const timer = W.setInterval(mount, 1500);
W[KEY] = { open, dispose };
W.addEventListener('pagehide', dispose, { once: true });
mount();


// Bundled feature factories. Each runs only when its own switch is enabled.
// Native extension module: window is the Tavern host, even when Tavern is embedded.
function startLibrary() {

  'use strict';
  const W = window, D = W.document, KEY = '__taoAvatarLibraryV1';
  W[KEY]?.dispose();
  let stopped = false, dbPromise, timer, dialog, busy = false, activeKind = "char", personas, mainModule;
  const urls = new Set();
  const PAGE_SIZE = 12;
  let pageNumber = 0, renderToken = 0;
  const breathe = () => new Promise(resolve => W.setTimeout(resolve, 0));
  const ctx = () => W.SillyTavern?.getContext();
  const uid = () => W.crypto.randomUUID();
  const notify = (message, error = false) => {
    const status = dialog?.querySelector('.tal-status');
    if (status) status.textContent = message;
    else W.toastr?.[error ? 'error' : 'info'](message, '头像库');
  };
  function target(kind = activeKind) {
    const c = ctx();
    if (kind === 'user') {
      const avatar = mainModule?.user_avatar || personas?.user_avatar || c?.userAvatar || c?.user_avatar || D.querySelector('#user_avatar_block .avatar-container.selected')?.getAttribute('data-avatar-id') || D.querySelector('#user_avatar_block .avatar.selected')?.getAttribute('imgfile');
      return avatar ? { avatar, key: 'user:' + avatar, type: 'persona', name: c?.name1 || '我的身份' } : null;
    }
    const avatar = D.querySelector('#avatar_url_pole')?.value;
    const character = c?.characters?.find(x => x.avatar === avatar) || c?.characters?.[c?.characterId];
    return character ? { avatar: character.avatar, key: character.avatar, type: 'avatar', name: character.name } : null;
  }
  async function loadUser() {
    if (target('user')) return;
    // Older Tavern versions export user_avatar from script.js instead of personas.js.
    for (const path of ['/script.js','/scripts/personas.js']) {
      try {
        const mod = await import(new URL(path,W.location.origin).href);
        if (path === '/script.js') mainModule = mod; else personas = mod;
        if (target('user')) return;
      } catch (e) { console.debug('[头像库] 可选用户模块不可用',path,e); }
    }
  }
  const imagePath = t => (t.type === 'persona' ? '/User%20Avatars/' : '/characters/') + encodeURIComponent(t.avatar);
  function database() {
    if (dbPromise) return dbPromise;
    const storage = ctx()?.accountStorage;
    if (!storage) throw new Error('当前酒馆缺少账号存储接口，请更新酒馆后重试。');
    let account = storage.getItem('tao-avatar-library-account');
    if (!account) { account = uid(); storage.setItem('tao-avatar-library-account', account); }
    dbPromise = new Promise((resolve, reject) => {
      const req = W.indexedDB.open('tao-avatar-library-' + account, 3);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('pairs')) req.result.createObjectStore('pairs',{keyPath:'id'}).createIndex('scope','scope');
        const store = req.result.objectStoreNames.contains('images') ? req.transaction.objectStore('images') : req.result.createObjectStore('images', { keyPath: 'id' });
        if (!store.indexNames.contains('avatar')) store.createIndex('avatar', 'avatar');
        if (!store.indexNames.contains('avatarDate')) store.createIndex('avatarDate', ['avatar', 'date']);
      };
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
      req.onerror = () => reject(new Error('无法打开头像存储：' + req.error.message));
      req.onblocked = () => reject(new Error('头像存储被其他窗口占用，请关闭旧窗口后重试。'));
    });
    return dbPromise;
  }
  async function transaction(mode, work, storeName = 'images') {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      let request;
      try { request = work(tx.objectStore(storeName)); } catch (e) { tx.abort(); reject(e); return; }
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('保存失败，可能是浏览器存储空间不足。'));
    });
  }
  const list = avatar => transaction('readonly', store => store.index('avatar').getAll(avatar));
  async function pageItems(key, offset) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images', 'readonly'), items = [];
      const range = W.IDBKeyRange.bound([key, 0], [key, Number.MAX_SAFE_INTEGER]);
      const req = tx.objectStore('images').index('avatarDate').openCursor(range, 'prev');
      let skipped = !offset;
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || items.length >= PAGE_SIZE) return;
        if (!skipped) { skipped = true; cursor.advance(offset); return; }
        items.push(cursor.value);
        if (items.length < PAGE_SIZE) cursor.continue();
      };
      tx.oncomplete = () => resolve(items);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('读取头像失败。'));
    });
  }
  // Remove embedded character text from PNGs without decoding and re-encoding pixels.
  async function originalImage(blob) {
    if (blob.size > 20 * 1024 * 1024) throw new Error('单张图片请小于 20 MB。');
    const buffer = await blob.arrayBuffer(), bytes = new Uint8Array(buffer);
    const pngSignature = [137,80,78,71,13,10,26,10];
    if (pngSignature.every((v, i) => bytes[i] === v)) {
      const view = new DataView(buffer), pieces = [bytes.subarray(0,8)];
      let offset = 8, ended = false;
      while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset), end = offset + length + 12;
        if (end > bytes.length) throw new Error('PNG 文件不完整。');
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        if (!['tEXt','iTXt','zTXt'].includes(type)) pieces.push(bytes.subarray(offset, end));
        offset = end;
        if (type === 'IEND') { ended = true; break; }
      }
      if (!ended) throw new Error('PNG 文件不完整。');
      return new W.Blob(pieces, {type:'image/png'});
    }
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.subarray(0,4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8,12)) === 'WEBP';
    if (!jpeg && !webp) throw new Error('请选择 PNG、JPG 或 WebP 图片。');
    return new W.Blob([buffer], {type:jpeg ? 'image/jpeg' : 'image/webp'});
  }
  async function thumbnail(blob) {
    let bitmap, url, source;
    try {
      if (typeof W.createImageBitmap === 'function') {
        try { bitmap = await W.createImageBitmap(blob, {resizeWidth:240,resizeQuality:'low'}); source = bitmap; } catch {}
      }
      if (!source) {
        url = W.URL.createObjectURL(blob); source = new W.Image(); source.decoding = 'async'; source.src = url; await source.decode();
      }
      const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
      const scale = Math.min(1, 240 / Math.max(width, height));
      const canvas = D.createElement('canvas'); canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
      canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
      const small = await new Promise(resolve => canvas.toBlob(resolve,'image/webp',.8));
      canvas.width = canvas.height = 1;
      if (!small) throw new Error('无法生成缩略图。');
      return small;
    } finally { bitmap?.close(); if (url) W.URL.revokeObjectURL(url); }
  }
  async function cacheThumbnail(id, thumb) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('images','readwrite'), store = tx.objectStore('images'), req = store.get(id);
      req.onsuccess = () => { if (req.result) store.put({...req.result,thumb}); };
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async function save(t, blob, name) {
    const clean = await originalImage(blob);
    const digest = await W.crypto.subtle.digest('SHA-256', await clean.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const id = t.key + ':' + hash;
    const old = await transaction('readonly', s => s.get(id));
    if (old) return false;
    await breathe();
    const thumb = await thumbnail(clean);
    await transaction('readwrite', s => s.put({id,avatar:t.key,hash,name:String(name).slice(0,120),date:Date.now(),blob:clean,thumb}));
    return true;
  }
  async function savePrevious(t,blob) {
    const clean = await originalImage(blob);
    const thumb = await thumbnail(clean);
    // A stable slot per identity prevents server re-encoding from creating new backups.
    const id = t.key + ':rolling-backup';
    await transaction('readwrite',store => store.put({
      id,avatar:t.key,autoBackup:true,name:'切换前备份（下次切换更新）',
      date:Date.now(),blob:clean,thumb,
    }));
    return true;
  }
  async function current(t) {
    const response = await W.fetch(imagePath(t) + '?tal=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('读取当前头像失败（' + response.status + '）。');
    return response.blob();
  }
  async function refreshImages(t) {
    let changed = 0;
    const stamp = String(Date.now());
    for (const img of D.querySelectorAll('img')) {
      if (img.closest('#tao-avatar-library-dialog') || img.dataset.tempIdentityAvatarBound === '1') continue;
      try {
        const u = new URL(img.src, W.location.href);
        if (u.origin !== W.location.origin) continue;
        if ((u.pathname === '/thumbnail' && u.searchParams.get('type') === t.type && u.searchParams.get('file') === t.avatar)
          || decodeURIComponent(u.pathname) === decodeURIComponent(imagePath(t))
          || (t.type === 'avatar' && img.id === 'avatar_load_preview' && target('char')?.key === t.key)) {
          const next = img.id === 'avatar_load_preview' ? new URL(imagePath(t), W.location.origin) : u;
          next.searchParams.set('tal', stamp); img.src = next.href;
          if (++changed % 8 === 0) await breathe();
        }
      } catch { /* An unrelated image may contain a non-URL source. */ }
    }
  }
  async function useImage(t, item) {
    if (target(t.type === 'persona' ? 'user' : 'char')?.key !== t.key) throw new Error('当前角色已改变，请关闭头像库后重新打开。');
    const added = await savePrevious(t, await current(t));
    if (stopped || target(t.type === 'persona' ? 'user' : 'char')?.key !== t.key) throw new Error('角色已切换，本次操作已取消。');
    await writeImage(t,item);
    return added;
  }
  async function writeImage(t,item) {
    const form = new W.FormData();
    form.append(t.type === 'persona' ? 'overwrite_name' : 'avatar_url', t.avatar);
    form.append('avatar', item.blob, item.blob.type === 'image/jpeg' ? 'avatar.jpg' : item.blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.png');
    const headers = new W.Headers(ctx().getRequestHeaders());
    headers.delete('Content-Type');
    const response = await W.fetch(t.type === 'persona' ? '/api/avatars/upload' : '/api/characters/edit-avatar', { method: 'POST', headers, body: form });
    if (!response.ok) throw new Error(response.status === 404 ? '当前酒馆不支持专用换头像接口，请更新酒馆。' : '换头像失败（' + response.status + '），原头像已备份。');
    // Start normal-key cache refresh and visible image refresh together.
    // Character data did not change: avoid broadcasting CHARACTER_EDITED to all extensions.
    const cacheRefresh = Promise.allSettled([
      W.fetch(imagePath(t), { cache: 'reload' }),
      W.fetch('/thumbnail?type=' + t.type + '&file=' + encodeURIComponent(t.avatar), { cache: 'reload' }),
    ]);
    await refreshImages(t);
    void cacheRefresh;
  }

  function element(tag, className, text) {
    const el = D.createElement(tag); if (className) el.className = className; if (text) el.textContent = text; return el;
  }
  function button(label, action, parent) {
    const b = element('button', 'menu_button tal-action', label); b.type = 'button';
    b.addEventListener('click', action); parent.append(b); return b;
  }
  function clearUrls() { renderToken++; for (const url of urls) W.URL.revokeObjectURL(url); urls.clear(); }
  async function run(action) {
    if (busy || !dialog) return;
    busy = true;
    dialog.querySelectorAll('button,input').forEach(b => { b.disabled = true; });
    try { await action(); } catch (e) { console.error('[头像库]', e); notify(e.message, true); }
    finally { busy = false; dialog?.querySelectorAll('button,input').forEach(b => { b.disabled = false; }); }
  }
  async function renameImage(id,name) {
    const db = await database();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('images','readwrite'), store = tx.objectStore('images'), req = store.get(id);
      let found = false;
      req.onsuccess = () => {
        if (!req.result) return;
        found = true; store.put({...req.result,name});
      };
      tx.oncomplete = () => found ? resolve() : reject(new Error('图片已被删除，请重新打开头像库。'));
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('名称保存失败。'));
    });
  }
  async function render(t) {
    const owner = dialog;
    const count = await transaction('readonly', store => store.index('avatar').count(t.key));
    pageNumber = Math.min(pageNumber, Math.max(0,Math.ceil(count/PAGE_SIZE)-1));
    const items = await pageItems(t.key, pageNumber*PAGE_SIZE);
    if (!dialog || dialog !== owner || stopped) return;
    clearUrls(); const token = renderToken, grid = dialog.querySelector('.tal-grid'); grid.replaceChildren();
    dialog.querySelector('.tal-count').textContent = count + ' 张头像 · 第 ' + (pageNumber+1) + ' / ' + Math.max(1,Math.ceil(count/PAGE_SIZE)) + ' 页';
    dialog.querySelector('.tal-pages')?.remove();
    const pages = element('div','tal-pages tal-row');
    if (pageNumber > 0) button('上一页', () => run(async () => { pageNumber--; await render(t); }), pages);
    if ((pageNumber+1)*PAGE_SIZE < count) button('下一页', () => run(async () => { pageNumber++; await render(t); }), pages);
    grid.after(pages);
    if (!count) grid.append(element('p', 'tal-empty', '还没有收藏。先保存当前头像，或添加喜欢的图片。'));
    const pending = [];
    // showModal() renders outside the root filter. These previews must not
    // receive the reverse filter intended for images inside the filtered page.
    function setPreview(img, blob) {
      if (stopped || renderToken !== token || !img.isConnected) return;
      const url = W.URL.createObjectURL(blob); urls.add(url); img.src = url;
    }
    for (const item of items) {
      const card = element('article','tal-card'), img = element('img','tal-preview th-color-decorative');
      img.setAttribute('data-th-color-decorative',''); img.alt = item.name; img.loading = 'lazy'; img.decoding = 'async';
      const title = element('div','tal-name',item.name); title.title = item.name;
      card.append(img,title);
      const row = element('div','tal-row'); card.append(row);
      button('使用', () => run(async () => {
        notify('正在保存原头像并切换…'); await breathe(); const added = await useImage(t,item); if (added) await render(t); notify('已换好「'+item.name+'」，原头像也已保存。');
      }),row);
      const editor = element('div','tal-rename'); editor.hidden = true;
      const nameInput = element('input'); nameInput.type = 'text'; nameInput.maxLength = 80;
      nameInput.placeholder = '例如：黑猫、白衬衫、秋日约会'; nameInput.setAttribute('aria-label','头像名称');
      editor.append(nameInput);
      const edits = element('div','tal-row'); editor.append(edits); card.append(editor);
      button(item.autoBackup ? '收藏备份' : '改名', () => {
        editor.hidden = false; nameInput.value = item.autoBackup ? '' : item.name; nameInput.focus(); nameInput.select();
      },row);
      const commitName = () => run(async () => {
        const name = nameInput.value.trim();
        if (!name) throw new Error('给头像起个名字再保存吧。');
        if (item.autoBackup) {
          const added = await save(t,item.blob,name);
          await render(t);
          notify(added ? '已另存为「'+name+'」，以后切换不会覆盖这张收藏。' : '这张图片已在收藏中，可找到它后改名。');
          return;
        }
        await renameImage(item.id,name);
        item.name = name; title.textContent = name; title.title = name; img.alt = name;
        editor.hidden = true; notify('已改名为「'+name+'」，情头选择中也会显示新名字。');
      });
      button('保存',commitName,edits);
      button('取消',() => { editor.hidden = true; },edits);
      nameInput.addEventListener('keydown',e => {
        if (e.isComposing) return;
        if (e.key === 'Enter') { e.preventDefault(); commitName(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); editor.hidden = true; }
      });
      button('删除', () => run(async () => {
        if (!W.confirm('从头像库删除这张图片？当前正在使用的角色头像不会被删除。')) return;
        await transaction('readwrite',s => s.delete(item.id)); await render(t); notify('已从头像库删除。');
      }),row);
      grid.append(card);
      if (item.thumb) setPreview(img,item.thumb); else pending.push({item,img});
    }
    // Old entries acquire one small preview at a time. Closing or paging cancels this work.
    void (async () => {
      for (const {item,img} of pending) {
        await breathe(); if (stopped || renderToken !== token) return;
        try {
          const thumb = await thumbnail(item.blob);
          if (stopped || renderToken !== token) return;
          setPreview(img,thumb); await cacheThumbnail(item.id,thumb);
        } catch (e) { console.warn('[头像库] 缩略图失败',e); }
      }
    })();
  }
  async function imageOptions(key) {
    const db = await database();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('images','readonly'), out = [];
      const req = tx.objectStore('images').index('avatar').openCursor(W.IDBKeyRange.only(key));
      req.onsuccess = () => { const c = req.result; if (c) { if (!c.value.autoBackup) out.push({id:c.value.id,name:c.value.name}); c.continue(); } };
      tx.oncomplete = () => resolve(out); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  function assertPairTargets(char,user) {
    if (target('char')?.key !== char.key || target('user')?.key !== user.key) throw new Error('角色或用户身份已切换，请重新打开情头绑定。');
  }
  async function applyPair(pair,char,user) {
    assertPairTargets(char,user);
    const charImage = await transaction('readonly',s => s.get(pair.charId));
    const userImage = await transaction('readonly',s => s.get(pair.userId));
    if (!charImage || !userImage) throw new Error('这组情头中的图片已被删除，请重新绑定。');
    if (charImage.avatar !== char.key || userImage.avatar !== user.key) throw new Error('情头与当前身份不匹配。');
    if (!W.confirm('为「'+char.name+'」和「'+user.name+'」一起更换这组情头？')) return;
    notify('正在备份两边的头像…');
    const charOld = await current(char), userOld = await current(user);
    await savePrevious(char,charOld); await savePrevious(user,userOld);
    assertPairTargets(char,user);
    try {
      notify('正在更换角色头像…'); await writeImage(char,charImage);
      assertPairTargets(char,user);
      notify('正在更换用户头像…'); await writeImage(user,userImage);
    } catch (e) {
      let recovered = true;
      for (const [t,blob] of [[char,charOld],[user,userOld]]) {
        try { await writeImage(t,{blob}); } catch { recovered = false; }
      }
      throw new Error(e.message + (recovered ? ' 两边已恢复原头像。' : ' 自动恢复未全部成功，请从两个头像库中使用刚才的备份恢复。'));
    }
    notify('情头已一起换好，两边原头像都已备份。');
  }
  async function pairPanel(original) {
    await loadUser();
    const char = target('char'), user = target('user');
    if (!char || !user) throw new Error('请先选好角色和用户身份，再打开情头绑定。');
    const owner = dialog;
    const charImages = await imageOptions(char.key), userImages = await imageOptions(user.key);
    if (!dialog || dialog !== owner || stopped) return;
    clearUrls();
    const grid = dialog.querySelector('.tal-grid'); grid.replaceChildren();
    dialog.querySelector('.tal-pages')?.remove();
    dialog.querySelector('.tal-toolbar').hidden = true;
    dialog.querySelector('.tal-count').textContent = char.name + ' × ' + user.name;
    const box = element('div','tal-pair-box'); grid.append(box);
    button('返回头像库',() => run(async () => { dialog.querySelector('.tal-toolbar').hidden = false; await render(original); notify('已返回头像库。'); }),box);
    box.append(element('p','','分别选一张已收藏的头像，保存成一组。'));
    function selectFor(label,items) {
      const line = element('label','tal-pair-label',label), select = element('select');
      select.setAttribute('aria-label',label);
      const blank = element('option','','请选择头像'); blank.value = ''; select.append(blank);
      for (const item of items) { const o = element('option','',item.name); o.value = item.id; select.append(o); }
      const preview = element('img','tal-preview th-color-decorative'); preview.setAttribute('data-th-color-decorative',''); preview.alt = label+'预览'; preview.hidden = true; preview.style.cssText = 'width:120px;height:160px;object-fit:contain';
      select.addEventListener('change',async () => {
        const selected = select.value; preview.hidden = true;
        if (!selected) return;
        try {
          const item = await transaction('readonly',s => s.get(selected));
          if (!item) return;
          const thumb = item.thumb || await thumbnail(item.blob);
          if (stopped || !preview.isConnected || select.value !== selected) return;
          if (preview.dataset.url) { W.URL.revokeObjectURL(preview.dataset.url); urls.delete(preview.dataset.url); }
          const url = W.URL.createObjectURL(thumb); urls.add(url); preview.dataset.url = url; preview.src = url; preview.hidden = false;
        } catch (e) { notify('预览未能加载：'+e.message,true); }
      });
      line.append(select,preview); box.append(line); return select;
    }
    const charSelect = selectFor('角色：'+char.name,charImages), userSelect = selectFor('用户：'+user.name,userImages);
    const name = element('input'); name.placeholder = '情头名称，例如：秋日约会'; name.maxLength = 80; name.setAttribute('aria-label','情头名称'); box.append(name);
    const scope = JSON.stringify([char.key,user.key]);
    const savedBox = element('div');
    async function showPairs() {
      const pairs = await transaction('readonly',s => s.index('scope').getAll(scope),'pairs');
      if (!savedBox.isConnected) return;
      savedBox.replaceChildren();
      if (!pairs.length) savedBox.append(element('p','','还没有保存的情头组合。'));
      for (const pair of pairs) {
        const row = element('div','tal-row'); row.append(element('span','',pair.name));
        button('一起使用',() => run(() => applyPair(pair,char,user)),row);
        button('解除绑定',() => run(async () => {
          if (!W.confirm('解除这组情头绑定？两张收藏图片会保留。')) return;
          await transaction('readwrite',s => s.delete(pair.id),'pairs'); await showPairs(); notify('已解除绑定，图片仍在头像库。');
        }),row); savedBox.append(row);
      }
    }
    button('保存情头绑定',() => run(async () => {
      assertPairTargets(char,user);
      if (!charSelect.value || !userSelect.value) throw new Error('请先分别选择角色和用户的头像；没有图片时，请先去对应头像库添加。');
      const id = scope+':'+charSelect.value+':'+userSelect.value;
      await transaction('readwrite',s => s.put({id,scope,name:name.value.trim() || '我的情头',charId:charSelect.value,userId:userSelect.value}),'pairs');
      await showPairs(); notify('情头已绑定，点击“一起使用”即可同时更换。');
    }),box);
    box.append(savedBox); await showPairs();
    notify('绑定仅用于一起换头像，不会修改酒馆的人设与聊天绑定。');
  }
  function download(blob, name) {
    const url = W.URL.createObjectURL(blob), a = element('a'); a.href = url; a.download = name;
    D.body.append(a); a.click(); a.remove(); W.setTimeout(() => W.URL.revokeObjectURL(url), 10000);
  }
  function dataUrl(blob) { return new Promise((resolve, reject) => { const r = new W.FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); }); }
  function close() { if (busy) return; dialog?.close(); }
  async function open(kind = 'char') {
    if (stopped) return;
    if (kind === 'user') await loadUser();
    if (stopped) return;
    activeKind = kind;
    pageNumber = 0;
    if (dialog) { dialog.focus(); return; }
    const t = target(); if (!t) { notify(kind === 'user' ? '请先在用户设置中选择一个头像。' : '请先打开一张已保存的角色卡。', true); return; }
    const previousFocus = D.activeElement;
    dialog = element('dialog'); dialog.id = 'tao-avatar-library-dialog';
    dialog.setAttribute('aria-label', t.name + '的头像库');
    const heading = element('header', 'tal-header');
    heading.append(element('strong', '', t.name + (kind === 'user' ? ' · 我的头像库' : ' · 角色头像库'))); button('关闭', close, heading);
    const bar = element('div', 'tal-toolbar');
    button('情头绑定', () => run(() => pairPanel(t)), bar);
    button('保存当前头像', () => run(async () => { notify('正在保存头像…'); await breathe(); const added = await save(t, await current(t), '收藏的头像'); if (added) { pageNumber = 0; await render(t); } notify(added ? '当前头像已保存。' : '这张头像已经在库里啦。'); }), bar);
    const upload = element('input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp'; upload.multiple = true; upload.hidden = true;
    button('添加图片', () => upload.click(), bar);
    upload.addEventListener('change', () => run(async () => {
      const files = [...upload.files]; upload.value = ''; let added = 0, failed = 0;
      for (const file of files) { notify('正在添加 ' + (files.indexOf(file)+1) + ' / ' + files.length + ' 张…'); await breathe(); try { if (await save(t, file, file.name)) added++; } catch (e) { failed++; console.error(e); } }
      pageNumber = 0; await render(t); notify('新增 ' + added + ' 张，重复 ' + (files.length - added - failed) + ' 张' + (failed ? '，失败 ' + failed + ' 张（支持 PNG/JPG/WebP，单张不超过 20 MB）。' : '。'));
    }));
    button('导出备份', () => run(async () => {
      const items = await list(t.key), images = [];
      for (const item of items) images.push({ name: item.name, image: await dataUrl(item.blob) });
      download(new W.Blob([JSON.stringify({ format: 'tao-avatar-library', version: 1, character: t.name, images })], { type: 'application/json' }), t.name.replace(/[\\/:*?"<>|]/g, '_') + '-头像库备份.json');
      notify('已导出这个角色的头像库备份。');
    }), bar);
    const restore = element('input'); restore.type = 'file'; restore.accept = '.json'; restore.hidden = true;
    button('导入备份', () => restore.click(), bar);
    restore.addEventListener('change', () => run(async () => {
      const file = restore.files[0]; restore.value = ''; if (!file) return;
      if (file.size > 150 * 1024 * 1024) throw new Error('备份大于 150 MB，请拆分后导入。');
      const data = JSON.parse(await file.text());
      if (data.format !== 'tao-avatar-library' || data.version !== 1 || !Array.isArray(data.images)) throw new Error('这不是头像库备份文件。');
      if (!W.confirm('将备份中的 ' + data.images.length + ' 张图片添加到「' + t.name + '」的头像库？')) return;
      let added = 0;
      for (const item of data.images) {
        await breathe();
        if (typeof item.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(item.image)) throw new Error('备份包含无效图片，已停止导入；之前导入的图片已保留。');
        if (await save(t, await (await W.fetch(item.image)).blob(), item.name || '导入的头像')) added++;
      }
      pageNumber = 0; await render(t); notify('已添加 ' + added + ' 张，重复图片已跳过。');
    }));
    const status = element('p', 'tal-status', '头像保存在当前浏览器中；换设备或清理数据前，请导出备份。'); status.setAttribute('role', 'status');
    dialog.append(heading, bar, upload, restore, element('div', 'tal-count'), element('div', 'tal-grid'), status);
    dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
    dialog.addEventListener('close', () => { const old = dialog; dialog = null; old?.remove(); clearUrls(); previousFocus?.focus(); });
    D.body.append(dialog); dialog.showModal(); run(() => render(t));
  }
  const style = element('style'); style.id = 'tao-avatar-library-style';
  style.textContent = `
    #tao-avatar-library-dialog [hidden]{display:none!important}
    #tao-avatar-library-dialog .tal-pair-box{grid-column:1/-1;display:grid;gap:12px}
    #tao-avatar-library-dialog .tal-pair-label{display:grid;gap:6px}
    #tao-avatar-library-dialog .tal-pair-box select,#tao-avatar-library-dialog .tal-pair-box input{box-sizing:border-box;width:100%;min-height:40px;font:inherit;color:inherit;background:var(--SmartThemeBlurTintColor,#29292e)}
    #tao-user-avatar-library-entry{display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
    #tao-avatar-library-entry{cursor:pointer;gap:5px;align-items:center;justify-content:center}
    #tao-avatar-library-dialog{box-sizing:border-box;width:min(700px,94vw);max-width:94vw;max-height:86vh;max-height:86dvh;padding:18px;border:1px solid var(--SmartThemeBorderColor,#888);border-radius:16px;background:var(--SmartThemeBlurTintColor,#28282c);color:var(--SmartThemeBodyColor,#eee);font:inherit;overflow:auto;box-shadow:0 12px 50px #0006}
    #tao-avatar-library-dialog::backdrop{background:#0008}
    #tao-avatar-library-dialog:modal img.tal-preview{filter:none!important}
    #tao-avatar-library-dialog .tal-header,#tao-avatar-library-dialog .tal-toolbar,#tao-avatar-library-dialog .tal-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    #tao-avatar-library-dialog .tal-header{justify-content:space-between;margin-bottom:14px}
    #tao-avatar-library-dialog .tal-header strong{overflow-wrap:anywhere;flex:1}
    #tao-avatar-library-dialog .tal-action{width:auto;min-height:36px;margin:0;font:inherit;color:inherit;padding:6px 10px;cursor:pointer}
    #tao-avatar-library-dialog button:disabled{opacity:.5;cursor:wait}
    #tao-avatar-library-dialog .tal-count{margin:12px 0;font-size:.85em;opacity:.7}
    #tao-avatar-library-dialog .tal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:12px}
    #tao-avatar-library-dialog .tal-card{min-width:0;border:1px solid var(--SmartThemeBorderColor,#8886);border-radius:10px;padding:8px}
    #tao-avatar-library-dialog .tal-card img{display:block;width:100%;height:180px;object-fit:contain;background:#8881;border-radius:6px}
    #tao-avatar-library-dialog .tal-name{overflow-wrap:anywhere;white-space:normal;font-size:.85em;line-height:1.4;margin:8px 0}
    #tao-avatar-library-dialog .tal-rename{margin-top:10px;display:grid;gap:8px}
    #tao-avatar-library-dialog .tal-rename input{box-sizing:border-box;width:100%;min-width:0;min-height:38px;font:inherit;color:inherit;background:var(--SmartThemeBlurTintColor,#29292e);border:1px solid var(--SmartThemeBorderColor,#888);border-radius:6px;padding:6px}
    #tao-avatar-library-dialog .tal-card .tal-action{padding:5px 7px;font-size:.85em}
    #tao-avatar-library-dialog .tal-row{justify-content:space-between}
    #tao-avatar-library-dialog .tal-status{font-size:.85em;line-height:1.6;margin:14px 0 0;overflow-wrap:anywhere}
    #tao-avatar-library-dialog .tal-empty{grid-column:1/-1;padding:30px 0;text-align:center;opacity:.7}
    @media(max-width:480px){#tao-avatar-library-dialog{padding:12px}#tao-avatar-library-dialog .tal-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}
  `;
  D.head.append(style);
  function mountUserEntry() {
    const anchor = D.getElementById('persona_set_image_button') || D.getElementById('persona_delete_button') || D.getElementById('persona_duplicate_button');
    if (!anchor?.parentElement) return;
    let entry = D.getElementById('tao-user-avatar-library-entry');
    if (!entry) {
      entry = element('button','menu_button',''); entry.type = 'button';
      entry.id = 'tao-user-avatar-library-entry'; entry.title = '我的头像库'; entry.setAttribute('aria-label','我的头像库');
      const icon = element('i','fa-solid fa-images'); icon.setAttribute('aria-hidden','true'); entry.append(icon);
      entry.addEventListener('click',() => open('user'));
    }
    if (entry.parentElement !== anchor.parentElement) anchor.after(entry);
  }
  function mount() {
    if (stopped || D.visibilityState === 'hidden') return;
    const anchor = D.getElementById('delete_button') || D.getElementById('export_button');
    mountUserEntry();
    if (!anchor?.parentElement) return;
    let entry = D.getElementById('tao-avatar-library-entry');
    if (!entry) {
      entry = element('button', 'menu_button', ''); entry.id = 'tao-avatar-library-entry'; entry.type = 'button';
      entry.title = '头像库'; entry.setAttribute('aria-label', '头像库');
      const icon = element('i', 'fa-solid fa-images'); icon.setAttribute('aria-hidden', 'true'); entry.append(icon);
      entry.addEventListener('click', () => open('char')); anchor.before(entry);
    }
    entry.style.display = target('char') && W.getComputedStyle(anchor).display !== 'none' ? 'inline-flex' : 'none';
  }
  function dispose() {
    stopped = true; W.clearInterval(timer); D.getElementById('tao-avatar-library-entry')?.remove(); D.getElementById('tao-user-avatar-library-entry')?.remove();
    dialog?.remove(); dialog = null; clearUrls(); style.remove();
    dbPromise?.then(db => db.close()).catch(() => {});
    window.removeEventListener('pagehide', dispose);
    if (W[KEY]?.dispose === dispose) delete W[KEY];
  }
  W[KEY] = { dispose, open, isBusy: () => busy };
  window.addEventListener('pagehide', dispose, { once: true });
  mount(); timer = W.setInterval(mount, 3000);

 const moduleInstance = W[KEY];
 moduleInstance.isActive = () => !stopped && W[KEY] === moduleInstance;
 return moduleInstance;
}


// Native extension module: window is the Tavern host, even when Tavern is embedded.
function startTemporary() {

  'use strict';

  const SCRIPT_WIN = window;
  const WIN = window;
  const DOC = WIN.document;
  const NS = 'temp-chat-identity-01';
  const PANEL_ID = `${NS}-panel`;
  const STYLE_ID = `${NS}-style`;
  const MENU_ITEM_ID = `${NS}-menu-item`;
  const BUTTON_NAME = '临时换装';

  const eventOff = [];
  const timers = new Set();
  let scanFrame = null;
  function later(callback, delay) {
    const timer = WIN.setTimeout(() => {
      timers.delete(timer);
      if (!state.cleaned) callback();
    }, delay);
    timers.add(timer);
  }
  const state = {
    charName: '',
    userName: '',
    charAvatar: '',
    userAvatar: '',
    charAvatarKind: '',
    userAvatarKind: '',
    observer: null,
    nativeAbort: null,
    panelAbort: null,
    panelFocus: null,
    scanQueued: false,
    cleaned: false,
    nameOriginals: new WeakMap(),
    imageOriginals: new WeakMap(),
    ownedObjectUrls: new Set(),
  };

  function log(...args) {
    console.log('[临时身份 1.0.3]', ...args);
  }

  function isUserMessageElement(el) {
    const mes = el?.closest?.('.mes');
    if (!mes) return false;
    return mes.getAttribute('is_user') === 'true' || mes.classList.contains('user_mes');
  }

  function roleOfElement(el) {
    return isUserMessageElement(el) ? 'user' : 'char';
  }

  function snapshotName(el) {
    if (!el || state.nameOriginals.has(el)) return;
    state.nameOriginals.set(el, el.textContent ?? '');
  }

  function applyNameElement(el) {
    if (!el) return;
    const role = roleOfElement(el);
    const next = role === 'user' ? state.userName : state.charName;
    const bound = el.dataset.tempIdentityNameBound === '1';

    if (next) {
      snapshotName(el);
      if (el.textContent !== next) el.textContent = next;
      el.dataset.tempIdentityNameBound = '1';
      el.dataset.tempIdentityRole = role;
      return;
    }

    if (bound) restoreNameElement(el);
  }

  function restoreNameElement(el) {
    if (!el) return;
    const original = state.nameOriginals.get(el);
    if (original !== undefined && el.textContent !== original) {
      el.textContent = original;
    }
    delete el.dataset.tempIdentityNameBound;
    delete el.dataset.tempIdentityRole;
    state.nameOriginals.delete(el);
  }

  function getAttrSnapshot(img, name) {
    return img.hasAttribute(name) ? img.getAttribute(name) : null;
  }

  function snapshotImage(img) {
    if (!img || state.imageOriginals.has(img)) return;
    state.imageOriginals.set(img, {
      src: getAttrSnapshot(img, 'src'),
      srcset: getAttrSnapshot(img, 'srcset'),
      sizes: getAttrSnapshot(img, 'sizes'),
      hd55ThumbSrc: img.dataset.hd55ThumbSrc,
      hd55OriginalSrcset: img.dataset.hd55OriginalSrcset,
      hd55OriginalSizes: img.dataset.hd55OriginalSizes,
      hd55OriginalSrcsetStored: img.dataset.hd55OriginalSrcsetStored,
      hd55OriginalSizesStored: img.dataset.hd55OriginalSizesStored,
      hd55File: img.dataset.hd55File,
      hd55HdUrl: img.dataset.hd55HdUrl,
      hd55Bound: img.dataset.hd55Bound,
      tempRole: img.dataset.tempIdentityRole,
    });
  }

  function setOrRemoveAttr(el, name, value) {
    if (value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  function setDatasetValue(el, key, value) {
    if (value === undefined) delete el.dataset[key];
    else el.dataset[key] = value;
  }

  function restoreImageElement(img) {
    if (!img) return;
    const original = state.imageOriginals.get(img);
    if (!original) {
      delete img.dataset.tempIdentityAvatarBound;
      delete img.dataset.tempIdentityRole;
      return;
    }

    setOrRemoveAttr(img, 'srcset', original.srcset);
    setOrRemoveAttr(img, 'sizes', original.sizes);

    setDatasetValue(img, 'hd55ThumbSrc', original.hd55ThumbSrc);
    setDatasetValue(img, 'hd55OriginalSrcset', original.hd55OriginalSrcset);
    setDatasetValue(img, 'hd55OriginalSizes', original.hd55OriginalSizes);
    setDatasetValue(img, 'hd55OriginalSrcsetStored', original.hd55OriginalSrcsetStored);
    setDatasetValue(img, 'hd55OriginalSizesStored', original.hd55OriginalSizesStored);
    setDatasetValue(img, 'hd55File', original.hd55File);
    setDatasetValue(img, 'hd55HdUrl', original.hd55HdUrl);
    setDatasetValue(img, 'hd55Bound', original.hd55Bound);

    if (original.src !== null && img.getAttribute('src') !== original.src) {
      img.setAttribute('src', original.src);
    } else if (original.src === null) {
      img.removeAttribute('src');
    }

    delete img.dataset.tempIdentityAvatarBound;
    delete img.dataset.tempIdentityRole;
    state.imageOriginals.delete(img);
  }

  function applyAvatarElement(img) {
    if (!img) return;
    const role = roleOfElement(img);
    const source = role === 'user' ? state.userAvatar : state.charAvatar;
    const bound = img.dataset.tempIdentityAvatarBound === '1';

    if (!source) {
      if (bound) restoreImageElement(img);
      return;
    }

    snapshotImage(img);

    // 临时头像期间完全取消响应式缩略图候选，避免主题 / 浏览器又挑回 thumbnail。
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');

    // 与“哇！头像变清晰啦！4.5.7”兼容：让它把这个临时原图视为已绑定高清源，
    // 这样它的 MutationObserver 不会再把 src 抢回真实角色 / Persona 的头像。
    img.dataset.hd55ThumbSrc = source;
    img.dataset.hd55OriginalSrcset = '';
    img.dataset.hd55OriginalSizes = '';
    delete img.dataset.hd55OriginalSrcsetStored;
    delete img.dataset.hd55OriginalSizesStored;
    img.dataset.hd55File = `__temp_identity_${role}__`;
    img.dataset.hd55HdUrl = source;
    img.dataset.hd55Bound = '1';

    img.dataset.tempIdentityAvatarBound = '1';
    img.dataset.tempIdentityRole = role;

    if (img.getAttribute('src') !== source) img.setAttribute('src', source);
  }

  function scan(force = false) {
    if (state.cleaned) return;

    DOC.querySelectorAll('#chat .mes .name_text').forEach(el => {
      if (force || el.dataset.tempIdentityNameBound !== '1') applyNameElement(el);
      else {
        const role = roleOfElement(el);
        const expected = role === 'user' ? state.userName : state.charName;
        if ((expected && el.textContent !== expected) || (!expected && el.dataset.tempIdentityNameBound === '1')) {
          applyNameElement(el);
        }
      }
    });

    DOC.querySelectorAll('#chat .mesAvatarWrapper img').forEach(img => {
      const role = roleOfElement(img);
      const expected = role === 'user' ? state.userAvatar : state.charAvatar;
      if (force || img.dataset.tempIdentityAvatarBound !== '1' || (expected && img.getAttribute('src') !== expected) || (expected && (img.hasAttribute('srcset') || img.hasAttribute('sizes'))) || (!expected && img.dataset.tempIdentityAvatarBound === '1')) {
        applyAvatarElement(img);
      }
    });
  }

  function queueScan(force = false) {
    if (state.cleaned || state.scanQueued) return;
    state.scanQueued = true;
    scanFrame = WIN.requestAnimationFrame(() => {
      scanFrame = null;
      state.scanQueued = false;
      scan(force);
    });
  }

  function revokeOwnedUrl(url) {
    if (!url || !state.ownedObjectUrls.has(url)) return;
    try { WIN.URL.revokeObjectURL(url); } catch {}
    state.ownedObjectUrls.delete(url);
  }

  function replaceAvatarState(role, source, kind = '') {
    const key = role === 'user' ? 'userAvatar' : 'charAvatar';
    const kindKey = role === 'user' ? 'userAvatarKind' : 'charAvatarKind';
    const old = state[key];
    if (old && old !== source) revokeOwnedUrl(old);
    state[key] = source || '';
    state[kindKey] = source ? kind : '';
  }

  function restoreAll(role = 'all') {
    DOC.querySelectorAll('#chat .name_text[data-temp-identity-name-bound="1"]').forEach(el => {
      if (role === 'all' || el.dataset.tempIdentityRole === role) restoreNameElement(el);
    });
    DOC.querySelectorAll('#chat .mesAvatarWrapper img[data-temp-identity-avatar-bound="1"]').forEach(img => {
      if (role === 'all' || img.dataset.tempIdentityRole === role) restoreImageElement(img);
    });
  }

  function resetRole(role) {
    if (role === 'user') {
      state.userName = '';
      replaceAvatarState('user', '', '');
    } else {
      state.charName = '';
      replaceAvatarState('char', '', '');
    }
    restoreAll(role);
    queueScan(true);
    syncPanelFromState();
  }

  function resetAll() {
    state.charName = '';
    state.userName = '';
    replaceAvatarState('char', '', '');
    replaceAvatarState('user', '', '');
    restoreAll('all');
    queueScan(true);
    syncPanelFromState();
  }

  function findVisibleRealName(role) {
    const selector = role === 'user'
      ? '#chat .mes[is_user="true"] .name_text, #chat .mes.user_mes .name_text'
      : '#chat .mes:not([is_user="true"]):not(.user_mes) .name_text';
    const el = DOC.querySelector(selector);
    if (el) {
      const original = state.nameOriginals.get(el);
      return original !== undefined ? original : (el.textContent || '');
    }

    try {
      const TH = WIN.TavernHelper;
      if (role === 'user' && typeof TH?.getCurrentPersonaName === 'function') return TH.getCurrentPersonaName() || '';
      if (role === 'char' && typeof TH?.getCurrentCharacterName === 'function') return TH.getCurrentCharacterName() || '';
    } catch {}
    const c = WIN.SillyTavern?.getContext();
    return (role === 'user' ? c?.name1 : c?.name2) || '';
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureStyle() {
    if (DOC.getElementById(STYLE_ID)) return;
    const style = DOC.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${PANEL_ID}::backdrop{background:rgba(0,0,0,.38)}
`;
    DOC.head.appendChild(style);
  }

  function panelStyles() {
    return `
:host{font-family:var(--mainFontFamily,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);font-size:14px;line-height:1.5;color:var(--SmartThemeBodyColor,#f4f4f5);text-shadow:none;text-align:left}
*,*::before,*::after{box-sizing:border-box}
.ti-card{width:100%;max-height:inherit;min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--SmartThemeBorderColor,rgba(127,127,127,.4));border-radius:16px;background:var(--ti-panel-bg,#25252b);color:inherit;box-shadow:0 18px 60px rgba(0,0,0,.28)}
.ti-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--SmartThemeBorderColor,rgba(127,127,127,.3))}
.ti-title{font-size:17px;font-weight:700}
.ti-close{border:0;background:transparent;color:inherit;font:inherit;font-size:26px;line-height:1;cursor:pointer;padding:7px;border-radius:9px;flex:none}
.ti-content{position:relative;display:flex;min-height:0;flex:1 1 auto;overflow:hidden}
.ti-body{width:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px 24px 14px 14px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;scrollbar-width:none}
.ti-body::-webkit-scrollbar{display:none}
.ti-scrollbar{position:absolute;right:3px;top:10px;bottom:10px;width:18px;touch-action:none;cursor:pointer}
.ti-scrollbar[hidden]{display:none}
.ti-scrollbar::before{content:"";position:absolute;left:6px;top:0;bottom:0;width:6px;border-radius:6px;background:rgba(127,127,127,.2)}
.ti-scroll-thumb{position:absolute;left:6px;width:6px;min-height:24px;border-radius:6px;background:currentColor;opacity:.6}
.ti-scrollbar:focus-visible{outline:2px solid var(--SmartThemeQuoteColor,currentColor);outline-offset:0;border-radius:8px}
.ti-role{min-width:0;border:1px solid var(--SmartThemeBorderColor,rgba(127,127,127,.3));border-radius:12px;padding:12px;background:rgba(127,127,127,.06)}
h3{margin:0 0 4px;font-size:15px}
.ti-real{font-size:12px;opacity:.8;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
label{display:block;font-size:12px;margin:8px 0 5px}
input[type="text"],input[type="url"]{width:100%;min-width:0;border:1px solid var(--SmartThemeBorderColor,rgba(127,127,127,.4));border-radius:9px;padding:8px 10px;background:rgba(127,127,127,.08);color:inherit;font:inherit;outline:none}
input::placeholder{color:inherit;opacity:.55}
input:focus-visible,button:focus-visible{outline:2px solid var(--SmartThemeQuoteColor,currentColor);outline-offset:2px}
.ti-avatar-row{display:grid;grid-template-columns:58px minmax(0,1fr);gap:10px;align-items:center}
.ti-preview{display:block;width:58px;height:88px;border-radius:8px;object-fit:contain;background:rgba(127,127,127,.12);border:1px solid var(--SmartThemeBorderColor,rgba(127,127,127,.4))}
.ti-preview:not([src]){visibility:hidden}
.ti-file{width:100%;min-width:0;font:inherit;font-size:12px;color:inherit}
.ti-small{font-size:11px;line-height:1.45;opacity:.82;margin-top:5px;overflow-wrap:anywhere}
.ti-actions{flex:none;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:12px 14px;border-top:1px solid var(--SmartThemeBorderColor,rgba(127,127,127,.3))}
button.ti-btn{border:1px solid var(--SmartThemeBorderColor,rgba(127,127,127,.4));border-radius:9px;padding:8px 12px;background:rgba(127,127,127,.1);color:inherit;font:inherit;cursor:pointer;min-height:38px}
button.ti-btn.primary{background:var(--SmartThemeQuoteColor,#657565);color:#fff;border-color:transparent}
:host(.compact) .ti-body{grid-template-columns:minmax(0,1fr)}
:host(.compact) .ti-head{padding:10px 12px}
:host(.compact) input[type="text"],:host(.compact) input[type="url"]{font-size:16px}
:host(.compact) .ti-actions{gap:6px;padding:10px}
:host(.compact) button.ti-btn{padding:8px 10px}
`;
  }

  function layoutPanel(panel) {
    const viewport = WIN.visualViewport;
    const width = viewport?.width || WIN.innerWidth;
    const height = viewport?.height || WIN.innerHeight;
    const gutter = width < 680 ? 8 : 16;
    const set = (key, value) => panel.style.setProperty(key, value, 'important');
    set('left', `${(viewport?.offsetLeft || 0) + width / 2}px`);
    set('top', `${(viewport?.offsetTop || 0) + height / 2}px`);
    set('width', `${Math.min(720, Math.max(0, width - gutter * 2))}px`);
    const heightLimit = width < 680 ? Math.min(600, height * 0.8) : 780;
    set('max-height', `${Math.max(0, Math.min(heightLimit, height - gutter * 2))}px`);
    panel.classList.toggle('compact', width < 680);
    panel.__tiRoot?.host.classList.toggle('compact', width < 680);
    panel.__tiUpdateScroll?.();
  }

  function opaqueThemeColor(color) {
    const value = String(color || '').trim();
    const rgb = value.match(/^rgba?\((.*)\)$/i);
    if (rgb) {
      const channels = rgb[1].includes(',') ? rgb[1].split(',').slice(0, 3).join(',') : rgb[1].split('/')[0].trim();
      return `rgb(${channels})`;
    }
    const wide = value.match(/^(color|lab|lch|oklab|oklch|hwb)\((.*)\)$/i);
    if (wide) return `${wide[1]}(${wide[2].split('/')[0].trim()})`;
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '#25252b';
  }

  function syncPanelTheme(panel) {
    const probe = panel.__tiRoot?.querySelector('.ti-color-probe');
    if (!probe) return;
    // 浏览器先解析主题色，再去掉颜色里的透明度；不改酒馆的主题变量。
    const color = opaqueThemeColor(WIN.getComputedStyle(probe).backgroundColor);
    if (panel.style.getPropertyValue('--ti-panel-bg') !== color) panel.style.setProperty('--ti-panel-bg', color);
  }

  function bindPanelScrollbar(panel) {
    const root = panel.__tiRoot;
    const body = root.querySelector('.ti-body');
    const rail = root.querySelector('.ti-scrollbar');
    const thumb = root.querySelector('.ti-scroll-thumb');
    const update = () => {
      const maximum = Math.max(0, body.scrollHeight - body.clientHeight);
      rail.hidden = maximum <= 1;
      const trackHeight = rail.clientHeight;
      const thumbHeight = Math.min(trackHeight, Math.max(24, trackHeight * body.clientHeight / Math.max(1, body.scrollHeight)));
      const thumbTop = maximum > 0 ? (trackHeight - thumbHeight) * body.scrollTop / maximum : 0;
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.top = `${thumbTop}px`;
      rail.setAttribute('aria-valuemax', String(Math.round(maximum)));
      rail.setAttribute('aria-valuenow', String(Math.round(body.scrollTop)));
    };
    body.addEventListener('scroll', update, { passive: true });
    let pointer = null;
    let offset = 0;
    const move = event => {
      const maximum = Math.max(0, body.scrollHeight - body.clientHeight);
      const travel = rail.clientHeight - thumb.offsetHeight;
      if (travel <= 0) return;
      const y = event.clientY - rail.getBoundingClientRect().top - offset;
      body.scrollTop = Math.max(0, Math.min(1, y / travel)) * maximum;
      update();
    };
    rail.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointer = event.pointerId;
      offset = event.target === thumb ? event.clientY - thumb.getBoundingClientRect().top : thumb.offsetHeight / 2;
      rail.setPointerCapture(event.pointerId);
      event.preventDefault();
      move(event);
    });
    rail.addEventListener('pointermove', event => { if (event.pointerId === pointer) move(event); });
    rail.addEventListener('lostpointercapture', () => { pointer = null; });
    rail.addEventListener('pointerup', event => { if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId); pointer = null; });
    rail.addEventListener('pointercancel', () => { pointer = null; });
    rail.addEventListener('keydown', event => {
      const max = Math.max(0, body.scrollHeight - body.clientHeight);
      const positions = { ArrowUp: body.scrollTop - 40, ArrowDown: body.scrollTop + 40, PageUp: body.scrollTop - body.clientHeight * 0.8, PageDown: body.scrollTop + body.clientHeight * 0.8, Home: 0, End: max };
      if (!(event.key in positions)) return;
      event.preventDefault();
      body.scrollTop = Math.max(0, Math.min(max, positions[event.key]));
      update();
    });
    panel.__tiUpdateScroll = update;
    if (typeof WIN.ResizeObserver === 'function') {
      panel.__tiScrollObserver = new WIN.ResizeObserver(update);
      [body, root.querySelector('.ti-card'), ...root.querySelectorAll('.ti-role')].forEach(el => panel.__tiScrollObserver.observe(el));
    }
    update();
  }

  function showPanel(panel) {
    syncPanelTheme(panel);
    layoutPanel(panel);
    panel.style.setProperty('display', 'flex', 'important');
    if (typeof panel.showModal === 'function') {
      if (!panel.open) panel.showModal();
    } else panel.setAttribute('open', '');
    panel.classList.add('open');
    state.panelAbort?.abort();
    state.panelAbort = new WIN.AbortController();
    const options = { signal: state.panelAbort.signal };
    const update = () => layoutPanel(panel);
    WIN.addEventListener('resize', update, options);
    WIN.visualViewport?.addEventListener('resize', update, options);
    WIN.visualViewport?.addEventListener('scroll', update, options);
    panel.__tiThemeObserver?.disconnect();
    panel.__tiThemeObserver = new WIN.MutationObserver(() => syncPanelTheme(panel));
    [DOC.documentElement, DOC.body].forEach(el => panel.__tiThemeObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class'] }));
    WIN.requestAnimationFrame(() => { if (panel.open) panel.__tiUpdateScroll?.(); });
  }

  function hidePanel(panel) {
    panel.__tiThemeObserver?.disconnect();
    state.panelAbort?.abort();
    state.panelAbort = null;
    if (typeof panel.close === 'function' && panel.open) panel.close();
    panel.removeAttribute('open');
    panel.classList.remove('open');
    panel.style.setProperty('display', 'none', 'important');
  }

  function panelRoleHtml(role, title) {
    const realName = findVisibleRealName(role);
    const nameValue = role === 'user' ? state.userName : state.charName;
    const avatarValue = role === 'user' ? state.userAvatar : state.charAvatar;
    return `
      <section class="ti-role" data-role="${role}">
        <h3>${title}</h3>
        <div class="ti-real">原来的名字：${esc(realName || '未检测到')}</div>
        <label>临时显示名</label>
        <input class="ti-name" type="text" value="${esc(nameValue)}" placeholder="留空 = 保持真实名字">
        <label>临时头像</label>
        <div class="ti-avatar-row">
          <img class="ti-preview" alt="preview" ${avatarValue ? `src="${esc(avatarValue)}"` : ''}>
          <div>
            <input class="ti-file" type="file" accept="image/*">
            <div class="ti-small">直接读取原图，不压缩，不会保存到角色卡或用户设定。</div>
          </div>
        </div>
        <label>或使用图片 URL</label>
        <input class="ti-url" type="url" value="${state[role === 'user' ? 'userAvatarKind' : 'charAvatarKind'] === 'url' ? esc(avatarValue) : ''}" placeholder="https://... / data:image/...">
        <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="ti-btn ti-reset-role" type="button">恢复这个身份</button></div>
      </section>`;
  }

  function ensurePanel() {
    ensureStyle();
    let panel = DOC.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = DOC.createElement('dialog');
    panel.id = PANEL_ID;
    // Top layer avoids transformed theme ancestors; shadow styles keep theme selectors out.
    const fixedStyles = {
      position: 'fixed', inset: 'auto', margin: '0', padding: '0', border: '0',
      height: 'auto', 'min-width': '0', 'min-height': '0', 'max-width': 'none',
      transform: 'translate(-50%, -50%)', translate: 'none', scale: 'none', rotate: 'none',
      display: 'none', overflow: 'visible', background: 'transparent',
      'box-sizing': 'border-box', 'z-index': '4100', 'align-items': 'stretch',
      'justify-content': 'flex-start', 'flex-direction': 'column',
      animation: 'none', transition: 'none', filter: 'none', opacity: '1', visibility: 'visible'
    };
    Object.entries(fixedStyles).forEach(([key, value]) => panel.style.setProperty(key, value, 'important'));
    const host = DOC.createElement('div');
    const hostStyles = { position:'static', inset:'auto', margin:'0', padding:'0', border:'0', transform:'none', display:'flex', 'flex-direction':'column', width:'100%', 'min-height':'0', 'max-height':'inherit', 'box-sizing':'border-box', overflow:'visible', 'font-size':'14px', 'line-height':'1.5', 'text-align':'left', 'text-shadow':'none', color:'var(--SmartThemeBodyColor,#f4f4f5)' };
    Object.entries(hostStyles).forEach(([key,value]) => host.style.setProperty(key,value,'important'));
    panel.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    panel.__tiRoot = root;
    root.innerHTML = `<style>${panelStyles()}</style>
      <div class="ti-color-probe" hidden style="background:var(--SmartThemeBlurTintColor,#25252b)"></div>
      <div class="ti-card">
        <div class="ti-head">
          <div>
            <div class="ti-title">临时更换聊天显示</div>
            <div class="ti-small">临时更换聊天显示，刷新后恢复。</div>
          </div>
          <button class="ti-close" type="button" aria-label="关闭">×</button>
        </div>
        <div class="ti-content">
        <div class="ti-body" id="ti-config-content">
          ${panelRoleHtml('char', 'Char')}
          ${panelRoleHtml('user', 'User')}
        </div>
        <div class="ti-scrollbar" role="scrollbar" tabindex="0" aria-label="滚动配置内容" aria-controls="ti-config-content" aria-orientation="vertical" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><div class="ti-scroll-thumb"></div></div>
        </div>
          <div class="ti-actions">
            <button class="ti-btn danger ti-reset-all" type="button">全部恢复</button>
            <button class="ti-btn ti-cancel" type="button">关闭</button>
            <button class="ti-btn primary ti-apply" type="button">应用到聊天界面</button>
          </div>
      </div>`;
    panel.setAttribute('aria-label', '临时更换聊天显示');
    DOC.body.appendChild(panel);
    bindPanelScrollbar(panel);

    panel.__tempIdentityDraft = {
      charAvatar: state.charAvatar,
      userAvatar: state.userAvatar,
      charAvatarKind: state.charAvatarKind,
      userAvatarKind: state.userAvatarKind,
    };

    panel.__tiRoot.querySelector('.ti-close')?.addEventListener('click', closePanel);
    panel.__tiRoot.querySelector('.ti-cancel')?.addEventListener('click', closePanel);
    panel.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
    panel.addEventListener('click', event => {
      if (event.composedPath()[0] !== panel) return;
      const rect = panel.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
    });
    panel.__tiRoot.querySelector('.ti-reset-all')?.addEventListener('click', resetAll);
    panel.__tiRoot.querySelectorAll('.ti-reset-role').forEach(btn => {
      btn.addEventListener('click', event => {
        const role = event.currentTarget.closest('.ti-role')?.dataset.role;
        if (role === 'char' || role === 'user') resetRole(role);
      });
    });

    panel.__tiRoot.querySelectorAll('.ti-file').forEach(input => {
      input.addEventListener('change', event => {
        const role = event.currentTarget.closest('.ti-role')?.dataset.role;
        const file = event.currentTarget.files?.[0];
        if (!file || (role !== 'char' && role !== 'user')) return;
        const url = WIN.URL.createObjectURL(file);
        state.ownedObjectUrls.add(url);
        replaceDraftAvatar(panel, role, url, 'file');
        const roleBox = event.currentTarget.closest('.ti-role');
        const urlInput = roleBox?.querySelector('.ti-url');
        if (urlInput) urlInput.value = '';
        const preview = roleBox?.querySelector('.ti-preview');
        if (preview) preview.src = url;
      });
    });

    panel.__tiRoot.querySelectorAll('.ti-url').forEach(input => {
      input.addEventListener('input', event => {
        const roleBox = event.currentTarget.closest('.ti-role');
        const role = roleBox?.dataset.role;
        const value = event.currentTarget.value.trim();
        if (role !== 'char' && role !== 'user') return;
        if (value) {
          replaceDraftAvatar(panel, role, value, 'url');
          const preview = roleBox?.querySelector('.ti-preview');
          if (preview) preview.src = value;
        } else {
          const stateKey = role === 'user' ? 'userAvatar' : 'charAvatar';
          const kindKey = role === 'user' ? 'userAvatarKind' : 'charAvatarKind';
          replaceDraftAvatar(panel, role, state[stateKey], state[kindKey]);
          const preview = roleBox?.querySelector('.ti-preview');
          if (preview) {
            if (state[stateKey]) preview.src = state[stateKey];
            else preview.removeAttribute('src');
          }
        }
      });
    });

    panel.__tiRoot.querySelector('.ti-apply')?.addEventListener('click', () => {
      const charBox = panel.__tiRoot.querySelector('.ti-role[data-role="char"]');
      const userBox = panel.__tiRoot.querySelector('.ti-role[data-role="user"]');
      state.charName = charBox?.querySelector('.ti-name')?.value.trim() || '';
      state.userName = userBox?.querySelector('.ti-name')?.value.trim() || '';

      const draft = panel.__tempIdentityDraft || {};
      replaceAvatarState('char', draft.charAvatar || '', draft.charAvatarKind || '');
      replaceAvatarState('user', draft.userAvatar || '', draft.userAvatarKind || '');

      scan(true);
      closePanel();
    });

    return panel;
  }

  function replaceDraftAvatar(panel, role, source, kind = '') {
    const draft = panel?.__tempIdentityDraft;
    if (!draft) return;
    const key = role === 'user' ? 'userAvatar' : 'charAvatar';
    const kindKey = role === 'user' ? 'userAvatarKind' : 'charAvatarKind';
    const stateKey = role === 'user' ? 'userAvatar' : 'charAvatar';
    const old = draft[key];
    if (old && old !== source && old !== state[stateKey]) revokeOwnedUrl(old);
    draft[key] = source || '';
    draft[kindKey] = source ? kind : '';
  }

  function discardPanelDraft(panel) {
    const draft = panel?.__tempIdentityDraft;
    if (!draft) return;
    for (const role of ['char', 'user']) {
      const key = role === 'user' ? 'userAvatar' : 'charAvatar';
      const draftUrl = draft[key];
      if (draftUrl && draftUrl !== state[key]) revokeOwnedUrl(draftUrl);
    }
    delete panel.__tempIdentityDraft;
  }

  function syncPanelFromState() {
    const old = DOC.getElementById(PANEL_ID);
    if (!old) return;
    const wasOpen = old.classList.contains('open');
    discardPanelDraft(old);
    hidePanel(old);
    old.__tiScrollObserver?.disconnect();
    old.remove();
    const fresh = ensurePanel();
    if (wasOpen) showPanel(fresh);
  }

  function openPanel() {
    if (state.cleaned) return;
    if (DOC.getElementById(PANEL_ID)) syncPanelFromState();
    if (!DOC.getElementById(PANEL_ID)?.open) state.panelFocus = DOC.activeElement;
    showPanel(ensurePanel());
  }

  function closePanel() {
    const panel = DOC.getElementById(PANEL_ID);
    if (!panel) return;
    hidePanel(panel);
    syncPanelFromState();
    if (state.panelFocus?.isConnected) state.panelFocus.focus({ preventScroll: true });
    state.panelFocus = null;
  }

  function ensureExtensionsMenuItem() {
    if (state.cleaned) return;
    const menu = DOC.getElementById('extensionsMenu');
    if (!menu) return;
    let item = DOC.getElementById(MENU_ITEM_ID);
    if (!item) {
      item = DOC.createElement('div');
      item.id = MENU_ITEM_ID;
      item.dataset.taoToolboxOwnedMenu = "temporary";
      item.className = 'list-group-item flex-container flexGap5 interactable';
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.title = '临时更换聊天显示';
      const icon = DOC.createElement('i');
      icon.className = 'fa-solid fa-user-pen fa-fw';
      icon.setAttribute('aria-hidden', 'true');
      const label = DOC.createElement('span');
      label.textContent = BUTTON_NAME;
      item.append(icon, label);
    }
    if (item.parentElement !== menu) menu.appendChild(item);
  }

  function bindExtensionsMenu() {
    state.nativeAbort = new WIN.AbortController();
    const options = { signal: state.nativeAbort.signal };
    DOC.addEventListener('click', event => {
      if (!event.target?.closest?.('#' + MENU_ITEM_ID)) return;
      openPanel();
      // 关闭面板后将焦点还给魔杖按钮，避免聚焦已收起的菜单项。
      state.panelFocus = DOC.getElementById('extensionsMenuButton');
      // 点击继续冒泡，由酒馆自己的处理器收起扩展菜单。
    }, options);
    DOC.addEventListener('keydown', event => {
      const item = event.target?.closest?.('#' + MENU_ITEM_ID);
      if (!item || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) item.click();
    }, { ...options, capture: true });
    ensureExtensionsMenuItem();
  }

  function bindObserver() {
    state.observer = new WIN.MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.type === 'childList')) ensureExtensionsMenuItem();
      let relevant = false;
      for (const mutation of mutations) {
        const target = mutation.target;
        if (mutation.type === 'childList') {
          relevant = true;
          break;
        }
        if (mutation.type === 'attributes' && target?.matches?.('#chat .mesAvatarWrapper img, #chat .name_text')) {
          relevant = true;
          break;
        }
        if (mutation.type === 'characterData' && target?.parentElement?.matches?.('#chat .name_text')) {
          relevant = true;
          break;
        }
      }
      if (relevant) queueScan(false);
    });
    state.observer.observe(DOC.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'sizes', 'class', 'is_user'],
    });
  }

  function tavernEventOn(name, callback) {
    const c = WIN.SillyTavern?.getContext();
    const fallback = { CHAT_CHANGED: 'chat_id_changed', USER_MESSAGE_RENDERED: 'user_message_rendered', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered', MESSAGE_UPDATED: 'message_updated', MORE_MESSAGES_LOADED: 'more_messages_loaded', CHARACTER_EDITED: 'character_edited', CHARACTER_PAGE_LOADED: 'character_page_loaded' };
    const event = c?.eventTypes?.[name] || fallback[name];
    if (!event || !c?.eventSource?.on) return false;
    c.eventSource.on(event, callback);
    eventOff.push(() => c.eventSource.removeListener(event, callback));
    return true;
  }

  function bindTavernEvents() {
    [
      'USER_MESSAGE_RENDERED',
      'CHARACTER_MESSAGE_RENDERED',
      'MESSAGE_UPDATED',
      'MORE_MESSAGES_LOADED',
      'CHARACTER_EDITED',
      'CHARACTER_PAGE_LOADED',
    ].forEach(name => {
      tavernEventOn(name, () => {
        queueScan(false);
        later(() => scan(false), 80);
      });
    });

    // 切聊天时保留“临时身份设定”，但只作用于新聊天的 DOM；真实数据仍完全不变。
    tavernEventOn('CHAT_CHANGED', () => {
      restoreAll('all');
      later(() => scan(true), 120);
      later(() => scan(true), 420);
    });
  }

  function cleanup() {
    if (state.cleaned) return;
    state.cleaned = true;
    eventOff.splice(0).forEach(off => { try { off(); } catch {} });
    timers.forEach(timer => WIN.clearTimeout(timer)); timers.clear();
    if (scanFrame !== null) WIN.cancelAnimationFrame(scanFrame);
    SCRIPT_WIN.removeEventListener("pagehide", cleanup);
    SCRIPT_WIN.removeEventListener("beforeunload", cleanup);
    state.observer?.disconnect();
    state.observer = null;
    try { state.nativeAbort?.abort(); } catch {}
    state.nativeAbort = null;
    restoreAll('all');
    for (const url of Array.from(state.ownedObjectUrls)) revokeOwnedUrl(url);
    const panel = DOC.getElementById(PANEL_ID);
    if (panel) { hidePanel(panel); panel.__tiScrollObserver?.disconnect(); discardPanelDraft(panel); panel.remove(); }
    DOC.getElementById(MENU_ITEM_ID)?.remove();
    DOC.getElementById(STYLE_ID)?.remove();
    log('已恢复聊天界面原始名字和头像');
  }

  function bindLifecycle() {
    SCRIPT_WIN.addEventListener('pagehide', cleanup, { once: true });
    SCRIPT_WIN.addEventListener('beforeunload', cleanup, { once: true });
  }

  function init() {
    ensureStyle();
    bindObserver();
    bindTavernEvents();
    bindLifecycle();
    bindExtensionsMenu();
    scan(false);
    later(() => scan(false), 120);
    log('临时身份 1.0.3 已加载');
  }

  init();

 return {dispose:cleanup, open:openPanel, isActive:()=>!state.cleaned};
}


// Based on the working standalone 4.5.10. Native extension window replaces the helper iframe parent.
function startHD() {

  'use strict';
  const SCRIPT_WIN = window;
  const WIN = window;
  const DOC = WIN.document;
  // 聊天头像与角色简介/编辑页的大头像共用原图处理。
  // 上传中的 data/blob 预览由 parseSource 排除，不改图片裁剪和点击事件。
  const SELECTOR = '.mesAvatarWrapper img, #avatar_load_preview';
  const INSTANCE = '__hdAvatar458Cleanup';
  // Re-running this version must not leave two observers competing for src.
  if (typeof WIN[INSTANCE] === 'function') WIN[INSTANCE]();
  const state = {
    cleaned: false, queued: false, frame: null, observer: null,
    records: new WeakMap(), versions: new Map(), off: [],
    generation: { avatar: 0, persona: 0 },
    session: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    abort: new WIN.AbortController(),
  };
  const temporary = img => img.dataset.tempIdentityAvatarBound === '1';
  const isAvatar = img => img?.matches?.(SELECTOR);
  const setAttr = (img, name, value) => {
    if (value === null) img.removeAttribute(name);
    else if (img.getAttribute(name) !== value) img.setAttribute(name, value);
  };

  function parseSource(source) {
    if (!source) return null;
    try {
      const url = new WIN.URL(source, DOC.baseURI);
      if (url.origin !== new WIN.URL(DOC.baseURI).origin) return null;
      let file, type, hd;
      if (/\/thumbnail\/?$/i.test(url.pathname)) {
        type = url.searchParams.get('type');
        file = url.searchParams.get('file'); // URLSearchParams already decodes once.
        if (!file || !['avatar', 'persona'].includes(type)) return null;
        // Preserve literal %, # and ? in filenames; encode each path segment once.
        const encoded = file.split('/').map(encodeURIComponent).join('/');
        hd = new WIN.URL((type === 'persona' ? '/User%20Avatars/' : '/characters/') + encoded, DOC.baseURI);
      } else if (/^\/(characters|User%20Avatars)\//i.test(url.pathname)) {
        type = /^\/characters\//i.test(url.pathname) ? 'avatar' : 'persona';
        file = decodeURIComponent(url.pathname.replace(/^\/[^/]+\//, ''));
        hd = new WIN.URL(url.href);
        // Strip only metadata added by this script when re-adopting an HD URL.
        if (hd.searchParams.has('hd_avatar')) hd.searchParams.delete('file');
        hd.searchParams.delete('hd_avatar');
      } else return null;
      return { file, type, hd: hd.href, key: `${type}:${file}` };
    } catch { return null; }
  }

  function token(info) {
    return `${state.session}-${state.generation[info.type]}-${state.versions.get(info.key) || 0}`;
  }
  function invalidate(key) {
    state.versions.set(key, (state.versions.get(key) || 0) + 1);
  }
  function clearMarkers(img) {
    for (const key of Object.keys(img.dataset)) {
      if (key.startsWith('hd55')) delete img.dataset[key];
    }
  }
  function mirror(img, rec) {
    // Keep the existing temporary-identity script's snapshot/restore protocol.
    img.dataset.hd55ThumbSrc = rec.source;
    img.dataset.hd55File = rec.info.file;
    img.dataset.hd55HdUrl = rec.info.hd;
    img.dataset.hd55Bound = '1';
    for (const [attr, key] of [['srcset', 'Srcset'], ['sizes', 'Sizes']]) {
      img.dataset[`hd55Original${key}`] = rec[attr] ?? '';
      if (rec[attr] !== null) img.dataset[`hd55Original${key}Stored`] = '1';
      else delete img.dataset[`hd55Original${key}Stored`];
    }
  }
  function suppress(img, rec) {
    for (const attr of ['srcset', 'sizes']) {
      if (img.hasAttribute(attr)) {
        rec[attr] = img.getAttribute(attr);
        img.removeAttribute(attr);
      }
    }
    mirror(img, rec);
  }
  function restoreResponsive(img, rec) {
    // Respect an external update that arrived immediately before cleanup.
    for (const attr of ['srcset', 'sizes']) {
      if (!img.hasAttribute(attr)) setAttr(img, attr, rec[attr]);
    }
  }

  function apply(img) {
    if (state.cleaned || temporary(img)) return;
    let rec = state.records.get(img);
    const current = img.getAttribute('src');
    if (!rec || (current !== rec.applied && current !== rec.source)) {
      const info = parseSource(current);
      if (!info) {
        if (rec) {
          // An external/data/blob/default avatar replaces this image; leave it alone.
          clearMarkers(img);
          state.records.delete(img);
        }
        return;
      }
      // A DOM node reused for a different avatar starts with fresh source metadata.
      rec = { source: current, info, applied: null, failed: null,
        srcset: img.getAttribute('srcset'), sizes: img.getAttribute('sizes') };
      state.records.set(img, rec);
    }
    const version = token(rec.info);
    if (rec.failed === version) return;
    suppress(img, rec);
    const url = new WIN.URL(rec.info.hd);
    url.searchParams.set('hd_avatar', version);
    // Tavern's native avatar zoom reads the filename after the final '='.
    // Keep the encoded filename last; the static image route ignores the query.
    // encodeURIComponent preserves spaces as %20 (URLSearchParams uses '+').
    url.searchParams.delete('file');
    rec.applied = `${url.href}&file=${encodeURIComponent(rec.info.file)}`;
    setAttr(img, 'src', rec.applied);
  }
  function scan() {
    if (state.cleaned) return;
    DOC.querySelectorAll(SELECTOR).forEach(apply);
  }
  function queueScan() {
    if (state.cleaned || state.queued) return;
    state.queued = true;
    state.frame = WIN.requestAnimationFrame(() => {
      state.queued = false;
      state.frame = null;
      scan();
    });
  }

  function onMutations(mutations) {
    if (state.cleaned) return;
    let relevant = false;
    const changed = new Set();
    for (const mutation of mutations) {
      const img = mutation.target;
      if (mutation.type === 'childList') {
        if ([...mutation.addedNodes].some(node => node.nodeType === 1 &&
          (isAvatar(node) || node.querySelector?.(SELECTOR)))) relevant = true;
        continue;
      }
      if (!isAvatar(img) || temporary(img)) continue;
      relevant = true;
      const rec = state.records.get(img);
      if (mutation.attributeName !== 'src' || !rec) continue;
      const current = img.getAttribute('src');
      // Ignore our own src assignment and error fallback. Detect native reloads,
      // including assigning an unchanged src after a same-name avatar upload.
      if (current === rec.applied && mutation.oldValue !== current) continue;
      if (current === rec.source && rec.failed === token(rec.info) && mutation.oldValue === rec.applied) continue;
      const info = current === rec.applied ? rec.info : parseSource(current);
      if (info) changed.add(info.key);
    }
    changed.forEach(invalidate);
    if (relevant) queueScan();
  }

  function onError(event) {
    const img = event.target;
    if (!isAvatar(img) || temporary(img) || state.cleaned) return;
    const rec = state.records.get(img);
    // Ignore an obsolete request's error after another source has already loaded.
    if (!rec || img.getAttribute('src') !== rec.applied || !img.complete || img.naturalWidth > 0) return;
    rec.failed = token(rec.info);
    setAttr(img, 'src', rec.source);
    restoreResponsive(img, rec);
    clearMarkers(img);
  }

  function bindTavernEvents() {
    let context;
    try { context = WIN.SillyTavern?.getContext?.(); } catch {}
    const helper = WIN.TavernHelper;
    const eventTypes = SCRIPT_WIN.tavern_events || WIN.tavern_events || context?.eventTypes || {};
    const names = {
      CHARACTER_EDITED: 'character_edited', CHARACTER_PAGE_LOADED: 'character_page_loaded',
      PERSONA_CHANGED: 'persona_changed', PERSONA_UPDATED: 'persona_updated',
      CHAT_CHANGED: 'chat_id_changed', MORE_MESSAGES_LOADED: 'more_messages_loaded',
      USER_MESSAGE_RENDERED: 'user_message_rendered', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
      MESSAGE_UPDATED: 'message_updated',
    };
    for (const [name, fallback] of Object.entries(names)) {
      const callback = () => {
        if (state.cleaned) return;
        if (name === 'CHARACTER_EDITED') state.generation.avatar++;
        if (name === 'PERSONA_UPDATED' || name === 'PERSONA_CHANGED') state.generation.persona++;
        // Never put an old thumbnail back when switching chats/personas.
        queueScan();
      };
      const event = eventTypes[name] || fallback;
      try {
        if (context?.eventSource?.on && context.eventSource.removeListener) {
          context.eventSource.on(event, callback);
          state.off.push(() => context.eventSource.removeListener(event, callback));
        } else {
          const owner = typeof SCRIPT_WIN.eventOn === 'function' ? SCRIPT_WIN : helper;
          if (typeof owner?.eventOn !== 'function') continue;
          const handle = owner.eventOn(event, callback);
          state.off.push(() => {
            if (typeof handle?.stop === 'function') handle.stop();
            else owner.eventRemoveListener?.(event, callback);
          });
        }
      } catch (error) { console.warn('[高清头像 4.5.10] 事件绑定失败', name, error); }
    }
  }

  function cleanup() {
    if (state.cleaned) return;
    state.cleaned = true;
    state.observer?.disconnect();
    state.abort.abort();
    if (state.frame !== null) WIN.cancelAnimationFrame(state.frame);
    state.off.forEach(off => { try { off(); } catch {} });
    DOC.querySelectorAll(SELECTOR).forEach(img => {
      if (temporary(img)) return;
      const rec = state.records.get(img);
      if (!rec) return;
      if (img.getAttribute('src') === rec.applied) {
        setAttr(img, 'src', rec.source);
        restoreResponsive(img, rec);
      }
      clearMarkers(img);
    });
    state.versions.clear();
    if (WIN[INSTANCE] === cleanup) delete WIN[INSTANCE];
  }

  WIN[INSTANCE] = cleanup;
  state.observer = new WIN.MutationObserver(onMutations);
  state.observer.observe(DOC.body, {
    subtree: true, childList: true, attributes: true, attributeOldValue: true,
    attributeFilter: ['src', 'srcset', 'sizes', 'class', 'is_user', 'data-temp-identity-avatar-bound'],
  });
  DOC.addEventListener('error', onError, { capture: true, signal: state.abort.signal });
  SCRIPT_WIN.addEventListener('pagehide', cleanup, { once: true, signal: state.abort.signal });
  SCRIPT_WIN.addEventListener('beforeunload', cleanup, { once: true, signal: state.abort.signal });
  bindTavernEvents();
  scan();
  console.log('[高清头像 4.5.10] 已加载');

  function editorStatus() {
    const img = DOC.getElementById('avatar_load_preview');
    if (!img) return '简介页：未找到头像，请先打开角色简介页。';
    const rec = state.records.get(img);
    const size = img.naturalWidth ? `（${img.naturalWidth}×${img.naturalHeight}）` : '';
    if (rec && rec.failed === token(rec.info)) return '简介页：原图请求失败，已回退原来源' + size;
    if (!img.complete) return '简介页：图片正在加载';
    let url;
    try { url = new WIN.URL(img.currentSrc || img.src, DOC.baseURI); } catch {}
    if (url && /^\/characters\//i.test(url.pathname) && img.naturalWidth) return '简介页：浏览器已载入角色原图' + size;
    if (url && /\/thumbnail\/?$/i.test(url.pathname)) return '简介页：浏览器当前仍显示缩略图' + size;
    return '简介页：尚未识别到角色原图' + size;
  }
  function refreshEditor() {
    state.generation.avatar++;
    state.generation.persona++;
    scan();
    return '已按高清脚本 4.5.10 重新处理头像。';
  }
  return {dispose:cleanup,refreshEditor,editorStatus,version:'4.5.10',isActive:()=>!state.cleaned && WIN[INSTANCE]===cleanup};
}


// Native extension module: window is the Tavern host, even when Tavern is embedded.
function startColor() {

  'use strict';
  const host = window, doc = host.document;
  const KEY = '__tavern_avatar_safe_invert_v1__';
  const STORE = '__tavern_color_panel_v2__';
  const LIBRARY = '__tavern_color_theme_presets_v1__';
  const POSITION = '__tavern_color_panel_position_v1__';
  const PERFORMANCE = '__tavern_color_performance_v1__';
  const ID = 'th-color-panel', CLASS = 'th-avatar-safe-invert';
  const LIGHT_CLASS = 'th-color-reduce-backdrop';
  const BACKGROUND_SAFE_CLASS='th-color-background-safe';
  const MINI_ID = ID+'-mini';
  host[KEY]?.dispose?.();
  const explicitPreserve='.th-color-preserve,[data-th-color-preserve]';
  const automaticPreserve='#avatar_load_preview,img[src*="/User%20Avatars/"],#stafe_preview_image,#stafe_gallery img,video,canvas,iframe,.avatar > img:first-of-type,.avatar > picture > img,.mes_text img,.mes_reasoning img,img.mes_img,.mes_img_container img,.zoomed_avatar img,img[src*="/characters/"],img[src*="/User Avatars/"],img[src*="type=avatar"]';
  const protectedSelector=`${explicitPreserve},:is(${automaticPreserve}):not(.th-color-decorative):not([data-th-color-decorative])`;
  // 只保护头像图片，不保护 .avatar 整个容器；容器上的框、背景、花边仍可调色。
  const skinVariables = [
    ['body', '--SmartThemeBodyColor', [220,220,210,1]],
    ['panel', '--SmartThemeBlurTintColor', [23,23,23,1]],
    ['border', '--SmartThemeBorderColor', [0,0,0,.5]],
  ];
  const defaults = {enabled:false,invert:true,hue:180,saturation:100,brightness:100,backgroundInvert:false,emojiPreserve:false,
    tintEnabled:false,tintShadow:'#302338',tintMid:'#aa7d9d',tintHighlight:'#f6e9df',
    tintStrength:70,tintScopeVersion:6};
  const tintPalettes=[
    ['柔粉','#382536','#b77f9e','#fff0e8'],['雾紫','#282138','#9280b7','#f4ecff'],
    ['海蓝','#172e43','#638fa9','#e6f7fc'],['苔绿','#20342c','#82a286','#f0f4df'],
    ['茶棕','#3c2b25','#b48c70','#fff0d6'],['奶油','#393226','#b7a47e','#fff8df']
  ];
  const limits = {hue:[0,360], saturation:[50,150], brightness:[70,130],tintStrength:[0,100]};
  const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
  const wrap = n => ((n % 360) + 360) % 360;
  const copy = value => JSON.parse(JSON.stringify(value));
  const rgba = c => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})`;
  const cleanColor = c => c.map((n,i)=>i===3 ? Math.round(clamp(n,0,1)*1000)/1000 : Math.round(clamp(n,0,255)));
  function cleanState(value, fallback = defaults) {
    const result = {...fallback};
    if (!value || typeof value !== 'object') return result;
    for (const key of ['enabled','invert','tintEnabled','backgroundInvert','emojiPreserve']) if (typeof value[key] === 'boolean') result[key] = value[key];
    for (const key of ['tintShadow','tintMid','tintHighlight']) if (typeof value[key]==='string' && /^#[0-9a-f]{6}$/i.test(value[key])) result[key]=value[key].toLowerCase();
    if (!value.tintMid && typeof value.tintColor==='string' && /^#[0-9a-f]{6}$/i.test(value.tintColor)) result.tintMid=value.tintColor.toLowerCase();
    for (const [key,[min,max]] of Object.entries(limits)) if (Number.isFinite(value[key])) result[key]=clamp(value[key],min,max);
    // 3.5 的单色叠加强度不等价于渐变映射；升级时恢复有层次的默认强度，保留零值。
    if (value.tintScopeVersion===5 && value.tintStrength!==0) result.tintStrength=70;
    result.tintScopeVersion=6;
    // 已移除的精确配色方案不自动切成反色，保留其滤镜参数，先关闭效果。
    if (value.mode === 'palette') result.enabled = false;
    return result;
  }
  function cleanLibrary(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.themes)) return [];
    const result = [];
    for (const item of value.themes) {
      if (!item || typeof item.theme !== 'string' || result.some(t=>t.theme===item.theme)) continue;
      const schemes = [];
      for (const s of Array.isArray(item.schemes) ? item.schemes : []) {
        if (!s || typeof s.id !== 'string' || typeof s.name !== 'string' || !s.name.trim()) continue;
        if (schemes.some(t=>t.id===s.id || t.name===s.name.trim())) continue;
        schemes.push({id:s.id,name:s.name.trim(),state:cleanState(s.state)});
      }
      result.push({theme:item.theme,schemes,working:cleanState(item.working),selected:schemes.some(s=>s.id===item.selected)?item.selected:''});
    }
    return result;
  }
  const readTheme = () => doc.getElementById('themes')?.value || null;
  let state = cleanState(defaults), library = [], disposed = false;
  let reduceBackdrop = false;
  try {
    const saved = JSON.parse(host.localStorage.getItem(PERFORMANCE));
    // 旧版曾默认开启：首次升级重置为关闭，之后只读取新版里用户自己的选择。
    if (saved?.version===2 && typeof saved.reduceBackdrop === 'boolean') reduceBackdrop = saved.reduceBackdrop;
    else host.localStorage.setItem(PERFORMANCE,JSON.stringify({version:2,reduceBackdrop:false}));
  } catch (_) {}
  try { state = cleanState(JSON.parse(host.localStorage.getItem(STORE))); } catch (_) {}
  try { library = cleanLibrary(JSON.parse(host.localStorage.getItem(LIBRARY))); } catch (_) {}
  let pendingLegacyState = library.length ? null : copy(state);
  let currentTheme = readTheme(), activeGroup = null, themeTimer = null, saveTimer = null, frame = null;
  let previewTimer = null, lastPreviewAt = -Infinity, moveFrame = null, viewportFrame = null;
  let lastSavedState = '', lastSavedLibrary = '';
  let baseColors = {}, baselineSignature = '', rawColorSignature = '', panelSkinSignature = '';
  let panelMove = null, panelPosition = null;
  try {
    const saved = JSON.parse(host.localStorage.getItem(POSITION));
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) panelPosition = {x:clamp(saved.x,-1,1),y:clamp(saved.y,0,1)};
  } catch (_) {}
  let comparing = false, drag = null, undo = [], redo = [], lastHistoryKey = '', lastHistoryTime = 0;
  function groupFor(theme, initial) {
    let group = library.find(t=>t.theme===theme);
    if (!group) { group = {theme,schemes:[],selected:'',working:cleanState(initial)}; library.push(group); }
    return group;
  }
  if (currentTheme !== null) {
    activeGroup = groupFor(currentTheme, library.length ? {...defaults,enabled:false} : state);
    state = copy(activeGroup.working); pendingLegacyState = null;
  } else state.enabled = false;
  function persistLibrary() {
    if (saveTimer !== null) { host.clearTimeout(saveTimer); saveTimer = null; }
    if (!activeGroup) return false;
    try {
      activeGroup.working = copy(state);
      const stateText=JSON.stringify(state), libraryText=JSON.stringify({version:1,themes:library});
      // localStorage 是同步写入；内容没有变化就跳过，避免关闭/隐藏时重复落盘。
      if (stateText!==lastSavedState) {host.localStorage.setItem(STORE,stateText);lastSavedState=stateText;}
      if (libraryText!==lastSavedLibrary) {host.localStorage.setItem(LIBRARY,libraryText);lastSavedLibrary=libraryText;}
      return true;
    } catch (_) { status('浏览器未能保存；当前调整可预览，刷新后可能丢失。'); return false; }
  }
  function scheduleSave() {
    if (!activeGroup) return;
    if (saveTimer !== null) host.clearTimeout(saveTimer);
    saveTimer = host.setTimeout(()=>{
      saveTimer=null;
      if (drag || panelMove) {scheduleSave();return;}
      persistLibrary();
    },600);
  }
  const style = doc.createElement('style'), effect = doc.createElement('style');
  style.dataset.thColor = 'ui'; effect.dataset.thColor = 'filter';
  const mini=doc.createElement('button');
  mini.id=MINI_ID;mini.type='button';mini.hidden=true;mini.textContent='调色';
  mini.title='点击展开 · 拖动移动';mini.setAttribute('aria-label','调色：点击展开，拖动移动，方向键微调');
  let panelTab='filter', minimized=false;
  const panel = doc.createElement('dialog');
  panel.id = ID;
  panel.setAttribute('aria-modal','false');
  if(typeof panel.showPopover==='function') panel.setAttribute('popover','manual');
  panel.setAttribute('aria-labelledby',ID+'-title');
  const queryCache=new Map(), queryAllCache=new Map();
  const $ = selector => {
    if (queryCache.has(selector)) return queryCache.get(selector);
    const node=panel.querySelector(selector); if (node) queryCache.set(selector,node); return node;
  };
  const $$ = selector => {
    if (!queryAllCache.has(selector)) queryAllCache.set(selector,panel.querySelectorAll(selector));
    return queryAllCache.get(selector);
  };
  const setText=(node,value)=>{if (node.textContent!==value) node.textContent=value;};
  const setProperty=(node,key,value)=>{if (node[key]!==value) node[key]=value;};
  const setAttribute=(node,key,value)=>{if (node.getAttribute(key)!==value) node.setAttribute(key,value);};
  const setStyle=(node,key,value)=>{if (node.style.getPropertyValue(key)!==value) node.style.setProperty(key,value);};
  function status(text) { const el = $('[data-status]'); if (el) setText(el,text); }
  // 用浏览器解析 CSS 颜色，可读取 rgba、hex、变量及 color-mix，统一转换到 sRGB。
  const probe = doc.createElement('span'), sampler = doc.createElement('canvas');
  probe.setAttribute('aria-hidden','true'); probe.id=ID+'-probe';
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden';
  sampler.width = sampler.height = 1;
  const sampleCtx = sampler.getContext('2d',{willReadFrequently:true});
  function parseCssColor(value,fallback) {
    if (!value?.trim() || !host.CSS?.supports('color',value)) return [...fallback];
    probe.style.color = value;
    const color = host.getComputedStyle(probe).color;
    const m = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    if (m) return cleanColor([+m[1],+m[2],+m[3],m[4]===undefined?1:+m[4]]);
    if (!sampleCtx) return [...fallback];
    sampleCtx.clearRect(0,0,1,1); sampleCtx.fillStyle=color; sampleCtx.fillRect(0,0,1,1);
    const d = sampleCtx.getImageData(0,0,1,1).data;
    return cleanColor([d[0],d[1],d[2],d[3]/255]);
  }
  function readBaseColors() {
    const root = host.getComputedStyle(doc.documentElement);
    const raw=skinVariables.map(([,css])=>root.getPropertyValue(css));
    const rawSignature=JSON.stringify([raw,root.color,root.colorScheme]);
    if (rawSignature===rawColorSignature) return false;
    rawColorSignature=rawSignature;
    const values = skinVariables.map(([key,,fallback],index)=>[key,parseCssColor(raw[index],fallback)]);
    const next = Object.fromEntries(values), signature = JSON.stringify(next);
    const changed = signature !== baselineSignature;
    baseColors = next; baselineSignature = signature;
    return changed;
  }
  function filteredColor(color) {
    if (!state.enabled || comparing) return [...color];
    let v = color.slice(0,3).map(n=>state.invert?255-n:n);
    const a = state.hue*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
    const matrix = [
      [.213+.787*c-.213*s,.715-.715*c-.715*s,.072-.072*c+.928*s],
      [.213-.213*c+.143*s,.715+.285*c+.140*s,.072-.072*c-.283*s],
      [.213-.213*c-.787*s,.715-.715*c+.715*s,.072+.928*c+.072*s]
    ];
    v = matrix.map(row=>clamp(row.reduce((sum,n,i)=>sum+n*v[i],0),0,255));
    const y = v[0]*.213+v[1]*.715+v[2]*.072;
    v = v.map(n=>clamp(y+(n-y)*state.saturation/100,0,255));
    return [...v.map(n=>Math.round(clamp(n*state.brightness/100,0,255))),color[3]];
  }
  function skinPanel() {
    const signature=JSON.stringify([baselineSignature,state]);
    const skinKey=signature+String(comparing);
    if (skinKey===panelSkinSignature) return;
    panelSkinSignature=skinKey;
    const effective = key => tintedColor(filteredColor(baseColors[key]));
    const bg = effective('panel'), fg = effective('body'), border = effective('border');
    // 面板保持实底，防止主题半透明色叠上聊天后看不清数值。
    bg[3]=1; fg[3]=1;
    const luma = c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
    if (Math.abs(luma(bg)-luma(fg))<65) fg.splice(0,3,...(luma(bg)>145?[25,25,25]:[242,242,242]));
    if (border[3]<.25 || Math.abs(luma(bg)-luma(border))<20) border.splice(0,4,fg[0],fg[1],fg[2],.25);
    const soft = bg.slice(0,3).map((n,i)=>Math.round(n*.93+fg[i]*.07));
    setStyle(panel,'--tcp-bg',rgba(bg));
    setStyle(panel,'--tcp-fg',rgba(fg));
    setStyle(panel,'--tcp-border',rgba(border));
    setStyle(panel,'--tcp-soft',rgba([...soft,1]));
    setStyle(panel,'color-scheme',luma(bg)<128?'dark':'light');
  }
  style.textContent = `
    #${ID} { --tcp-bg:var(--SmartThemeBlurTintColor,#222); --tcp-fg:var(--SmartThemeBodyColor,#eee); --tcp-border:var(--SmartThemeBorderColor,#777); --tcp-soft:var(--tcp-bg);
      box-sizing:border-box;position:fixed;z-index:2147483647;inset:12px 12px 12px auto;margin:auto 0;padding:0;width:290px !important;max-width:calc(100vw - 16px) !important;
      height:360px;max-height:min(360px,calc(100dvh - 16px));border:1px solid var(--tcp-border);border-radius:14px;
      background:var(--tcp-bg);color:var(--tcp-fg);box-shadow:0 8px 24px #0004;font:13px/1.4 var(--mainFontFamily,system-ui,sans-serif);text-shadow:none;overflow:hidden;
      filter:none !important;backdrop-filter:none !important;transform:none !important; }
    #${ID}[open] { display:flex;flex-direction:column; }
    #${ID}::backdrop { background:transparent;backdrop-filter:none; }
    #${ID} *, #${ID} *::before, #${ID} *::after { box-sizing:border-box;text-shadow:none; }
    #${ID} [hidden], #${MINI_ID}[hidden] { display:none !important; }
    #${ID} h3 { font-size:15px;font-weight:600;line-height:1.2;margin:0;color:inherit; }
    #${ID} p { margin:0; }
    #${ID} .tcp-head { cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;align-items:center;gap:5px;padding:9px 12px;border-bottom:1px solid var(--tcp-border);flex-shrink:0; }
    #${ID} .tcp-head > div { min-width:0;flex:1; }
    #${ID} .tcp-head[data-moving] { cursor:grabbing; }
    #${ID} .tcp-theme { font-size:10px;opacity:.65;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    #${ID} .tcp-scroll { padding:10px 12px;overflow:auto;overscroll-behavior:contain;min-height:0;scrollbar-width:thin; }
    #${ID} .tcp-row { display:flex;align-items:center;justify-content:space-between;gap:8px; }
    #${ID} button, #${ID} input, #${ID} select { font:inherit;color:var(--tcp-fg);text-shadow:none;box-shadow:none;filter:none;letter-spacing:normal; }
    #${ID} button { min-height:32px;border:1px solid var(--tcp-border);border-radius:8px;background:var(--tcp-soft);padding:5px 8px;cursor:pointer;line-height:1.3;margin:0; }
    #${ID} button:hover { border-color:var(--tcp-fg); }
    #${ID} button:disabled { opacity:.4;cursor:default; }
    #${ID} button[aria-pressed=true] { box-shadow:inset 0 0 0 1px var(--tcp-fg); }
    #${ID} :is(button,input,select,[tabindex]):focus-visible { outline:2px solid var(--tcp-fg);outline-offset:2px; }
    #${ID} .tcp-head button { width:32px;min-height:32px;flex:0 0 32px;padding:2px;font-size:19px;touch-action:manipulation; }
    #${ID} .tcp-hint { font-size:11px;opacity:.72;line-height:1.5; }
    #${ID} .tcp-space { margin:8px 0; }
    #${ID} :is(select,input[type=text],input[type=number]) { border:1px solid var(--tcp-border);background:var(--tcp-soft);border-radius:7px;min-width:0;min-height:32px;padding:5px 6px;margin:0;width:100%; }
    #${ID} input[type=number] { appearance:textfield;-moz-appearance:textfield;text-align:center;font-variant-numeric:tabular-nums; }
    #${ID} input::-webkit-inner-spin-button { -webkit-appearance:none;margin:0; }
    #${ID} input[aria-invalid=true] { outline:2px solid #e65c65; }
    #${ID} input[type=checkbox] { appearance:auto;-webkit-appearance:checkbox;width:18px;height:18px;margin:0;accent-color:var(--tcp-fg); }
    #${ID} input[type=checkbox]::before, #${ID} input[type=checkbox]::after { display:none; }
    #${ID} input[type=range] { appearance:auto;-webkit-appearance:auto;width:100%;min-width:0;height:32px;margin:0;padding:0;border:0;background:transparent;accent-color:var(--tcp-fg);cursor:pointer; }
    #${ID} .tcp-tabs { display:flex;gap:5px;margin:8px 0; }
    #${ID} .tcp-tabs button { flex:1; }
    #${ID} .tcp-wheel { position:relative;width:144px;aspect-ratio:1;margin:8px auto;flex-shrink:0;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:50%;isolation:isolate; }
    #${ID} .tcp-ring { position:absolute;inset:0;border-radius:50%;background:conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);cursor:crosshair; }
    #${ID} .tcp-hole { position:absolute;inset:12%;border-radius:50%;background:var(--tcp-bg);pointer-events:none; }
    #${ID} .tcp-marker { position:absolute;width:14px;height:14px;border:2px solid #fff;box-shadow:0 0 0 1px #222b;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none; }
    #${ID} .tcp-filter-center { position:absolute;inset:23%;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none;text-align:center; }
    #${ID} .tcp-filter-center strong { font-size:27px;font-weight:500;font-variant-numeric:tabular-nums; }
    #${ID} .tcp-slider { display:grid;grid-template-columns:44px minmax(0,1fr) 48px 12px;align-items:center;gap:5px;margin:7px 0;font-size:12px; }
    #${ID} .tcp-slider input[type=number] { padding:4px 2px; }
    #${ID} .tcp-actions, #${ID} .tcp-utility { display:flex;flex-wrap:wrap;gap:5px;margin:8px 0; }
    #${ID} .tcp-actions button, #${ID} .tcp-utility button { flex:1 1 auto;font-size:12px; }
    #${ID} .tcp-utility { margin-bottom:0; }
    #${ID} details { border-top:1px solid var(--tcp-border);padding-top:6px;margin-top:7px; }
    #${ID} summary { cursor:pointer;min-height:27px;font-size:12px; }
    #${ID} details label:not(.tcp-slider):not(.tcp-row) { display:block;font-size:12px;margin:7px 0; }
    #${ID} details label:not(.tcp-slider):not(.tcp-row) :is(input,select) { margin-top:4px; }
    #${ID} [data-status] { font-size:11px;overflow-wrap:anywhere;margin-top:5px; }
    #${ID} [data-status]:empty { display:none; }
    #${ID} .tcp-off { padding:5px 7px;border:1px dashed var(--tcp-border);border-radius:7px;font-size:11px;margin:6px 0; }
    #${ID} .tcp-tint-picker { display:grid;grid-template-columns:repeat(3,1fr);align-items:center;gap:7px;margin:8px 0; }
    #${ID} .tcp-tint-picker label { display:grid;gap:4px;font-size:11px;text-align:center; }
    #${ID} input[type=color] { appearance:auto;width:100%;height:32px;padding:2px;border:1px solid var(--tcp-border);border-radius:7px;background:var(--tcp-soft);cursor:pointer; }
    #${ID} .tcp-tint-preview { height:14px;border:1px solid var(--tcp-border);border-radius:7px; }
    #${ID} .tcp-swatches { display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:9px 0; }
    #${ID} .tcp-swatches button { height:30px;min-height:30px;padding:0;background:var(--swatch);border:2px solid var(--tcp-border); }
    #${MINI_ID} { position:fixed;z-index:2147483646;width:64px;height:44px;min-width:0;min-height:0;padding:0;margin:0;
      border:1px solid var(--SmartThemeBorderColor,#777);border-radius:12px;background:var(--SmartThemeBlurTintColor,#222);color:var(--SmartThemeBodyColor,#eee);
      font:12px/1.2 var(--mainFontFamily,system-ui,sans-serif);text-shadow:none;box-shadow:0 2px 8px #0003;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none; }
    #${MINI_ID}[data-moving] { cursor:grabbing; }
    #${MINI_ID}:focus-visible { outline:2px solid currentColor;outline-offset:3px; }
    #${ID}::backdrop { display:none;pointer-events:none; }
    #${ID} .tcp-tabs { padding:4px;border:1px solid var(--tcp-border);border-radius:11px;margin:0 0 12px;gap:4px; }
    #${ID} .tcp-tabs button { border-color:transparent;min-height:36px; }
    #${ID} .tcp-tabs button[aria-pressed=true] { border-color:var(--tcp-border);box-shadow:0 1px 4px #0002; }
    #${ID} .tcp-space { min-height:36px;margin:4px 0; }
    #${ID} .tcp-main-control { border-top:1px solid var(--tcp-border);padding-top:6px;margin-top:10px; }
    #${ID} .tcp-utility { display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:6px;margin:12px 0; }
    #${ID} .tcp-utility button { min-height:36px; }
    #${ID} details { margin-top:10px;padding-top:10px; }
    #${ID} summary { min-height:32px;line-height:24px;font-weight:600; }
    #${ID} .tcp-hint { line-height:1.65; }
    #${ID} .tcp-swatches button { height:34px; }
    #th-color-menu { cursor:pointer; }
    @media(max-width:600px) {
      #${ID} { inset:auto 8px max(8px,env(safe-area-inset-bottom)) auto;margin:0;width:290px !important;max-height:min(360px,calc(100dvh - 16px)); }
      #${ID} :is(select,input[type=text],input[type=number]) { font-size:16px; }
    }
  `;
  const slider = (label,key,min,max,unit,group) => `<label class="tcp-slider"><span>${label}</span><input aria-label="${label}" type="range" min="${min}" max="${max}" step="1" data-${group}="${key}"><input aria-label="${label}数值" type="number" min="${min}" max="${max}" step="1" data-${group}="${key}"><span>${unit}</span></label>`;
  panel.innerHTML = `
    <header class="tcp-head" data-move-panel tabindex="0" role="group" aria-label="拖动面板；方向键微调位置">
      <div><h3 id="${ID}-title">⠿ 界面调色</h3><div class="tcp-theme"><span data-theme-name></span> · 3.8.4</div></div>
      <input type="checkbox" data-enabled title="启用调色" aria-label="启用调色"><button type="button" data-collapse title="收成小按钮" aria-label="收成小按钮">−</button><button type="button" data-close aria-label="关闭调色面板">×</button>
    </header>
    <div class="tcp-scroll">
      <div class="tcp-off" data-off hidden>已关闭；调整参数可重新开启。</div>
      <div class="tcp-tabs" role="group" aria-label="选择调色方式"><button type="button" data-tab="filter" aria-pressed="true">色相 / 反色</button><button type="button" data-tab="tint" aria-pressed="false">渐变映射</button></div>
      <section data-page="filter">
        <div class="tcp-wheel"><div class="tcp-ring" data-ring role="slider" tabindex="0" aria-label="色相环" aria-valuemin="0" aria-valuemax="360"><div class="tcp-hole"></div><i class="tcp-marker" data-hue-marker></i></div>
          <div class="tcp-filter-center"><strong data-degrees></strong><span class="tcp-hint">拖动换色</span></div></div>
      </section>
      <section data-page="tint" hidden>
        <label class="tcp-row tcp-space"><span>整页渐变映射</span><input type="checkbox" data-tint-enabled></label>
        <div class="tcp-tint-picker">${[['tintShadow','暗部'],['tintMid','中间调'],['tintHighlight','亮部']].map(([key,label])=>`<label>${label}<input type="color" data-tint-stop="${key}" aria-label="${label}颜色"></label>`).join('')}</div>
        <div class="tcp-tint-preview" data-tint-preview title="从暗到亮的映射效果" aria-label="从暗到亮的映射效果"></div>
        <div class="tcp-swatches">${tintPalettes.map(([name,dark,mid,light],index)=>`<button type="button" data-tint-swatch="${index}" style="--swatch:linear-gradient(90deg,${dark},${mid},${light})" title="${name}" aria-label="${name}"></button>`).join('')}</div>
        ${slider('强度','tintStrength',0,100,'%','tint-key')}
        <p class="tcp-hint">把整页视作一张画面，按明暗映射到三种颜色。</p>
        <p class="tcp-hint" data-tint-note></p>
      </section>
      <label class="tcp-row tcp-space"><span>反转明暗</span><input type="checkbox" data-invert></label>
      <label class="tcp-row tcp-space"><span>背景跟随反色</span><input type="checkbox" data-background-invert></label>
      <p class="tcp-hint">保留旧版背景开关；关闭时补偿标准背景层的基础调色。渐变仍按原版作用于背景。</p>
      <label class="tcp-row tcp-space"><span>聊天 emoji 保色</span><input type="checkbox" data-emoji-preserve></label><p class="tcp-hint">默认关闭。开启后单独显示正文 emoji，避开调色；增加文字识别和位置同步开销。</p>
      <div class="tcp-main-control">${slider('亮度','brightness',70,130,'%','filter-key')}</div>
      <div class="tcp-utility"><button type="button" data-undo>↶ 撤销</button><button type="button" data-redo>↷ 重做</button><button type="button" data-compare>对比原主题</button></div>
      <p data-status role="status" aria-live="polite"></p>

      <details><summary>色相、饱和度与预设</summary>
        ${slider('色相','hue',0,360,'°','filter-key')}
        ${slider('饱和度','saturation',50,150,'%','filter-key')}
        <div class="tcp-actions"><button type="button" data-preset="balanced">反色保留色系</button><button type="button" data-preset="soft">柔和反色</button><button type="button" data-preset="inverse">纯反色</button><button type="button" data-preset="complement">色相 +180°</button><button type="button" data-preset="neutral">全部归零</button></div>
        <label class="tcp-row tcp-space"><span>反色减负</span><input type="checkbox" data-reduce-backdrop></label><p class="tcp-hint">默认关闭。手动开启后，反色期间暂停毛玻璃。</p>
      </details>
      <details data-schemes><summary>本主题的方案</summary>
        <label>已保存方案<select data-scheme-select aria-label="本主题的调色方案"></select></label>
        <label>方案名称<input type="text" data-scheme-name maxlength="80" placeholder="例如：奶油粉"></label>
        <div class="tcp-actions"><button type="button" data-scheme-save>另存</button><button type="button" data-scheme-update>更新</button><button type="button" data-scheme-delete>删除</button></div>
        <p class="tcp-hint">当前调整自动记住；命名方案需点“更新”。</p>
      </details>
      <details><summary>使用说明</summary><p class="tcp-hint">展开时也可操作酒馆；拖动标题栏移动面板。“−”或面板内 Esc 收起，小按钮可直接拖动，点击在当前位置展开。<br>整页渐变映射：按亮度统一映射到暗部、中间调、亮部三种颜色；黑白灰也能上色，不逐张读取或替换素材。强度可调，默认70%。<br>头像、聊天照片及标记保色内容的可见区域直接保留渐变前画面，100%渐变也不再给这些区域强行反向还原。基础反色/色相仍沿用原有补偿，极端基础参数可能产生色差。<br>豁免按区域生效：位于头像范围之外的框、花边继续调色；透明头像的空隙、重叠到豁免区内的装饰或其他内容，也可能一起保色。支持常见圆角、二维旋转、滚动容器裁切；复杂遮罩和三维变换需按主题实际效果调整。<br>额外保色可用 th-color-preserve 类；误判成照片的装饰图可用 th-color-decorative 类。只跟踪保色区域的位置，不搬动头像或改素材层级。反色减负默认关闭。<br>设置及方案按主题保存；连续调整合并预览，松手应用最终值。</p></details>
    </div>`;
  (doc.head || doc.documentElement).append(style,effect);
  doc.body.append(panel,probe,mini);
  const button = doc.createElement('div');
  button.id = 'th-color-menu'; button.dataset.taoToolboxOwnedMenu = 'color'; button.className = 'list-group-item flex-container flexGap5 interactable';
  button.tabIndex=0; button.setAttribute('role','button'); button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls',ID);
  button.innerHTML='<i class="fa-solid fa-palette fa-fw" aria-hidden="true"></i><span></span>';
  // 样式表只建立一次；拖动色环时只更新两条规则的值，避免反复解析复杂选择器。
  effect.textContent = `html.${CLASS} { filter:none !important; }
    html.${CLASS} :is(${protectedSelector}):not(:is(${protectedSelector}) *):not(#${ID}):not(#${ID} *) { filter:none !important; }
    html.${CLASS}.${BACKGROUND_SAFE_CLASS} :is(#bg1,#bg2,#bg_custom) { filter:none !important; }
    html.${LIGHT_CLASS}, html.${LIGHT_CLASS} *,
    html.${LIGHT_CLASS}::before, html.${LIGHT_CLASS}::after,
    html.${LIGHT_CLASS} *::before, html.${LIGHT_CLASS} *::after,
    html.${LIGHT_CLASS} *::backdrop {
      -webkit-backdrop-filter:none !important; backdrop-filter:none !important;
    }`;
  const backgroundReverseRule=effect.sheet.cssRules[2].style;
  const forwardRule = effect.sheet.cssRules[0].style, reverseRule = effect.sheet.cssRules[1].style;
  // 根节点合成画面 -> 亮度 -> 三段渐变 -> 按强度混合原画面。
  // 仅跟踪保色区域的几何位置；不请求、替换素材或增加可见覆盖层。
  const tintActive=()=>state.enabled && !comparing && state.tintEnabled && state.tintStrength>0;
  const tintHex=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
  const tintStops=()=>[state.tintShadow,state.tintMid,state.tintHighlight].map(tintHex);
  const tintLuma=color=>color[0]*.2126+color[1]*.7152+color[2]*.0722;
  function mapGradient(level,stops) {
    const segment=level<.5?0:1,amount=clamp(level*2-segment,0,1);
    return stops[segment].map((n,i)=>n+(stops[segment+1][i]-n)*amount);
  }
  function tintedColor(color) {
    if (!tintActive()) return [...color];
    const amount=state.tintStrength/100,mapped=mapGradient(tintLuma(color)/255,tintStops());
    return [...color.slice(0,3).map((n,i)=>Math.round(n*(1-amount)+mapped[i]*255*amount)),color[3]];
  }
  const svgNS='http://www.w3.org/2000/svg',globalTintDefs=doc.createElementNS(svgNS,'svg');
  globalTintDefs.id=ID+'-global-filters';globalTintDefs.setAttribute('aria-hidden','true');globalTintDefs.setAttribute('focusable','false');
  globalTintDefs.style.cssText='position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important;display:block!important';
  const defs=doc.createElementNS(svgNS,'defs');globalTintDefs.append(defs);
  function makeTintGraph(id) {
    const filter=doc.createElementNS(svgNS,'filter'),gray=doc.createElementNS(svgNS,'feColorMatrix');
    filter.id=id;filter.setAttribute('color-interpolation-filters','sRGB');
    filter.setAttribute('primitiveUnits','objectBoundingBox');
    filter.setAttribute('x','0%');filter.setAttribute('y','0%');filter.setAttribute('width','100%');filter.setAttribute('height','100%');
    gray.setAttribute('in','SourceGraphic');gray.setAttribute('type','matrix');
    gray.setAttribute('values','0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0');
    const transfer=doc.createElementNS(svgNS,'feComponentTransfer');transfer.setAttribute('result','mapped');
    const channels=['R','G','B'].map(channel=>{
      const node=doc.createElementNS(svgNS,'feFunc'+channel);
      node.setAttribute('type','table');node.setAttribute('tableValues','0 .5 1');transfer.append(node);return node;
    });
    const composite=doc.createElementNS(svgNS,'feComposite');
    for (const [key,value] of Object.entries({in:'mapped',in2:'SourceGraphic',operator:'arithmetic',k1:'0',k2:'0',k3:'1',k4:'0'})) composite.setAttribute(key,value);
    filter.append(gray,transfer,composite);defs.append(filter);return {filter,channels,composite};
  }
  const forwardTintId=ID+'-whole-tint';
  const forwardTint=makeTintGraph(forwardTintId);
  // 蒙版只决定哪些原画面像素绕过渐变，不把头像重新画到页面顶层。
  const preserveMaskId=ID+'-preserve-mask',preserveMask=doc.createElementNS(svgNS,'g');
  preserveMask.id=preserveMaskId;defs.append(preserveMask);
  forwardTint.composite.setAttribute('result','tinted');
  function tintPrimitive(name,attrs) {
    const node=doc.createElementNS(svgNS,name);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    forwardTint.filter.append(node);return node;
  }
  const maskImage=tintPrimitive('feImage',{href:'#'+preserveMaskId,x:'0',y:'0',width:'1',height:'1',preserveAspectRatio:'none',result:'preserve'});
  maskImage.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','#'+preserveMaskId);
  tintPrimitive('feComposite',{in:'tinted',in2:'preserve',operator:'out',result:'outside'});
  tintPrimitive('feComposite',{in:'SourceGraphic',in2:'preserve',operator:'in',result:'original'});
  // 加和互补区域，避免普通 over 在抗锯齿边缘再次衰减 alpha。
  tintPrimitive('feComposite',{in:'outside',in2:'original',operator:'arithmetic',k1:'0',k2:'1',k3:'1',k4:'0'});
  doc.body.append(globalTintDefs);
  let lastTintParams='';
  const tintNumber=n=>String(Number(n.toFixed(7)));
  function updateTintFilter() {
    if (!tintActive()) return;
    const signature=[state.tintShadow,state.tintMid,state.tintHighlight,state.tintStrength].join(':');
    if (signature===lastTintParams) return;
    lastTintParams=signature;
    const amount=state.tintStrength/100,keep=1-amount,stops=tintStops();
    forwardTint.channels.forEach((node,i)=>node.setAttribute('tableValues',stops.map(c=>tintNumber(c[i])).join(' ')));
    forwardTint.composite.setAttribute('k2',tintNumber(amount));forwardTint.composite.setAttribute('k3',tintNumber(keep));
  }
  // 只登记媒体/显式保色元素，布局读取限于可见区域；静止时不持续刷帧。
  const preservedNodes=new Set(),visiblePreserved=new Set(),preserveSizes=new Set();
  let preserveRunning=false,preserveFrame=null,preserveIntersection=null,preserveResize=null,preserveChanges=null,lastMaskMarkup='';
  const ownNode=node=>node?.nodeType===1 && !!node.closest(`#${ID},#${MINI_ID},#${ID}-global-filters,#${ID}-probe,#th-color-menu`);
  const nmask=n=>String(Number(n.toFixed(7)));
  const px=(v,full)=>String(v).endsWith('%')?parseFloat(v)*full/100:(parseFloat(v)||0);
  const animationGeometry=new WeakMap();
  function roundedMaskPath(g,inset=[0,0,0,0]) {
    const [t,r,b,l]=inset,w=Math.max(0,g.w-l-r),h=Math.max(0,g.h-t-b),s=g.s;
    if (!w || !h) return '';
    const corners=['borderTopLeftRadius','borderTopRightRadius','borderBottomRightRadius','borderBottomLeftRadius'];
    let radii=corners.map((key,i)=>{
      const v=s[key].split(/\s+/);
      return [Math.max(0,px(v[0],g.w)-(i===0||i===3?l:r)),Math.max(0,px(v[1]||v[0],g.h)-(i<2?t:b))];
    });
    const scale=Math.min(1,w/(radii[0][0]+radii[1][0]||1),w/(radii[2][0]+radii[3][0]||1),h/(radii[0][1]+radii[3][1]||1),h/(radii[1][1]+radii[2][1]||1));
    radii=radii.map(c=>c.map(n=>n*scale));
    const [[ax,ay],[bx,by],[cx,cy],[dx,dy]]=radii,x=l,y=t,right=x+w,bottom=y+h;
    const arc=(rx,ry,x,y)=>rx && ry?`A${rx} ${ry} 0 0 1 ${x} ${y}`:`L${x} ${y}`;
    return `M${x+ax} ${y}H${right-bx}${arc(bx,by,right,y+by)}V${bottom-cy}${arc(cx,cy,right-cx,bottom)}H${x+dx}${arc(dx,dy,x,bottom-dy)}V${y+ay}${arc(ax,ay,x+ax,y)}Z`;
  }
  function syncPreserveMask() {
    if (!preserveRunning || disposed || doc.visibilityState==='hidden') return;
    const rootRect=doc.documentElement.getBoundingClientRect(),rw=rootRect.width,rh=rootRect.height;
    if (!rw || !rh) return;
    const styleCache=new Map(),matrixCache=new Map(),geometryCache=new Map(),clips=[],shapes=[];
    const css=el=>{if (!styleCache.has(el)) styleCache.set(el,host.getComputedStyle(el));return styleCache.get(el);};
    const linear=el=>{
      if (!el || el===doc.documentElement || !host.DOMMatrix) return host.DOMMatrix?new host.DOMMatrix():null;
      if (matrixCache.has(el)) return matrixCache.get(el);
      const s=css(el);let own=new host.DOMMatrix();
      try {
        if (s.rotate && s.rotate!=='none') {
          const angle=s.rotate.trim().split(/\s+/).pop(),v=parseFloat(angle)||0;
          const degrees=angle.endsWith('grad')?v*.9:angle.endsWith('rad')?v*180/Math.PI:angle.endsWith('turn')?v*360:v;
          own=own.rotate(degrees);
        }
        if (s.scale && s.scale!=='none') {const v=s.scale.split(/\s+/).map(Number);own=own.scale(v[0],v[1]??v[0]);}
        if (s.transform && s.transform!=='none') own=own.multiply(new host.DOMMatrix(s.transform));
        own=linear(el.parentElement).multiply(own);
      } catch (_) {own=new host.DOMMatrix();}
      matrixCache.set(el,own);return own;
    };
    const geometry=el=>{
      if (geometryCache.has(el)) return geometryCache.get(el);
      const s=css(el),r=el.getBoundingClientRect();
      const extraX=px(s.paddingLeft,0)+px(s.paddingRight,0)+px(s.borderLeftWidth,0)+px(s.borderRightWidth,0);
      const extraY=px(s.paddingTop,0)+px(s.paddingBottom,0)+px(s.borderTopWidth,0)+px(s.borderBottomWidth,0);
      const cw=parseFloat(s.width),ch=parseFloat(s.height);
      const w=Number.isFinite(cw)?cw+(s.boxSizing==='border-box'?0:extraX):(el.offsetWidth||r.width);
      const h=Number.isFinite(ch)?ch+(s.boxSizing==='border-box'?0:extraY):(el.offsetHeight||r.height);
      const m=linear(el);let a=m?.a??1,b=m?.b??0,c=m?.c??0,d=m?.d??1;
      // 透视/三维无法仅凭矩形精确反推，退回可见包围框；不迁移原节点。
      if (m && !m.is2D) {a=1;b=0;c=0;d=1;}
      const xs=[0,a*w,c*h,a*w+c*h],ys=[0,b*w,d*h,b*w+d*h];
      const sx=r.width/(Math.max(...xs)-Math.min(...xs)||1),sy=r.height/(Math.max(...ys)-Math.min(...ys)||1);
      const transform=`matrix(${[a*sx/rw,b*sy/rh,c*sx/rw,d*sy/rh,(r.left-Math.min(...xs)*sx-rootRect.left)/rw,(r.top-Math.min(...ys)*sy-rootRect.top)/rh].map(nmask).join(' ')})`;
      const result={el,s,r,w,h,transform};geometryCache.set(el,result);return result;
    };
    const path=(g,d)=>`<path d="${d}" transform="${g.transform}" style="fill:white!important;stroke:none!important;opacity:1!important;filter:none!important"/>`;
    const clip=(g,d)=>{
      const id=preserveMaskId+'-c'+clips.length;
      clips.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${path(g,d)}</clipPath>`);return id;
    };
    // 常见主题的 circle/ellipse/polygon/inset 裁切；路径只接受数值及 SVG 路径字符。
    const position=(v,full)=>v==='center'?full/2:v==='right'||v==='bottom'?full:v==='left'||v==='top'?0:px(v,full);
    const cssClip=g=>{
      const text=g.s.clipPath;if (!text || text==='none') return '';
      let m=text.match(/^circle\(([^)]*)\)$/);
      if (m) {
        const [radius,at='50% 50%']=m[1].split(/\s+at\s+/),p=at.split(/\s+/);
        const cx=position(p[0],g.w),cy=position(p[1]||'50%',g.h);
        const r=!radius || radius==='closest-side'?Math.min(cx,cy,g.w-cx,g.h-cy):radius==='farthest-side'?Math.max(cx,cy,g.w-cx,g.h-cy):px(radius,Math.hypot(g.w,g.h)/Math.SQRT2);
        return `M${cx-r} ${cy}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 ${-2*r} 0Z`;
      }
      m=text.match(/^ellipse\(([^)]*)\)$/);
      if (m) {
        const [radius,at='50% 50%']=m[1].split(/\s+at\s+/),v=radius.split(/\s+/),p=at.split(/\s+/);
        const cx=position(p[0],g.w),cy=position(p[1]||'50%',g.h);
        const radiusAt=(value,size,center)=>!value || value==='closest-side'?Math.min(center,size-center):value==='farthest-side'?Math.max(center,size-center):px(value,size);
        const rx=radiusAt(v[0],g.w,cx),ry=radiusAt(v[1]||v[0],g.h,cy);
        return `M${cx-rx} ${cy}a${rx} ${ry} 0 1 0 ${2*rx} 0a${rx} ${ry} 0 1 0 ${-2*rx} 0Z`;
      }
      m=text.match(/^polygon\(([^)]*)\)$/);
      if (m) {const points=m[1].replace(/^(?:nonzero|evenodd),\s*/,'').split(',').map(v=>v.trim().split(/\s+/));return points.length>2 && points.every(v=>v.length===2)?points.map((v,i)=>`${i?'L':'M'}${px(v[0],g.w)} ${px(v[1],g.h)}`).join('')+'Z':'';}
      m=text.match(/^inset\(([^)]*)\)$/);
      if (m) {const v=m[1].split(/\s+round\s+/)[0].trim().split(/\s+/);return roundedMaskPath(g,[px(v[0],g.h),px(v[1]||v[0],g.w),px(v[2]||v[0],g.h),px(v[3]||v[1]||v[0],g.w)]);}
      m=text.match(/^path\(["']([MmZzLlHhVvCcSsQqTtAaEe0-9.,+\s-]+)["']\)$/);return m?m[1]:'';
    };
    const viewport=host.visualViewport,viewportBottom=(viewport?.offsetTop||0)+(viewport?.height||host.innerHeight);
    for (const el of visiblePreserved) {
      if (!el.isConnected || ownNode(el) || !el.matches(protectedSelector) || el.parentElement?.closest(protectedSelector)) continue;
      const g=geometry(el),s=g.s;
      if (!g.w || !g.h || !g.r.width || !g.r.height || s.display==='none' || s.visibility!=='visible' || g.r.bottom<0 || g.r.top>viewportBottom || g.r.right<0 || g.r.left>host.innerWidth) continue;
      const insets=[px(s.borderTopWidth,0),px(s.borderRightWidth,0),px(s.borderBottomWidth,0),px(s.borderLeftWidth,0)];
      if (el.tagName==='IMG') {insets[0]+=px(s.paddingTop,0);insets[1]+=px(s.paddingRight,0);insets[2]+=px(s.paddingBottom,0);insets[3]+=px(s.paddingLeft,0);}
      let drawing=path(g,roundedMaskPath(g,insets)),hidden=false;
      if (el.tagName==='IMG' && s.backgroundImage==='none' && el.naturalWidth && el.naturalHeight && ['contain','scale-down','none'].includes(s.objectFit)) {
        const cw=g.w-insets[1]-insets[3],ch=g.h-insets[0]-insets[2];
        let scale=s.objectFit==='none'?1:Math.min(cw/el.naturalWidth,ch/el.naturalHeight);
        if (s.objectFit==='scale-down') scale=Math.min(1,scale);
        const w=el.naturalWidth*scale,h=el.naturalHeight*scale,p=s.objectPosition.split(/\s+/);
        const x=insets[3]+position(p[0],cw-w),y=insets[0]+position(p[1]||'50%',ch-h);
        drawing=`<g clip-path="url(#${clip(g,`M${x} ${y}h${w}v${h}h${-w}Z`)})">${drawing}</g>`;
      }
      for (let node=el;node && node!==doc.documentElement;node=node.parentElement) {
        const ng=geometry(node),ns=ng.s;
        if (ns.display==='none' || Number(ns.opacity)===0) {hidden=true;break;}
        if (node!==el && [ns.overflowX,ns.overflowY].some(v=>v!=='visible' && v!=='unset')) {
          const d=roundedMaskPath(ng,[px(ns.borderTopWidth,0),px(ns.borderRightWidth,0),px(ns.borderBottomWidth,0),px(ns.borderLeftWidth,0)]);
          drawing=`<g clip-path="url(#${clip(ng,d)})">${drawing}</g>`;
        }
        const d=cssClip(ng);if (d) drawing=`<g clip-path="url(#${clip(ng,d)})">${drawing}</g>`;
      }
      if (!hidden) shapes.push(drawing);
    }
    const markup=`<rect x="0" y="0" width="1" height="1" style="opacity:0!important"/><defs>${clips.join('')}</defs>${shapes.join('')}`;
    // 所有读取结束后才写入；位置与裁切不变时不触发 SVG 重绘。
    if (markup!==lastMaskMarkup) {lastMaskMarkup=markup;preserveMask.innerHTML=markup;}
    // 只在保色元素或其祖先确实有几何动画时追帧，颜色/发光动画不触发。
    let moving=false;
    for (const el of geometryCache.keys()) {
      for (const anim of el.getAnimations?.()||[]) {
        if (anim.playState!=='running') continue;
        if (!animationGeometry.has(anim)) animationGeometry.set(anim,(anim.effect?.getKeyframes?.()||[]).some(k=>Object.keys(k).some(key=>/^(transform|translate|rotate|scale|left|right|top|bottom|width|height|margin|padding|offset|clipPath)/.test(key))));
        if (animationGeometry.get(anim)) {moving=true;break;}
      }
      if (moving) break;
    }
    if (moving) requestPreserveMask();
  }
  function requestPreserveMask() {
    if (!preserveRunning || preserveFrame!==null || disposed || doc.visibilityState==='hidden') return;
    preserveFrame=host.requestAnimationFrame(()=>{preserveFrame=null;syncPreserveMask();});
  }
  function watchPreserved(node) {
    if (ownNode(node) || preservedNodes.has(node)) return;
    preservedNodes.add(node);visiblePreserved.add(node);preserveIntersection?.observe(node);
    for (const box of [node,node.closest('.avatar'),node.closest('.mes')]) {
      if (box && !preserveSizes.has(box)) {preserveSizes.add(box);preserveResize?.observe(box);}
    }
  }
  function collectPreserved(root) {
    if (root.nodeType!==1 || ownNode(root)) return;
    if (root.matches(protectedSelector)) watchPreserved(root);
    root.querySelectorAll(protectedSelector).forEach(watchPreserved);
  }
  function onPreserveLayout(event) {if (!ownNode(event.target)) requestPreserveMask();}
  function startPreserveMask() {
    if (preserveRunning) return;
    preserveRunning=true;
    if (host.IntersectionObserver) preserveIntersection=new host.IntersectionObserver(entries=>{
      for (const entry of entries) {if (entry.isIntersecting) visiblePreserved.add(entry.target);else visiblePreserved.delete(entry.target);}
      requestPreserveMask();
    },{rootMargin:'160px'});
    if (host.ResizeObserver) {
      preserveResize=new host.ResizeObserver(requestPreserveMask);
      for (const box of [doc.documentElement,doc.body,doc.getElementById('chat')]) if (box) {preserveSizes.add(box);preserveResize.observe(box);}
    }
    collectPreserved(doc.body);
    preserveChanges=new host.MutationObserver(records=>{
      let dirty=false,removed=false;
      for (const record of records) {
        if (ownNode(record.target)) continue;
        if (record.type==='childList') {
          for (const node of record.addedNodes) if (node.nodeType===1 && !ownNode(node)) {collectPreserved(node);dirty=true;}
          if ([...record.removedNodes].some(node=>node.nodeType===1 && !ownNode(node))) {dirty=true;removed=true;}
        } else {
          if (record.target.matches('img,video,canvas,iframe,.avatar,'+explicitPreserve)) {collectPreserved(record.target);dirty=true;}
          else if (!dirty) dirty=[...visiblePreserved].some(node=>record.target.contains(node));
        }
      }
      if (removed) {
        for (const node of preservedNodes) if (!node.isConnected) {preservedNodes.delete(node);visiblePreserved.delete(node);preserveIntersection?.unobserve(node);if(preserveSizes.delete(node)) preserveResize?.unobserve(node);}
        for (const node of preserveSizes) if (!node.isConnected) {preserveSizes.delete(node);preserveResize?.unobserve(node);}
      }
      if (dirty) requestPreserveMask();
    });
    preserveChanges.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src','srcset','class','style','hidden','data-th-color-preserve','data-th-color-decorative']});
    for (const type of ['scroll','load','transitionrun','transitionend','animationstart','animationend']) doc.addEventListener(type,onPreserveLayout,{capture:true,passive:true});
    host.addEventListener('resize',onPreserveLayout,{passive:true});
    host.visualViewport?.addEventListener('resize',onPreserveLayout,{passive:true});
    host.visualViewport?.addEventListener('scroll',onPreserveLayout,{passive:true});
    syncPreserveMask();
  }
  function stopPreserveMask() {
    if (!preserveRunning) return;
    preserveRunning=false;
    if (preserveFrame!==null) {host.cancelAnimationFrame(preserveFrame);preserveFrame=null;}
    preserveIntersection?.disconnect();preserveResize?.disconnect();preserveChanges?.disconnect();
    preserveIntersection=null;preserveResize=null;preserveChanges=null;
    preservedNodes.clear();visiblePreserved.clear();preserveSizes.clear();
    for (const type of ['scroll','load','transitionrun','transitionend','animationstart','animationend']) doc.removeEventListener(type,onPreserveLayout,true);
    host.removeEventListener('resize',onPreserveLayout);
    host.visualViewport?.removeEventListener('resize',onPreserveLayout);
    host.visualViewport?.removeEventListener('scroll',onPreserveLayout);
  }
  let lastForward='none', lastReverse='none', effectSignature='', effectActive=false, effectLight=false;
  function filterValues() {
    const forward=[], reverse=[], hue=wrap(state.hue);
    if (state.invert) forward.push('invert(1)');
    if (hue!==0) forward.push(`hue-rotate(${hue}deg)`);
    if (state.saturation!==100) forward.push(`saturate(${state.saturation/100})`);
    if (state.brightness!==100) forward.push(`brightness(${state.brightness/100})`);
    if (state.brightness!==100) reverse.push(`brightness(${100/state.brightness})`);
    if (state.saturation!==100) reverse.push(`saturate(${100/state.saturation})`);
    if (hue!==0) reverse.push(`hue-rotate(${-hue}deg)`);
    if (state.invert) reverse.push('invert(1)');
    if (tintActive()) {
      forward.push(`url("#${forwardTintId}")`);
    }
    return {forward:forward.join(' ') || 'none',reverse:reverse.join(' ') || 'none'};
  }
  // Avatar Focus 将缓存的计算滤镜写成 inline !important；普通 CSS 无法覆盖。
  // 只接管该插件的百分比饱和度写入，重建当前补偿，避免缓存旧色相或重复反色。
  const focusFilters=new Map();
  let focusObserver=null,focusFrame=null;
  const focusPending=new Set();
  function syncFocusImage(img) {
    if (img?.tagName!=='IMG') return;
    const value=img.style.getPropertyValue('filter'),priority=img.style.getPropertyPriority('filter');
    let saved=focusFilters.get(img);
    const eligible=img.isConnected && img.matches(protectedSelector) && !ownNode(img);
    if (!eligible) {
      if (saved && value===saved.written && priority==='important') img.style.setProperty('filter',saved.base,saved.priority);
      focusFilters.delete(img);return;
    }
    if (!saved || value!==saved.written || priority!=='important') {
      // 插件的 setImageSaturation / 编辑预览均以 saturate(N%) 结尾。
      if (priority!=='important' || !/saturate\(\s*[\d.]+%\s*\)\s*$/i.test(value)) {focusFilters.delete(img);return;}
      const base=value.replace(/\b(?:invert|hue-rotate|brightness)\([^)]*\)/gi,' ').replace(/\s+/g,' ').trim();
      saved={base,priority,written:''};focusFilters.set(img,saved);
    }
    const reverse=effectActive && !img.parentElement?.closest(protectedSelector)?lastReverse:'none';
    const next=[reverse==='none'?'':reverse,saved.base].filter(Boolean).join(' ') || 'none';
    // CSSOM 会规范化小数和空格：必须记录浏览器实际值，不能拿原字符串判断自身写入。
    if(saved.desired===next && value===saved.written && priority==='important') return;
    if(value!==next || priority!=='important') img.style.setProperty('filter',next,'important');
    saved.desired=next;
    saved.written=img.style.getPropertyValue('filter');
  }
  function collectFocusImages(root) {
    if(root?.nodeType!==1 || ownNode(root)) return;
    if(root.tagName==='IMG') syncFocusImage(root);
    else root.querySelectorAll('img').forEach(syncFocusImage);
  }
  function syncFocusFilters() {
    if(!focusObserver) {
      if(!doc.getElementById('stafe_settings') && !doc.getElementById('stafe_editor')) return;
      focusObserver=new host.MutationObserver(records=>{
        for(const record of records) {
          if(ownNode(record.target)) continue;
          if(record.type==='childList') {
            record.addedNodes.forEach(node=>{if(node.nodeType===1 && !ownNode(node)) focusPending.add(node);});
            if(record.removedNodes.length) for(const img of focusFilters.keys()) if(!img.isConnected) focusPending.add(img);
          } else if(record.target.tagName==='IMG') {
            const img=record.target,saved=focusFilters.get(img);
            // 自己写回的滤镜，以及插件只改位置/缩放的 style，均不触发再次写入。
            if(record.attributeName==='style' && saved && img.style.getPropertyValue('filter')===saved.written && img.style.getPropertyPriority('filter')==='important') continue;
            focusPending.add(img);
          }
        }
        if(!focusPending.size || focusFrame!==null) return;
        // 合并到下一帧；不在 MutationObserver 微任务里互相追写。
        focusFrame=host.requestAnimationFrame(()=>{
          focusFrame=null;
          const pending=[...focusPending];focusPending.clear();
          if(disposed || !focusObserver) return;
          pending.forEach(collectFocusImages);
        });
      });
      focusObserver.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','src','data-th-color-preserve','data-th-color-decorative']});
      collectFocusImages(doc.body);
    } else for(const img of focusFilters.keys()) syncFocusImage(img);
  }
  function stopFocusFilters() {
    focusObserver?.disconnect();focusObserver=null;
    if(focusFrame!==null) {host.cancelAnimationFrame(focusFrame);focusFrame=null;}
    focusPending.clear();
    for(const [img,saved] of focusFilters) if(img.style.getPropertyValue('filter')===saved.written && img.style.getPropertyPriority('filter')==='important') img.style.setProperty('filter',saved.base,saved.priority);
    focusFilters.clear();
  }
  // 独立聊天 emoji 保色；不改原有滤镜和媒体豁免。关闭后不保留观察器。
  const emojiSupported=typeof doc.createElement('div').showPopover==='function';
  const emojiSelector='.mes_text';
  const emojiRegex=/(?:[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*[\u{E0020}-\u{E007E}]*\u{E007F}?)/gu;
  let emojiChat=null,emojiLayer=null,emojiObserver=null,emojiResize=null,emojiIntersection=null,emojiFrame=null;
  const emojiItems=new Map(),emojiVisible=new Set(),emojiPending=new Set();
  function emojiObserve() {
    emojiObserver?.observe(emojiChat,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class','hidden','contenteditable']});
  }
  function queueEmoji() {
    if(!emojiChat || emojiFrame!==null || disposed || doc.visibilityState==='hidden') return;
    emojiFrame=host.requestAnimationFrame(()=>{emojiFrame=null;flushEmoji();});
  }
  function emojiEligible(node) {
    const p=node.parentElement;
    return p && emojiChat.contains(p) && p.closest(emojiSelector) && !p.closest('script,style,textarea,input,select,pre,code,svg,[contenteditable]:not([contenteditable="false"]),[data-th-emoji-token],'+protectedSelector);
  }
  function scanEmojiText(root) {
    if(!root.isConnected) return;
    const texts=[];
    if(root.nodeType===3) texts.push(root);
    else if(root.nodeType===1) {
      const walker=doc.createTreeWalker(root,host.NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode())) texts.push(node);
    }
    for(const node of texts) {
      if(!emojiEligible(node)) continue;
      const value=node.data,matches=[...value.matchAll(emojiRegex)].filter(m=>value[m.index+m[0].length]!=='\uFE0E');
      if(!matches.length) continue;
      const fragment=doc.createDocumentFragment();let offset=0;
      for(const m of matches) {
        fragment.append(doc.createTextNode(value.slice(offset,m.index)));
        const token=doc.createElement('span'),paint=doc.createElement('span');
        token.dataset.thEmojiToken='';token.textContent=m[0];
        // 留下真实文本，复制/选中仍使用原文；独立层对辅助技术隐藏。
        token.style.cssText='display:inline-block!important;opacity:0!important;line-height:inherit!important;vertical-align:baseline!important;white-space:pre!important;';
        paint.textContent=m[0];paint.style.cssText='all:initial!important;position:fixed!important;display:block!important;pointer-events:none!important;white-space:pre!important;margin:0!important;padding:0!important;border:0!important;filter:none!important;';
        emojiLayer.append(paint);fragment.append(token);emojiItems.set(token,paint);emojiVisible.add(token);
        emojiIntersection?.observe(token);emojiResize?.observe(token);
        offset=m.index+m[0].length;
      }
      fragment.append(doc.createTextNode(value.slice(offset)));node.replaceWith(fragment);
    }
  }
  function collectEmojiRecords(records) {
    for(const record of records) {
      const target=record.target.nodeType===3?record.target.parentElement:record.target;
      const token=target?.closest('[data-th-emoji-token]');
      if(token && emojiItems.has(token)) {
        // 流式生成若改写了占位文本，先撤回此占位再重新识别。
        emojiPending.add(token);continue;
      }
      if(record.type==='characterData') emojiPending.add(record.target);
      else if(record.type==='childList') for(const node of record.addedNodes) emojiPending.add(node);
      else emojiPending.add(record.target);
    }
  }
  function removeEmojiToken(token,restore=true) {
    emojiItems.get(token)?.remove();emojiItems.delete(token);emojiVisible.delete(token);
    emojiIntersection?.unobserve(token);emojiResize?.unobserve(token);
    if(restore && token.parentNode) {
      const parent=token.parentNode;
      while(token.firstChild) parent.insertBefore(token.firstChild,token);
      token.remove();
    }
  }
  function flushEmoji() {
    if(!emojiChat || !emojiLayer) return;
    collectEmojiRecords(emojiObserver.takeRecords());emojiObserver.disconnect();
    try {
      for(const token of [...emojiItems.keys()]) if(!emojiChat.contains(token) || !token.closest(emojiSelector) || token.parentElement?.closest('pre,code,[contenteditable]:not([contenteditable="false"]),'+protectedSelector)) removeEmojiToken(token);
      for(const root of [...emojiPending]) {
        if(root.nodeType===1 && emojiItems.has(root)) {
          const parent=root.parentNode;removeEmojiToken(root);if(parent) scanEmojiText(parent);
        } else scanEmojiText(root);
      }
      emojiPending.clear();
    } finally {emojiObserve();}
    const cssCache=new Map(),rectCache=new Map(),writes=[];
    const css=el=>{if(!cssCache.has(el)) cssCache.set(el,host.getComputedStyle(el));return cssCache.get(el);};
    const rect=el=>{if(!rectCache.has(el)) rectCache.set(el,el.getBoundingClientRect());return rectCache.get(el);};
    const v=visibleViewport();let animated=false;
    for(const token of emojiVisible) {
      const paint=emojiItems.get(token);if(!paint) continue;
      const r=rect(token),font=css(token);let left=Math.max(r.left,v.left),top=Math.max(r.top,v.top),right=Math.min(r.right,v.left+v.width),bottom=Math.min(r.bottom,v.top+v.height),opacity=1;
      for(let el=token.parentElement;el && el!==doc.documentElement;el=el.parentElement) {
        const st=css(el);opacity*=Number(st.opacity);
        if(st.visibility!=='visible' || st.display==='none') {opacity=0;break;}
        if(st.overflowX!=='visible' || st.overflowY!=='visible') {
          const b=rect(el);
          if(st.overflowX!=='visible') {left=Math.max(left,b.left+el.clientLeft);right=Math.min(right,b.left+el.clientLeft+el.clientWidth);}
          if(st.overflowY!=='visible') {top=Math.max(top,b.top+el.clientTop);bottom=Math.min(bottom,b.top+el.clientTop+el.clientHeight);}
        }
      }
      let visible=opacity>0 && font.visibility==='visible' && right>left && bottom>top;
      if(visible) {
        const hit=doc.elementFromPoint((left+right)/2,(top+bottom)/2);
        visible=!!hit && (token.contains(hit) || hit.contains(token));
      }
      const data={display:visible?'block':'none'};
      if(visible) {
        Object.assign(data,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',opacity:String(opacity),color:font.color,'font-family':font.fontFamily,'font-size':font.fontSize,'font-weight':font.fontWeight,'font-style':font.fontStyle,'font-variant':font.fontVariant,'line-height':font.lineHeight,'letter-spacing':font.letterSpacing,'text-shadow':font.textShadow,'text-align':font.textAlign,direction:font.direction,'clip-path':`inset(${top-r.top}px ${r.right-right}px ${r.bottom-bottom}px ${left-r.left}px)`});
      }
      writes.push([paint,data]);
    }
    for(const [el] of cssCache) if(el!==doc.documentElement && (el.getAnimations?.()||[]).some(a=>a.playState==='running' && (a.effect?.getKeyframes?.()||[]).some(k=>Object.keys(k).some(p=>/^(transform|translate|rotate|scale|left|top|width|height|margin|padding|offset)/.test(p))))) {animated=true;break;}
    for(const [paint,data] of writes) for(const [key,value] of Object.entries(data)) if(paint.style.getPropertyValue(key)!==value) paint.style.setProperty(key,value,'important');
    if(animated) queueEmoji();
  }
  function startEmoji(chat) {
    emojiChat=chat;emojiLayer=doc.createElement('div');emojiLayer.id=ID+'-emoji-layer';
    emojiLayer.setAttribute('popover','manual');emojiLayer.setAttribute('aria-hidden','true');
    emojiLayer.style.cssText='all:initial!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;pointer-events:none!important;overflow:hidden!important;filter:none!important;';
    doc.body.append(emojiLayer);
    try {emojiLayer.showPopover();} catch (_) {stopEmoji();return;}
    emojiObserver=new host.MutationObserver(records=>{collectEmojiRecords(records);queueEmoji();});
    if(host.ResizeObserver) {emojiResize=new host.ResizeObserver(queueEmoji);emojiResize.observe(chat);}
    if(host.IntersectionObserver) emojiIntersection=new host.IntersectionObserver(entries=>{
      for(const e of entries) {if(e.isIntersecting) emojiVisible.add(e.target);else {emojiVisible.delete(e.target);emojiItems.get(e.target)?.style.setProperty('display','none','important');}}
      queueEmoji();
    });
    emojiPending.add(chat);flushEmoji();
    for(const type of ['scroll','load','transitionrun','transitionend','animationstart','animationend','pointerdown','pointerup','toggle']) doc.addEventListener(type,queueEmoji,{capture:true,passive:true});
    host.addEventListener('resize',queueEmoji,{passive:true});
    host.visualViewport?.addEventListener('resize',queueEmoji,{passive:true});host.visualViewport?.addEventListener('scroll',queueEmoji,{passive:true});
  }
  function stopEmoji() {
    if(!emojiChat && !emojiLayer) return;
    if(emojiFrame!==null) {host.cancelAnimationFrame(emojiFrame);emojiFrame=null;}
    emojiObserver?.disconnect();emojiResize?.disconnect();emojiIntersection?.disconnect();
    emojiObserver=null;emojiResize=null;emojiIntersection=null;
    for(const token of [...emojiItems.keys()]) removeEmojiToken(token);
    emojiVisible.clear();emojiPending.clear();emojiLayer?.remove();emojiLayer=null;emojiChat=null;
    for(const type of ['scroll','load','transitionrun','transitionend','animationstart','animationend','pointerdown','pointerup','toggle']) doc.removeEventListener(type,queueEmoji,true);
    host.removeEventListener('resize',queueEmoji);host.visualViewport?.removeEventListener('resize',queueEmoji);host.visualViewport?.removeEventListener('scroll',queueEmoji);
  }
  function syncEmojiMode() {
    const chat=doc.getElementById('chat');
    const wanted=state.emojiPreserve && effectActive && emojiSupported && doc.visibilityState!=='hidden' && chat;
    if(!wanted || (emojiChat && emojiChat!==chat)) stopEmoji();
    if(wanted && !emojiChat) startEmoji(chat);
    else if(wanted) queueEmoji();
  }

  function applyEffect() {
    updateTintFilter();
    if (tintActive() && doc.visibilityState!=='hidden') startPreserveMask();else stopPreserveMask();
    const signature=JSON.stringify([state.enabled,comparing,state.invert,state.hue,state.saturation,state.brightness,reduceBackdrop,state.backgroundInvert,tintActive()]);
    if (signature!==effectSignature) {
      effectSignature=signature;
      const {forward,reverse}=filterValues();
      effectActive=state.enabled && !comparing && forward!=='none';
      effectLight=effectActive && state.invert && reduceBackdrop;
      if (lastForward!==forward) {forwardRule.setProperty('filter',forward,'important');lastForward=forward;}
      if (lastReverse!==reverse) {reverseRule.setProperty('filter',reverse,'important');backgroundReverseRule.setProperty('filter',reverse,'important');lastReverse=reverse;}
    }
    const root=doc.documentElement;
    const backgroundSafe=effectActive && !state.backgroundInvert;
    if(root.classList.contains(BACKGROUND_SAFE_CLASS)!==backgroundSafe) root.classList.toggle(BACKGROUND_SAFE_CLASS,backgroundSafe);
    if (root.classList.contains(CLASS)!==effectActive) root.classList.toggle(CLASS,effectActive);
    if (root.classList.contains(LIGHT_CLASS)!==effectLight) root.classList.toggle(LIGHT_CLASS,effectLight);
    syncFocusFilters();
    syncEmojiMode();
  }
  const sameState = (a,b) => Object.keys(defaults).every(k=>a[k]===b[k]);
  let schemesSignature = '', schemesRevision = 0, schemeNameNeedsReset = true, markerHue = null;
  function renderSchemes(resetName=false) {
    if (resetName) schemeNameNeedsReset=true;
    if (!panel.open) return;
    setText($('[data-theme-name]'),currentTheme || '尚未识别主题');
    const selected = activeGroup?.schemes.find(s=>s.id===activeGroup.selected);
    const signature = JSON.stringify([currentTheme,!!activeGroup,schemesRevision,activeGroup?.selected,selected? sameState(state,selected.state) : null]);
    if (signature!==schemesSignature) {
      const select=$('[data-scheme-select]'); select.replaceChildren();
      const empty=doc.createElement('option'); empty.value=''; empty.textContent='当前调整（未选择方案）'; select.append(empty);
      for (const s of activeGroup?.schemes || []) {
        const option=doc.createElement('option'); option.value=s.id;
        option.textContent=s.name + (s.id===activeGroup.selected && !sameState(state,s.state)?' · 有未更新调整':''); select.append(option);
      }
      select.value=activeGroup?.selected || ''; schemesSignature=signature;
      for (const attr of ['select','name','save']) setProperty($(`[data-scheme-${attr}]`),'disabled',!activeGroup);
      setProperty($('[data-scheme-update]'),'disabled',!selected); setProperty($('[data-scheme-delete]'),'disabled',!selected);
    }
    if (schemeNameNeedsReset) {$('[data-scheme-name]').value=selected?.name || '';schemeNameNeedsReset=false;}
  }
  function setInput(input,value) { if (doc.activeElement!==input && input.value!==String(value)) input.value=String(value); }
  function cancelPreview() {
    if (frame!==null) {host.cancelAnimationFrame(frame);frame=null;}
    if (previewTimer!==null) {host.clearTimeout(previewTimer);previewTimer=null;}
  }
  function render(save=true) {
    if (disposed) return;
    const pendingEdit=frame!==null || previewTimer!==null;
    cancelPreview();
    applyEffect();
    lastPreviewAt=host.performance.now();
    setText(button.querySelector('span'),`界面调色：${state.enabled?'已开启':'已关闭'}`);
    if (save || pendingEdit) scheduleSave();
    // 关闭的面板不更新颜色、控件或方案列表；再次打开时一次性同步。
    if (!panel.open) return;
    if (!baselineSignature) readBaseColors();
    skinPanel();
    $$('[data-page]').forEach(el=>setProperty(el,'hidden',el.dataset.page!==panelTab));
    $$('[data-tab]').forEach(el=>setAttribute(el,'aria-pressed',String(el.dataset.tab===panelTab)));
    setProperty($('[data-tint-enabled]'),'checked',state.tintEnabled);
    $$('[data-tint-stop]').forEach(el=>setInput(el,state[el.dataset.tintStop]));
    const preview=[0,128,255].map(n=>rgba(tintedColor([n,n,n,1])));
    setStyle($('[data-tint-preview]'),'background',`linear-gradient(90deg,${preview.join(',')})`);
    setText($('[data-tint-note]'),tintActive()?'头像区域默认豁免渐变，100%强度也保留映射前画面。':'头像区域默认豁免；0%保留原画面，100%完全映射其他区域。');
    const hue=state.hue;
    setProperty($('[data-enabled]'),'checked',state.enabled); setProperty($('[data-invert]'),'checked',state.invert); setProperty($('[data-background-invert]'),'checked',state.backgroundInvert); setProperty($('[data-emoji-preserve]'),'checked',state.emojiPreserve);
    setProperty($('[data-reduce-backdrop]'),'checked',reduceBackdrop);
    setProperty($('[data-off]'),'hidden',state.enabled);
    setText($('[data-degrees]'),Math.round(hue)+'°');
    if (markerHue!==hue) {
      markerHue=hue;
      const rad=hue*Math.PI/180;
      setStyle($('[data-hue-marker]'),'left',(50+44.5*Math.sin(rad))+'%');
      setStyle($('[data-hue-marker]'),'top',(50-44.5*Math.cos(rad))+'%');
      setStyle($('[data-hue-marker]'),'background',`hsl(${hue} 100% 50%)`);
      setAttribute($('[data-ring]'),'aria-valuenow',String(Math.round(hue)));
      setAttribute($('[data-ring]'),'aria-valuetext',`色相旋转 ${Math.round(hue)} 度`);
    }
    $$('[data-filter-key]').forEach(el=>setInput(el,state[el.dataset.filterKey]));
    $$('[data-tint-key]').forEach(el=>setInput(el,state[el.dataset.tintKey]));
    setProperty($('[data-undo]'),'disabled',!undo.length); setProperty($('[data-redo]'),'disabled',!redo.length);
    setAttribute($('[data-compare]'),'aria-pressed',String(comparing));
    setText($('[data-compare]'),comparing?'返回调色':'对比原主题');
    renderSchemes();
  }
  function requestRender() {
    if (disposed || frame!==null || previewTimer!==null) return;
    // 连续调色最多约 30 次/秒；没有输入时不会循环刷新，松手时 render 会立即收尾。
    const queue=()=>{
      previewTimer=null;
      if (!disposed) frame=host.requestAnimationFrame(()=>{frame=null;render();});
    };
    const remaining=1000/30-(host.performance.now()-lastPreviewAt);
    if (remaining>0) previewTimer=host.setTimeout(queue,remaining);
    else queue();
  }
  function remember(key='',force=false) {
    const now=Date.now();
    if (force || !key || key!==lastHistoryKey || now-lastHistoryTime>650) {
      undo.push(copy(state)); if (undo.length>40) undo.shift(); redo=[];
    }
    lastHistoryKey=key; lastHistoryTime=now;
    comparing=false;
  }
  function freshTheme() {
    const next=readTheme();
    if (next!==null && next!==currentTheme) { checkTheme(); return false; }
    return true;
  }
  function checkTheme() {
    if (disposed) return;
    const next=readTheme();
    if (next!==null && next!==currentTheme) {
      stopRingDrag(); cancelPreview();
      persistLibrary(); currentTheme=next;
      activeGroup=groupFor(next,pendingLegacyState || {...defaults,enabled:false}); pendingLegacyState=null; state=copy(activeGroup.working);
      comparing=false; drag=null; undo=[]; redo=[]; lastHistoryKey='';
      if (panel.open) readBaseColors();
      render(false); renderSchemes(true); persistLibrary();
      status('已恢复此主题上次的调整。');
    } else if (panel.open && !drag && !panelMove && readBaseColors()) {
      render(false);
    }
  }
  function visibleViewport() {
    const viewport=host.visualViewport;
    return {left:viewport?.offsetLeft || 0, top:viewport?.offsetTop || 0,
      width:viewport?.width || host.innerWidth || doc.documentElement.clientWidth,
      height:viewport?.height || host.innerHeight || doc.documentElement.clientHeight};
  }
  function positionPanel(left,top,metrics=null) {
    if (!panel.open) return;
    const v=metrics?.viewport || visibleViewport();
    if (!metrics) setStyle(panel,'max-height',Math.max(100,Math.min(360,v.height-16))+'px');
    const width=metrics?.width ?? panel.getBoundingClientRect().width;
    const headerHeight=metrics?.headerHeight ?? ($('[data-move-panel]').getBoundingClientRect().height || 76);
    // 允许面板部分移出屏幕，只保留至少一段可拖回的标题栏。
    const visibleWidth=Math.min(160,width,Math.max(40,v.width-16));
    const x=clamp(left,v.left-width+visibleWidth,v.left+v.width-visibleWidth);
    const minTop=v.top+8, maxTop=Math.max(minTop,v.top+v.height-headerHeight-8);
    const y=clamp(top,minTop,maxTop);
    setStyle(panel,'left',x+'px'); setStyle(panel,'top',y+'px');
    setStyle(panel,'right','auto'); setStyle(panel,'bottom','auto'); setStyle(panel,'margin','0px');
  }
  function savePosition() {
    if (!panel.open) return;
    const v=visibleViewport(), rect=panel.getBoundingClientRect();
    panelPosition={x:(rect.left-v.left)/v.width,y:(rect.top-v.top)/v.height};
    try {host.localStorage.setItem(POSITION,JSON.stringify(panelPosition));} catch (_) {}
  }
  function restorePosition() {
    if (!panel.open) return;
    const v=visibleViewport();
    setStyle(panel,'max-height',Math.max(100,Math.min(360,v.height-16))+'px');
    const rect=panel.getBoundingClientRect();
    positionPanel(panelPosition ? v.left+panelPosition.x*v.width : rect.left,
      panelPosition ? v.top+panelPosition.y*v.height : rect.top);
  }
  function flushPanelMove() {
    if (moveFrame!==null) {host.cancelAnimationFrame(moveFrame);moveFrame=null;}
    if (panelMove) positionPanel(panelMove.left,panelMove.top,panelMove.metrics);
  }
  function endPanelMove(event) {
    if (!panelMove || (event && event.pointerId!==panelMove.id)) return;
    if (event?.type==='pointerup') {
      panelMove.left=event.clientX-panelMove.offsetX;panelMove.top=event.clientY-panelMove.offsetY;
    }
    flushPanelMove();
    const pointerId=panelMove.id; panelMove=null;
    const header=$('[data-move-panel]'); header.removeAttribute('data-moving');
    if (header.hasPointerCapture(pointerId)) header.releasePointerCapture(pointerId);
    savePosition();
  }
  function onViewportChange() {
    finishMiniMove();
    if (minimized && !disposed) positionMini(parseFloat(mini.style.left)||0,parseFloat(mini.style.top)||0);
    if (disposed || !panel.open || viewportFrame!==null) return;
    viewportFrame=host.requestAnimationFrame(()=>{
      viewportFrame=null;
      if (disposed || !panel.open) return;
      endPanelMove(); restorePosition();
      if (drag) drag.rect=null;
    });
  }
  function open() {
    const fromMini=minimized,miniRect=fromMini?mini.getBoundingClientRect():null;
    finishMiniMove();minimized=false;mini.hidden=true;
    checkTheme(); readBaseColors();
    if (!panel.open) {
      panel.show();
      // 手动 popover 仅提升到顶层，不设遮罩、不使页面 inert。旧浏览器使用非模态 dialog。
      if(panel.hasAttribute('popover')) {try {panel.showPopover();} catch (_) {panel.removeAttribute('popover');}}
    }
    render(false);
    restorePosition();
    if(miniRect) {positionPanel(miniRect.left,miniRect.top);savePosition();}
  }
  function close() {
    minimized=false;mini.hidden=true;
    endPanelMove(); savePosition(); comparing=false; stopRingDrag(); cancelPreview();
    if (panel.open) {if(panel.hasAttribute('popover')) {try {panel.hidePopover();} catch (_) {}} panel.close();}
    render(false); persistLibrary();
  }
  let miniMove=null,miniFrame=null,miniSuppressUntil=0;
  function flushMiniMove() {
    if(miniFrame!==null) {host.cancelAnimationFrame(miniFrame);miniFrame=null;}
    if(miniMove?.moved) positionMini(miniMove.left,miniMove.top);
  }
  function finishMiniMove(event) {
    if(!miniMove || (event && event.pointerId!==miniMove.id)) return;
    const moving=miniMove;
    if(event?.type==='pointerup' && moving.moved) {moving.left=event.clientX-moving.offsetX;moving.top=event.clientY-moving.offsetY;}
    flushMiniMove();miniMove=null;mini.removeAttribute('data-moving');
    if(moving.moved || event?.type==='pointercancel') miniSuppressUntil=host.performance.now()+500;
    if(mini.hasPointerCapture(moving.id)) mini.releasePointerCapture(moving.id);
  }
  mini.addEventListener('pointerdown',event=>{
    if(event.button!==0 || miniMove) return;
    miniSuppressUntil=0;
    const rect=mini.getBoundingClientRect();
    miniMove={id:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,left:rect.left,top:rect.top,moved:false};
    mini.setPointerCapture(event.pointerId);
  });
  mini.addEventListener('pointermove',event=>{
    if(miniMove?.id!==event.pointerId) return;
    if(!miniMove.moved && Math.hypot(event.clientX-miniMove.startX,event.clientY-miniMove.startY)<5) return;
    event.preventDefault();miniMove.moved=true;mini.setAttribute('data-moving','');
    miniMove.left=event.clientX-miniMove.offsetX;miniMove.top=event.clientY-miniMove.offsetY;
    if(miniFrame===null) miniFrame=host.requestAnimationFrame(()=>{miniFrame=null;flushMiniMove();});
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']) mini.addEventListener(type,finishMiniMove);
  mini.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();const step=event.shiftKey?32:8,r=mini.getBoundingClientRect();
    positionMini(r.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),r.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));
  });
  panel.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !event.defaultPrevented) {event.preventDefault();event.stopPropagation();minimize();mini.focus({preventScroll:true});}
  });
  function positionMini(left,top) {
    const v=visibleViewport();
    mini.style.left=clamp(left,v.left+6,Math.max(v.left+6,v.left+v.width-(mini.offsetWidth||64)-6))+'px';
    mini.style.top=clamp(top,v.top+6,Math.max(v.top+6,v.top+v.height-(mini.offsetHeight||44)-6))+'px';
  }
  function minimize() {
    endPanelMove();
    const rect=panel.getBoundingClientRect();
    close();minimized=true;mini.hidden=false;positionMini(rect.left,rect.top);
  }
  const header=$('[data-move-panel]');
  header.addEventListener('pointerdown',event=>{
    if (event.button!==0 || panelMove || drag || event.target.closest('button,input,select,a')) return;
    event.preventDefault();
    const rect=panel.getBoundingClientRect();
    panelMove={id:event.pointerId,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,left:rect.left,top:rect.top,
      metrics:{viewport:visibleViewport(),width:rect.width,headerHeight:header.getBoundingClientRect().height || 76}};
    header.focus({preventScroll:true});header.setAttribute('data-moving','');
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove',event=>{
    if (!panelMove || event.pointerId!==panelMove.id) return;
    event.preventDefault();
    panelMove.left=event.clientX-panelMove.offsetX; panelMove.top=event.clientY-panelMove.offsetY;
    if (moveFrame===null) moveFrame=host.requestAnimationFrame(()=>{moveFrame=null;flushPanelMove();});
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) header.addEventListener(type,endPanelMove);
  header.addEventListener('keydown',event=>{
    if (event.target!==header || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault();const step=event.shiftKey?40:10,rect=panel.getBoundingClientRect();
    positionPanel(rect.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),
      rect.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0));savePosition();
  });
  function editScheme(action) {
    if (!freshTheme() || !activeGroup) return;
    const name=$('[data-scheme-name]').value.trim(), selected=activeGroup.schemes.find(s=>s.id===activeGroup.selected);
    if (action!=='delete' && !name) { status('先给方案取个名字吧。'); $('[data-scheme-name]').focus(); return; }
    if (action!=='delete' && activeGroup.schemes.some(s=>s.name===name && (action==='save'||s.id!==selected?.id))) {status('本主题已有同名方案，请换个名字或更新原方案。');return;}
    if (action==='save') {
      const entry={id:host.crypto?.randomUUID?.() || `tcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,name,state:copy(state)};
      activeGroup.schemes.push(entry); activeGroup.selected=entry.id;
    } else if (action==='update' && selected) {selected.name=name;selected.state=copy(state);}
    else if (action==='delete' && selected) {activeGroup.schemes=activeGroup.schemes.filter(s=>s.id!==selected.id);activeGroup.selected='';}
    else return;
    schemesRevision++;
    const saved=persistLibrary(); renderSchemes(true);
    if (saved) status(action==='delete'?'已删除方案，当前配色保持不变。':`已保存到「${currentTheme}」：${name}`);
  }
  function normalizeInput(el) {
    el.removeAttribute('aria-invalid');
    if (el.matches('[data-filter-key]')) el.value=state[el.dataset.filterKey];
    if (el.matches('[data-tint-key]')) el.value=state[el.dataset.tintKey];
    if (el.matches('[data-tint-stop]')) el.value=state[el.dataset.tintStop];
  }
  panel.addEventListener('input',event=>{
    const el=event.target;
    if (el.matches('[data-reduce-backdrop]')) {
      reduceBackdrop=el.checked; applyEffect();
      try {host.localStorage.setItem(PERFORMANCE,JSON.stringify({version:2,reduceBackdrop}));}
      catch (_) {status('减负设置本次有效，浏览器未能记住此开关。');}
      return;
    }
    if (!freshTheme()) return;
    if (el.matches('[data-tint-enabled]')) {
      remember();state.tintEnabled=el.checked;if (el.checked) state.enabled=true;render();return;
    }
    if (el.matches('[data-tint-stop]')) {
      const key=el.dataset.tintStop;
      const color=el.value.toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(color)) return;
      if (state[key]===color && state.tintEnabled && state.enabled && !comparing) return;
      remember('tint-'+key);state[key]=color;state.tintEnabled=true;state.enabled=true;requestRender();return;
    }
    if (el.matches('[data-enabled]')) {remember();state.enabled=el.checked;render();return;}
    if (el.matches('[data-emoji-preserve]')) {remember();state.emojiPreserve=el.checked;render();if(el.checked && !emojiSupported) status('当前浏览器不支持独立保色层，请关闭此项。');return;}
    if (el.matches('[data-background-invert]')) {remember();state.backgroundInvert=el.checked;render();return;}
    if (el.matches('[data-invert]')) {remember();state.invert=el.checked;state.enabled=true;render();return;}
    if (!el.matches('[data-filter-key],[data-tint-key]')) return;
    const value=Number(el.value), min=Number(el.min), max=Number(el.max);
    if (!el.value.trim() || !Number.isFinite(value) || value<min || value>max) {el.setAttribute('aria-invalid','true');return;}
    el.removeAttribute('aria-invalid');
    const n=Math.round(value);
    const key=el.dataset.filterKey || el.dataset.tintKey;
    if (state[key]===n && state.enabled && !comparing && (!el.dataset.tintKey || state.tintEnabled)) return;
    remember('filter-'+key);state[key]=n;state.enabled=true;
    if (el.dataset.tintKey) state.tintEnabled=true;
    requestRender();
  });
  panel.addEventListener('change',event=>{
    const el=event.target;
    if (!freshTheme()) return;
    if (el.matches('[data-scheme-select]') && activeGroup) {
      activeGroup.selected=el.value;
      const chosen=activeGroup.schemes.find(s=>s.id===el.value);
      if (chosen) {remember();state=copy(chosen.state);render();}
      else persistLibrary();
      renderSchemes(true);status(chosen?'已应用：'+chosen.name:'可将当前调整另存为方案。');return;
    }
    if (el.matches('[data-filter-key],[data-tint-key],[data-tint-stop]')) {normalizeInput(el);render(false);persistLibrary();}
  });
  panel.addEventListener('focusout',event=>{
    if (event.target.matches('[data-filter-key],[data-tint-key],[data-tint-stop]') && freshTheme()) {
      normalizeInput(event.target);render(false);persistLibrary();
    }
  });
  panel.addEventListener('click',event=>{
    const el=event.target.closest('button'); if (!el) return;
    if (el.hasAttribute('data-close')) {close();return;}
    if (el.hasAttribute('data-collapse')) {minimize();return;}
    if (!freshTheme()) return;
    if (el.dataset.tab) {stopRingDrag();panelTab=el.dataset.tab;render(false);restorePosition();return;}
    if (el.hasAttribute('data-tint-swatch')) {
      const palette=tintPalettes[Number(el.dataset.tintSwatch)];if (!palette) return;
      remember();[state.tintShadow,state.tintMid,state.tintHighlight]=palette.slice(1);
      state.tintEnabled=true;state.enabled=true;render();return;
    }
    for (const action of ['save','update','delete']) if (el.hasAttribute('data-scheme-'+action)) {editScheme(action);return;}
    if (el.hasAttribute('data-compare')) {comparing=!comparing;render(false);return;}
    if (el.hasAttribute('data-undo') || el.hasAttribute('data-redo')) {
      const previous=el.hasAttribute('data-undo'), from=previous?undo:redo, to=previous?redo:undo;
      if (!from.length) return;to.push(copy(state));state=from.pop();lastHistoryKey='';comparing=false;render();return;
    }
    if (el.dataset.preset) {
      remember();state.enabled=true;
      const p=el.dataset.preset;
      if (p==='neutral') state.tintEnabled=false;
      if (p==='complement') state.hue=wrap(state.hue+180);
      else Object.assign(state,p==='neutral'?{invert:false,hue:0,saturation:100,brightness:100}:p==='inverse'?{invert:true,hue:0,saturation:100,brightness:100}:p==='soft'?{invert:true,hue:180,saturation:80,brightness:95}:{invert:true,hue:180,saturation:100,brightness:100});
      render();
    }
  });
  function updatePointer(event) {
    const rect=drag?.rect || $('[data-ring]').getBoundingClientRect();
    if (drag) drag.rect=rect;
    if (!rect.width || !rect.height) return;
    const hue=Math.round(wrap(Math.atan2(event.clientX-rect.left-rect.width/2,
      -(event.clientY-rect.top-rect.height/2))*180/Math.PI));
    if (event.type!=='pointerdown' && state.hue===hue && state.enabled && !comparing) return;
    state.hue=hue;
    state.enabled=true;requestRender();
  }
  const ring=$('[data-ring]');
  ring.addEventListener('pointerdown',event=>{
    if (event.button!==0 || drag || panelMove || !freshTheme()) return;
    const r=ring.getBoundingClientRect(),distance=Math.hypot(event.clientX-r.left-r.width/2,event.clientY-r.top-r.height/2);
    if (distance<r.width*.38) return;
    event.preventDefault();remember('drag',true);drag={id:event.pointerId,rect:r};
    ring.focus({preventScroll:true});ring.setPointerCapture(event.pointerId);updatePointer(event);
  });
  ring.addEventListener('pointermove',event=>{
    if (drag?.id===event.pointerId) {event.preventDefault();updatePointer(event);}
  });
  function stopRingDrag() {
    if (!drag) return;
    const pointerId=drag.id;drag=null;lastHistoryKey='';
    if (ring.hasPointerCapture(pointerId)) ring.releasePointerCapture(pointerId);
  }
  function finishRingDrag(event) {
    if (drag?.id!==event.pointerId) return;
    if (event.type==='pointerup') updatePointer(event);
    stopRingDrag();render(false);persistLibrary();
  }
  panel.addEventListener('scroll',()=>{if (drag) drag.rect=null;},{capture:true,passive:true});
  for (const type of ['pointerup','pointercancel','lostpointercapture']) ring.addEventListener(type,finishRingDrag);
  ring.addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)||!freshTheme()) return;
    event.preventDefault();remember('keyboard-ring');
    const sign=['ArrowLeft','ArrowDown'].includes(event.key)?-1:1;
    state.hue=event.key==='Home'?0:event.key==='End'?359:wrap(state.hue+sign*(event.shiftKey?10:1));
    state.enabled=true;requestRender();
  });
  function mount() {
    if (disposed || button.isConnected) return;
    const menu=doc.getElementById('extensionsMenu');if (menu && button.parentNode!==menu) menu.append(button);
  }
  const onThemeChange=event=>{if (event.target?.id==='themes') checkTheme();};
  function stopMaintenance() {
    if (themeTimer!==null) {host.clearInterval(themeTimer);themeTimer=null;}
  }
  function startMaintenance() {
    if (disposed || doc.visibilityState==='hidden' || themeTimer!==null) return;
    // 用户切主题仍走 change 事件立即更新；定时器只兜底程序化切换和菜单重建。
    themeTimer=host.setInterval(()=>{checkTheme();mount();if(!focusObserver) syncFocusFilters();if(state.emojiPreserve && doc.getElementById('chat')!==emojiChat) syncEmojiMode();},2000);
  }
  const onVisibility=()=>{
    if (disposed) return;
    if (doc.visibilityState==='hidden') {
      cancelPreview();endPanelMove();stopRingDrag();finishMiniMove();
      stopPreserveMask();stopEmoji();
      persistLibrary(); stopMaintenance();
    } else {
      checkTheme(); render(false); mount(); startMaintenance();
    }
  };
  function dispose() {
    if (disposed) return;
    stopEmoji();finishMiniMove();endPanelMove();stopRingDrag();savePosition();persistLibrary();disposed=true;
    stopMaintenance();
    cancelPreview();
    stopPreserveMask();
    stopFocusFilters();
    globalTintDefs.remove();
    if (moveFrame!==null) {host.cancelAnimationFrame(moveFrame);moveFrame=null;}
    if (viewportFrame!==null) {host.cancelAnimationFrame(viewportFrame);viewportFrame=null;}
    doc.removeEventListener('change',onThemeChange);doc.removeEventListener('visibilitychange',onVisibility);
    host.removeEventListener('resize',onViewportChange);
    host.visualViewport?.removeEventListener('resize',onViewportChange);
    host.visualViewport?.removeEventListener('scroll',onViewportChange);
    if (panel.open) {if(panel.hasAttribute('popover')) {try {panel.hidePopover();} catch (_) {}} panel.close();}
    panel.remove();mini.remove();button.remove();probe.remove();style.remove();effect.remove();
    doc.documentElement.classList.remove(CLASS,LIGHT_CLASS,BACKGROUND_SAFE_CLASS);
    window.removeEventListener('pagehide',dispose);window.removeEventListener('unload',dispose);
    if (host[KEY]===instance) delete host[KEY];
  }
  const instance={dispose,open,isActive:()=>!disposed && host[KEY]===instance};host[KEY]=instance;
  button.addEventListener('click',open);
  mini.addEventListener('click',event=>{
    if(event.detail!==0 && host.performance.now()<miniSuppressUntil) {event.preventDefault();return;}
    open();
  });
  button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
  panel.addEventListener('cancel',event=>{event.preventDefault();close();});
  panel.addEventListener('close',()=>{if (!disposed) {comparing=false;stopRingDrag();cancelPreview();render(false);persistLibrary();}});
  doc.addEventListener('change',onThemeChange);doc.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',dispose);window.addEventListener('unload',dispose);
  render(false);renderSchemes(true);persistLibrary();
  host.addEventListener('resize',onViewportChange);
  host.visualViewport?.addEventListener('resize',onViewportChange);
  host.visualViewport?.addEventListener('scroll',onViewportChange);
  startMaintenance();mount();

 return instance;
}
