import { startLibrary, startTemporary, startHD, startColor } from './modules.js';

// 桃mini · 头像工具箱。The supplied modules retain their existing storage keys.
const W = window, D = document, KEY = '__taoAvatarToolbox';
W[KEY]?.dispose();
const factories = { library: startLibrary, temporary: startTemporary, hd: startHD, color: startColor };
const defaults = { library: true, temporary: true, hd: true, color: false };
const running = {}, errors = {};
let settings = { ...defaults }, initialized = false, disposed = false, panel;
const context = () => W.SillyTavern?.getContext();
function node(tag, text, className) {
  const el = D.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;
}
function persist() { context()?.accountStorage?.setItem('tao-avatar-toolbox-v1', JSON.stringify(settings)); }
function setEnabled(key, enabled) {
  if (key === 'library' && running.library?.isBusy?.()) throw new Error('头像正在保存，请稍等再关闭模块。');
  if (enabled && !running[key]) {
    running[key] = factories[key]();
  } else if (!enabled && running[key]) {
    running[key].dispose(); delete running[key];
  }
  settings[key] = enabled; delete errors[key]; persist();
}
function launch(key, kind) {
  try {
    if (!running[key]) setEnabled(key, true);
    panel?.close(); running[key]?.open?.(kind);
  } catch (e) { W.toastr?.error(e.message, '头像工具箱'); }
}
function button(text, fn, parent) {
  const b = node('button', text, 'menu_button'); b.type = 'button'; b.addEventListener('click', fn); parent.append(b); return b;
}
function open() {
  if (!initialized || disposed) return;
  if (panel?.open) return;
  panel?.remove(); panel = node('dialog'); panel.id = 'tao-avatar-toolbox-panel';
  panel.setAttribute('aria-label', '头像工具箱');
  const header = node('header'); header.append(node('strong', '头像工具箱'));
  button('关闭', () => panel.close(), header); panel.append(header);
  const specifications = [
    ['library', '头像库', '为角色和当前用户身份分别保存头像，随时换回。'],
    ['temporary', '临时头像与姓名', '调整当前聊天界面的显示；关闭模块时恢复。'],
    ['hd', '头像高清', '聊天头像优先读取原图，兼容临时头像。'],
    ['color', '反色与调色', '保留原来的面板和设置，新安装默认关闭此模块。'],
  ];
  for (const [key, name, detail] of specifications) {
    const section = node('section'), row = node('div', '', 'tat-row'), label = node('label');
    const toggle = node('input'); toggle.type = 'checkbox'; toggle.checked = !!running[key];
    label.append(toggle, D.createTextNode(' ' + name)); row.append(label);
    toggle.addEventListener('change', () => {
      try { setEnabled(key, toggle.checked); status.textContent = toggle.checked ? '已启用' : '已关闭'; }
      catch (e) { toggle.checked = !!running[key]; status.textContent = e.message; }
    });
    section.append(row, node('p', detail));
    const status = node('small', errors[key] || ''); status.setAttribute('role', 'status');
    if (key === 'library') {
      button('角色头像库', () => launch(key, 'char'), row);
      button('我的头像库', () => launch(key, 'user'), row);
    } else if (key !== 'hd') button('打开设置', () => launch(key), row);
    section.append(status); panel.append(section);
  }
  panel.append(node('p', '头像收藏保存在当前浏览器；换设备前，请在头像库中导出备份。', 'tat-note'));
  D.body.append(panel); panel.showModal();
}
const style = node('style');
style.textContent = `
  #temp-chat-identity-01-menu-item,#th-color-menu{display:none!important}
  #tao-avatar-toolbox-panel{box-sizing:border-box;width:min(650px,94vw);max-height:86vh;max-height:86dvh;overflow:auto;padding:18px;border-radius:16px;border:1px solid var(--SmartThemeBorderColor,#777);background:var(--SmartThemeBlurTintColor,#29292e);color:var(--SmartThemeBodyColor,#eee);font:inherit}
  #tao-avatar-toolbox-panel::backdrop{background:#0008}
  #tao-avatar-toolbox-panel header,#tao-avatar-toolbox-panel .tat-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  #tao-avatar-toolbox-panel header{justify-content:space-between;margin-bottom:16px}
  #tao-avatar-toolbox-panel section{padding:14px 0;border-top:1px solid var(--SmartThemeBorderColor,#7775)}
  #tao-avatar-toolbox-panel label{display:flex;align-items:center;gap:6px;margin-right:auto}
  #tao-avatar-toolbox-panel input[type=checkbox]{width:18px;height:18px;margin:0}
  #tao-avatar-toolbox-panel button{font:inherit;width:auto;min-height:36px;margin:0;padding:6px 10px;color:inherit}
  #tao-avatar-toolbox-panel p{font-size:.88em;line-height:1.6;margin:10px 0 0;opacity:.8}
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
function mount() {
  if (disposed) return;
  const c = context();
  if (!c?.accountStorage || !D.body) return;
  if (!initialized) {
    initialized = true;
    try {
      const saved = JSON.parse(c.accountStorage.getItem('tao-avatar-toolbox-v1') || '{}');
      for (const key of Object.keys(defaults)) if (typeof saved[key] === 'boolean') settings[key] = saved[key];
    } catch { /* Start with defaults if an older settings value is unreadable. */ }
    for (const key of Object.keys(factories)) {
      if (!settings[key]) continue;
      try { running[key] = factories[key](); } catch (e) { errors[key] = e.message; console.error('[头像工具箱]', key, e); }
    }
  }
  menuItem('tao-avatar-toolbox-menu', D.getElementById('extensionsMenu'));
  menuItem('tao-avatar-toolbox-settings', D.getElementById('extensions_settings'));
}
function dispose() {
  disposed = true; W.clearInterval(timer);
  for (const key of ['color', 'temporary', 'hd', 'library']) { try { running[key]?.dispose(); } catch (e) { console.warn(e); } }
  panel?.remove(); style.remove(); D.getElementById('tao-avatar-toolbox-menu')?.remove(); D.getElementById('tao-avatar-toolbox-settings')?.remove();
  W.removeEventListener('pagehide', dispose);
  if (W[KEY]?.dispose === dispose) delete W[KEY];
}
const timer = W.setInterval(mount, 1500);
W[KEY] = { open, dispose };
W.addEventListener('pagehide', dispose, { once: true });
mount();
