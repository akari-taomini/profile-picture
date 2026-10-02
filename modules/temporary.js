// Native extension module: window is the Tavern host, even when Tavern is embedded.
export function startTemporary() {

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
