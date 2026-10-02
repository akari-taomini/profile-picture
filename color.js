// Native extension module: window is the Tavern host, even when Tavern is embedded.
export function startColor() {

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
