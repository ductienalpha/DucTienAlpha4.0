// ==UserScript==
// @name        DucTien Alpha 4.0 (No OBF)
// @namespace   http://tampermonkey.net/
// @version     4.0
// @description To solve exercises
// @author      DucTien
// @match       https://*/*
// @icon        https://i.pinimg.com/1200x/0d/fc/a6/0dfca60200be23af53d552ead0d535be.jpg
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @grant       GM.xmlHttpRequest
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// ==/UserScript==

(async function(){
  'use strict';

  // ---------- CONFIG ----------
  const ACCESS_KEY = "ductien???"; // change here to invalidate previous key for all users
  const STORAGE_UNLOCK_FLAG = "dt_access_granted_v1"; // stored '1' if unlocked and key matched current stored key
  const STORAGE_KEY_VERSION = "dt_access_key_saved_v1"; // store the key string that was used to unlock
  const STORAGE_API_KEY = "dt_api_key";
  const MODEL_MAP = {
    'DucTien Flash': 'gemini-2.5-flash',
    'DucTien Pro': 'gemini-2.5-pro'
  };

  // ---------- small helpers for storage (GM first, fallback localStorage) ----------
  async function getStored(k, fallback=null){
    try{
      if(typeof GM !== 'undefined' && typeof GM.getValue === 'function'){
        const v = await GM.getValue(k);
        return (v === undefined) ? fallback : v;
      }
      if(typeof GM_getValue === 'function'){
        const v = GM_getValue(k);
        return (v === undefined) ? fallback : v;
      }
    }catch(e){}
    try{
      const v = localStorage.getItem(k);
      return v === null ? fallback : v;
    }catch(e){}
    return fallback;
  }
  async function setStored(k, v){
    try{
      if(typeof GM !== 'undefined' && typeof GM.setValue === 'function'){
        await GM.setValue(k, v);
        return;
      }
      if(typeof GM_setValue === 'function'){
        GM_setValue(k, v);
        return;
      }
    }catch(e){}
    try{ localStorage.setItem(k, v); }catch(e){}
  }
  async function deleteStored(k){
    try{
      if(typeof GM !== 'undefined' && typeof GM.deleteValue === 'function'){
        await GM.deleteValue(k); return;
      }
      if(typeof GM_deleteValue === 'function'){ GM_deleteValue(k); return; }
    }catch(e){}
    try{ localStorage.removeItem(k); }catch(e){}
  }

  // ---------- state ----------
  let zBase = 9999999; // ensure very high so UI floats over pages
  let panel = null;
  let unlocked = false;

  // ---------- styles (scoped & smaller header/font + dropdown fix + title glow) ----------
  GM_addStyle(`
  .dt-lock-overlay, .dt-panel { font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; box-sizing: border-box; }

  .dt-lock-overlay {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.78); z-index: ${zBase + 2000}; pointer-events: auto;
  }
  .dt-lock-box {
    width: 380px; max-width: 94vw;
    background: linear-gradient(180deg,#0f1220,#12121a);
    color: #e6f6ff;
    padding: 14px;
    border-radius: 10px;
    box-shadow: 0 18px 48px rgba(0,0,0,0.65);
    border: 1px solid rgba(127,191,255,0.06);
  }
  .dt-lock-box h3 { margin:0 0 6px; font-size:15px; }
  .dt-lock-note { color:#cfefff; font-size:12px; margin-bottom:6px; opacity:0.95; }
  .dt-lock-row { display:flex; gap:8px; align-items:center; }
  .dt-lock-row input {
    flex:1;
    padding:8px 10px;
    border-radius:8px;
    border:1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.02);
    color: #e6f6ff;
    outline:none;
    min-width:0;
    font-size:13px;
  }
  .dt-lock-eye { background: transparent; border: none; color: #e6f6ff; cursor: pointer; padding:6px; border-radius:8px; font-size:14px; }
  .dt-lock-open { padding:8px 10px; border-radius:8px; border:none; background: linear-gradient(90deg,#a280ff,#7fbfff); color:#051021; font-weight:700; cursor:pointer; min-width:70px; font-size:13px; }
  .dt-lock-msg { margin-top:6px; font-size:12px; height:18px; color:#ffb3b3; }

  .dt-panel {
    position: fixed;
    width: 380px;
    max-height: 82vh;
    border-radius: 10px;
    display:flex;
    flex-direction:column;
    overflow: hidden;
    z-index: ${zBase + 1000};
    opacity: 0; transform: translateY(6px) scale(0.995);
    transition: opacity 0.16s ease, transform 0.16s cubic-bezier(.2,.9,.2,1);
    left: 32px; top: 64px;
    background: linear-gradient(180deg,#0f1220,#141420);
    box-shadow: 18px 24px 48px rgba(0,0,0,0.65);
    color: #e6f6ff;
    border: 1px solid rgba(127,191,255,0.06);
    min-width: 260px;
    pointer-events: auto;
    font-size: 13px;
  }
  .dt-panel.show { opacity:1; transform: translateY(0) scale(1); }
  .dt-panel.hide { opacity:0; pointer-events:none; }

  /* HEADER: slightly smaller than before */
  .dt-header {
    display:flex; align-items:center; justify-content:space-between;
    padding:6px 8px; cursor:grab; /* reduced padding */
    background: linear-gradient(90deg,#6f3cff,#9b6bff);
    border-top-left-radius: 10px; border-top-right-radius: 10px;
    gap:8px;
  }
  .dt-header .left { display:flex; gap:6px; align-items:center; }
  .dt-icon { width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; }
  /* Title: made slightly larger for prominence + gradient animation */
  .dt-title { font-weight:800; font-size:14px; line-height:1; padding-right:6px;
    background: linear-gradient(90deg, #9d4edd, #6be3ff, #9d4edd);
    background-size: 200% 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: dt-title-gradient 6s linear infinite;
    transition: filter 0.22s ease, transform 0.12s ease;
  }
  .dt-title:hover { filter: drop-shadow(0 0 6px rgba(155,107,255,0.6)); transform: translateY(-1px); }

  @keyframes dt-title-gradient {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  .dt-controls { display:flex; gap:6px; align-items:center; }

  .dt-controls button { background:transparent; border:none; color:#fff; cursor:pointer; padding:6px; border-radius:8px; font-size:13px; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; }
  .dt-controls button:hover { transform: translateY(-2px); }

  .dt-body { padding:10px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; }

  .dt-row { display:flex; gap:8px; align-items:center; }
  .dt-row .grow { flex:1; min-width:0; }

  .dt-panel input, .dt-panel textarea, .dt-panel select, .dt-panel button { font-family: inherit; }
  .dt-panel input[type="password"], .dt-panel input[type="text"] {
    padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08);
    background: linear-gradient(180deg,#0b1220,#0f1624); color:#e6f6ff; outline:none; font-size:13px;
  }

  /* Dropdown base */
  .dt-panel select {
    padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08);
    appearance:none; font-size:13px;
    background-color: var(--dt-select-bg, rgba(11,18,32,0.9));
    color: var(--dt-select-color, #e6f6ff);
  }
  /* custom arrow */
  .dt-panel select { background-image: linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.18) 50%), linear-gradient(135deg, rgba(255,255,255,0.18) 50%, transparent 50%); background-position: calc(100% - 16px) calc(1em + 2px), calc(100% - 12px) calc(1em + 2px); background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; padding-right: 34px; }

  .dt-panel button.primary { padding:8px 10px; border-radius:8px; border:none; cursor:pointer; background: linear-gradient(90deg,#a280ff,#7fbfff); color:#051021; font-weight:700; font-size:13px; }

  .dt-imgbox { min-height:110px; max-height:300px; border-radius:8px; padding:8px; display:flex; align-items:center; justify-content:center; overflow:hidden; background: linear-gradient(180deg,#0b0f1a,#0f1726); border: 1px solid rgba(127,191,255,0.04); }
  .dt-imgbox img { max-width:100%; max-height:100%; object-fit:contain; border-radius:6px; box-shadow: 0 6px 18px rgba(0,0,0,0.55); }

  .dt-status { font-size:12px; padding:6px 8px; border-radius:8px; background: rgba(255,255,255,0.02); color:#cfefff; border:1px solid rgba(127,191,255,0.03); text-align:center; min-width:72px; }
  .dt-status.ready { color:#bfe6ac; }
  .dt-progress { height:6px; background: rgba(255,255,255,0.02); border-radius:8px; overflow:hidden; }
  .dt-progress-bar { height:100%; width:0%; transition: width 0.16s linear; background: linear-gradient(90deg,#a280ff,#7fbfff); }

  .dt-result { min-height:80px; max-height:200px; overflow:auto; background: linear-gradient(180deg,#0b1220,#08101a); padding:10px; border-radius:8px; color:#dff8ff; border:1px solid rgba(127,191,255,0.03); font-size:13px; }
  .dt-result pre { background: rgba(255,255,255,0.02); padding:6px; border-radius:6px; color: #e6f6ff; font-size:13px; }

  /* Light theme overrides (scoped to class on html element) */
  .dt-theme-light .dt-panel { background: linear-gradient(180deg,#eef3f7,#e6edf2); color:#123; border:1px solid rgba(33,45,66,0.06); box-shadow: 10px 14px 30px rgba(0,0,0,0.06); }
  .dt-theme-light .dt-header { background: linear-gradient(90deg,#8a6dff,#b597ff); color:#fff; }
  .dt-theme-light .dt-panel input, .dt-theme-light .dt-panel select { background: #fff; color:#111; border:1px solid rgba(33,45,66,0.06); }
  .dt-theme-light .dt-result { background: linear-gradient(180deg,#f8fbfd,#eef6fb); color:#22303f; border:1px solid rgba(33,45,66,0.04); }
  .dt-theme-light .dt-status { color:#2b6b08; background: rgba(34,139,34,0.06); }

  /* Dropdown color variables: dark theme */
  :root { --dt-select-bg: rgba(11,18,32,0.95); --dt-select-color: #e6f6ff; }
  .dt-theme-light :root, .dt-theme-light { /* ensure in light theme selects are white */ }
  .dt-theme-light .dt-panel { --dt-select-bg: #ffffff; --dt-select-color: #111111; }

  @media (max-width:720px){
    .dt-panel{ width:92vw !important; left:4vw !important; top:6vh !important; }
    .dt-lock-box { width: 92vw; }
  }
  `);

  // ---------- MathJax load ----------
  (function loadMathJax(){
    if(window.MathJax) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
    s.async = true;
    document.head.appendChild(s);
  })();

  // ---------- LOCK OVERLAY ----------
  const lockOverlay = document.createElement('div');
  lockOverlay.className = 'dt-lock-overlay';
  lockOverlay.setAttribute('role','dialog');
  lockOverlay.setAttribute('aria-modal','true');
  lockOverlay.style.display = 'none'; // start hidden until we check storage
  lockOverlay.innerHTML = `
    <div class="dt-lock-box">
      <h3>🔒 DucTien Panel</h3>
      <div class="dt-lock-note">Nhập access key để mở panel (quản lý key bằng cách chỉnh mã script).</div>
      <div class="dt-lock-row">
        <input id="dt-access-input" type="password" placeholder="Enter access key..." autocomplete="off" />
        <button class="dt-lock-eye" id="dt-eye" title="Show/Hide" aria-label="Show or hide">${getEyeSVG(false)}</button>
        <button class="dt-lock-open" id="dt-open">Open</button>
      </div>
      <div class="dt-lock-msg" id="dt-lock-msg"></div>
    </div>
  `;
  document.body.appendChild(lockOverlay);

  const accessInput = lockOverlay.querySelector('#dt-access-input');
  const openBtn = lockOverlay.querySelector('#dt-open');
  const eyeBtn = lockOverlay.querySelector('#dt-eye');
  const lockMsg = lockOverlay.querySelector('#dt-lock-msg');

  // helper: show/hide lock overlay
  function showLock(show){
    lockOverlay.style.display = show ? 'flex' : 'none';
    lockOverlay.style.pointerEvents = show ? 'auto' : 'none';
    if(show){
      setTimeout(()=>{ try{ accessInput.value=''; accessInput.focus(); }catch(e){} }, 80);
      unlocked = false;
      if(panel) { panel.classList.remove('show'); panel.classList.add('hide'); }
    }
  }

  // eye toggle for input
  let eyeOpen = false;
  eyeBtn.addEventListener('click', ()=>{
    eyeOpen = !eyeOpen;
    accessInput.type = eyeOpen ? 'text' : 'password';
    eyeBtn.innerHTML = getEyeSVG(eyeOpen);
  });

  // mark unlocked: save using GM storage (persists across domains)
  async function markUnlocked(){
    unlocked = true;
    try {
      await setStored(STORAGE_UNLOCK_FLAG, '1');
      await setStored(STORAGE_KEY_VERSION, ACCESS_KEY);
    } catch(e){}
    // completely hide overlay to avoid overlapping page elements
    lockOverlay.style.display = 'none';
    lockOverlay.style.pointerEvents = 'none';
  }

  async function isPreviouslyUnlocked(){
    try{
      const flag = await getStored(STORAGE_UNLOCK_FLAG, '0');
      const saved = await getStored(STORAGE_KEY_VERSION, null);
      if(flag === '1' && saved === ACCESS_KEY) return true;
    }catch(e){}
    return false;
  }

  // initialize: check persisted unlock & API key
  const prevUnlocked = await isPreviouslyUnlocked();
  if(prevUnlocked){
    unlocked = true;
    showLock(false);
  } else {
    showLock(true);
  }

  // handle submit/open
  async function tryOpen(){
    const v = String(accessInput.value || '').trim();
    if(v === ACCESS_KEY){
      await markUnlocked();
      if(!panel) createPanel();
      panel.classList.remove('hide'); panel.classList.add('show');
    } else {
      lockMsg.textContent = '❌ Invalid key';
      setTimeout(()=>{ lockMsg.textContent = ''; }, 2200);
    }
  }
  openBtn.addEventListener('click', tryOpen);
  accessInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') tryOpen(); });

  // ---------- createPanel ----------
  function createPanel(){
    if(panel) return panel;
    panel = document.createElement('div');
    panel.className = 'dt-panel hide';
    panel.style.left = '32px';
    panel.style.top = '64px';
    panel.style.zIndex = ++zBase;

    panel.innerHTML = `
      <div class="dt-header" title="Drag to move">
        <div class="left"><span class="dt-icon">${getBoltSVG()}</span><div class="dt-title">DucTien Alpha 4.0</div></div>
        <div class="dt-controls">
          <button class="dt-theme" title="Toggle theme" aria-label="Toggle theme">${getMoonSVG()}</button>
          <button class="dt-logout" title="Logout" aria-label="Logout">${getLogoutSVG()}</button>
          <button class="dt-min" title="Minimize" aria-label="Minimize">${getMinSVG()}</button>
          <button class="dt-close" title="Close" aria-label="Close">${getCloseSVG()}</button>
        </div>
      </div>

      <div class="dt-body">
        <div class="dt-row">
          <label class="dt-small" style="min-width:64px;color:inherit;">🔑 API Key</label>
          <input class="dt-api grow" type="password" placeholder="API key for DucTien..." />
          <label class="dt-small" style="min-width:48px;color:inherit;">Model</label>
          <select class="dt-model"><option>DucTien Flash</option><option>DucTien Pro</option></select>
        </div>

        <div class="dt-row">
          <select class="dt-lang" style="width:72px"><option value="VI">VI</option><option value="EN">EN</option></select>
          <select class="dt-subj grow"><option>Toán</option><option>Lý</option><option>Hóa</option><option>Sinh</option><option>Văn</option><option>Anh</option></select>
          <select class="dt-mode-select" style="width:110px"><option value="answer">Đáp án</option><option value="explain">Giải thích</option></select>
        </div>

        <div style="display:flex;gap:8px;align-items:center;">
          <button class="dt-btn-paste primary" title="Paste image from clipboard and send">${getClipboardSVG()} Paste image & Send</button>
          <button class="dt-clear" title="Clear image" style="background:transparent;border:1px solid rgba(255,255,255,0.08);color:inherit;padding:6px 8px;border-radius:8px;">${getTrashSVG()}</button>
        </div>

        <div class="dt-imgbox">No image</div>

        <div class="dt-footer" style="margin-top:4px;display:flex;gap:8px;align-items:center;justify-content:space-between;">
          <div class="dt-status ready">Ready</div>
          <div style="flex:0 0 46%;"><div class="dt-progress"><div class="dt-progress-bar"></div></div></div>
        </div>

        <div class="dt-result">Result will appear here.</div>
      </div>
    `;

    document.body.appendChild(panel);

    // references
    const header = panel.querySelector('.dt-header');
    const closeBtn = panel.querySelector('.dt-close');
    const minBtn = panel.querySelector('.dt-min');
    const logoutBtn = panel.querySelector('.dt-logout');
    const themeBtn = panel.querySelector('.dt-theme');
    const apiInput = panel.querySelector('.dt-api');
    const modelSel = panel.querySelector('.dt-model');
    const langSel = panel.querySelector('.dt-lang');
    const subjSel = panel.querySelector('.dt-subj');
    const modeSel = panel.querySelector('.dt-mode-select');
    const pasteBtn = panel.querySelector('.dt-btn-paste');
    const clearBtn = panel.querySelector('.dt-clear');
    const imgBox = panel.querySelector('.dt-imgbox');
    const resultBox = panel.querySelector('.dt-result');
    const statusEl = panel.querySelector('.dt-status');
    const progressBar = panel.querySelector('.dt-progress-bar');

    // restore persisted values (API key & others) using GM storage
    (async ()=>{
      try{
        const savedApi = await getStored(STORAGE_API_KEY, '');
        apiInput.value = savedApi || '';
        const savedModel = await getStored('dt_mode', 'DucTien Flash');
        modelSel.value = savedModel || 'DucTien Flash';
        const savedLang = await getStored('dt_lang', 'VI');
        langSel.value = savedLang || 'VI';
      }catch(e){}
    })();

    // bring to front
    function bringToFront(){ panel.style.zIndex = ++zBase; }
    panel.addEventListener('mousedown', bringToFront);
    header.addEventListener('mousedown', bringToFront);

    // close/min/logout/theme handlers
    closeBtn.addEventListener('click', ()=> togglePanel(false));
    minBtn.addEventListener('click', ()=>{
      const body = panel.querySelector('.dt-body');
      if(body.style.display === 'none'){ body.style.display = 'block'; header.style.cursor = 'grab'; }
      else { body.style.display = 'none'; header.style.cursor = 'default'; }
    });
    logoutBtn.addEventListener('click', async ()=>{
      // remove stored unlock flag so user must re-enter on next open
      try{ await deleteStored(STORAGE_UNLOCK_FLAG); await deleteStored(STORAGE_KEY_VERSION); }catch(e){}
      unlocked = false;
      showLock(true);
    });
    themeBtn.addEventListener('click', ()=>{
      document.documentElement.classList.toggle('dt-theme-light');
      const isLight = document.documentElement.classList.contains('dt-theme-light');
      themeBtn.innerHTML = isLight ? getSunSVG() : getMoonSVG();
    });

    // draggable header
    (function drag(){
      let dragging=false, startX=0, startY=0, left=0, top=0;
      header.addEventListener('mousedown', e=>{
        if(e.target.closest('button')) return;
        dragging = true; bringToFront();
        const rect = panel.getBoundingClientRect();
        left = rect.left; top = rect.top;
        startX = e.clientX; startY = e.clientY;
        header.style.cursor = 'grabbing'; e.preventDefault();
      });
      document.addEventListener('mousemove', e=>{
        if(!dragging) return;
        panel.style.left = (left + e.clientX - startX) + 'px';
        panel.style.top = (top + e.clientY - startY) + 'px';
      });
      document.addEventListener('mouseup', ()=>{ dragging = false; header.style.cursor='grab'; });
    })();

    // persist settings on change (auto-save with GM storage)
    apiInput.addEventListener('input', async ()=> { await setStored(STORAGE_API_KEY, apiInput.value || ''); setStatus('Saved', true); });
    modelSel.addEventListener('change', async ()=> { await setStored('dt_mode', modelSel.value || 'DucTien Flash'); });
    langSel.addEventListener('change', async ()=> { await setStored('dt_lang', langSel.value || 'VI'); });

    // helpers
    function setStatus(t, ready=false){ try{ statusEl.textContent = t; statusEl.classList.toggle('ready', ready); }catch(e){} }
    function setProgress(p){ try{ progressBar.style.width = Math.max(0,Math.min(100,p)) + '%'; }catch(e){} }

    function renderResponse(txt){
      resultBox.innerHTML = '';
      const parts = String(txt).split(/```/g);
      for(let i=0;i<parts.length;i++){
        if(i%2===0){
          const d = document.createElement('div'); d.textContent = parts[i]; resultBox.appendChild(d);
        } else {
          const pre = document.createElement('pre'); pre.textContent = parts[i]; resultBox.appendChild(pre);
        }
      }
      if(window.MathJax?.typesetPromise){ try{ MathJax.typesetClear(); MathJax.typesetPromise([resultBox]); }catch(e){} }
    }

    // resizeBlob
    async function resizeBlob(blob, max=1280){
      return new Promise((res, rej)=>{
        const img = new Image();
        const r = new FileReader();
        r.onload = e => { img.src = e.target.result; };
        img.onload = () => {
          const c = document.createElement('canvas');
          const s = Math.min(1, max/Math.max(img.width, img.height));
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/png'));
        };
        r.readAsDataURL(blob);
        img.onerror = rej;
      });
    }

    // sendToGemini (GM call) -- UPDATED: improved API-key / response error handling
    async function sendToGemini(base64, prompt, model){
      const gmFunc = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest : ((typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null);
      if(!gmFunc){ setStatus('❌ GM not available'); return; }
      const apiKey = (apiInput.value || '').trim();
      if(!apiKey){ setStatus('⚠️ No API key'); resultBox.textContent = '❌ API Key sai hoặc chưa có API Key'; return; }
      const modelId = MODEL_MAP[model] || MODEL_MAP['DucTien Flash'];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const payload = { contents:[{ parts:[{ text: prompt }, { inlineData:{ mimeType: "image/png", data: base64 } }] }], generationConfig:{ temperature:0.05 } };
      setStatus('⏳ Sending...'); setProgress(20);
      try{
        gmFunc({
          method: 'POST',
          url,
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(payload),
          onload: (r) => {
            setProgress(100);
            try{
              // try parse response
              let d = null;
              try { d = JSON.parse(r.responseText || '{}'); } catch(e) { d = null; }

              // HTTP error codes or API-level error
              const statusCode = r.status || (r.statusCode || 0);
              if(statusCode >= 400){
                const errMsg = (d && (d.error?.message || JSON.stringify(d))) || (`HTTP ${statusCode}`);
                setStatus('❌ Invalid key or request');
                resultBox.textContent = `❌ API Key sai hoặc request lỗi.\nChi tiết: ${errMsg}`;
                setTimeout(()=>setProgress(0), 600);
                return;
              }

              if(d && d.error){
                const errMsg = d.error.message || JSON.stringify(d.error);
                setStatus('❌ Invalid key');
                resultBox.textContent = `❌ API Key sai hoặc chưa có API Key\nChi tiết: ${errMsg}`;
                setTimeout(()=>setProgress(0), 600);
                return;
              }

              // find text candidate
              const t = d?.candidates?.[0]?.content?.parts?.[0]?.text;
              if(!t || String(t).trim() === ''){
                // no textual response -> likely key limited / model rate-limited / blank response
                setStatus('⚠️ No response');
                resultBox.textContent = '⚠️ API Key có thể bị giới hạn hoặc Gemini không phản hồi. Thử lại sau vài phút.';
                setTimeout(()=>setProgress(0), 600);
                return;
              }

              // good response
              renderResponse(t);
              setStatus('✅ Done', true);
            }catch(err){
              setStatus('❌ Parse error'); resultBox.textContent = String(err);
            }
            setTimeout(()=>setProgress(0), 600);
          },
          onerror: (err) => {
            setStatus('❌ Network error'); setProgress(0);
            resultBox.textContent = '⚠️ Không thể kết nối tới Gemini hoặc API Key bị giới hạn. Thử lại sau vài phút.';
          }
        });
      }catch(e){
        setStatus('❌ Request error'); setProgress(0);
        resultBox.textContent = '⚠️ Lỗi gửi yêu cầu tới Gemini.';
      }
    }

    // paste handler
    pasteBtn.addEventListener('click', async ()=>{
      setStatus('Reading clipboard...');
      try{
        const items = await navigator.clipboard.read();
        let blob = null;
        for(const it of items) for(const t of it.types) if(t.startsWith('image/')) blob = await it.getType(t);
        if(!blob){ setStatus('❌ No image'); return; }
        const dataUrl = await resizeBlob(blob, 1280);
        const base64 = dataUrl.split(',')[1];
        imgBox.innerHTML = `<img src="${dataUrl}">`;
        const subj = subjSel.value, mode = modeSel.value, lang = langSel.value;
        const prompt = lang === 'EN'
          ? (mode === 'answer' ? `Answer only, analyze ${subj} problem.` : `Analyze ${subj} image, explain in detail.`)
          : (mode === 'answer' ? `Chỉ trả lời đáp án, không giải thích. Bài ${subj}.` : `Phân tích ảnh bài ${subj}, giải thích chi tiết.`);
        sendToGemini(base64, prompt, modelSel.value);
      }catch(err){
        setStatus('❌ Error reading clipboard'); resultBox.textContent = String(err);
      }
    });

    // clear image
    clearBtn.addEventListener('click', ()=>{ imgBox.innerHTML = 'No image'; setStatus('Ready', true); });

    return panel;
  } // end createPanel

  // ---------- toggle panel ----------
  function togglePanel(force){
    if(!panel) createPanel();
    if(!unlocked){
      showLock(true);
      return;
    }
    if(force === false){ panel.classList.remove('show'); panel.classList.add('hide'); return; }
    if(panel.classList.contains('show')){ panel.classList.remove('show'); panel.classList.add('hide'); }
    else { panel.classList.remove('hide'); panel.classList.add('show'); }
  }

  // ---------- hotkey handling ----------
  document.addEventListener('keydown', (e)=>{
    if(e.key.toLowerCase() === 't' && e.shiftKey){
      if(unlocked) togglePanel();
      else { showLock(true); }
    }
  });

  // expose for debugging/control
  window.DucTien = {
    createPanel,
    togglePanel,
    unlockNow: async ()=>{
      try{ await setStored(STORAGE_UNLOCK_FLAG,'1'); await setStored(STORAGE_KEY_VERSION, ACCESS_KEY); }catch(e){}
      unlocked = true; showLock(false); if(!panel) createPanel(); panel.classList.remove('hide'); panel.classList.add('show');
    }
  };

  console.log('✅ DucTien Panel loaded (secure + GM-persistent storage, UI smaller header + dropdown fix + title glow).');

  // ----------------- SVG helper functions -----------------
  function getEyeSVG(open){
    if(open) return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" stroke="#e6f6ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="#e6f6ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2l20 20" stroke="#e6f6ff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.94 17.94C16.24 19.07 14.2 19.8 12 19.8c-7 0-11-7-11-7 1.68-2.9 4.6-5.03 8-5.8" stroke="#e6f6ff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function getBoltSVG(){
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h7l-1 8L21 10h-7l-1-8z" fill="#fff" opacity="0.95"/></svg>`;
  }
  function getMoonSVG(){
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="#fff"/></svg>`;
  }
  function getSunSVG(){
    return `<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="#fff"/></svg>`;
  }
  function getLogoutSVG(){
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 17l5-5-5-5" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12H9" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 19H7a2 2 0 01-2-2V7a2 2 0 012-2h5" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function getMinSVG(){ return `<svg width="12" height="12" viewBox="0 0 24 24"><path d="M5 12h14" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`; }
  function getCloseSVG(){ return `<svg width="12" height="12" viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>`; }
  function getClipboardSVG(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 4h-2.18A2 2 0 0012 2h0a2 2 0 00-1.82 2H8a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V6a2 2 0 00-2-2z" stroke="#051021" stroke-width="1.2"/></svg>`; }
  function getTrashSVG(){ return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>`; }

})();
