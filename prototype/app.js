/* ============================================================
   Convene — engine (v4): Buildings>Floors>Spaces, wizard,
   per-building multi-choice catering w/ cutoffs, setup/teardown.
   ============================================================ */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const money=n=>'$'+Math.round(n).toLocaleString();
const svc=id=>DATA.services.find(s=>s.id===id);
const space=id=>DATA.spaces.find(s=>s.id===id);
const building=id=>DATA.buildings.find(b=>b.id===id);
const planner=id=>DATA.planners.find(p=>p.id===id);
const fmtHr=h=>{const hh=Math.floor(h),mm=Math.round((h%1)*60);return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;};
const t2d=t=>{const [h,m]=String(t).split(':').map(Number);return h+(m||0)/60;};
const TODAY='2026-06-30';
const NOW={date:TODAY,hour:9};                 // notional "now" for cutoff demos

/* roles */
const PERSONAS={ employee:{name:'Jordan Lee',role:'Employee · Sales',avatar:'JL'}, planner:{name:'Ava Mendel',role:'Workplace Lead',avatar:'AM'} };
let currentRole='employee';
const me=()=>PERSONAS[currentRole];

/* persistence */
const STORE='convene.v4';
function save(){ try{ localStorage.setItem(STORE,JSON.stringify({ bookings:DATA.bookings, requests:DATA.requests, insights:DATA.insights, overrides:DATA.cateringOverrides, fav:DATA.user.favoriteBuildingId })); }catch(e){} }
function load(){ try{ const s=JSON.parse(localStorage.getItem(STORE)||'null'); if(s){ DATA.bookings=s.bookings||DATA.bookings; DATA.requests=s.requests||DATA.requests; DATA.insights=s.insights||DATA.insights; DATA.cateringOverrides=s.overrides||{}; DATA.user.favoriteBuildingId=s.fav||null; } }catch(e){} }
function resetDemo(){ localStorage.removeItem(STORE); location.reload(); }

/* ---- catering helpers ---- */
const menuFor=bId=> DATA.cateringOverrides[bId] || (building(bId) ? DATA.cateringTemplates[building(bId).cateringTemplate].items : DATA.cateringTemplates.tpl_std.items);
const catItem=(bId,itemId)=> menuFor(bId).find(i=>i.id===itemId) || Object.values(DATA.cateringTemplates).flatMap(t=>t.items).find(i=>i.id===itemId);
const CAT_SLA={beverage:1,snack:2,lunch:8,buffet:12,reception:24};
const hoursUntil=(date,start)=>{ const d=(new Date(date)-new Date(NOW.date))/3.6e6/24; return Math.round(d)*24 + (start-NOW.hour); };
const pastCutoff=(item,date,start)=> hoursUntil(date,start) < item.cutoffHours;
const fmtCut=h=> h<24?`${h}h before`:`${h/24===1?'1 day':h/24+' days'} before`;

/* ---- availability incl. setup/teardown buffers ---- */
const winOf=(sp,start,end)=>[start - (sp.setupMins||0)/60, end + (sp.teardownMins||0)/60];
function conflictsForSpace(spaceId,date,start,end,ignoreId){
  const sp=space(spaceId); const [ns,ne]=winOf(sp,start,end);
  return DATA.bookings.filter(b=>{ if(b.spaceId!==spaceId||(b.date||TODAY)!==date||b.id===ignoreId) return false;
    const [bs,be]=winOf(sp,b.start,b.end); return bs<ne && ns<be; });
}
const spaceFree=(id,d,s,e,ig)=>conflictsForSpace(id,d,s,e,ig).length===0;

/* ---- navigation + roles ---- */
function go(screen){ $$('.screen').forEach(s=>s.classList.remove('on')); $('#screen-'+screen).classList.add('on'); $$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.screen===screen)); window.scrollTo({top:0,behavior:'smooth'}); }
$('#nav').addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b.dataset.screen)go(b.dataset.screen);});
document.addEventListener('click',e=>{const g=e.target.closest('[data-goto]');if(g)go(g.dataset.goto);});

function applyRole(){
  const p=me(); $('#me-av').textContent=p.avatar; $('#me-name').textContent=p.name; $('#me-role').textContent=p.role;
  $$('#nav [data-roles]').forEach(b=>b.style.display=b.dataset.roles.includes(currentRole)?'':'none');
  $('#lbl-requests').textContent=currentRole==='planner'?'Requests':'My Requests';
  const cur=$('.screen.on')?.id.replace('screen-','');
  const allowed=currentRole==='planner'?['book','requests','dashboard','planner','catering','recs']:['book','requests'];
  if(!allowed.includes(cur)) go('book');
  renderRequests(); renderReqCount();
}
function renderReqCount(){ const n=DATA.requests.filter(r=>r.status==='pending').length; const el=$('#req-count'); el.textContent=(currentRole==='planner'&&n)?n:''; el.style.display=el.textContent?'':'none'; }
$('#role-switch').onclick=()=>{ currentRole=currentRole==='planner'?'employee':'planner'; applyRole(); if(currentRole==='planner'){renderDashboard();renderPlanner();renderCatering();renderRecs();} toast(`Now viewing as ${me().name} (${currentRole})`); };

/* theme */
const THEME_KEY='convene.theme';
function applyTheme(name){
  document.body.className='theme-'+name;
  $$('#theme-switch button').forEach(b=>b.classList.toggle('on',b.dataset.theme===name));
  try{ localStorage.setItem(THEME_KEY,name); }catch(e){}
}
$('#theme-switch').addEventListener('click',e=>{const b=e.target.closest('[data-theme]');if(b)applyTheme(b.dataset.theme);});

/* toast */
let toastT; function toast(m,ok=true){const t=$('#toast');t.className='toast on'+(ok?'':' bad');t.innerHTML=(ok?'✓ ':'✕ ')+m;clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),3000);}

/* ============================================================ BOOKING JOURNEY / SLA ============================================================ */
const fmtSla=h=>h===0?'instant':h<24?`~${h}h`:(h%24===0?`~${h/24}d`:`~${(h/24).toFixed(1)}d`);
function journeyFor(o){
  const done=o.kind==='booking'||o.status==='allocated';
  const roomSla=o.kind==='request'?DATA.allocSla:0;
  const cItems=(o.catering||[]); const sIds=(o.services||[]);
  const cSla=cItems.length?Math.max(...cItems.map(c=>CAT_SLA[catItem(o.buildingId,c.itemId)?.type]||4)):0;
  const sSla=sIds.length?Math.max(...sIds.map(id=>svc(id).confirmSla)):0;
  const steps=[
    {icon:'📝',label:o.kind==='request'?'Request submitted':'Booking created',sla:0,status:'done',detail:'Requirements, services & catering captured'},
    {icon:'🏢',label:'Room confirmation',sla:roomSla,status:done?'done':'pending',detail:done?`Confirmed: ${space(o.allocatedSpaceId||o.spaceId)?.name||'room'}`:(o.kind==='request'?'Planner allocates a room':'Instant')},
    {icon:'🍽️',label:'Catering order confirmation',sla:cSla,status:cItems.length?(done?'done':'queued'):'na',detail:cItems.length?cItems.map(c=>catItem(o.buildingId,c.itemId)?.name).join(', '):'No catering ordered'},
    {icon:'🎛️',label:'AV & services booking',sla:sSla,status:sIds.length?(done?'done':'queued'):'na',detail:sIds.length?sIds.map(id=>svc(id).name).join(', '):'No services ordered'},
    {icon:'✅',label:'Fully confirmed — ready',sla:0,status:done?'done':'pending',detail:done?'All elements confirmed':'Pending the steps above'},
  ];
  return {steps,roomSla,cSla,sSla,total:roomSla+Math.max(cSla,sSla),done};
}
const JDOT={done:'✓',pending:'●',queued:'○',na:'–'};
function journeyHTML(j){
  const rows=j.steps.map((s,i)=>{const last=i===j.steps.length-1;const sla=s.status==='na'?'—':(s.sla===0?(s.status==='done'?'done':'—'):fmtSla(s.sla));
    return `<div class="jstep ${s.status}"><div class="jrail"><span class="jdot">${JDOT[s.status]}</span>${last?'':'<span class="jconn"></span>'}</div><div class="jbody"><div class="jhd"><b>${s.icon} ${s.label}</b><span class="jsla">${sla}</span></div><div class="jdetail">${s.detail}</div></div></div>`;}).join('');
  const eta=j.done?`<span style="color:var(--ok)">All confirmed ✓</span>`:`Est. time to fully confirmed <b>${fmtSla(j.total)}</b> <span class="muted">(room ${fmtSla(j.roomSla)} · then catering ${fmtSla(j.cSla)} / AV ${fmtSla(j.sSla)} in parallel)</span>`;
  return `<div class="journey">${rows}</div><div class="jtotal">⏱ ${eta}</div>`;
}

/* ============================================================ ROOM RANKING ============================================================ */
function rankSpaces(list,req){
  return list.map(sp=>{
    let s=0; const why=[];
    const free=spaceFree(sp.id,req.date,req.start,req.end);
    const ratio=sp.capacity/req.pax;
    if(ratio<1){s-=45;why.push(['neg',`Seats ${sp.capacity} (need ${req.pax})`]);}
    else if(ratio<=1.5){s+=30;why.push(['pos',`Right-sized (${sp.capacity} seats)`]);}
    else if(ratio<=2.2){s+=14;why.push(['pos',`Comfortable for ${req.pax}`]);}
    else {s-=6;why.push(['neg',`Over-sized (${sp.capacity} seats)`]);}
    (req.amenities||[]).forEach(a=>{ if(sp.amenities.includes(a)){s+=8;why.push(['pos',a]);} else {s-=14;why.push(['neg','No '+a]);} });
    if(req.eventType==='Client meeting'||req.eventType==='Board meeting'){ if(sp.amenities.includes('Skyline view')){s+=8;why.push(['pos','Skyline view']);} if(sp.amenities.includes('4K display'))s+=5; }
    s+=(sp.rating-4.3)*12;
    if(!free){const c=conflictsForSpace(sp.id,req.date,req.start,req.end)[0];s-=70;why.push(['neg',`Busy / buffer ${fmtHr(c.start)}–${fmtHr(c.end)}`]);}
    return {sp,why,free,score:Math.max(8,Math.min(98,Math.round(52+s*0.62)))};
  }).sort((a,b)=>b.score-a.score);
}

/* ============================================================ WIZARD ============================================================ */
let wz=null;
function freshWizard(){
  const fav=DATA.user.favoriteBuildingId;
  return { step:0, buildingId:fav||null, date:TODAY, start:14, end:16, pax:12,
    setup:DATA.setupTypes[1], eventType:DATA.eventTypes[1], wantExtras:false,
    spaceId:null, services:new Set(), catering:[], name:'', buildingQuery:'' };
}
function seq(){ return ['details', ...(wz.buildingId?['rooms']:[]), ...(wz.wantExtras?['services','catering']:[]), 'review']; }
function gotoStep(name){ const s=seq(); wz.step=Math.max(0,s.indexOf(name)); renderWizard(); }
function stepNext(){ const s=seq(); if(wz.step<s.length-1){wz.step++;renderWizard();} }
function stepBack(){ if(wz.step>0){wz.step--;renderWizard();} }

function renderWizard(){
  const s=seq(); const cur=s[Math.min(wz.step,s.length-1)];
  const titles={details:'1 · Details',rooms:'2 · Choose a room',services:'Services',catering:'Catering',review:'Review & confirm'};
  $('#wz-steps').innerHTML=s.map((k,i)=>`<div class="wz-pip ${i===wz.step?'on':''} ${i<wz.step?'done':''}"><span class="n">${i<wz.step?'✓':i+1}</span>${titles[k].replace(/^\d+ · /,'')}</div>`).join('<span class="wz-arrow">›</span>');
  ({details:stepDetails,rooms:stepRooms,services:stepServices,catering:stepCatering,review:stepReview})[cur]();
}

/* --- step 1: details / selection screen --- */
function stepDetails(){
  const b=wz.buildingId?building(wz.buildingId):null;
  const q=wz.buildingQuery.toLowerCase();
  const matches=q?DATA.buildings.filter(x=>x.label.toLowerCase().includes(q)).slice(0,8):[];
  const fav=DATA.user.favoriteBuildingId;
  $('#wz-body').innerHTML=`<div class="cards" style="grid-template-columns:1fr 320px;gap:18px;align-items:start">
    <div class="card">
      <div class="fg"><label>Building <span class="muted">(defaults to your favourite ★ — leave blank to request a room)</span></label>
        <div style="position:relative">
          <input id="wz-bq" placeholder="Search 120 buildings by name or city…" value="${b?b.label.replace(/"/g,'&quot;'):wz.buildingQuery.replace(/"/g,'&quot;')}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff">
          ${matches.length?`<div class="dropdown">${matches.map(x=>`<div class="dd" data-pickb="${x.id}"><b>${x.name}</b><span>${x.city} · ${x.region} · ${x.externalId}${x.id===fav?' · ★ favourite':''}</span></div>`).join('')}</div>`:''}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          ${b?`<button class="btn sm ${fav===b.id?'':'ghost'}" id="wz-fav">${fav===b.id?'★ Favourite building':'☆ Set as favourite'}</button>`:''}
          ${b?`<button class="btn sm ghost" id="wz-clearb">✕ Clear (request instead)</button>`:''}
          ${!b&&fav?`<button class="btn sm ghost" id="wz-usefav">★ Use my favourite (${building(fav).name})</button>`:''}
        </div>
      </div>
      <div class="row2">
        <div class="fg"><label>Attendees</label><input id="wz-pax" type="number" min="1" value="${wz.pax}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff"></div>
        <div class="fg"><label>Date</label><input id="wz-date" type="date" value="${wz.date}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff"></div>
      </div>
      <div class="row2">
        <div class="fg"><label>Start</label><input id="wz-start" type="time" value="${fmtHr(wz.start)}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff"></div>
        <div class="fg"><label>End</label><input id="wz-end" type="time" value="${fmtHr(wz.end)}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff"></div>
      </div>
      <div class="row2">
        <div class="fg"><label>Setup type (layout)</label><select id="wz-setup" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff">${DATA.setupTypes.map(x=>`<option ${x===wz.setup?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="fg"><label>Event type</label><select id="wz-event" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff">${DATA.eventTypes.map(x=>`<option ${x===wz.eventType?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>
      <label class="check"><input type="checkbox" id="wz-extras" ${wz.wantExtras?'checked':''}> I need <b>services &amp; catering</b> for this booking</label>
    </div>
    <div class="card" style="border-left:3px solid var(--brand)">
      <div style="font-size:12px;color:var(--mut);font-weight:650">Your centre (auto-filled)</div>
      <div style="font-size:17px;font-weight:750;margin:6px 0 2px">${DATA.user.center}</div>
      <div class="muted" style="font-size:11.5px">From your profile in the space management system.</div>
      <hr style="border:none;border-top:1px solid var(--line);margin:14px 0">
      ${b?`<div style="font-size:12.5px"><b>${b.name}</b><div class="muted">${b.city} · ${b.region}</div><div class="muted" style="margin-top:4px">${b.floors.length} floors · ${DATA.spaces.filter(s=>s.buildingId===b.id).length} spaces · catering: ${DATA.cateringTemplates[b.cateringTemplate].name}</div></div>
        <div class="ai-banner" style="margin-top:12px"><div class="dot">🏢</div><div><b>Building selected</b><p>Next step lists all rooms in ${b.name}.</p></div></div>`
      :`<div class="ai-banner" style="margin:0"><div class="dot">📥</div><div><b>No building chosen</b><p>You’ll submit a <b>Request a Room</b> and a planner allocates one in your centre.</p></div></div>`}
    </div>
  </div>
  <div class="wz-nav"><span></span><button class="btn primary" id="wz-next">${wz.buildingId?'Find rooms →':'Request a room →'}</button></div>`;
}

/* --- step 2: rooms in the building --- */
function stepRooms(){
  const b=building(wz.buildingId);
  const list=DATA.spaces.filter(s=>s.buildingId===wz.buildingId);
  const ranked=rankSpaces(list,{date:wz.date,start:wz.start,end:wz.end,pax:wz.pax,amenities:[],eventType:wz.eventType});
  const free=ranked.filter(r=>r.free).length;
  $('#wz-body').innerHTML=`<div class="ai-banner"><div class="dot">🧠</div><div><b>${b.name} — ${list.length} rooms</b><p>${free} free for ${fmtHr(wz.start)}–${fmtHr(wz.end)} (incl. setup/teardown buffer). Ranked for ${wz.pax} pax · ${wz.eventType}.</p></div></div>
    <div class="cards rooms">${ranked.map(r=>spaceCard(r.sp,{score:r.score,free:r.free,why:r.why,sel:wz.spaceId===r.sp.id})).join('')}</div>
    <div class="wz-nav"><button class="btn ghost" id="wz-back">← Back</button><button class="btn primary" id="wz-next" ${wz.spaceId?'':'style="opacity:.5;pointer-events:none"'}>${wz.wantExtras?'Next: services →':'Review →'}</button></div>`;
}
function spaceCard(sp,o={}){
  const busy=o.free===false;
  const tags=sp.amenities.slice(0,4).map(a=>`<span class="chip ${a==='Catering-ready'?'g':/view|4K/i.test(a)?'b':''}">${a}</span>`).join('');
  const buf=(sp.setupMins||sp.teardownMins)?`<span class="chip">⏱ setup ${sp.setupMins}m / teardown ${sp.teardownMins}m</span>`:'<span class="chip">⏱ no buffer</span>';
  return `<div class="card room ${busy?'busy':''} ${o.sel?'picked':''}" data-pickspace="${sp.id}">
    <div class="ph"><span class="ph-mono">${sp.type.charAt(0)}</span><span class="ph-t">${sp.type}</span>
      ${o.score!=null?`<span class="score">${o.score}% fit</span>`:''}</div>
    <div class="bd"><h3>${sp.name} <span class="muted" style="font-size:12px;font-weight:600">${money(sp.rate)}/hr</span></h3>
      <div class="meta">Floor ${sp.floor} · 👥 ${sp.capacity} · ⭐ ${sp.rating} · ${sp.externalId} · <span class="avail-inline ${busy?'no':'ok'}">${busy?'Busy':'Available'}</span></div>
      <div class="chips">${tags}${buf}</div>
      ${o.why?`<div class="why"><b>Why:</b> ${o.why.filter(w=>w[0]==='pos').slice(0,3).map(w=>w[1]).join(' · ')||'—'}</div>`:''}
    </div></div>`;
}

/* --- step 3: services --- */
function stepServices(){
  $('#wz-body').innerHTML=`<div class="card"><div class="section-h"><h2 style="font-size:15px">🛎️ Services</h2><span class="muted" style="font-size:12px">Optional add-ons</span></div>
    ${DATA.services.map(s=>{const on=wz.services.has(s.id);return `<div class="opt"><div><div class="nm">${s.icon} ${s.name}</div><div class="sub">${money(s.price)} · confirms in ${fmtSla(s.confirmSla)}</div></div><button class="add ${on?'on':''}" data-svc="${s.id}">${on?'✓':'+'}</button></div>`;}).join('')}</div>
    <div class="wz-nav"><button class="btn ghost" id="wz-back">← Back</button><button class="btn primary" id="wz-next">Next: catering →</button></div>`;
}

/* --- step 4: catering (per-building, multi-choice, cutoff) --- */
function stepCatering(){
  const bId=wz.buildingId; const menu=menuFor(bId);
  const note=bId?`Menu for <b>${building(bId).name}</b> (${DATA.cateringTemplates[building(bId).cateringTemplate].name}).`:`Standard menu shown — final menu is set once a building is allocated.`;
  $('#wz-body').innerHTML=`<div class="card"><div class="section-h"><h2 style="font-size:15px">🍽️ Catering</h2><span class="muted" style="font-size:12px">${note}</span></div>
    ${menu.map(it=>cateringItemHTML(it,bId)).join('')}</div>
    <div class="wz-nav"><button class="btn ghost" id="wz-back">← Back</button><button class="btn primary" id="wz-next">Review →</button></div>`;
}
function chosen(itemId){ return wz.catering.find(c=>c.itemId===itemId); }
function cateringItemHTML(it,bId){
  const sel=chosen(it.id); const past=pastCutoff(it,wz.date,wz.start);
  const multi=it.choiceGroups&&it.choiceGroups.length;
  const head=`<div class="ci-head"><div><div class="nm">${it.name} <span class="cat-type ${it.type}">${it.type}</span></div>
      <div class="sub">${money(it.pricePerHead)}/head · order cutoff <b>${fmtCut(it.cutoffHours)}</b> ${past?'<span style="color:var(--bad)">· ⛔ past cutoff for this time</span>':'<span style="color:var(--ok)">· ✓ in time</span>'}</div></div>
    <button class="add ${sel?'on':''}" data-cat="${it.id}" ${past?'disabled style="opacity:.4"':''}>${sel?'✓':'+'}</button></div>`;
  let groups='';
  if(multi && sel){
    groups=`<div class="ci-groups">${it.choiceGroups.map(g=>{
      const picks=(sel.choices[g.id]||[]);
      return `<div class="cg"><div class="cg-h">${g.label} <span class="muted">— pick ${g.pick} (${picks.length}/${g.pick})</span></div>
        <div class="cg-opts">${g.options.map(o=>{const on=picks.includes(o.name);return `<button class="opt-chip ${on?'on':''}" data-opt="${it.id}|${g.id}|${encodeURIComponent(o.name)}">${o.name}${o.veg?' 🌱':''}</button>`;}).join('')}</div></div>`;
    }).join('')}</div>`;
  }
  return `<div class="ci ${past?'past':''} ${sel?'sel':''}">${head}${groups}</div>`;
}

/* --- step 5: review --- */
function stepReview(){
  const b=wz.buildingId?building(wz.buildingId):null;
  const sp=wz.spaceId?space(wz.spaceId):null;
  const isReq=!wz.buildingId;
  const j=journeyFor({kind:isReq?'request':'booking',buildingId:wz.buildingId,spaceId:wz.spaceId,catering:wz.catering,services:[...wz.services],status:isReq?'pending':'confirmed'});
  const t=totals();
  const cateLines=wz.catering.map(c=>{const it=catItem(wz.buildingId,c.itemId);const ch=Object.values(c.choices||{}).flat();return `<div class="kv"><span>🍽️ ${it.name}${ch.length?` <span class="muted">(${ch.join(', ')})</span>`:''}</span><b>${money(it.pricePerHead*wz.pax)}</b></div>`;}).join('')||'<div class="muted" style="font-size:12.5px;padding:6px 0">No catering</div>';
  const svcLines=[...wz.services].map(id=>`<div class="kv"><span>${svc(id).icon} ${svc(id).name}</span><b>${money(svc(id).price)}</b></div>`).join('')||'<div class="muted" style="font-size:12.5px;padding:6px 0">No services</div>';
  $('#wz-body').innerHTML=`<div class="cards" style="grid-template-columns:1fr 360px;gap:18px;align-items:start">
    <div class="card">
      <div class="fg"><label>Meeting / client name</label><input id="wz-name" value="${(wz.name||'').replace(/"/g,'&quot;')}" placeholder="e.g. Acme — Contract signing" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px;color:#fff"></div>
      <div class="kv"><span>${isReq?'Request in':'Room'}</span><b>${sp?`${sp.name} · ${sp.type} · Fl ${sp.floor}`:(b?b.name:`${DATA.user.center} (planner allocates)`)}</b></div>
      ${sp?`<div class="kv"><span>Setup / teardown</span><b>${sp.setupMins}m / ${sp.teardownMins}m</b></div><div class="kv"><span>Room held</span><b>${fmtHr(wz.start-sp.setupMins/60)}–${fmtHr(wz.end+sp.teardownMins/60)}</b></div>`:''}
      <div class="kv"><span>When</span><b>${wz.date} · ${fmtHr(wz.start)}–${fmtHr(wz.end)}</b></div>
      <div class="kv"><span>Attendees · setup · event</span><b>👥 ${wz.pax} · ${wz.setup} · ${wz.eventType}</b></div>
      <div class="section-h"><h2 style="font-size:14px">🍽️ Catering</h2></div>${cateLines}
      <div class="section-h"><h2 style="font-size:14px">🛎️ Services</h2></div>${svcLines}
      <div class="section-h"><h2 style="font-size:14px">🧭 Booking journey</h2></div>${journeyHTML(j)}
    </div>
    <div class="card" style="position:sticky;top:20px">
      <div class="muted" style="font-size:11px">${sp?'Estimated total':'Catering + services'}</div>
      <div class="total" style="margin:4px 0 14px">${money(t.total)}</div>
      <div class="kv"><span>Room ${sp?`· ${(wz.end-wz.start)}h`:''}</span><b>${sp?money(sp.rate*(wz.end-wz.start)):'at allocation'}</b></div>
      <div class="kv"><span>Catering · ${wz.pax} pax</span><b>${money(t.cat)}</b></div>
      <div class="kv"><span>Services</span><b>${money(t.svc)}</b></div>
      <div class="jmini" style="margin-top:14px">⏱ ${isReq?'Est. room confirmation '+fmtSla(j.roomSla):'Room confirmed instantly'} · fully confirmed <b>${fmtSla(j.total)}</b></div>
      <button class="btn primary" id="wz-confirm" style="width:100%;margin-top:14px">${isReq?'Submit request 📥':'Confirm booking ✓'}</button>
      <button class="btn ghost sm" id="wz-back" style="width:100%;margin-top:8px">← Back</button>
    </div>
  </div>`;
}
function totals(){
  const sp=wz.spaceId?space(wz.spaceId):null;
  const cat=wz.catering.reduce((s,c)=>s+catItem(wz.buildingId,c.itemId).pricePerHead*wz.pax,0);
  const svcC=[...wz.services].reduce((s,id)=>s+svc(id).price,0);
  return {room:sp?sp.rate*(wz.end-wz.start):0,cat,svc:svcC,total:(sp?sp.rate*(wz.end-wz.start):0)+cat+svcC};
}

/* wizard interactions */
$('#wz-body').addEventListener('input',e=>{
  const id=e.target.id;
  if(id==='wz-bq'){ wz.buildingQuery=e.target.value; wz.buildingId=null; renderDetailsDropdown(); return; }
  if(id==='wz-pax') wz.pax=+e.target.value||1;
  else if(id==='wz-date') wz.date=e.target.value;
  else if(id==='wz-start') wz.start=t2d(e.target.value);
  else if(id==='wz-end') wz.end=t2d(e.target.value);
  else if(id==='wz-setup') wz.setup=e.target.value;
  else if(id==='wz-event') wz.eventType=e.target.value;
  else if(id==='wz-name'){ wz.name=e.target.value; return; }
});
function renderDetailsDropdown(){ // light refresh of just the dropdown on each keystroke
  if(seq()[wz.step]==='details') stepDetails(), $('#wz-bq')?.focus();
}
$('#wz-body').addEventListener('change',e=>{ if(e.target.id==='wz-extras'){ wz.wantExtras=e.target.checked; } });
$('#wz-body').addEventListener('click',e=>{
  const pb=e.target.closest('[data-pickb]'); if(pb){ wz.buildingId=pb.dataset.pickb; wz.buildingQuery=''; stepDetails(); return; }
  if(e.target.closest('#wz-fav')){ DATA.user.favoriteBuildingId=DATA.user.favoriteBuildingId===wz.buildingId?null:wz.buildingId; save(); stepDetails(); toast(DATA.user.favoriteBuildingId?'Favourite building set ★':'Favourite cleared'); return; }
  if(e.target.closest('#wz-clearb')){ wz.buildingId=null; wz.spaceId=null; stepDetails(); return; }
  if(e.target.closest('#wz-usefav')){ wz.buildingId=DATA.user.favoriteBuildingId; stepDetails(); return; }
  const ps=e.target.closest('[data-pickspace]'); if(ps){ wz.spaceId=ps.dataset.pickspace; stepRooms(); return; }
  const sv=e.target.closest('[data-svc]'); if(sv){ const id=sv.dataset.svc; wz.services.has(id)?wz.services.delete(id):wz.services.add(id); stepServices(); return; }
  const ct=e.target.closest('[data-cat]'); if(ct&&!ct.disabled){ toggleCatering(ct.dataset.cat); return; }
  const op=e.target.closest('[data-opt]'); if(op){ const [itemId,gid,enc]=op.dataset.opt.split('|'); toggleOption(itemId,gid,decodeURIComponent(enc)); return; }
  if(e.target.closest('#wz-next')){ if(!validateStep())return; stepNext(); return; }
  if(e.target.closest('#wz-back')){ stepBack(); return; }
  if(e.target.closest('#wz-confirm')){ confirmWizard(); return; }
});
function validateStep(){
  const cur=seq()[wz.step];
  if(cur==='details'){ wz.pax=+($('#wz-pax')?.value||wz.pax); if(wz.end<=wz.start){toast('End time must be after start',false);return false;} }
  return true;
}
function toggleCatering(itemId){
  const it=catItem(wz.buildingId,itemId); const i=wz.catering.findIndex(c=>c.itemId===itemId);
  if(i>=0) wz.catering.splice(i,1);
  else { if(pastCutoff(it,wz.date,wz.start)){toast('Past the order cutoff for this time',false);return;} wz.catering.push({itemId,choices:{}}); }
  stepCatering();
}
function toggleOption(itemId,gid,name){
  const c=chosen(itemId); if(!c)return; const it=catItem(wz.buildingId,itemId); const g=it.choiceGroups.find(x=>x.id===gid);
  const arr=c.choices[gid]||(c.choices[gid]=[]); const idx=arr.indexOf(name);
  if(idx>=0) arr.splice(idx,1);
  else { if(arr.length>=g.pick){ arr.shift(); } arr.push(name); }
  stepCatering();
}
function confirmWizard(){
  wz.name=($('#wz-name')?.value||wz.name||'Untitled meeting').trim();
  // validate multi-choice completeness
  for(const c of wz.catering){ const it=catItem(wz.buildingId,c.itemId); for(const g of (it.choiceGroups||[])){ if((c.choices[g.id]||[]).length!==g.pick){ toast(`Complete “${g.label}” for ${it.name} (pick ${g.pick})`,false); gotoStep('catering'); return; } } }
  if(wz.buildingId){
    if(!spaceFree(wz.spaceId,wz.date,wz.start,wz.end)){ toast('That room is no longer free',false); gotoStep('rooms'); return; }
    DATA.bookings.push({ id:'b'+Date.now(), spaceId:wz.spaceId, title:wz.name.slice(0,28),
      client:wz.eventType==='Internal meeting'?'Internal':wz.name.split('—')[0].trim(), start:wz.start, end:wz.end, pax:wz.pax,
      status:'new', catering:wz.catering, services:[...wz.services], date:wz.date, planner:'p1', setup:wz.setup, eventType:wz.eventType });
    save(); toast(`${space(wz.spaceId).name} booked ${fmtHr(wz.start)}–${fmtHr(wz.end)}`);
    if(currentRole==='planner') renderPlanner();
    wz=freshWizard(); renderWizard(); go(currentRole==='planner'?'planner':'book');
  } else {
    DATA.requests.push({ id:'rq'+Date.now(), requester:me().name, meeting:wz.name, eventType:wz.eventType, pax:wz.pax,
      date:wz.date, start:wz.start, end:wz.end, buildingId:null, region:DATA.user.homeRegion, preferredSpaceId:null,
      setup:wz.setup, amenities:[], catering:wz.catering, services:[...wz.services], notes:'Submitted via Book a Space — no building chosen.', status:'pending', allocatedSpaceId:null });
    save(); toast('Request submitted — a planner will allocate a room'); renderRequests(); renderReqCount();
    wz=freshWizard(); go('requests');
  }
}

/* ============================================================ REQUESTS + ALLOCATION ============================================================ */
let allocSel={};
function reqCandidates(req){
  const pool = req.buildingId ? DATA.spaces.filter(s=>s.buildingId===req.buildingId)
             : DATA.spaces.filter(s=>s.region===req.region);
  return rankSpaces(pool,{date:req.date,start:req.start,end:req.end,pax:req.pax,amenities:req.amenities||[],eventType:req.eventType})
         .filter(o=>o.sp.capacity>=req.pax-2).slice(0,9);
}
function renderRequests(){
  const planning=currentRole==='planner';
  $('#req-title').textContent=planning?'📥 Room Requests':'📥 My Requests';
  $('#req-sub').textContent=planning?'Employee requests awaiting allocation. Allocate a room — preferred rooms honoured where free.':'Rooms you’ve requested and their status.';
  const list=planning?DATA.requests.filter(r=>r.status==='pending').concat(DATA.requests.filter(r=>r.status!=='pending')):DATA.requests.filter(r=>r.requester===me().name);
  const pend=DATA.requests.filter(r=>r.status==='pending').length, alloc=DATA.requests.filter(r=>r.status==='allocated').length;
  $('#requests-stats').innerHTML=[['Pending',pend,planning?'need a room':'awaiting planner'],['Allocated',alloc,'confirmed'],['Buildings',DATA.buildings.length,'in estate'],['Total requests',DATA.requests.length,'']].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
  if(!list.length){ $('#requests-list').innerHTML=`<div class="empty">${planning?'No requests right now.':'No requests yet — try Book a Space without choosing a building.'}</div>`; return; }
  $('#requests-list').innerHTML=list.map(req=>{
    const where=req.buildingId?building(req.buildingId).name:`${req.region} (no building — allocate)`;
    const allocSp=req.allocatedSpaceId?space(req.allocatedSpaceId):null;
    const statusLine=req.status==='allocated'?`<span class="status allocated">Allocated · ${allocSp.name}</span>`:req.status==='rejected'?`<span class="status rejected">Rejected</span>`:`<span class="status pending">Pending</span>`;
    const j=journeyFor({kind:'request',buildingId:req.buildingId,catering:req.catering,services:req.services,status:req.status,allocatedSpaceId:req.allocatedSpaceId});
    const meta=[`<span>🗂️ <b>${req.eventType}</b></span>`,`<span>🏢 <b>${where}</b></span>`,`<span>🕑 <b>${fmtHr(req.start)}–${fmtHr(req.end)}</b></span>`,`<span>👥 <b>${req.pax}</b></span>`,`<span>🧩 ${req.setup}</span>`,req.catering.length?`<span>🍽️ ${req.catering.map(c=>catItem(req.buildingId,c.itemId)?.name||'item').join(', ')}</span>`:'',req.services.length?`<span>🎛️ ${req.services.map(id=>svc(id).name).join(', ')}</span>`:''].filter(Boolean).join('');
    const sla=`<div class="slastrip"><span>🏢 Room <b>${fmtSla(j.roomSla)}</b></span><span>🍽️ Catering <b>${req.catering.length?fmtSla(j.cSla):'—'}</b></span><span>🎛️ AV <b>${req.services.length?fmtSla(j.sSla):'—'}</b></span><span class="tot">⏱ Confirmed <b>${j.done?'done':fmtSla(j.total)}</b></span></div>`;
    let panel='';
    if(planning&&req.status==='pending'&&req._open){
      const cands=reqCandidates(req); const chosen=allocSel[req.id]||cands.find(o=>o.free&&o.sp.capacity>=req.pax)?.sp.id;
      panel=`<div class="alloc"><div style="font-size:12.5px;color:var(--mut);font-weight:650">Allocate a room ${req.buildingId?`in ${where}`:`in ${req.region}`} — AI-ranked, free rooms selectable</div>
        <div class="opts">${cands.map(o=>{const r=o.sp,sel=chosen===r.id;return `<div class="ar ${sel?'sel':''} ${o.free?'':'busy'}" data-alloc-room="${req.id}|${r.id}"><b>${r.name}</b><div class="m">${r.buildingName} · Fl ${r.floor} · 👥${r.capacity} · ${money(r.rate)}/hr</div><div class="fit ${o.free&&r.capacity>=req.pax?'ok':'no'}">${!o.free?'● Busy':r.capacity<req.pax?`● Too small (${r.capacity})`:`● Free · ${o.score}% fit`}</div></div>`;}).join('')}</div>
        <div style="display:flex;gap:10px"><button class="btn primary sm" data-confirm-alloc="${req.id}">✓ Confirm allocation</button><button class="btn ghost sm" data-reject="${req.id}">Reject</button></div></div>`;
    }
    const actions=(planning&&req.status==='pending')?`<button class="btn sm primary" data-allocate="${req.id}">${req._open?'Close':'Allocate room'}</button>`:'';
    return `<div class="req"><div class="rh"><div><h3>${req.meeting}</h3><div class="who">Requested by ${req.requester} · ${req.date}</div></div><div style="display:flex;gap:10px;align-items:center">${actions}${statusLine}</div></div><div class="grid">${meta}</div>${req.notes?`<div class="note">“${req.notes}”</div>`:''}${sla}${panel}</div>`;
  }).join('');
}
function allocate(reqId){
  const req=DATA.requests.find(r=>r.id===reqId);
  const sid=allocSel[reqId]||reqCandidates(req).find(o=>o.free&&o.sp.capacity>=req.pax)?.sp.id;
  if(!sid){toast('Pick a free room',false);return;}
  if(!spaceFree(sid,req.date,req.start,req.end)){toast('Room no longer free',false);return;}
  DATA.bookings.push({ id:'b'+Date.now(), spaceId:sid, title:req.meeting.slice(0,28), client:req.eventType==='Internal meeting'?'Internal':req.meeting.split('—')[0].trim(), start:req.start, end:req.end, pax:req.pax, status:'new', catering:req.catering, services:req.services, date:req.date, planner:'p1', setup:req.setup, eventType:req.eventType });
  req.status='allocated'; req.allocatedSpaceId=sid; req._open=false; delete allocSel[reqId];
  save(); renderRequests(); renderReqCount(); renderPlanner(); renderDashboard();
  toast(`Allocated ${space(sid).name} (${space(sid).buildingName}) to ${req.requester}`);
}

/* ============================================================ PLANNER BOARD (building-scoped) ============================================================ */
const H0=8,H1=20;
function buildingOptions(sel){ return DATA.buildings.slice(0,40).map(b=>`<option value="${b.id}" ${b.id===sel?'selected':''}>${b.name} · ${b.city}</option>`).join(''); }
function plBuilding(){ return $('#pl-building').value || (DATA.user.favoriteBuildingId||'bld-001'); }
function renderPlanner(){
  const sel=$('#pl-building'); if(!sel.options.length){ sel.innerHTML=buildingOptions(DATA.user.favoriteBuildingId||'bld-001'); }
  const bId=plBuilding(); const b=building(bId); $('#pl-name').textContent=`${b.name} · ${b.city}`;
  const spaces=DATA.spaces.filter(s=>s.buildingId===bId);
  const hours=[];for(let h=H0;h<=H1;h++)hours.push(`<div>${String(h).padStart(2,'0')}:00</div>`); $('#tl-hours').innerHTML=hours.join('');
  const span=H1-H0;
  $('#tl-body').innerHTML=spaces.map(sp=>{
    const blocks=DATA.bookings.filter(b=>b.spaceId===sp.id).map(b=>{
      const left=((b.start-H0)/span)*100,width=((b.end-b.start)/span)*100;
      const su=(sp.setupMins/60/span)*100, td=(sp.teardownMins/60/span)*100;
      const setupBand=sp.setupMins?`<div class="buf" style="left:${left-su}%;width:${su}%"></div>`:'';
      const tdBand=sp.teardownMins?`<div class="buf" style="left:${left+width}%;width:${td}%"></div>`:'';
      return `${setupBand}${tdBand}<div class="bk ${b.status}" data-detail="${b.id}" style="left:${left}%;width:${width}%">${b.title}<small>${fmtHr(b.start)}–${fmtHr(b.end)} · ${b.client}</small></div>`;
    }).join('');
    return `<div class="tl-row"><div class="tl-room"><b>${sp.name}</b><span>${sp.type} · Fl ${sp.floor} · 👥${sp.capacity} · ⏱${sp.setupMins}/${sp.teardownMins}m</span></div><div class="tl-track">${blocks}</div></div>`;
  }).join('')||'<div class="empty">No spaces.</div>';
  const bk=DATA.bookings.filter(b=>spaces.some(s=>s.id===b.spaceId));
  const rev=bk.reduce((s,b)=>{const sp=space(b.spaceId);return s+sp.rate*(b.end-b.start)+b.services.reduce((x,id)=>x+svc(id).price,0)+b.catering.reduce((x,c)=>x+(catItem(b? bId:bId,c.itemId)?.pricePerHead||0)*b.pax,0);},0);
  $('#planner-stats').innerHTML=[['Spaces',spaces.length,'in building'],['Bookings',bk.length,'today'],['Booked hours',Math.round(bk.reduce((s,b)=>s+(b.end-b.start),0))+'h',''],['Booked value',money(rev),'incl. extras']].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
}
$('#pl-building').addEventListener('change',renderPlanner);

/* booking detail */
const drawer=$('#drawer'),scrim=$('#scrim');
$('#drawer-x').onclick=()=>{drawer.classList.remove('on');scrim.classList.remove('on');}; scrim.onclick=$('#drawer-x').onclick;
function openBookingDetail(b){
  const sp=space(b.spaceId);
  const cRows=b.catering.length?b.catering.map(c=>{const it=catItem(sp.buildingId,c.itemId);const ch=Object.values(c.choices||{}).flat();return `<div class="kv"><span>🍽️ ${it?.name||'item'}${ch.length?` <span class="muted">(${ch.join(', ')})</span>`:''}</span><b>${money((it?.pricePerHead||0)*b.pax)}</b></div>`;}).join(''):'<div class="muted" style="font-size:12.5px;padding:8px 0">No catering</div>';
  const sRows=b.services.length?b.services.map(id=>`<div class="kv"><span>${svc(id).icon} ${svc(id).name}</span><b>${money(svc(id).price)}</b></div>`).join(''):'<div class="muted" style="font-size:12.5px;padding:8px 0">No services</div>';
  $('#drawer-head').innerHTML=`<h2>${b.title}</h2><div class="sub">${sp.name} · ${sp.buildingName} · ${fmtHr(b.start)}–${fmtHr(b.end)} · <span class="tag">${b.status}</span></div>`;
  $('#drawer-body').innerHTML=`<div class="kv"><span>Client / event</span><b>${b.client} · ${b.eventType||'—'}</b></div>
    <div class="kv"><span>Space ID</span><b>${sp.externalId}</b></div>
    <div class="kv"><span>Attendees · setup</span><b>👥 ${b.pax} · ${b.setup||'—'}</b></div>
    <div class="kv"><span>Setup / teardown</span><b>${sp.setupMins}m / ${sp.teardownMins}m</b></div>
    <div class="kv"><span>Room held</span><b>${fmtHr(b.start-sp.setupMins/60)}–${fmtHr(b.end+sp.teardownMins/60)}</b></div>
    <div class="section-h"><h2 style="font-size:14px">🍽️ Catering</h2></div>${cRows}
    <div class="section-h"><h2 style="font-size:14px">🛎️ Services</h2></div>${sRows}
    <div class="section-h"><h2 style="font-size:14px">🧭 Journey</h2></div>${journeyHTML(journeyFor({kind:'booking',buildingId:sp.buildingId,spaceId:b.spaceId,catering:b.catering,services:b.services,status:b.status}))}`;
  $('#drawer-foot').innerHTML='';
  drawer.classList.add('on'); scrim.classList.add('on');
}

/* ============================================================ CATERING SETUP ============================================================ */
function renderCatering(){
  const sel=$('#ct-building'); if(!sel.options.length){ sel.innerHTML=buildingOptions(DATA.user.favoriteBuildingId||'bld-001'); }
  const bId=sel.value||'bld-001'; const menu=menuFor(bId); const b=building(bId);
  $('#catering-list').innerHTML=`<div class="muted" style="font-size:12.5px">${b.name} uses the <b>${DATA.cateringTemplates[b.cateringTemplate].name}</b> template${DATA.cateringOverrides[bId]?' (overridden for this building)':''}. Edit cutoffs, add options, or add items — changes apply to this building only.</div>`+
    menu.map(it=>{
      const groups=(it.choiceGroups||[]).map(g=>`<div class="cg"><div class="cg-h">${g.label} <span class="muted">— pick ${g.pick}</span></div><div class="cg-opts">${g.options.map(o=>`<span class="opt-chip on">${o.name}${o.veg?' 🌱':''}</span>`).join('')}<button class="opt-chip add-opt" data-addopt="${bId}|${it.id}|${g.id}">+ option</button></div></div>`).join('');
      return `<div class="card"><div class="ci-head"><div><div class="nm">${it.name} <span class="cat-type ${it.type}">${it.type}</span></div><div class="sub">${money(it.pricePerHead)}/head</div></div>
        <div style="display:flex;align-items:center;gap:8px"><label class="muted" style="font-size:11.5px">cutoff (h)</label><input type="number" min="0" value="${it.cutoffHours}" data-cutoff="${bId}|${it.id}" style="width:70px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:7px;color:#fff"></div></div>
        ${groups?`<div class="ci-groups" style="margin-top:10px">${groups}</div>`:'<div class="muted" style="font-size:12px;margin-top:8px">Simple item — no choices.</div>'}</div>`;
    }).join('');
}
function ensureOverride(bId){ if(!DATA.cateringOverrides[bId]) DATA.cateringOverrides[bId]=JSON.parse(JSON.stringify(menuFor(bId))); return DATA.cateringOverrides[bId]; }
$('#ct-building').addEventListener('change',renderCatering);
$('#catering-list').addEventListener('input',e=>{ const c=e.target.closest('[data-cutoff]'); if(c){ const [bId,itemId]=c.dataset.cutoff.split('|'); const m=ensureOverride(bId); const it=m.find(x=>x.id===itemId); it.cutoffHours=+c.value||0; save(); } });
$('#catering-list').addEventListener('click',e=>{
  const ao=e.target.closest('[data-addopt]'); if(ao){ const [bId,itemId,gid]=ao.dataset.addopt.split('|'); const name=prompt('New option name:'); if(!name)return; const m=ensureOverride(bId); const g=m.find(x=>x.id===itemId).choiceGroups.find(x=>x.id===gid); g.options.push({name,veg:/veg|salad|fruit/i.test(name)}); save(); renderCatering(); toast('Option added'); }
});
$('#ct-add').onclick=()=>{ const sel=$('#ct-building'); const bId=sel.value||'bld-001'; const name=prompt('Item name (e.g. Premium Buffet):'); if(!name)return; const type=(prompt('Type: buffet / lunch / beverage / snack','buffet')||'buffet').toLowerCase(); const price=+prompt('Price per head ($):','20')||20; const cut=+prompt('Order cutoff (hours before):','24')||24; const m=ensureOverride(bId); const item={id:'cust-'+Date.now(),name,type,pricePerHead:price,cutoffHours:cut,choiceGroups:(type==='buffet'||type==='lunch')?[{id:'g1',label:'Choices',pick:2,options:[{name:'Option A',veg:true},{name:'Option B',veg:false}]}]:[]}; m.push(item); save(); renderCatering(); toast('Catering item added'); };

/* ============================================================ DASHBOARD / RECS ============================================================ */
function renderDashboard(){
  const pend=DATA.requests.filter(r=>r.status==='pending').length;
  $('#dash-line').textContent=`30 June 2026 · ${DATA.buildings.length} buildings · ${DATA.spaces.length} spaces · ${pend} request(s) pending allocation.`;
  $('#dash-stats').innerHTML=[['Buildings',DATA.buildings.length,'in estate'],['Spaces',DATA.spaces.length,'bookable'],['Pending requests',pend,pend?'needs allocation':'all clear'],['Bookings today',DATA.bookings.length,'']].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
  $('#dash-insights').innerHTML=DATA.insights.length?DATA.insights.slice(0,2).map(insightCard).join(''):'<div class="empty">All clear 🎉</div>';
}
function insightCard(i){return `<div class="card ins"><div class="ic">${i.icon}</div><div style="flex:1"><h3>${i.title} <span class="tag">${i.type}</span></h3><p>${i.detail}</p><div class="foot"><span class="impact">▲ ${i.impact}</span><span class="conf">conf <span class="bar"><i style="width:${Math.round(i.confidence*100)}%"></i></span> ${Math.round(i.confidence*100)}%</span></div><div style="margin-top:12px;display:flex;gap:8px"><button class="btn sm primary" data-act="${i.id}">${i.action}</button><button class="btn sm ghost" data-dismiss="${i.id}">Dismiss</button></div></div></div>`;}
function renderRecs(){ $('#recs-list').innerHTML=DATA.insights.length?DATA.insights.map(insightCard).join(''):'<div class="empty">No open suggestions.</div>'; }
$('#recs-refresh').onclick=()=>{renderRecs();toast('Re-scanned');};

/* global clicks (board/requests/insights) */
document.addEventListener('click',e=>{
  const d=e.target.closest('[data-detail]'); if(d){openBookingDetail(DATA.bookings.find(b=>b.id===d.dataset.detail));return;}
  const al=e.target.closest('[data-allocate]'); if(al){const r=DATA.requests.find(x=>x.id===al.dataset.allocate);r._open=!r._open;renderRequests();return;}
  const ar=e.target.closest('[data-alloc-room]'); if(ar){const [rq,rm]=ar.dataset.allocRoom.split('|');allocSel[rq]=rm;renderRequests();return;}
  const ca=e.target.closest('[data-confirm-alloc]'); if(ca){allocate(ca.dataset.confirmAlloc);return;}
  const rj=e.target.closest('[data-reject]'); if(rj){const r=DATA.requests.find(x=>x.id===rj.dataset.reject);r.status='rejected';r._open=false;save();renderRequests();renderDashboard();toast('Request rejected');return;}
  const act=e.target.closest('[data-act]'); if(act){const i=DATA.insights.find(x=>x.id===act.dataset.act);if(i.type==='request'){go('requests');return;}toast(`“${i.action}” applied`);act.textContent='✓ Done';act.classList.remove('primary');return;}
  const dis=e.target.closest('[data-dismiss]'); if(dis){DATA.insights=DATA.insights.filter(x=>x.id!==dis.dataset.dismiss);save();renderRecs();renderDashboard();toast('Dismissed');return;}
  if(e.target.closest('#reset-demo'))resetDemo();
});

/* init */
load();
applyTheme((()=>{try{return localStorage.getItem(THEME_KEY)||'corporate';}catch(e){return 'corporate';}})());
wz=freshWizard();
applyRole();
renderWizard(); renderRequests(); renderReqCount();
renderDashboard(); renderPlanner(); renderCatering(); renderRecs();
go('book');
