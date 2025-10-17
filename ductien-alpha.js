
(async function(){
  'use strict';

  // ---------- CONFIG ----------
  const KEY_URL = 'https://raw.githubusercontent.com/ductienalpha/DucTienAlpha4.0/main/key.txt'; // key online
  const STORAGE_UNLOCK_FLAG = "dt_access_granted_v1";
  const STORAGE_KEY_VERSION = "dt_access_key_saved_v1";
  const STORAGE_API_KEY = "dt_api_key";
  const MODEL_MAP = {
    'DucTien Flash': 'gemini-2.5-flash',
    'DucTien Pro': 'gemini-2.5-pro'
  };
  const SCRIPT_URL = 'https://raw.githubusercontent.com/ductienalpha/DucTienAlpha4.0/main/tampermonkey.user.js';

  // ---------- small helpers for storage ----------
  async function getStored(k,fallback=null){
    try{
      if(typeof GM !== 'undefined' && GM.getValue) return (await GM.getValue(k)) ?? fallback;
      if(typeof GM_getValue !== 'undefined') return GM_getValue(k) ?? fallback;
    }catch(e){}
    try{ return localStorage.getItem(k) ?? fallback; }catch(e){}
    return fallback;
  }
  async function setStored(k,v){
    try{ if(GM?.setValue) await GM.setValue(k,v); else if(GM_setValue) GM_setValue(k,v); }catch(e){}
    try{ localStorage.setItem(k,v); }catch(e){}
  }
  async function deleteStored(k){
    try{ if(GM?.deleteValue) await GM.deleteValue(k); else if(GM_deleteValue) GM_deleteValue(k); }catch(e){}
    try{ localStorage.removeItem(k); }catch(e){}
  }

  // ---------- state ----------
  let zBase = 9999999;
  let panel = null;
  let unlocked = false;
  let ONLINE_KEY = '';

  // ---------- load online key ----------
  async function fetchOnlineKey(){
    try{
      const resp = await fetch(KEY_URL + '?t=' + Date.now());
      const txt = await resp.text();
      return txt.trim();
    }catch(e){ return ''; }
  }
  ONLINE_KEY = await fetchOnlineKey();

  // ---------- LOCK OVERLAY ----------
  const lockOverlay = document.createElement('div');
  lockOverlay.className = 'dt-lock-overlay';
  lockOverlay.style.display = 'none';
  lockOverlay.innerHTML = `
    <div class="dt-lock-box">
      <h3>🔒 DucTien Panel</h3>
      <div class="dt-lock-note">Nhập access key để mở panel (key kiểm tra online từ GitHub).</div>
      <div class="dt-lock-row">
        <input id="dt-access-input" type="password" placeholder="Enter access key..." autocomplete="off" />
        <button class="dt-lock-eye" id="dt-eye" title="Show/Hide"></button>
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

  // eye toggle
  let eyeOpen=false;
  eyeBtn.addEventListener('click', ()=>{ eyeOpen=!eyeOpen; accessInput.type=eyeOpen?'text':'password'; });

  function showLock(show){
    lockOverlay.style.display=show?'flex':'none';
    if(show){ unlocked=false; if(panel){panel.classList.remove('show');panel.classList.add('hide');} accessInput.value=''; accessInput.focus(); }
  }

  async function markUnlocked(){
    unlocked=true;
    await setStored(STORAGE_UNLOCK_FLAG,'1');
    await setStored(STORAGE_KEY_VERSION, ONLINE_KEY);
    lockOverlay.style.display='none';
  }

  async function isPreviouslyUnlocked(){
    const flag = await getStored(STORAGE_UNLOCK_FLAG,'0');
    const saved = await getStored(STORAGE_KEY_VERSION,null);
    return flag==='1' && saved===ONLINE_KEY;
  }

  if(await isPreviouslyUnlocked()){ unlocked=true; showLock(false); } else { showLock(true); }

  async function tryOpen(){
    const v = (accessInput.value||'').trim();
    if(v===ONLINE_KEY){ await markUnlocked(); if(!panel) createPanel(); panel.classList.remove('hide'); panel.classList.add('show'); }
    else { lockMsg.textContent='❌ Invalid key'; setTimeout(()=>lockMsg.textContent='',2200); }
  }
  openBtn.addEventListener('click', tryOpen);
  accessInput.addEventListener('keydown', e=>{ if(e.key==='Enter') tryOpen(); });

  // ---------- createPanel ----------
  function createPanel(){
    if(panel) return panel;
    panel = document.createElement('div');
    panel.className='dt-panel hide';
    panel.style.left='32px';
    panel.style.top='64px';
    panel.style.zIndex=++zBase;

    panel.innerHTML = `
      <div class="dt-header" title="Drag to move">
        <div class="left"><span class="dt-icon">⚡</span><div class="dt-title">DucTien Alpha 4.0</div></div>
        <div class="dt-controls">
          <button class="dt-theme" title="Toggle theme">🌙</button>
          <button class="dt-logout" title="Logout">⎋</button>
          <button class="dt-min" title="Minimize">–</button>
          <button class="dt-close" title="Close">×</button>
        </div>
      </div>
      <div class="dt-body">
        <div class="dt-row">
          <label>🔑 API Key</label>
          <input class="dt-api grow" type="password" placeholder="API key for DucTien..." />
          <label>Model</label>
          <select class="dt-model"><option>DucTien Flash</option><option>DucTien Pro</option></select>
        </div>
        <div class="dt-row">
          <select class="dt-lang"><option value="VI">VI</option><option value="EN">EN</option></select>
          <select class="dt-subj grow"><option>Toán</option><option>Lý</option><option>Hóa</option><option>Sinh</option><option>Văn</option><option>Anh</option></select>
          <select class="dt-mode-select"><option value="answer">Đáp án</option><option value="explain">Giải thích</option></select>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="dt-btn-paste primary">📋 Paste image & Send</button>
          <button class="dt-clear">🗑️</button>
        </div>
        <div class="dt-imgbox">No image</div>
        <div class="dt-footer" style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
          <div class="dt-status ready">Ready</div>
          <div style="flex:0 0 46%;"><div class="dt-progress"><div class="dt-progress-bar"></div></div></div>
        </div>
        <div class="dt-result">Result will appear here.</div>
      </div>
    `;
    document.body.appendChild(panel);

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

    // restore persisted API key & settings
    (async()=>{
      apiInput.value = await getStored(STORAGE_API_KEY,'') || '';
      modelSel.value = await getStored('dt_mode','DucTien Flash') || 'DucTien Flash';
      langSel.value = await getStored('dt_lang','VI') || 'VI';
    })();

    // bring to front
    function bringToFront(){ panel.style.zIndex = ++zBase; }
    panel.addEventListener('mousedown',bringToFront);
    header.addEventListener('mousedown',bringToFront);

    closeBtn.addEventListener('click',()=>panel.classList.remove('show') || panel.classList.add('hide'));
    minBtn.addEventListener('click',()=>{
      const body = panel.querySelector('.dt-body');
      if(body.style.display==='none'){ body.style.display='block'; header.style.cursor='grab'; }
      else { body.style.display='none'; header.style.cursor='default'; }
    });
    logoutBtn.addEventListener('click', async()=>{
      await deleteStored(STORAGE_UNLOCK_FLAG);
      await deleteStored(STORAGE_KEY_VERSION);
      unlocked=false;
      showLock(true);
    });
    themeBtn.addEventListener('click',()=>{
      document.documentElement.classList.toggle('dt-theme-light');
      themeBtn.textContent=document.documentElement.classList.contains('dt-theme-light')?'☀️':'🌙';
    });

    // draggable header
    (function drag(){
      let dragging=false, startX=0, startY=0, left=0, top=0;
      header.addEventListener('mousedown', e=>{
        if(e.target.closest('button')) return;
        dragging=true; bringToFront();
        const rect = panel.getBoundingClientRect();
        left=rect.left; top=rect.top; startX=e.clientX; startY=e.clientY;
        header.style.cursor='grabbing'; e.preventDefault();
      });
      document.addEventListener('mousemove',e=>{ if(!dragging) return; panel.style.left=(left+e.clientX-startX)+'px'; panel.style.top=(top+e.clientY-startY)+'px'; });
      document.addEventListener('mouseup',()=>{ dragging=false; header.style.cursor='grab'; });
    })();

    apiInput.addEventListener('input',async()=>{ await setStored(STORAGE_API_KEY,apiInput.value||''); statusEl.textContent='Saved'; });
    modelSel.addEventListener('change',async()=>{ await setStored('dt_mode',modelSel.value||'DucTien Flash'); });
    langSel.addEventListener('change',async()=>{ await setStored('dt_lang',langSel.value||'VI'); });

    function setStatus(t,ready=false){ statusEl.textContent=t; statusEl.classList.toggle('ready',ready); }
    function setProgress(p){ progressBar.style.width=Math.max(0,Math.min(100,p))+'%'; }
    function renderResponse(txt){
      resultBox.innerHTML=''; const parts=String(txt).split(/```/g);
      for(let i=0;i<parts.length;i++){ if(i%2===0){ const d=document.createElement('div'); d.textContent=parts[i]; resultBox.appendChild(d); } else { const pre=document.createElement('pre'); pre.textContent=parts[i]; resultBox.appendChild(pre); } }
    }

    async function resizeBlob(blob,max=1280){
      return new Promise((res,rej)=>{
        const img=new Image(),r=new FileReader();
        r.onload=e=>{ img.src=e.target.result; };
        img.onload=()=>{ const c=document.createElement('canvas'); const s=Math.min(1,max/Math.max(img.width,img.height)); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/png')); };
        r.readAsDataURL(blob); img.onerror=rej;
      });
    }

    async function sendToGemini(base64,prompt,model){
      const gmFunc=(typeof GM_xmlhttpRequest!=='undefined')?GM_xmlhttpRequest:((typeof GM!=='undefined'&&GM.xmlHttpRequest)?GM.xmlHttpRequest:null);
      if(!gmFunc){ setStatus('❌ GM not available'); return; }
      const apiKey=(apiInput.value||'').trim();
      if(!apiKey){ setStatus('⚠️ No API key'); resultBox.textContent='❌ API Key sai hoặc chưa có API Key'; return; }
      const modelId=MODEL_MAP[model]||MODEL_MAP['DucTien Flash'];
      const url=`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
      const payload={ contents:[{ parts:[{ text:prompt },{ inlineData:{ mimeType:"image/png", data:base64 } }] }], generationConfig:{ temperature:0.05 } };
      setStatus('⏳ Sending...'); setProgress(20);
      try{
        gmFunc({ method:'POST', url, headers:{'Content-Type':'application/json'}, data:JSON.stringify(payload),
          onload:(r)=>{
            setProgress(100);
            let d=null; try{ d=JSON.parse(r.responseText||'{}'); }catch(e){ d=null; }
            if(r.status>=400){ setStatus('❌ Invalid API key / Error'); resultBox.textContent=r.responseText||'Error'; return; }
            if(d?.candidates?.length){ renderResponse(d.candidates.map(c=>c.output?.[0]?.content?.[0]?.text||'').join('\n')); setStatus('✅ Done',true); }
            else { setStatus('⚠️ No output'); resultBox.textContent=r.responseText||'No response'; }
          },
          onerror:()=>{ setStatus('❌ Failed'); }
        });
      }catch(e){ setStatus('❌ Exception'); console.error(e); }
    }

    pasteBtn.addEventListener('click', async()=>{
      const clipboardItems = await navigator.clipboard.read();
      for(const item of clipboardItems){
        if(item.types.includes('image/png')){
          const blob = await item.getType('image/png');
          const dataUrl = await resizeBlob(blob);
          imgBox.style.backgroundImage=`url(${dataUrl})`;
          imgBox.textContent='';
          const prompt = `Solve this exercise in ${subjSel.value||'Toán'} with mode=${modeSel.value||'answer'} language=${langSel.value||'VI'}`;
          await sendToGemini(dataUrl,prompt,modelSel.value);
          return;
        }
      }
      alert('No image found in clipboard');
    });

    clearBtn.addEventListener('click',()=>{ imgBox.style.backgroundImage='none'; imgBox.textContent='No image'; resultBox.textContent=''; });

    return panel;
  }

  if(unlocked) createPanel();

  // ---------- AUTO UPDATE ----------
  async function checkUpdate(){
    try{
      const resp = await fetch(SCRIPT_URL + '?t=' + Date.now());
      const txt = await resp.text();
      const remoteVer = txt.match(/@version\s+([\d\.]+)/)?.[1];
      if(remoteVer && remoteVer!==GM_info.script.version){
        console.log('DucTien Alpha update available, reload to update...');
      }
    }catch(e){ console.error(e); }
  }
  checkUpdate();

  // ---------- STYLES ----------
  GM_addStyle(`
    .dt-lock-overlay{position:fixed;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center;background:rgba(0,0,0,.7);z-index:99999;}
    .dt-lock-box{background:#222;color:#fff;padding:20px;border-radius:12px;display:flex;flex-direction:column;gap:12px;width:300px;box-shadow:0 0 20px #000;}
    .dt-lock-row{display:flex;gap:6px;align-items:center;}
    .dt-lock-row input{flex:1;padding:6px;border-radius:6px;border:none;background:#333;color:#fff;}
    .dt-lock-row button{padding:6px 8px;border:none;border-radius:6px;background:#555;color:#fff;cursor:pointer;}
    .dt-lock-msg{height:18px;color:#f55;font-size:13px;}
    .dt-panel{position:fixed;top:64px;left:32px;width:420px;background:#111;color:#fff;border-radius:12px;box-shadow:0 0 16px #000;transition:all .25s;display:flex;flex-direction:column;font-family:sans-serif;font-size:14px;}
    .dt-panel.hide{opacity:0;pointer-events:none;transform:scale(0.95);}
    .dt-panel.show{opacity:1;pointer-events:auto;transform:scale(1);}
    .dt-header{padding:6px 12px;display:flex;justify-content:space-between;align-items:center;cursor:grab;background:#222;border-bottom:1px solid #444;border-radius:12px 12px 0 0;}
    .dt-body{padding:8px;display:flex;flex-direction:column;gap:8px;}
    .dt-row{display:flex;gap:6px;align-items:center;}
    .dt-row select,.dt-row input{padding:4px;border-radius:6px;border:none;background:#333;color:#fff;flex:1;}
    .dt-btn-paste, .dt-clear, .dt-theme, .dt-logout, .dt-min, .dt-close{cursor:pointer;border:none;border-radius:6px;padding:4px 6px;background:#555;color:#fff;}
    .dt-imgbox{width:100%;height:120px;background:#222;background-size:contain;background-repeat:no-repeat;background-position:center;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#888;}
    .dt-result{background:#222;border-radius:8px;padding:6px;min-height:80px;overflow:auto;}
    .dt-footer{display:flex;align-items:center;gap:4px;}
    .dt-progress{flex:1;background:#333;height:8px;border-radius:4px;overflow:hidden;}
    .dt-progress-bar{width:0%;height:100%;background:#0f0;}
    .dt-status.ready{color:#0f0;}
  `);

})();
