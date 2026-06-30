/* ============================================================
   Convene — clickable prototype engine (vanilla JS)
   ============================================================ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const money = n => '$' + n.toLocaleString();
const cat = id => DATA.catering.find(c => c.id === id);
const svc = id => DATA.services.find(s => s.id === id);
const room = id => DATA.rooms.find(r => r.id === id);
const planner = id => DATA.planners.find(p => p.id === id);
const fmtHr = h => { const hh = Math.floor(h), mm = (h % 1) * 60; return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };

/* ---------- Navigation ---------- */
function go(screen){
  $$('.screen').forEach(s => s.classList.remove('on'));
  $('#screen-' + screen).classList.add('on');
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.screen === screen));
  window.scrollTo({top:0, behavior:'smooth'});
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.screen); });
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });

/* ---------- Toast ---------- */
let toastT;
function toast(msg){
  const t = $('#toast'); t.innerHTML = '✓ ' + msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ============================================================
   AI ROOM RECOMMENDER
   Transparent weighted scoring so every match is explainable.
   ============================================================ */
function recommend(req){
  return DATA.rooms.map(r => {
    let score = 0; const why = [];

    // Capacity fit — best when room is 100–150% of party size
    const ratio = r.capacity / req.pax;
    if (ratio < 1)        { score -= 40; why.push(['neg', `Only seats ${r.capacity} (need ${req.pax})`]); }
    else if (ratio <= 1.5){ score += 32; why.push(['pos', `Right-sized for ${req.pax} (${r.capacity} seats)`]); }
    else if (ratio <= 2.5){ score += 18; why.push(['pos', `Comfortable for ${req.pax}`]); }
    else                  { score += 4;  why.push(['neg', `Over-sized — ${r.capacity} seats for ${req.pax}`]); }

    // Required features
    let featMiss = 0;
    req.features.forEach(f => {
      if (f === 'catering'){
        if (r.catering){ score += 14; why.push(['pos','Catering-ready']); }
        else { score -= 30; featMiss++; why.push(['neg','No catering service']); }
      } else if (r.features.includes(f)){ score += 10; why.push(['pos', f]); }
      else { score -= 18; featMiss++; why.push(['neg', 'Missing ' + f]); }
    });

    // Building preference
    if (req.bldg !== 'Any'){
      if (r.building === req.bldg){ score += 10; }
      else { score -= 14; why.push(['neg', `In ${r.building}, not ${req.bldg}`]); }
    }

    // Client tier → premium AV + experience
    if (req.tier.startsWith('Tier-1')){
      if (r.av === 'premium'){ score += 16; why.push(['pos','Premium AV for VIP client']); }
      if (r.features.includes('Skyline view')){ score += 8; why.push(['pos','Skyline view — premium feel']); }
      if (r.rating >= 4.8){ score += 6; }
    } else if (req.tier === 'Internal' && r.rate > 200){
      score -= 8; why.push(['neg','Premium rate for internal use']);
    }

    // Quality + proximity nudges
    score += (r.rating - 4) * 10;
    score -= r.building_proximity * 2;
    if (r.natLight){ score += 4; }

    const pct = Math.max(2, Math.min(99, Math.round(50 + score)));
    return { room: r, score: pct, why, featMiss, fits: ratio >= 1 };
  })
  .sort((a,b) => b.score - a.score);
}

/* ---------- Room card ---------- */
function roomCard(r, opts={}){
  const sc = opts.score != null ? `<div class="score" style="box-shadow:0 0 0 2px ${opts.score>=75?'var(--ok)':opts.score>=55?'var(--warn)':'var(--bad)'}">${opts.score}% match</div>` : '';
  const why = opts.why ? `<div class="why"><b>Why:</b> ${opts.why.filter(w=>w[0]==='pos').slice(0,3).map(w=>w[1]).join(' · ') || 'See details'}</div>` : '';
  const tags = r.features.slice(0,4).map(f => `<span class="chip ${f==='Catering-ready'?'g':/view|4K/i.test(f)?'b':''}">${f}</span>`).join('');
  return `<div class="card room" data-book="${r.id}" ${opts.score!=null?`data-score="${opts.score}"`:''}>
    <div class="ph" style="background:${r.img}">
      <div class="badge">⭐ ${r.rating}</div>${sc}
    </div>
    <div class="bd">
      <h3>${r.name} <span class="muted" style="font-size:12px;font-weight:600">${money(r.rate)}/hr</span></h3>
      <div class="meta">${r.building} · Floor ${r.floor} · ${r.layout} · 👥 ${r.capacity}</div>
      <div class="chips">${tags}</div>
      ${why}
    </div>
  </div>`;
}

/* ---------- Insight / recommendation card ---------- */
function insightCard(i){
  return `<div class="card ins">
    <div class="ic">${i.icon}</div>
    <div style="flex:1">
      <h3>${i.title} <span class="tag">${i.type}</span></h3>
      <p>${i.detail}</p>
      <div class="foot">
        <span class="impact">▲ ${i.impact}</span>
        <span class="conf">conf <span class="bar"><i style="width:${Math.round(i.confidence*100)}%"></i></span> ${Math.round(i.confidence*100)}%</span>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn sm primary" data-act="${i.id}">${i.action}</button>
        <button class="btn sm ghost" data-dismiss="${i.id}">Dismiss</button>
      </div>
    </div>
  </div>`;
}

/* ============================================================
   RENDERERS
   ============================================================ */
function renderDashboard(){
  const todays = DATA.bookings.length;
  const confirmed = DATA.bookings.filter(b=>b.status==='confirmed').length;
  const cateredPax = DATA.bookings.filter(b=>b.catering.length).reduce((s,b)=>s+b.pax,0);
  const util = Math.round(DATA.bookings.reduce((s,b)=>s+(b.end-b.start),0) / (DATA.rooms.length*12) * 100);
  $('#dash-stats').innerHTML = [
    ['Client bookings today', todays, '+3 vs last Tue', false],
    ['Confirmed', confirmed + '/' + todays, 'On track', false],
    ['Guests with catering', cateredPax, '6 menus active', false],
    ['Room utilisation', util + '%', util>55?'High demand':'Healthy', util>75],
  ].map(([k,v,d,down]) => `<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d ${down?'down':''}">${d}</div></div>`).join('');

  $('#dash-insights').innerHTML = DATA.insights.slice(0,2).map(insightCard).join('');
  // top rooms by rating
  $('#dash-rooms').innerHTML = [...DATA.rooms].sort((a,b)=>b.rating-a.rating).slice(0,3).map(r=>roomCard(r)).join('');
}

function renderRooms(){
  $('#rooms-all').innerHTML = DATA.rooms.map(r=>roomCard(r)).join('');
}

function renderFinder(results){
  const box = $('#finder-results');
  if (!results){ return; }
  const top = results[0];
  $('#ai-headline').textContent = `Top match: ${top.room.name} — ${top.score}% fit`;
  $('#ai-sub').textContent = `Ranked ${results.length} rooms. ${results.filter(r=>r.score>=70).length} strong matches. The recommender weighted capacity fit, required features, client tier and location.`;
  box.innerHTML = results.slice(0,6).map(r => roomCard(r.room, {score:r.score, why:r.why})).join('');
}

function runFinder(){
  const feats = $$('#f-feat .tg.on').map(t=>t.dataset.f);
  const req = {
    name: $('#f-name').value,
    pax: +$('#f-pax').value || 1,
    tier: $('#f-tier').value,
    bldg: $('#f-bldg').value,
    features: feats,
    notes: $('#f-notes').value,
  };
  const results = recommend(req);
  lastReq = req;
  renderFinder(results);
  toast(`AI ranked ${results.length} rooms for “${req.name}”`);
}

/* ---------- Planner board ---------- */
const H0 = 8, H1 = 20; // 08:00–20:00
function renderPlanner(){
  const hours = [];
  for (let h=H0; h<=H1; h++) hours.push(`<div>${String(h).padStart(2,'0')}:00</div>`);
  $('#tl-hours').innerHTML = hours.join('');

  const span = H1 - H0;
  $('#tl-body').innerHTML = DATA.rooms.map(r => {
    const blocks = DATA.bookings.filter(b=>b.roomId===r.id).map(b=>{
      const left = ((b.start - H0) / span) * 100;
      const width = ((b.end - b.start) / span) * 100;
      return `<div class="bk ${b.status}" data-detail="${b.id}" style="left:${left}%;width:${width}%">
        ${b.title}<small>${fmtHr(b.start)}–${fmtHr(b.end)} · ${b.client}</small></div>`;
    }).join('');
    return `<div class="tl-row">
      <div class="tl-room"><b>${r.name}</b><span>${r.building} · Fl ${r.floor} · 👥${r.capacity}</span></div>
      <div class="tl-track" data-newroom="${r.id}">${blocks}</div>
    </div>`;
  }).join('');

  // planner stats
  const totalHrs = DATA.bookings.reduce((s,b)=>s+(b.end-b.start),0);
  const clients = new Set(DATA.bookings.filter(b=>b.client!=='Internal').map(b=>b.client)).size;
  const revenue = DATA.bookings.reduce((s,b)=>{
    const r=room(b.roomId); const cter=b.catering.reduce((x,id)=>x+cat(id).price*b.pax,0);
    const sv=b.services.reduce((x,id)=>x+svc(id).price,0);
    return s + r.rate*(b.end-b.start) + cter + sv;
  },0);
  $('#planner-stats').innerHTML = [
    ['Bookings', DATA.bookings.length, ''],
    ['Booked hours', totalHrs + 'h', ''],
    ['External clients', clients, ''],
    ['Booked value (today)', money(Math.round(revenue)), 'incl. catering & services'],
  ].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');

  $('#planner-load').innerHTML = DATA.planners.map(p=>{
    const mine = DATA.bookings.filter(b=>b.planner===p.id);
    const pct = Math.min(100, Math.round(mine.length/4*100));
    return `<div class="card"><div style="display:flex;gap:11px;align-items:center">
      <div class="avatar">${p.avatar}</div>
      <div><b style="font-size:14px">${p.name}</b><div class="muted" style="font-size:12px">${p.role}</div></div></div>
      <div style="margin-top:13px;font-size:12px;color:var(--mut)">${mine.length} bookings today</div>
      <div class="conf" style="margin-top:7px"><span class="bar" style="width:100%;height:7px"><i style="width:${pct}%"></i></span></div>
    </div>`;
  }).join('');
}

function renderRecs(){
  $('#recs-stats').innerHTML = [
    ['Open suggestions', DATA.insights.length, 'AI-generated'],
    ['Est. value at stake', money(540), 'upsell + risk'],
    ['Avg confidence', Math.round(DATA.insights.reduce((s,i)=>s+i.confidence,0)/DATA.insights.length*100)+'%', ''],
    ['Rooms optimised', '3', 'this week'],
  ].map(([k,v,d])=>`<div class="card stat"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
  $('#recs-list').innerHTML = DATA.insights.map(insightCard).join('');
}

/* ============================================================
   DRAWER — booking flow (catering + services) & booking detail
   ============================================================ */
let lastReq = null;
const drawer = $('#drawer'), scrim = $('#scrim');
let basket = { roomId:null, catering:new Set(), services:new Set(), pax:12, hours:2 };

function openDrawer(){ drawer.classList.add('on'); scrim.classList.add('on'); }
function closeDrawer(){ drawer.classList.remove('on'); scrim.classList.remove('on'); }
$('#drawer-x').onclick = closeDrawer; scrim.onclick = closeDrawer;

function basketTotals(){
  const r = room(basket.roomId);
  const roomCost = r.rate * basket.hours;
  const cCost = [...basket.catering].reduce((s,id)=>s+cat(id).price*basket.pax,0);
  const sCost = [...basket.services].reduce((s,id)=>s+svc(id).price,0);
  return { roomCost, cCost, sCost, total: roomCost+cCost+sCost };
}

function renderBasket(){
  const r = room(basket.roomId);
  const t = basketTotals();
  $('#drawer-head').innerHTML = `<h2>Book ${r.name}</h2><div class="sub">${r.building} · Floor ${r.floor} · ${r.layout} · seats ${r.capacity}</div>`;

  const cateringRows = r.catering
    ? DATA.catering.map(c=>{
        const on = basket.catering.has(c.id);
        return `<div class="opt"><div><div class="nm">${c.name}</div><div class="sub">${money(c.price)} ${c.unit} · ${c.lead}h lead${c.veg?' · veg ✓':''}</div></div>
          <div style="display:flex;align-items:center;gap:10px"><span class="pr">${money(c.price*basket.pax)}</span>
          <button class="add ${on?'on':''}" data-cat="${c.id}">${on?'✓':'+'}</button></div></div>`;
      }).join('')
    : `<div class="empty">⚠️ ${r.name} is not catering-ready. Pick a catering-ready room to add food & beverage.</div>`;

  const serviceRows = DATA.services.map(s=>{
    const on = basket.services.has(s.id);
    return `<div class="opt"><div><div class="nm">${s.icon} ${s.name}</div><div class="sub">${money(s.price)} ${s.unit}</div></div>
      <button class="add ${on?'on':''}" data-svc="${s.id}">${on?'✓':'+'}</button></div>`;
  }).join('');

  $('#drawer-body').innerHTML = `
    <div class="row2">
      <div class="fg"><label style="font-size:12px;color:var(--mut);font-weight:650">Attendees</label>
        <input id="b-pax" type="number" value="${basket.pax}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px;color:#fff"></div>
      <div class="fg"><label style="font-size:12px;color:var(--mut);font-weight:650">Duration (hrs)</label>
        <input id="b-hrs" type="number" value="${basket.hours}" step="0.5" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px;color:#fff"></div>
    </div>
    <div class="tabs"><button class="on" data-tab="cater">🍽️ Catering</button><button data-tab="svc">🛎️ Services</button></div>
    <div id="tab-cater">${cateringRows}</div>
    <div id="tab-svc" style="display:none">${serviceRows}</div>
    <div style="margin-top:18px">
      <div class="kv"><span>Room · ${basket.hours}h × ${money(r.rate)}</span><b id="k-room">${money(t.roomCost)}</b></div>
      <div class="kv"><span>Catering · ${basket.catering.size} item(s) × ${basket.pax} pax</span><b id="k-cat">${money(t.cCost)}</b></div>
      <div class="kv"><span>Services · ${basket.services.size} item(s)</span><b id="k-svc">${money(t.sCost)}</b></div>
    </div>`;

  $('#drawer-foot').innerHTML = `<div><div class="muted" style="font-size:11px">Estimated total</div><div class="total" id="k-total">${money(t.total)}</div></div>
    <button class="btn primary" id="b-confirm">Confirm booking ✓</button>`;
}

function startBooking(roomId, prefill){
  basket = { roomId, catering:new Set(), services:new Set(), pax: prefill?.pax || lastReq?.pax || 12, hours:2 };
  // smart prefill: a catering-ready room + lunch in notes → suggest working lunch
  if (lastReq && /lunch/i.test(lastReq.notes||'') && room(roomId).catering) basket.catering.add('c3');
  if (lastReq?.tier?.startsWith('Tier-1')) basket.services.add('s1');
  renderBasket(); openDrawer();
}

/* drawer interactions */
$('#drawer-body').addEventListener('click', e => {
  const c = e.target.closest('[data-cat]'); const s = e.target.closest('[data-svc]'); const tab = e.target.closest('[data-tab]');
  if (c){ const id=c.dataset.cat; basket.catering.has(id)?basket.catering.delete(id):basket.catering.add(id); renderBasket(); }
  if (s){ const id=s.dataset.svc; basket.services.has(id)?basket.services.delete(id):basket.services.add(id); renderBasket(); }
  if (tab){ const t=tab.dataset.tab; $$('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
    $('#tab-cater').style.display = t==='cater'?'block':'none'; $('#tab-svc').style.display = t==='svc'?'block':'none'; }
});
$('#drawer-body').addEventListener('input', e => {
  if (e.target.id==='b-pax'){ basket.pax = +e.target.value||1; renderBasket(); }
  if (e.target.id==='b-hrs'){ basket.hours = +e.target.value||1; renderBasket(); }
});
$('#drawer-foot').addEventListener('click', e => {
  if (e.target.id==='b-confirm'){
    const r = room(basket.roomId);
    DATA.bookings.push({
      id:'b'+(DATA.bookings.length+1), roomId:basket.roomId, title:(lastReq?.name||'New client booking').slice(0,28),
      start:15, end:15+basket.hours, planner:'p1', client:(lastReq?.name||'Client').split('—')[0].trim(),
      pax:basket.pax, status:'new', catering:[...basket.catering], services:[...basket.services]
    });
    closeDrawer(); toast(`${r.name} booked — added to the Planner Board`);
    renderPlanner(); renderDashboard();
    setTimeout(()=>go('planner'), 400);
  }
});

/* booking detail view (from planner) */
function openBookingDetail(b){
  const r = room(b.roomId); const p = planner(b.planner);
  const cRows = b.catering.length ? b.catering.map(id=>{const c=cat(id);return `<div class="kv"><span>🍽️ ${c.name}</span><b>${money(c.price*b.pax)}</b></div>`}).join('') : '<div class="muted" style="font-size:12.5px;padding:8px 0">No catering</div>';
  const sRows = b.services.length ? b.services.map(id=>{const s=svc(id);return `<div class="kv"><span>${s.icon} ${s.name}</span><b>${money(s.price)}</b></div>`}).join('') : '<div class="muted" style="font-size:12.5px;padding:8px 0">No services</div>';
  const cCost=b.catering.reduce((x,id)=>x+cat(id).price*b.pax,0), sCost=b.services.reduce((x,id)=>x+svc(id).price,0);
  const total = r.rate*(b.end-b.start)+cCost+sCost;
  $('#drawer-head').innerHTML = `<h2>${b.title}</h2><div class="sub">${r.name} · ${fmtHr(b.start)}–${fmtHr(b.end)} · <span class="tag">${b.status}</span></div>`;
  $('#drawer-body').innerHTML = `
    <div class="kv"><span>Client</span><b>${b.client}</b></div>
    <div class="kv"><span>Attendees</span><b>👥 ${b.pax}</b></div>
    <div class="kv"><span>Room rate</span><b>${money(r.rate)}/hr · ${(b.end-b.start)}h</b></div>
    <div class="kv"><span>Planner</span><b>${p.name}</b></div>
    <div class="section-h"><h2 style="font-size:14px">🍽️ Catering</h2></div>${cRows}
    <div class="section-h"><h2 style="font-size:14px">🛎️ Services</h2></div>${sRows}`;
  $('#drawer-foot').innerHTML = `<div><div class="muted" style="font-size:11px">Booking value</div><div class="total">${money(Math.round(total))}</div></div>
    <button class="btn primary" id="bd-edit">Add catering / services</button>`;
  $('#drawer-foot').querySelector('#bd-edit').onclick = () => { basket={roomId:b.roomId,catering:new Set(b.catering),services:new Set(b.services),pax:b.pax,hours:b.end-b.start}; renderBasket(); };
  openDrawer();
}

/* ---------- Global click delegation for cards / actions ---------- */
document.addEventListener('click', e => {
  const bookBtn = e.target.closest('[data-book]');
  if (bookBtn){ startBooking(bookBtn.dataset.book); return; }
  const detail = e.target.closest('[data-detail]');
  if (detail){ openBookingDetail(DATA.bookings.find(b=>b.id===detail.dataset.detail)); return; }
  const newslot = e.target.closest('[data-newroom]');
  if (newslot && !e.target.closest('.bk')){ startBooking(newslot.dataset.newroom); return; }
  const act = e.target.closest('[data-act]');
  if (act){ const i=DATA.insights.find(x=>x.id===act.dataset.act); toast(`Action “${i.action}” applied — ${i.title}`); act.textContent='✓ Done'; act.classList.remove('primary'); return; }
  const dis = e.target.closest('[data-dismiss]');
  if (dis){ DATA.insights = DATA.insights.filter(x=>x.id!==dis.dataset.dismiss); renderRecs(); renderDashboard(); toast('Suggestion dismissed'); return; }
});

/* feature toggles in finder */
$('#f-feat').addEventListener('click', e => { const t=e.target.closest('.tg'); if(t) t.classList.toggle('on'); });
$('#f-run').onclick = runFinder;
$('#recs-refresh').onclick = () => { renderRecs(); toast('Re-scanned — insights refreshed'); };

/* ---------- init ---------- */
renderDashboard(); renderRooms(); renderPlanner(); renderRecs();
go('dashboard');
