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
// taxRate = combined local indirect-tax rate applied to the booking subtotal.
const CITIES = [
  {city:'New York',     region:'Americas',code:'NYC',country:'United States',state:'New York',     taxLabel:'Sales tax',       taxRate:0.08875},
  {city:'San Francisco',region:'Americas',code:'SFO',country:'United States',state:'California',    taxLabel:'Sales tax',       taxRate:0.08625},
  {city:'Chicago',      region:'Americas',code:'CHI',country:'United States',state:'Illinois',      taxLabel:'Sales tax',       taxRate:0.1025},
  {city:'Austin',       region:'Americas',code:'AUS',country:'United States',state:'Texas',         taxLabel:'Sales tax',       taxRate:0.0825},
  {city:'Toronto',      region:'Americas',code:'YYZ',country:'Canada',       state:'Ontario',       taxLabel:'HST',             taxRate:0.13},
  {city:'São Paulo',    region:'Americas',code:'GRU',country:'Brazil',       state:'São Paulo',     taxLabel:'ICMS',            taxRate:0.18},
  {city:'London',       region:'EMEA',    code:'LON',country:'United Kingdom',state:'England',      taxLabel:'VAT',             taxRate:0.20},
  {city:'Dublin',       region:'EMEA',    code:'DUB',country:'Ireland',      state:'Leinster',      taxLabel:'VAT',             taxRate:0.23},
  {city:'Paris',        region:'EMEA',    code:'PAR',country:'France',       state:'Île-de-France', taxLabel:'TVA',             taxRate:0.20},
  {city:'Berlin',       region:'EMEA',    code:'BER',country:'Germany',      state:'Berlin',        taxLabel:'USt',             taxRate:0.19},
  {city:'Amsterdam',    region:'EMEA',    code:'AMS',country:'Netherlands',  state:'North Holland', taxLabel:'BTW',             taxRate:0.21},
  {city:'Madrid',       region:'EMEA',    code:'MAD',country:'Spain',        state:'Madrid',        taxLabel:'IVA',             taxRate:0.21},
  {city:'Dubai',        region:'EMEA',    code:'DXB',country:'UAE',          state:'Dubai',         taxLabel:'VAT',             taxRate:0.05},
  {city:'Singapore',    region:'APAC',    code:'SIN',country:'Singapore',    state:'Singapore',     taxLabel:'GST',             taxRate:0.09},
  {city:'Tokyo',        region:'APAC',    code:'TYO',country:'Japan',        state:'Tokyo',         taxLabel:'Consumption tax', taxRate:0.10},
  {city:'Sydney',       region:'APAC',    code:'SYD',country:'Australia',    state:'New South Wales',taxLabel:'GST',            taxRate:0.10},
  {city:'Bangalore',    region:'APAC',    code:'BLR',country:'India',        state:'Karnataka',     taxLabel:'GST',             taxRate:0.18},
  {city:'Hong Kong',    region:'APAC',    code:'HKG',country:'Hong Kong SAR',state:'Hong Kong',     taxLabel:'No sales tax',    taxRate:0.0},
];

// which layouts each space type supports (the per-room multi-select default)
const SETUP_BY_TYPE = {
  'Huddle':      ['As-is / existing','Boardroom'],
  'Meeting Room':['As-is / existing','Boardroom','U-shape'],
  'Conference':  ['As-is / existing','Boardroom','U-shape','Hollow square'],
  'Boardroom':   ['As-is / existing','Boardroom','U-shape','Hollow square'],
  'Training':    ['As-is / existing','Classroom','U-shape','Cabaret','Theatre'],
  'Theatre':     ['As-is / existing','Theatre','Classroom','Cabaret'],
  'Banquet':     ['As-is / existing','Banquet','Cabaret','Theatre','Classroom'],
};
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

/* ---- ancillary services (catalog; availability is set per building) ---- */
const SERVICES = [
  { id:'s1', name:'AV Technician on standby',   price:120, confirmSla:4,  icon:'🎛️', provider:'In-house AV',            category:'AV' },
  { id:'s2', name:'Video conferencing setup',   price:60,  confirmSla:2,  icon:'📹', provider:'In-house AV',            category:'AV' },
  { id:'s3', name:'Room reset / deep clean',    price:45,  confirmSla:2,  icon:'🧹', provider:'Facilities',             category:'Facilities' },
  { id:'s4', name:'Reception & visitor escort', price:75,  confirmSla:4,  icon:'🛎️', provider:'Front of house',         category:'Hospitality' },
  { id:'s5', name:'Whiteboard / flipchart pack',price:15,  confirmSla:1,  icon:'📝', provider:'Facilities',             category:'Supplies' },
  { id:'s6', name:'Translation / captioning',   price:200, confirmSla:24, icon:'🌐', provider:'Language services (vendor)', category:'Specialist' },
  { id:'s7', name:'Hybrid event production',    price:450, confirmSla:48, icon:'🎥', provider:'Events team',            category:'AV' },
  { id:'s8', name:'On-site IT support',         price:90,  confirmSla:3,  icon:'💻', provider:'IT service desk',        category:'IT' },
];

/* ---- amenity catalog (master list with rich detail) ---- */
const AMENITY_META = {
  '4K display':        {category:'AV',           icon:'🖥️', desc:'Wall-mounted 4K display with HDMI & USB-C',   chargeable:false, bookable:false},
  'Dual screen':       {category:'AV',           icon:'🖥️', desc:'Two displays for side-by-side content',       chargeable:false, bookable:false},
  'VC suite':          {category:'AV',           icon:'📹', desc:'Integrated video-conferencing (Teams/Zoom)',  chargeable:false, bookable:false},
  'Dedicated AV booth':{category:'AV',           icon:'🎛️', desc:'Control booth for produced sessions',         chargeable:true,  bookable:true},
  'PA system':         {category:'AV',           icon:'🔊', desc:'Public-address / sound reinforcement',        chargeable:false, bookable:false},
  'Phone for dial-in': {category:'AV',           icon:'☎️', desc:'Conference phone for audio dial-in',          chargeable:false, bookable:false},
  'Hearing loop':      {category:'Accessibility',icon:'🦻', desc:'Induction loop for hearing aids',             chargeable:false, bookable:false},
  'Step-free access':  {category:'Accessibility',icon:'♿', desc:'Level / lift access, no steps',               chargeable:false, bookable:false},
  'Skyline view':      {category:'Comfort',      icon:'🌆', desc:'External windows with a city view',           chargeable:false, bookable:false},
  'Natural light':     {category:'Comfort',      icon:'🌞', desc:'Daylight from external windows',              chargeable:false, bookable:false},
  'Coffee station':    {category:'Comfort',      icon:'☕', desc:'In-room hot-drinks station',                  chargeable:false, bookable:false},
  'Whiteboard wall':   {category:'Collaboration',icon:'🧑‍🏫', desc:'Floor-to-ceiling writable wall',             chargeable:false, bookable:false},
  'Stage':             {category:'Layout',       icon:'🎤', desc:'Raised stage / podium area',                  chargeable:false, bookable:false},
  'Catering-ready':    {category:'Catering',     icon:'🍽️', desc:'Cleared surfaces & power for catering setup', chargeable:false, bookable:false},
};
const amenityCatalog = AMENITIES.map((n,i)=>({ id:'am'+_pad(i+1,2), name:n, ...(AMENITY_META[n]||{category:'General',icon:'•',desc:'',chargeable:false,bookable:false}) }));

/* ---- caterers (vendors); buildings are assigned one or more ---- */
const CATERERS = {
  cat_metro:   { id:'cat_metro',   name:'Metro Catering Co',  cuisine:'International buffet & working lunch', rating:4.5, phone:'+1 555 0100', hours:'Mon–Fri 07:00–17:00', items:_menu('metro',false) },
  cat_gourmet: { id:'cat_gourmet', name:'Gourmet Plate',      cuisine:'Premium / fine dining & receptions',  rating:4.8, phone:'+1 555 0144', hours:'Mon–Sat 08:00–20:00', items:_menu('gourmet',true) },
  cat_quick:   { id:'cat_quick',   name:'Quick Bites',        cuisine:'Beverages, snacks & grab-and-go',     rating:4.3, phone:'+1 555 0188', hours:'Daily 07:00–18:00', items:[
    {id:'quick-bev',  name:'Barista Coffee & Tea Cart', type:'beverage', pricePerHead:6, cutoffHours:2, choiceGroups:[]},
    {id:'quick-snack',name:'Afternoon Snacks & Pastries',type:'snack',   pricePerHead:9, cutoffHours:4, choiceGroups:[]},
  ] },
  cat_green:   { id:'cat_green',   name:'Green Leaf Kitchen', cuisine:'Vegetarian & vegan',                  rating:4.7, phone:'+1 555 0166', hours:'Mon–Fri 08:00–16:00', items:_menu('green',false) },
};

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
          setupTypes:[...(SETUP_BY_TYPE[st.t]||['As-is / existing'])],
          buildingId:bId, buildingName:bName, city:loc.city, region:loc.region,
          floorId:fId, floor:level,
          rate: Math.round((20 + cap*6 + (big?60:0)) /5)*5, rating:(3.9+r()*1.1).toFixed(1)*1,
        });
      }
      floors.push({ id:fId, level, name:`Floor ${level}` });
    }
    buildings.push({
      id:bId, externalId:`BLD-${_pad(i+1,4)}`, name:bName, city:loc.city, region:loc.region,
      country:loc.country, state:loc.state, taxLabel:loc.taxLabel, taxRate:loc.taxRate,
      label:`${bName} · ${loc.city}`, floors, cateringTemplate:tpl,
    });
  }
  return { buildings, spaces };
}
const _estate = buildEstate();

/* ---- assign caterers + service availability per building ---- */
function assignVendors(buildings){
  const bc={}, bs={}; const allSvc=SERVICES.map(s=>s.id);
  buildings.forEach((b,i)=>{
    const list=['cat_metro'];
    if(i%2) list.push('cat_gourmet'); else list.push('cat_quick');
    if(i%3===0) list.push('cat_green');
    bc[b.id]=list;
    bs[b.id]= (i%4===0) ? allSvc.filter(x=>x!=='s6'&&x!=='s7') : (i%5===0 ? allSvc.filter(x=>x!=='s7') : allSvc);
  });
  return {bc,bs};
}
const _vend=assignVendors(_estate.buildings);

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
  caterers: CATERERS,
  buildingCaterers: _vend.bc,     // buildingId -> [catererId]
  catererOverrides: {},           // catererId -> items[]  (menu edits)
  buildingServices: _vend.bs,     // buildingId -> [serviceId] available
  amenityCatalog: amenityCatalog, // master amenity list
  spaceOverrides: {},             // spaceId -> edited fields
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
