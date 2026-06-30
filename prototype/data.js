/* ============================================================
   Convene — data layer (v4)
   Scale model: 100+ Buildings > Floors > Spaces.
   In production these are hydrated from internal systems:
     - Buildings / floors / spaces / common names / amenities  -> SPACE MANAGEMENT SYSTEM
     - Live availability                                        -> Microsoft 365 / Google Workspace
     - Per-building catering menus                              -> caterer setup (admin) + caterer feed
     - Services (AV / IT / cleaning)                            -> ticketing
   Here the space estate is generated deterministically so the
   prototype has realistic scale (searchable building list,
   favourites, building-scoped room lists).
   ============================================================ */

/* ---- deterministic RNG so the estate is stable across reloads ---- */
function _rng(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const _pick  = (a,r)=>a[Math.floor(r()*a.length)];
const _int   = (lo,hi,r)=>lo+Math.floor(r()*(hi-lo+1));
const _pickN = (a,n,r)=>{ const c=[...a],out=[]; for(let i=0;i<n&&c.length;i++) out.push(c.splice(Math.floor(r()*c.length),1)[0]); return out; };
const _pad   = (n,w)=>String(n).padStart(w,'0');

/* ---- reference lists ---- */
const CITIES = [
  {city:'New York',region:'Americas',code:'NYC'},{city:'San Francisco',region:'Americas',code:'SFO'},
  {city:'Chicago',region:'Americas',code:'CHI'},{city:'Austin',region:'Americas',code:'AUS'},
  {city:'Toronto',region:'Americas',code:'YYZ'},{city:'São Paulo',region:'Americas',code:'GRU'},
  {city:'London',region:'EMEA',code:'LON'},{city:'Dublin',region:'EMEA',code:'DUB'},
  {city:'Paris',region:'EMEA',code:'PAR'},{city:'Berlin',region:'EMEA',code:'BER'},
  {city:'Amsterdam',region:'EMEA',code:'AMS'},{city:'Madrid',region:'EMEA',code:'MAD'},
  {city:'Dubai',region:'EMEA',code:'DXB'},{city:'Singapore',region:'APAC',code:'SIN'},
  {city:'Tokyo',region:'APAC',code:'TYO'},{city:'Sydney',region:'APAC',code:'SYD'},
  {city:'Bangalore',region:'APAC',code:'BLR'},{city:'Hong Kong',region:'APAC',code:'HKG'},
];
const BLD_NAMES = ['Helix','Beacon','Atrium','Quay','Meridian','Harbour','Lumen','Pioneer','Spectrum','Cobalt','Ironworks','Summit','Vertex','Aurora','Keystone','Lighthouse','Maple','Granite','Eastgate','Northpoint','Riverside','Skyline','Foundry','Observatory'];
const BLD_SUFFIX = ['Tower','House','Centre','Campus','Place','Works','Plaza','Hall'];
const ROOM_NAMES = ['Sequoia','Baltic','Sahara','Thames','Hudson','Willow','Cedar','Onyx','Coral','Marble','Aspen','Cobalt','Indigo','Saffron','Juniper','Basalt','Tundra','Cypress','Lagoon','Quartz','Ember','Dune','Fjord','Birch','Slate','Cove','Mesa','Verde','Aurora','Cirrus','Delta','Echo','Flint','Garnet','Halcyon','Iris'];
// setup/teardown = minutes the room is held before/after a booking for reset & layout
const SPACE_TYPES = [
  {t:'Huddle',      cap:[2,6],   setup:0,  teardown:0},
  {t:'Meeting Room',cap:[4,10],  setup:5,  teardown:5},
  {t:'Conference',  cap:[8,16],  setup:10, teardown:10},
  {t:'Boardroom',   cap:[10,20], setup:15, teardown:15},
  {t:'Training',    cap:[16,40], setup:20, teardown:15},
  {t:'Theatre',     cap:[30,120],setup:45, teardown:30},
  {t:'Banquet',     cap:[40,200],setup:60, teardown:45},
];
const AMENITIES = ['4K display','Dual screen','VC suite','Hearing loop','Step-free access','Skyline view','Whiteboard wall','Stage','PA system','Catering-ready','Natural light','Dedicated AV booth','Phone for dial-in','Coffee station'];

const SETUP_TYPES = ['As-is / existing','Boardroom','U-shape','Theatre','Classroom','Banquet','Hollow square','Cabaret'];
const EVENT_TYPES = ['Internal meeting','Client meeting','Training / workshop','Interview','Board meeting','Town hall','Reception / networking'];

/* ---- catering templates (a building references one; admin can override) ----
   Multi-choice items expose choiceGroups: the orderer picks `pick` from each.
   cutoffHours = how far before the event the order must be placed.            */
function _menu(prefix, premium){
  const veg=t=>({name:t,veg:true}), non=t=>({name:t,veg:false});
  const buffet = {
    id:prefix+'-buffet', name:'Hot & Cold Buffet', type:'buffet', pricePerHead: premium?34:26, cutoffHours:24,
    choiceGroups:[
      {id:'g1',label:'Starters',pick:2,options:[veg('Garden salad'),veg('Soup of the day'),non('Chicken skewers'),veg('Hummus & flatbread'),non('Smoked salmon')]},
      {id:'g2',label:'Mains',   pick:2,options:[non('Roast chicken'),non('Grilled salmon'),veg('Vegetable lasagne'),non('Beef stir-fry'),veg('Paneer curry')]},
      {id:'g3',label:'Sides',   pick:2,options:[veg('Roast potatoes'),veg('Seasonal greens'),veg('Rice pilaf'),veg('Mixed leaf salad')]},
      {id:'g4',label:'Dessert', pick:1,options:[veg('Fruit platter'),veg('Cheesecake'),veg('Brownie bites')]},
    ],
  };
  const lunch = {
    id:prefix+'-lunch', name:'Working Lunch (individual orders)', type:'lunch', pricePerHead: premium?22:17, cutoffHours:18,
    choiceGroups:[
      {id:'g1',label:'Main',pick:1,options:[non('Chicken Caesar wrap'),veg('Falafel & halloumi wrap'),non('Roast beef sandwich'),veg('Caprese ciabatta'),non('Tuna nicoise box')]},
      {id:'g2',label:'Side',pick:1,options:[veg('Fruit pot'),veg('Crisps'),veg('Side salad')]},
      {id:'g3',label:'Drink',pick:1,options:[veg('Still water'),veg('Sparkling water'),veg('Orange juice'),veg('Cola')]},
    ],
  };
  const items = [
    buffet, lunch,
    {id:prefix+'-bev',  name:'Barista Coffee & Tea Cart', type:'beverage', pricePerHead:6, cutoffHours:2,  choiceGroups:[]},
    {id:prefix+'-snack',name:'Afternoon Snacks & Pastries',type:'snack',   pricePerHead:9, cutoffHours:4,  choiceGroups:[]},
  ];
  if(premium) items.push({id:prefix+'-canape',name:'Client Reception Canapés',type:'reception',pricePerHead:32,cutoffHours:48,choiceGroups:[
    {id:'g1',label:'Canapé selection',pick:4,options:[non('Mini beef sliders'),non('Prawn skewers'),veg('Caprese bites'),veg('Wild mushroom tartlet'),non('Chicken yakitori'),veg('Bruschetta')]},
  ]});
  return items;
}
const CATERING_TEMPLATES = {
  tpl_std:     { id:'tpl_std',     name:'Standard',         items:_menu('std',false) },
  tpl_premium: { id:'tpl_premium', name:'Premium / client', items:_menu('prm',true)  },
  tpl_lite:    { id:'tpl_lite',    name:'Lite (beverages & snacks)', items:[
    {id:'lite-bev',name:'Barista Coffee & Tea Cart',type:'beverage',pricePerHead:6,cutoffHours:2,choiceGroups:[]},
    {id:'lite-snack',name:'Afternoon Snacks & Pastries',type:'snack',pricePerHead:9,cutoffHours:4,choiceGroups:[]},
  ] },
};

/* ---- ancillary services (global) ---- */
const SERVICES = [
  { id:'s1', name:'AV Technician on standby',   price:120, confirmSla:4,  icon:'🎛️' },
  { id:'s2', name:'Video conferencing setup',   price:60,  confirmSla:2,  icon:'📹' },
  { id:'s3', name:'Room reset / deep clean',    price:45,  confirmSla:2,  icon:'🧹' },
  { id:'s4', name:'Reception & visitor escort', price:75,  confirmSla:4,  icon:'🛎️' },
  { id:'s5', name:'Whiteboard / flipchart pack',price:15,  confirmSla:1,  icon:'📝' },
  { id:'s6', name:'Translation / captioning',   price:200, confirmSla:24, icon:'🌐' },
];

/* ---- generate the estate ---- */
function buildEstate(){
  const r=_rng(1337); const buildings=[], spaces=[];
  const N=120; const tplKeys=Object.keys(CATERING_TEMPLATES);
  let spc=0;
  for(let i=0;i<N;i++){
    const loc=CITIES[i%CITIES.length];
    const bId='bld-'+_pad(i+1,3);
    const bName=`${_pick(BLD_NAMES,r)} ${_pick(BLD_SUFFIX,r)}`;
    const nFloors=_int(2,9,r);
    const tpl = tplKeys[i%tplKeys.length];
    const floors=[];
    for(let f=0;f<nFloors;f++){
      const level=f+1;
      const nSpaces=_int(2,7,r);
      const fId=`${bId}-f${level}`;
      for(let s=0;s<nSpaces;s++){
        const st=_pick(SPACE_TYPES,r);
        const cap=_int(st.cap[0],st.cap[1],r);
        const big=['Conference','Boardroom','Training','Theatre','Banquet'].includes(st.t);
        const ams=_pickN(AMENITIES, _int(3,6,r), r);
        if(big && r()<0.8 && !ams.includes('Catering-ready')) ams.push('Catering-ready');
        if(level>=Math.max(1,nFloors-1) && r()<0.5 && !ams.includes('Skyline view')) ams.push('Skyline view');
        spc++;
        spaces.push({
          id:`sp-${_pad(spc,5)}`, externalId:`SPC-${loc.code}-${_pad(spc,5)}`,
          name:_pick(ROOM_NAMES,r), commonName:_pick(ROOM_NAMES,r),
          type:st.t, capacity:cap, amenities:ams,
          setupMins:st.setup, teardownMins:st.teardown,
          buildingId:bId, buildingName:bName, city:loc.city, region:loc.region,
          floorId:fId, floor:level,
          rate: Math.round((20 + cap*6 + (big?60:0)) /5)*5, rating:(3.9+r()*1.1).toFixed(1)*1,
        });
      }
      floors.push({ id:fId, level, name:`Floor ${level}` });
    }
    buildings.push({
      id:bId, externalId:`BLD-${_pad(i+1,4)}`, name:bName, city:loc.city, region:loc.region,
      label:`${bName} · ${loc.city}`, floors, cateringTemplate:tpl,
    });
  }
  return { buildings, spaces };
}
const _estate = buildEstate();

/* ---- seed today's bookings + a couple of requests in a home building ---- */
function seedBookings(spaces){
  const home = spaces.filter(s=>s.buildingId==='bld-001');
  const big = home.filter(s=>s.capacity>=8);
  const mk=(i,sp,title,client,st,en,pax,status,cat,sv)=>({ id:'b'+(i+1), spaceId:sp.id, title, client, start:st, end:en, pax, status, catering:cat, services:sv, date:'2026-06-30', planner:'p1' });
  const b=[];
  if(big[0]) b.push(mk(0,big[0],'Acme Corp QBR','Acme Corp',9,11,14,'confirmed',[],['s2']));
  if(big[1]) b.push(mk(1,big[1],'Investor day','Northwind',10,16,22,'confirmed',[],['s1','s2']));
  if(big[2]) b.push(mk(2,big[2],'Design review','Internal',11,12,7,'tentative',[],['s5']));
  if(big[3]) b.push(mk(3,big[3],'Legal negotiation','Initech',9.5,12.5,9,'confirmed',[],['s6']));
  if(home[0]) b.push(mk(4,home[0],'Standup','Internal',9,9.5,5,'confirmed',[],[]));
  return b;
}

const DATA = {
  buildings: _estate.buildings,
  spaces: _estate.spaces,
  cateringTemplates: CATERING_TEMPLATES,
  cateringOverrides: {},          // buildingId -> items[]  (set via Catering Setup)
  services: SERVICES,
  setupTypes: SETUP_TYPES,
  eventTypes: EVENT_TYPES,
  amenities: AMENITIES,
  planners: [
    { id:'p1', name:'Ava Mendel',  role:'Workplace Experience Lead', avatar:'AM' },
    { id:'p2', name:'Tomás Reyes', role:'Facilities Coordinator',    avatar:'TR' },
  ],
  // allocation SLA (hours) used by the booking-journey timeline
  allocSla: 6,
  bookings: seedBookings(_estate.spaces),
  requests: [
    { id:'rq1', requester:'Jordan Lee', meeting:'Customer advisory board', eventType:'Client meeting', pax:18,
      date:'2026-06-30', start:14, end:17, buildingId:null, region:'Americas', preferredSpaceId:null,
      setup:'Boardroom', amenities:['VC suite'], catering:[], services:['s1','s2'],
      notes:'No building chosen — please allocate a client-grade room in New York.', status:'pending', allocatedSpaceId:null },
  ],
  insights: [
    { id:'i1', type:'request', icon:'📥', title:'Unallocated request needs a room',
      detail:'Jordan Lee’s “Customer advisory board” (18 pax, New York, no building chosen) is unallocated and starts 14:00 today. Allocate a client-grade room.',
      impact:'Avoids a no-room incident', confidence:0.9, action:'Allocate' },
    { id:'i2', type:'catering', icon:'🍽️', title:'Buffet cutoff approaching',
      detail:'Hot & Cold Buffet has a 24h order cutoff. Same-day buffet requests will be blocked — steer late bookers to the 2h beverage cart or 4h snacks.',
      impact:'Prevents catering failures', confidence:0.84, action:'Acknowledge' },
  ],

  // current user profile (employee). Center auto-fills on the selection screen.
  user: { name:'Jordan Lee', center:'Americas — New York', homeRegion:'Americas', favoriteBuildingId:null },
};
