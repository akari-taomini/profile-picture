// 桃mini · 头像工具箱 1.0.5
// Each feature keeps its own state, styles and cleanup. Disabled features are not imported.
const W = window, D = document, KEY = '__taoAvatarToolbox';
W[KEY]?.dispose();
const loaders = {
  library: () => import('./modules/library.js?v=1.0.5').then(m => m.startLibrary),
  temporary: () => import('./modules/temporary.js?v=1.0.5').then(m => m.startTemporary),
  hd: () => import('./modules/hd.js?v=1.0.5').then(m => m.startHD),
  color: () => import('./modules/color.js?v=1.0.5').then(m => m.startColor),
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
      : running[key] ? '正在使用内置模块'
      : externalActive(key) ? '内置模块已关闭，检测到对应独立脚本'
      : '内置模块已关闭；如需独立脚本，请在酒馆助手启用');
    if (row.status.textContent !== message) row.status.textContent = message;
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
  const header = node('header'); header.append(node('strong', '头像工具箱 · 1.0.5'));
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
    button('改用独立脚本', () => { void setEnabled(key, false); }, row);
    rows.set(key, { toggle, status, actions });
    section.append(status); panel.append(section);
  }
  panel.append(node('p', '同一功能任选内置模块或独立脚本；不同功能可以混用。', 'tat-note'));
  panel.append(node('p', '头像收藏保存在当前浏览器；换设备前，请在头像库中导出备份。', 'tat-note'));
  D.body.append(panel); refreshRows(); panel.showModal();
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
