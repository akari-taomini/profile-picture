// Based on the working standalone 4.5.10. Native extension window replaces the helper iframe parent.
export function startHD() {

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
