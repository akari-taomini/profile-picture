// Native extension module: window is the Tavern host, even when Tavern is embedded.
export function startLibrary() {

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
    function setPreview(img, blob) {
      if (stopped || renderToken !== token || !img.isConnected) return;
      const url = W.URL.createObjectURL(blob); urls.add(url); img.src = url;
    }
    for (const item of items) {
      const card = element('article','tal-card'), img = element('img','th-color-preserve');
      img.setAttribute('data-th-color-preserve',''); img.alt = item.name; img.loading = 'lazy'; img.decoding = 'async';
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
      const preview = element('img','th-color-preserve'); preview.setAttribute('data-th-color-preserve',''); preview.alt = label+'预览'; preview.hidden = true; preview.style.cssText = 'width:120px;height:160px;object-fit:contain';
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
