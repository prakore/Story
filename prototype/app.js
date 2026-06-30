/* ============================================================
   Convene — clickable prototype engine (vanilla JS)
   ============================================================ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const money = n => '$' + Math.round(n).toLocaleString();
const cat = id => DATA.catering.find(c => c.id === id);
const svc = id => DATA.services.find(s => s.id === id);
const room = id => DATA.rooms.find(r => r.id === id);
const planner = id => DATA.planners.find(p => p.id === id);
const centerById = id => DATA.centers.find(c => c.id === id);
const centerOf = r => centerById(r.centerId);
const policyOf = r => centerOf(r).policy;
const fmtHr = h => { const hh=Math.floor(h), mm=Math.round((h%1)*60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };
const t2d = t => { const [h,m]=String(t).split(':').map(Number); return h+(m||0)/60; };
const TODAY = '2026-06-30';
const POLICY_LABEL = { self:'Instant book', request_pref:'Request · pick room', allocate:'Planner-allocated' };

/* ---------- Roles ---------- */
const PERSONAS = {
  planner:  { name:'Ava Mendel',  role:'Workplace Lead',   avatar:'AM' },
  employee: { name:'Jordan Lee',  role:'Employee · Sales', avatar:'JL' },
};
let currentRole = 'planner';
const me = () => PERSONAS[currentRole];

/* ---------- Persistence ---------- */
const STORE = 'convene.v2';
function save(){ try{ localStorage.setItem(STORE, JSON.stringify({ bookings:DATA.bookings, requests:DATA.requests, insights:DATA.insights })); }catch(e){} }
function load(){ try{ const s=JSON.parse(localStorage.getItem(STORE)||'null'); if(s&&s.bookings){ DATA.bookings=s.bookings; DATA.requests=s.requests||DATA.requests; DATA.insights=s.insights||DATA.insights; } }catch(e){} }
function resetDemo(){ localStorage.removeItem(STORE); location.reload(); }

/* ---------- Availability ---------- */
const overlaps = (s1,e1,s2,e2) => s1<e2 && s2<e1;
function conflictsFor(roomId,date,start,end,ignoreId){ return DATA.bookings.filter(b=>b.roomId===roomId && (b.date||TODAY)===date && b.id!==ignoreId && overlaps(b.start,b.end,start,end)); }
const isFree = (roomId,date,start,end,ignoreId) => conflictsFor(roomId,date,start,end,ignoreId).length===0;

/* ---------- Navigation ---------- */
function go(screen){
  $$('.screen').forEach(s=>s.classList.remove('on'));
  $('#screen-'+screen).classList.add('on');
  $$('#nav button').forEach(b=>b.classList.toggle('on', b.dataset.screen===screen));
  window.scrollTo({top:0,behavior:'smooth'});
}
$('#nav').addEventListener('click', e=>{ const b=e.target.closest('button'); if(b&&b.dataset.screen) go(b.dataset.screen); });
document.addEventListener('click', e=>{ const g=e.target.closest('[data-goto]'); if(g) go(g.dataset.goto); });

/* ---------- Role switch ---------- */
function applyRole(){
  const p = me();
  $('#me-av').textContent = p.avatar; $('#me-name').textContent = p.name; $('#me-role').textContent = p.role;
  $$('#nav button[data-roles]').forEach(b => b.style.display = b.dataset.roles.includes(currentRole) ? '' : 'none');
  $('#lbl-requests').textContent = currentRole==='planner' ? 'Requests' : 'My Requests';
  $('#lbl-finder').textContent = currentRole==='planner' ? 'AI Room Finder' : 'Find / Request a room';
  $('#req-new-btn').style.display = currentRole==='employee' ? '' : 'none';
  // guard current screen
  const cur = $('.screen.on')?.id.replace('screen-','');
  const allowed = currentRole==='planner' ? ['dashboard','finder','rooms','planner','requests','recs'] : ['finder','rooms','requests'];
  if(!allowed.includes(cur)) go(currentRole==='planner'?'dashboard':'finder');
  renderRequests(); renderRooms(); renderReqCount();
}
function renderReqCount(){
  const pend = DATA.requests.filter(r=>r.status==='pending').length;
  const el = $('#req-count'); el.textContent = (currentRole==='planner' && pend) ? pend : ''; el.style.display = el.textContent?'':'none';
  $('#dash-pending').textContent = pend;
}
$('#role-switch').onclick = () => { currentRole = currentRole==='planner'?'employee':'planner'; applyRole(); toast(`Now viewing as ${me().name} (${currentRole})`); };

/* ---------- Toast ---------- */
let toastT;
function toast(msg, ok=true){ const t=$('#toast'); t.className='toast on'+(ok?'':' bad'); t.innerHTML=(ok?'✓ ':'✕ ')+msg; clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'),3000); }

/* ============================================================
   AI ROOM RECOMMENDER — explainable, time-aware, audience-aware
   ============================================================ */
function recommend(req){
  const scored = DATA.rooms.map(r=>{
    let s=0; const why=[];
    const conflicts = conflictsFor(r.id, req.date, req.start, req.end);
    const free = conflicts.length===0;

    const ratio = r.capacity/req.pax;
    if(ratio<1){ s-=45; why.push(['neg',`Only seats ${r.capacity} (need ${req.pax})`]); }
    else if(ratio<=1.5){ s+=30; why.push(['pos',`Right-sized for ${req.pax} (${r.capacity} seats)`]); }
    else if(ratio<=2.2){ s+=14; why.push(['pos',`Comfortable for ${req.pax}`]); }
    else { s-=6; why.push(['neg',`Over-sized — ${r.capacity} seats for ${req.pax}`]); }

    (req.features||[]).forEach(f=>{
      if(f==='catering'){ if(r.catering){ s+=10; why.push(['pos','Catering-ready']); } else { s-=28; why.push(['neg','No catering service']); } }
      else if(r.features.includes(f)){ s+=8; why.push(['pos',f]); }
      else { s-=16; why.push(['neg','Missing '+f]); }
    });

    if(req.bldg && req.bldg!=='Any'){ if(r.building===req.bldg){ s+=8; } else { s-=16; why.push(['neg',`In ${r.building}`]); } }

    // Audience (replaces client tier): external => premium experience; internal => cost-aware
    if(req.audience==='External client'){
      if(r.av==='premium'){ s+=12; why.push(['pos','Premium AV for client visit']); }
      if(r.features.includes('Skyline view')){ s+=8; why.push(['pos','Skyline view']); }
      if(r.rating>=4.8){ s+=5; }
    } else {
      if(r.rate>200){ s-=10; why.push(['neg','Premium rate for an internal meeting']); }
      else { s+=5; }
    }

    s += (r.rating-4.4)*12;
    s -= r.building_proximity*2.5;
    if(r.natLight) s+=4;
    if(!free){ s-=70; why.push(['neg',`Busy ${fmtHr(conflicts[0].start)}–${fmtHr(conflicts[0].end)} (${conflicts[0].client})`]); }

    return { room:r, raw:s, why, free, conflicts, ratio };
  });
  return scored.map(o=>({ ...o, score: Math.max(8, Math.min(98, Math.round(52+o.raw*0.62))) }))
               .sort((a,b)=>b.score-a.score);
}

/* ---------- Room card ---------- */
function roomCard(r, opts={}){
  const busy = opts.free===false;
  const pol = policyOf(r);
  const sc = opts.score!=null ? `<div class="score" style="box-shadow:0 0 0 2px ${opts.score>=72?'var(--ok)':opts.score>=52?'var(--warn)':'var(--bad)'}">${opts.score}% match</div>` : '';
  const avail = opts.free!=null ? `<div class="avail ${busy?'no':'ok'}">${busy?'● Busy at that time':'● Available'}</div>` : `<div class="policy ${pol}">${POLICY_LABEL[pol]}</div>`;
  const pos = (opts.why||[]).filter(w=>w[0]==='pos').slice(0,3).map(w=>w[1]);
  const neg = (opts.why||[]).filter(w=>w[0]==='neg').slice(0,1).map(w=>w[1]);
  const why = opts.why ? `<div class="why"><b>Why:</b> ${pos.join(' · ')||'—'}${neg.length?` <span style="color:var(--bad)">· ⚠ ${neg[0]}</span>`:''}</div>` : '';
  const tags = r.features.slice(0,4).map(f=>`<span class="chip ${f==='Catering-ready'?'g':/view|4K/i.test(f)?'b':''}">${f}</span>`).join('');
  return `<div class="card room ${busy?'busy':''}" data-room="${r.id}">
    <div class="ph" style="background:${r.img}"><div class="badge">⭐ ${r.rating}</div>${sc}${avail}</div>
    <div class="bd">
      <h3>${r.name} <span class="muted" style="font-size:12px;font-weight:600">${money(r.rate)}/hr</span></h3>
      <div class="meta">${r.building} · Floor ${r.floor} · ${r.layout} · 👥 ${r.capacity}</div>
      <div class="chips">${tags}</div>${why}
    </div>
  </div>`;
}

/* ---------- Insight card ---------- */
function insightCard(i){
  return `<div class="card ins"><div class="ic">${i.icon}</div><div style="flex:1">
    <h3>${i.title} <span class="tag">${i.type}</span></h3><p>${i.detail}</p>
    <div class="foot"><span class="impact">▲ ${i.impact}</span>
      <span class="conf">conf <span class="bar"><i style="width:${Math.round(i.confidence*100)}%"></i></span> ${Math.round(i.confidence*100)}%</span></div>
    <div style="margin-top:12px;display:flex;gap:8px">
      <button class="btn sm primary" data-act="${i.id}">${i.action}</button>
      <button class="btn sm ghost" data-dismiss="${i.id}">Dismiss</button></div>
  </div>`;
}

/* ============================================================ RENDERERS ============================================================ */
function renderDashboard(){
  const todays=DATA.bookings.length, confirmed=DATA.bookings.filter(b=>b.status==='confirmed').length;
  const cateredPax=DATA.bookings.filter(b=>b.catering.length).reduce((s,b)=>s+b.pax,0);
  const pending=DATA.requests.filter(r=>r.status==='pending').length;
  $('#dash-stats').innerHTML=[
    ['Bookings today',todays,'+3 vs last Tue',false],
    ['Pending requests',pending,pending?'Needs allocation':'All clear',pending>0],
    ['Guests with catering',cateredPax,'6 menus active',false],
    ['Confirmed',confirmed+'/'+todays,'On track',false],
  ].map(([k,v,d,down])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d ${down?'down':''}">${d}</div></div>`).join('');
  $('#dash-insights').innerHTML = DATA.insights.length ? DATA.insights.slice(0,2).map(insightCard).join('') : '<div class="empty">All clear — no open AI suggestions 🎉</div>';
  $('#dash-rooms').innerHTML = [...DATA.rooms].sort((a,b)=>b.rating-a.rating).slice(0,3).map(r=>roomCard(r)).join('');
}

function renderCentersLegend(){
  $('#centers-legend').innerHTML = DATA.centers.map(c=>{
    const icon = c.policy==='self'?'🟢':c.policy==='request_pref'?'🟡':'🟣';
    return `<div class="lc"><div class="d">${icon}</div><div style="flex:1"><b>${c.name}</b><p>${c.blurb}</p></div><span class="pol ${c.policy}">${POLICY_LABEL[c.policy]}</span></div>`;
  }).join('');
}
function renderRooms(){ renderCentersLegend(); $('#rooms-all').innerHTML = DATA.rooms.map(r=>roomCard(r)).join(''); }

function renderFinder(results){
  if(!results) return;
  const top=results[0], avail=results.filter(r=>r.free).length;
  $('#ai-headline').textContent = top.free ? `Top match: ${top.room.name} — ${top.score}% fit` : `Best fit ${top.room.name} is busy then — see alternatives`;
  $('#ai-sub').textContent = `Ranked ${results.length} rooms · ${avail} free for ${lastReq.startStr}–${fmtHr(lastReq.end)} · ${results.filter(r=>r.score>=70&&r.free).length} strong matches. The action on each card follows its centre’s policy.`;
  $('#finder-results').innerHTML = results.slice(0,6).map(r=>roomCard(r.room,{score:r.score,why:r.why,free:r.free})).join('');
}
function runFinder(){
  const start=t2d($('#f-start').value||'14:00'), dur=+$('#f-dur').value||2;
  lastReq={ name:$('#f-name').value||'New booking', pax:+$('#f-pax').value||1, audience:$('#f-aud').value,
    bldg:$('#f-bldg').value, features:$$('#f-feat .tg.on').map(t=>t.dataset.f), notes:$('#f-notes').value,
    date:$('#f-date').value||TODAY, start, end:start+dur, dur, startStr:$('#f-start').value||'14:00' };
  renderFinder(recommend(lastReq));
  toast(`AI ranked ${DATA.rooms.length} rooms for “${lastReq.name}”`);
}

/* ---------- Planner board ---------- */
const H0=8, H1=20;
function renderPlanner(){
  const hours=[]; for(let h=H0;h<=H1;h++) hours.push(`<div>${String(h).padStart(2,'0')}:00</div>`);
  $('#tl-hours').innerHTML=hours.join('');
  const span=H1-H0;
  $('#tl-body').innerHTML = DATA.rooms.map(r=>{
    const blocks=DATA.bookings.filter(b=>b.roomId===r.id).map(b=>{
      const left=((b.start-H0)/span)*100, width=((b.end-b.start)/span)*100;
      return `<div class="bk ${b.status}" data-detail="${b.id}" style="left:${left}%;width:${width}%">${b.title}<small>${fmtHr(b.start)}–${fmtHr(b.end)} · ${b.client}</small></div>`;
    }).join('');
    return `<div class="tl-row"><div class="tl-room"><b>${r.name}</b><span>${r.building} · Fl ${r.floor} · 👥${r.capacity}</span></div><div class="tl-track" data-newroom="${r.id}">${blocks}</div></div>`;
  }).join('');
  const totalHrs=DATA.bookings.reduce((s,b)=>s+(b.end-b.start),0);
  const clients=new Set(DATA.bookings.filter(b=>b.client!=='Internal').map(b=>b.client)).size;
  const revenue=DATA.bookings.reduce((s,b)=>{ const r=room(b.roomId); return s+r.rate*(b.end-b.start)+b.catering.reduce((x,id)=>x+cat(id).price*b.pax,0)+b.services.reduce((x,id)=>x+svc(id).price,0); },0);
  $('#planner-stats').innerHTML=[
    ['Bookings',DATA.bookings.length,''],['Booked hours',Math.round(totalHrs)+'h',''],
    ['External clients',clients,''],['Booked value (today)',money(revenue),'incl. catering & services'],
  ].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
}

function renderRecs(){
  $('#recs-stats').innerHTML=[
    ['Open suggestions',DATA.insights.length,'AI-generated'],['Pending requests',DATA.requests.filter(r=>r.status==='pending').length,'awaiting allocation'],
    ['Avg confidence',DATA.insights.length?Math.round(DATA.insights.reduce((s,i)=>s+i.confidence,0)/DATA.insights.length*100)+'%':'—',''],['Rooms optimised','3','this week'],
  ].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
  $('#recs-list').innerHTML = DATA.insights.length ? DATA.insights.map(insightCard).join('') : '<div class="empty">No open suggestions. Hit “Re-scan”.</div>';
}

/* ============================================================ REQUESTS + ALLOCATION ============================================================ */
let allocSel = {}; // requestId -> roomId chosen by planner

function candidates(req){ // AI-ranked rooms within the request's centre
  return recommend({ pax:req.pax, audience:req.audience, bldg:centerById(req.centerId).name, features:req.features||[], date:req.date, start:req.start, end:req.end })
         .filter(o => o.room.centerId===req.centerId);
}
function chipRow(label, ids, fn){ return ids.length ? `<b>${label}:</b> ${ids.map(fn).join(', ')}` : ''; }

function renderRequests(){
  const planning = currentRole==='planner';
  $('#req-title').textContent = planning ? '📥 Room Requests' : '📥 My Requests';
  $('#req-sub').textContent = planning
    ? 'Employee requests awaiting allocation. Review the requirements, then allocate a room — preferred rooms are honoured where free.'
    : 'Rooms you’ve requested. Self-service centres book instantly; managed centres are allocated by a planner.';
  const list = planning
    ? DATA.requests.filter(r=>r.status==='pending').concat(DATA.requests.filter(r=>r.status!=='pending'))
    : DATA.requests.filter(r=>r.requester===me().name);

  const pend=DATA.requests.filter(r=>r.status==='pending').length, alloc=DATA.requests.filter(r=>r.status==='allocated').length;
  $('#requests-stats').innerHTML=[
    ['Pending',pend,planning?'need a room':'awaiting planner'],['Allocated',alloc,'confirmed'],
    ['Centres',DATA.centers.length,'2 managed'],['Total requests',DATA.requests.length,''],
  ].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');

  if(!list.length){ $('#requests-list').innerHTML = `<div class="empty">${planning?'No requests right now.':'You have no requests yet — find or request a room.'}</div>`; renderReqCount(); return; }

  $('#requests-list').innerHTML = list.map(req=>{
    const c=centerById(req.centerId);
    const pref=req.preferredRoomId?room(req.preferredRoomId):null;
    const allocRoom=req.allocatedRoomId?room(req.allocatedRoomId):null;
    const statusLine = req.status==='allocated' ? `<span class="status allocated">Allocated · ${allocRoom.name}</span>`
                     : req.status==='rejected' ? `<span class="status rejected">Rejected</span>`
                     : `<span class="status pending">Pending</span>`;
    const meta = [
      `<span><b>${req.audience}</b></span>`,
      `<span>🏢 <b>${c.name}</b> <span class="pol ${c.policy}">${POLICY_LABEL[c.policy]}</span></span>`,
      `<span>🕑 <b>${fmtHr(req.start)}–${fmtHr(req.end)}</b></span>`,
      `<span>👥 <b>${req.pax}</b></span>`,
      pref?`<span>⭐ Preferred: <b>${pref.name}</b></span>`:'',
      chipRow('Catering', req.catering, id=>cat(id).name),
      chipRow('Services', req.services, id=>svc(id).name.replace(/ on standby| setup/,'')),
    ].filter(Boolean).join('');

    // allocation panel (planner, pending, expanded)
    let panel='';
    if(planning && req.status==='pending' && req._open){
      const cands=candidates(req);
      const chosen = allocSel[req.id] || (pref && isFree(pref.id,req.date,req.start,req.end) ? pref.id : cands.find(o=>o.free)?.room.id);
      panel = `<div class="alloc"><div style="font-size:12.5px;color:var(--mut);font-weight:650">Allocate a room in ${c.name} — AI-ranked, only free rooms selectable</div>
        <div class="opts">${cands.map(o=>{
          const r=o.room, free=o.free, sel=chosen===r.id;
          return `<div class="ar ${sel?'sel':''} ${free?'':'busy'}" data-alloc-room="${req.id}|${r.id}">
            ${req.preferredRoomId===r.id?'<span class="pref">⭐ PREFERRED</span>':''}
            <b>${r.name}</b><div class="m">👥 ${r.capacity} · ${money(r.rate)}/hr · ⭐${r.rating}</div>
            <div class="fit ${free && r.capacity>=req.pax?'ok':'no'}">${!free?'● Busy at that time':r.capacity<req.pax?`● Too small (${r.capacity})`:`● Free · ${o.score}% fit`}</div>
          </div>`;
        }).join('')}</div>
        <div style="display:flex;gap:10px"><button class="btn primary sm" data-confirm-alloc="${req.id}">✓ Confirm allocation</button>
          <button class="btn ghost sm" data-reject="${req.id}">Reject request</button></div></div>`;
    }
    const actions = (planning && req.status==='pending')
      ? `<button class="btn sm primary" data-allocate="${req.id}">${req._open?'Close':'Allocate room'}</button>`
      : '';
    return `<div class="req"><div class="rh">
        <div><h3>${req.meeting}</h3><div class="who">Requested by ${req.requester}${req.date?` · ${req.date}`:''}</div></div>
        <div style="display:flex;gap:10px;align-items:center">${actions}${statusLine}</div></div>
      <div class="grid">${meta}</div>${req.notes?`<div class="note">“${req.notes}”</div>`:''}${panel}</div>`;
  }).join('');
  renderReqCount();
}

function allocate(reqId){
  const req=DATA.requests.find(r=>r.id===reqId);
  const roomId = allocSel[reqId] || (req.preferredRoomId && isFree(req.preferredRoomId,req.date,req.start,req.end) ? req.preferredRoomId : candidates(req).find(o=>o.free && o.room.capacity>=req.pax)?.room.id);
  if(!roomId){ toast('Pick a free room to allocate',false); return; }
  if(!isFree(roomId,req.date,req.start,req.end)){ toast('That room is no longer free',false); return; }
  DATA.bookings.push({ id:'b'+Date.now(), roomId, title:req.meeting.slice(0,28),
    start:req.start, end:req.end, planner:'p1', client:req.audience==='External client'?req.meeting.split('—')[0].trim():'Internal',
    pax:req.pax, status:'new', catering:[...req.catering], services:[...req.services], date:req.date });
  req.status='allocated'; req.allocatedRoomId=roomId; req._open=false; delete allocSel[reqId];
  save(); renderRequests(); renderPlanner(); renderDashboard(); renderRecs();
  toast(`Allocated ${room(roomId).name} to ${req.requester} — booking confirmed`);
}

/* ============================================================ COMPOSER (book / request) ============================================================ */
let lastReq=null;
const drawer=$('#drawer'), scrim=$('#scrim');
let cmp=null; // composer state
function openDrawer(){ drawer.classList.add('on'); scrim.classList.add('on'); }
function closeDrawer(){ drawer.classList.remove('on'); scrim.classList.remove('on'); }
$('#drawer-x').onclick=closeDrawer; scrim.onclick=closeDrawer;

function routeRoom(r){
  if(currentRole==='planner'){ openComposer({mode:'book', roomId:r.id}); return; }
  const pol=policyOf(r);
  if(pol==='self') openComposer({mode:'book', roomId:r.id});
  else if(pol==='request_pref') openComposer({mode:'reqpref', roomId:r.id});
  else openComposer({mode:'reqspace', centerId:r.centerId});
}

function openComposer(o){
  const base={ catering:new Set(), services:new Set(), pax:lastReq?.pax||12, hours:lastReq?.dur||2,
    start:lastReq?.start??15, date:lastReq?.date||TODAY, name:lastReq?.name||'', audience:lastReq?.audience||'External client', editId:null };
  cmp={ ...base, ...o };
  if(o.roomId){
    if(lastReq && /lunch/i.test(lastReq.notes||'') && room(o.roomId).catering) cmp.catering.add('c3');
    if(cmp.audience==='External client') cmp.services.add('s1');
  } else if(o.mode==='reqspace'){ cmp.catering.add('c3'); cmp.services.add('s1'); }
  if(o.prefill) Object.assign(cmp, o.prefill);
  renderComposer(); openDrawer();
}

function composerTotals(){
  const r = cmp.roomId?room(cmp.roomId):null;
  const roomCost = r?r.rate*cmp.hours:0;
  const cCost=[...cmp.catering].reduce((s,id)=>s+cat(id).price*cmp.pax,0);
  const sCost=[...cmp.services].reduce((s,id)=>s+svc(id).price,0);
  return { roomCost, cCost, sCost, total:roomCost+cCost+sCost };
}

function renderComposer(){
  const r = cmp.roomId?room(cmp.roomId):null;
  const center = r?centerOf(r):centerById(cmp.centerId);
  const end = cmp.start+cmp.hours;
  const t = composerTotals();
  const isBook = cmp.mode==='book';
  const title = isBook ? `Book ${r.name}` : cmp.mode==='reqpref' ? `Request ${r.name}` : `Request a space`;
  const sub = r ? `${r.building} · Floor ${r.floor} · ${r.layout} · seats ${r.capacity}` : `${center.name} · a planner will allocate the suite`;
  $('#drawer-head').innerHTML = `<h2>${title}</h2><div class="sub">${sub}</div>`;

  let warn='';
  if(isBook){
    const conflict = conflictsFor(r.id, cmp.date, cmp.start, end, cmp.editId);
    warn = conflict.length
      ? `<div class="empty" style="padding:12px;background:rgba(251,113,133,.1);border-radius:10px;color:#fda4af;font-weight:600">⚠ Clashes with “${conflict[0].title}” (${fmtHr(conflict[0].start)}–${fmtHr(conflict[0].end)}). Pick another time.</div>`
      : `<div style="font-size:12px;color:var(--ok);font-weight:600;padding:4px 0">✓ ${r.name} is free ${fmtHr(cmp.start)}–${fmtHr(end)}</div>`;
  } else {
    const note = cmp.mode==='reqpref' ? `A planner will confirm <b>${r.name}</b> or an equivalent room.` : `A planner will allocate a suite in <b>${center.name}</b> that fits your needs.`;
    warn = `<div style="font-size:12px;color:#c4b5fd;font-weight:600;padding:8px 12px;background:rgba(167,139,250,.1);border-radius:10px">📥 ${note}</div>`;
  }

  const cateringOk = r ? r.catering : true; // exec centre suites are catering-ready
  const cateringRows = cateringOk
    ? DATA.catering.map(c=>{ const on=cmp.catering.has(c.id); return `<div class="opt"><div><div class="nm">${c.name}</div><div class="sub">${money(c.price)} ${c.unit} · ${c.lead}h lead${c.veg?' · veg ✓':''}</div></div><div style="display:flex;align-items:center;gap:10px"><span class="pr">${money(c.price*cmp.pax)}</span><button class="add ${on?'on':''}" data-cat="${c.id}">${on?'✓':'+'}</button></div></div>`; }).join('')
    : `<div class="empty">⚠️ ${r.name} is not catering-ready.</div>`;
  const serviceRows = DATA.services.map(s=>{ const on=cmp.services.has(s.id); return `<div class="opt"><div><div class="nm">${s.icon} ${s.name}</div><div class="sub">${money(s.price)} ${s.unit}</div></div><button class="add ${on?'on':''}" data-svc="${s.id}">${on?'✓':'+'}</button></div>`; }).join('');

  $('#drawer-body').innerHTML = `
    <div class="fg"><label style="font-size:12px;color:var(--mut);font-weight:650">Meeting / client name</label>
      <input id="c-name" value="${cmp.name.replace(/"/g,'&quot;')}" placeholder="e.g. Acme — Contract signing" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px;color:#fff"></div>
    <div class="fg"><label style="font-size:12px;color:var(--mut);font-weight:650">Audience</label>
      <select id="c-aud" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px;color:#fff">
        <option ${cmp.audience==='Internal meeting'?'selected':''}>Internal meeting</option>
        <option ${cmp.audience==='External client'?'selected':''}>External client</option></select></div>
    <div class="row2">
      <div class="fg"><label style="font-size:12px;color:var(--mut);font-weight:650">Start</label>
        <input id="c-start" type="time" value="${fmtHr(cmp.start)}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px;color:#fff"></div>
      <div class="fg"><label style="font-size:12px;color:var(--mut);font-weight:650">Duration (hrs)</label>
        <input id="c-hrs" type="number" value="${cmp.hours}" step="0.5" min="0.5" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px;color:#fff"></div>
    </div>
    <div class="fg"><label style="font-size:12px;color:var(--mut);font-weight:650">Attendees</label>
      <input id="c-pax" type="number" value="${cmp.pax}" min="1" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px;color:#fff"></div>
    ${warn}
    <div class="tabs"><button class="on" data-tab="cater">🍽️ Catering</button><button data-tab="svc">🛎️ Services</button></div>
    <div id="tab-cater">${cateringRows}</div>
    <div id="tab-svc" style="display:none">${serviceRows}</div>
    <div style="margin-top:18px">
      <div class="kv"><span>Room · ${cmp.hours}h ${r?'× '+money(r.rate):''}</span><b>${r?money(t.roomCost):'at allocation'}</b></div>
      <div class="kv"><span>Catering · ${cmp.catering.size} item(s) × ${cmp.pax} pax</span><b>${money(t.cCost)}</b></div>
      <div class="kv"><span>Services · ${cmp.services.size} item(s)</span><b>${money(t.sCost)}</b></div>
    </div>`;

  const blocked = isBook && conflictsFor(r.id, cmp.date, cmp.start, end, cmp.editId).length;
  const btnLabel = isBook ? (cmp.editId?'Save changes ✓':'Confirm booking ✓') : 'Submit request 📥';
  $('#drawer-foot').innerHTML = `<div><div class="muted" style="font-size:11px">${r?'Estimated total':'Catering + services'}</div><div class="total">${money(t.total)}</div></div>
    <button class="btn primary" id="cmp-submit" ${blocked?'style="opacity:.5;pointer-events:none"':''}>${btnLabel}</button>`;
}

/* composer interactions */
$('#drawer-body').addEventListener('click', e=>{
  const c=e.target.closest('[data-cat]'), s=e.target.closest('[data-svc]'), tab=e.target.closest('[data-tab]');
  if(c){ const id=c.dataset.cat; cmp.catering.has(id)?cmp.catering.delete(id):cmp.catering.add(id); renderComposer(); }
  if(s){ const id=s.dataset.svc; cmp.services.has(id)?cmp.services.delete(id):cmp.services.add(id); renderComposer(); }
  if(tab){ const tn=tab.dataset.tab; $$('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tn)); $('#tab-cater').style.display=tn==='cater'?'block':'none'; $('#tab-svc').style.display=tn==='svc'?'block':'none'; }
});
$('#drawer-body').addEventListener('input', e=>{
  if(e.target.id==='c-pax') cmp.pax=+e.target.value||1;
  else if(e.target.id==='c-hrs') cmp.hours=+e.target.value||0.5;
  else if(e.target.id==='c-start') cmp.start=t2d(e.target.value);
  else if(e.target.id==='c-name'){ cmp.name=e.target.value; return; }
  else if(e.target.id==='c-aud'){ cmp.audience=e.target.value; return; }
  else return;
  renderComposer();
});
$('#drawer-foot').addEventListener('click', e=>{
  if(e.target.id!=='cmp-submit') return;
  const end=cmp.start+cmp.hours;
  cmp.name = ($('#c-name')?.value||cmp.name||'Untitled').trim();
  cmp.audience = $('#c-aud')?.value||cmp.audience;
  if(cmp.mode==='book'){
    const r=room(cmp.roomId);
    if(conflictsFor(r.id,cmp.date,cmp.start,end,cmp.editId).length){ toast('That time clashes with an existing booking',false); return; }
    if(end>H1||cmp.start<H0){ toast('Booking must fall within 08:00–20:00',false); return; }
    if(cmp.editId){ const b=DATA.bookings.find(x=>x.id===cmp.editId); Object.assign(b,{start:cmp.start,end,pax:cmp.pax,catering:[...cmp.catering],services:[...cmp.services]}); toast(`${b.title} updated`); }
    else { DATA.bookings.push({ id:'b'+Date.now(), roomId:cmp.roomId, title:cmp.name.slice(0,28), start:cmp.start, end, planner:'p1', client:cmp.audience==='External client'?cmp.name.split('—')[0].trim():'Internal', pax:cmp.pax, status:'new', catering:[...cmp.catering], services:[...cmp.services], date:cmp.date }); toast(`${r.name} booked ${fmtHr(cmp.start)}–${fmtHr(end)}`); }
    save(); closeDrawer(); renderPlanner(); renderDashboard();
    setTimeout(()=>go(currentRole==='planner'?'planner':'rooms'),350);
  } else {
    const centerId = cmp.roomId?room(cmp.roomId).centerId:cmp.centerId;
    DATA.requests.push({ id:'rq'+Date.now(), requester:me().name, meeting:cmp.name, audience:cmp.audience, pax:cmp.pax,
      date:cmp.date, start:cmp.start, end, centerId, preferredRoomId:cmp.mode==='reqpref'?cmp.roomId:null,
      features:lastReq?.features||[], catering:[...cmp.catering], services:[...cmp.services], notes:lastReq?.notes||'', status:'pending', allocatedRoomId:null });
    save(); closeDrawer(); toast('Request submitted — a planner will allocate your room'); renderDashboard(); renderRecs(); renderRequests();
    go('requests');
  }
});

/* booking detail (planner) */
function openBookingDetail(b){
  const r=room(b.roomId), p=planner(b.planner);
  const cRows=b.catering.length?b.catering.map(id=>{const c=cat(id);return `<div class="kv"><span>🍽️ ${c.name}</span><b>${money(c.price*b.pax)}</b></div>`}).join(''):'<div class="muted" style="font-size:12.5px;padding:8px 0">No catering</div>';
  const sRows=b.services.length?b.services.map(id=>{const s=svc(id);return `<div class="kv"><span>${s.icon} ${s.name}</span><b>${money(s.price)}</b></div>`}).join(''):'<div class="muted" style="font-size:12.5px;padding:8px 0">No services</div>';
  const total=r.rate*(b.end-b.start)+b.catering.reduce((x,id)=>x+cat(id).price*b.pax,0)+b.services.reduce((x,id)=>x+svc(id).price,0);
  $('#drawer-head').innerHTML=`<h2>${b.title}</h2><div class="sub">${r.name} · ${fmtHr(b.start)}–${fmtHr(b.end)} · <span class="tag">${b.status}</span></div>`;
  $('#drawer-body').innerHTML=`
    <div class="kv"><span>Client / audience</span><b>${b.client}</b></div>
    <div class="kv"><span>Centre</span><b>${r.building}</b></div>
    <div class="kv"><span>Attendees</span><b>👥 ${b.pax}</b></div>
    <div class="kv"><span>Room rate</span><b>${money(r.rate)}/hr · ${(b.end-b.start)}h</b></div>
    <div class="kv"><span>Planner</span><b>${p.name}</b></div>
    <div class="section-h"><h2 style="font-size:14px">🍽️ Catering</h2></div>${cRows}
    <div class="section-h"><h2 style="font-size:14px">🛎️ Services</h2></div>${sRows}`;
  $('#drawer-foot').innerHTML=`<div><div class="muted" style="font-size:11px">Booking value</div><div class="total">${money(total)}</div></div><button class="btn primary" id="bd-edit">Edit / add services</button>`;
  $('#drawer-foot').querySelector('#bd-edit').onclick=()=>openComposer({mode:'book',roomId:b.roomId,editId:b.id,prefill:{catering:new Set(b.catering),services:new Set(b.services),pax:b.pax,hours:b.end-b.start,start:b.start,date:b.date||TODAY,name:b.title,audience:b.client==='Internal'?'Internal meeting':'External client'}});
  openDrawer();
}

/* ---------- Global click delegation ---------- */
document.addEventListener('click', e=>{
  const detail=e.target.closest('[data-detail]'); if(detail){ openBookingDetail(DATA.bookings.find(b=>b.id===detail.dataset.detail)); return; }
  const roomBtn=e.target.closest('[data-room]'); if(roomBtn){ routeRoom(room(roomBtn.dataset.room)); return; }
  const newslot=e.target.closest('[data-newroom]');
  if(newslot && !e.target.closest('.bk')){ const rect=newslot.getBoundingClientRect(); const frac=Math.min(0.95,Math.max(0,(e.clientX-rect.left)/rect.width)); const start=Math.min(Math.round((H0+frac*(H1-H0))*2)/2,H1-1); openComposer({mode:'book',roomId:newslot.dataset.newroom,prefill:{start}}); return; }
  const al=e.target.closest('[data-allocate]'); if(al){ const req=DATA.requests.find(r=>r.id===al.dataset.allocate); req._open=!req._open; renderRequests(); return; }
  const ar=e.target.closest('[data-alloc-room]'); if(ar){ const [rq,rm]=ar.dataset.allocRoom.split('|'); allocSel[rq]=rm; renderRequests(); return; }
  const ca=e.target.closest('[data-confirm-alloc]'); if(ca){ allocate(ca.dataset.confirmAlloc); return; }
  const rj=e.target.closest('[data-reject]'); if(rj){ const req=DATA.requests.find(r=>r.id===rj.dataset.reject); req.status='rejected'; req._open=false; save(); renderRequests(); renderDashboard(); toast('Request rejected'); return; }
  const act=e.target.closest('[data-act]'); if(act){ const i=DATA.insights.find(x=>x.id===act.dataset.act); if(i.type==='request'){ go('requests'); return; } toast(`Action “${i.action}” applied — ${i.title}`); act.textContent='✓ Done'; act.classList.remove('primary'); return; }
  const dis=e.target.closest('[data-dismiss]'); if(dis){ DATA.insights=DATA.insights.filter(x=>x.id!==dis.dataset.dismiss); save(); renderRecs(); renderDashboard(); toast('Suggestion dismissed'); return; }
  if(e.target.closest('#reset-demo')) resetDemo();
});

/* finder + misc */
$('#f-feat').addEventListener('click', e=>{ const t=e.target.closest('.tg'); if(t) t.classList.toggle('on'); });
$('#f-run').onclick=runFinder;
$('#recs-refresh').onclick=()=>{ renderRecs(); toast('Re-scanned — insights refreshed'); };

/* ---------- init ---------- */
load();
renderDashboard(); renderRooms(); renderPlanner(); renderRecs(); renderRequests();
applyRole();
go('dashboard');
