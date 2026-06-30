/* ============================================================
   Mock data layer
   Hydrated in production from internal systems:
   - Space/floor data  -> IWMS / facilities
   - Calendar/occupancy -> Microsoft 365 / Google Workspace
   - Catering menu      -> caterer "shop" feed
   - Services           -> AV / IT / cleaning / security ticketing
   ============================================================ */

const DATA = {
  /* --- Conference centres & their booking policy ---
     self         : employees pick a room and book instantly
     request_pref : employees request and MAY name a preferred room; a planner confirms
     allocate     : employees can only request a space; a planner allocates the room   */
  // allocSla = typical hours for a planner to confirm/allocate a room request
  centers: [
    { id:'c-hq',    name:'HQ Tower',                policy:'self',         allocSla:0, blurb:'Self-service — pick a room and book instantly.' },
    { id:'c-annex', name:'Annex',                   policy:'request_pref', allocSla:4, blurb:'Request a room; you may name a preferred one. A planner confirms.' },
    { id:'c-exec',  name:'Executive Client Centre', policy:'allocate',     allocSla:8, blurb:'Premium client suites — request a space; a planner allocates the room.' },
  ],

  // --- People ---
  planners: [
    { id:'p1', name:'Ava Mendel',  role:'Workplace Experience Lead', avatar:'AM' },
    { id:'p2', name:'Tomás Reyes', role:'Facilities Coordinator',    avatar:'TR' },
    { id:'p3', name:'Priya Nair',  role:'Catering Coordinator',      avatar:'PN' },
  ],

  // --- Catering menu ---  lead = order-ahead notice; confirmSla = caterer confirmation turnaround (hours)
  catering: [
    { id:'c1', name:'Barista Coffee & Tea Cart', price:6,  unit:'per person', lead:2,  confirmSla:1,  veg:true },
    { id:'c2', name:'Continental Breakfast',     price:14, unit:'per person', lead:12, confirmSla:4,  veg:true },
    { id:'c3', name:'Working Lunch Buffet',      price:24, unit:'per person', lead:24, confirmSla:8,  veg:true },
    { id:'c4', name:'Premium Boxed Lunch',       price:19, unit:'per person', lead:18, confirmSla:6,  veg:true },
    { id:'c5', name:'Afternoon Snack & Pastries',price:9,  unit:'per person', lead:4,  confirmSla:2,  veg:true },
    { id:'c6', name:'Client Reception Canapés',  price:32, unit:'per person', lead:48, confirmSla:24, veg:false },
  ],

  // --- Ancillary services ---  confirmSla = team confirmation turnaround (hours)
  services: [
    { id:'s1', name:'AV Technician on standby',   price:120, unit:'flat', confirmSla:4,  icon:'🎛️' },
    { id:'s2', name:'Video conferencing setup',   price:60,  unit:'flat', confirmSla:2,  icon:'📹' },
    { id:'s3', name:'Room reset / deep clean',    price:45,  unit:'flat', confirmSla:2,  icon:'🧹' },
    { id:'s4', name:'Reception & visitor escort', price:75,  unit:'flat', confirmSla:4,  icon:'🛎️' },
    { id:'s5', name:'Whiteboard / flipchart pack',price:15,  unit:'flat', confirmSla:1,  icon:'📝' },
    { id:'s6', name:'Translation / captioning',   price:200, unit:'flat', confirmSla:24, icon:'🌐' },
  ],

  // --- Rooms (centerId links to a centre's policy) ---
  rooms: [
    { id:'r1', name:'Summit',  centerId:'c-hq',    building:'HQ Tower', floor:14, capacity:16, layout:'Boardroom', img:'linear-gradient(135deg,#6366f1,#8b5cf6)', features:['4K display','Dual screen','VC suite','Catering-ready','Step-free'], av:'premium', natLight:true,  catering:true,  rate:180, rating:4.9, building_proximity:1 },
    { id:'r2', name:'Horizon', centerId:'c-hq',    building:'HQ Tower', floor:14, capacity:24, layout:'Theatre',   img:'linear-gradient(135deg,#0ea5e9,#22d3ee)', features:['Stage','PA system','VC suite','Catering-ready','Hearing loop','Step-free'], av:'premium', natLight:true, catering:true, rate:260, rating:4.8, building_proximity:1 },
    { id:'r3', name:'Atlas',   centerId:'c-hq',    building:'HQ Tower', floor:9,  capacity:8,  layout:'Conference',img:'linear-gradient(135deg,#f59e0b,#f97316)', features:['Display','VC suite','Whiteboard wall','Catering-ready'], av:'standard', natLight:true, catering:true, rate:90, rating:4.6, building_proximity:2 },
    { id:'r4', name:'Nimbus',  centerId:'c-hq',    building:'HQ Tower', floor:9,  capacity:6,  layout:'Huddle',    img:'linear-gradient(135deg,#10b981,#34d399)', features:['Display','VC suite','Whiteboard'], av:'standard', natLight:false, catering:false, rate:55, rating:4.4, building_proximity:2 },
    { id:'r8', name:'Aurora',  centerId:'c-hq',    building:'HQ Tower', floor:20, capacity:18, layout:'Boardroom', img:'linear-gradient(135deg,#a855f7,#ec4899)', features:['4K display','Dual screen','VC suite','Catering-ready','Skyline view','Step-free'], av:'premium', natLight:true, catering:true, rate:230, rating:5.0, building_proximity:1 },

    { id:'r6', name:'Cobalt',  centerId:'c-annex', building:'Annex',    floor:3,  capacity:12, layout:'Boardroom', img:'linear-gradient(135deg,#3b82f6,#6366f1)', features:['4K display','VC suite','Catering-ready','Step-free'], av:'premium', natLight:true, catering:true, rate:140, rating:4.7, building_proximity:4 },
    { id:'r7', name:'Pine',    centerId:'c-annex', building:'Annex',    floor:1,  capacity:4,  layout:'Huddle',    img:'linear-gradient(135deg,#14b8a6,#22d3ee)', features:['Display','Whiteboard'], av:'basic', natLight:false, catering:false, rate:35, rating:4.2, building_proximity:4 },

    { id:'r5',  name:'Vertex',  centerId:'c-exec', building:'Executive Client Centre', floor:2, capacity:40, layout:'Banquet',   img:'linear-gradient(135deg,#ec4899,#f43f5e)', features:['Stage','PA system','Catering kitchen','Catering-ready','Step-free','Hearing loop'], av:'premium', natLight:true, catering:true, rate:420, rating:4.7, building_proximity:3 },
    { id:'r9',  name:'Monaco',  centerId:'c-exec', building:'Executive Client Centre', floor:5, capacity:14, layout:'Boardroom', img:'linear-gradient(135deg,#f59e0b,#ec4899)', features:['4K display','Dual screen','VC suite','Catering-ready','Skyline view','Step-free'], av:'premium', natLight:true, catering:true, rate:300, rating:4.9, building_proximity:3 },
    { id:'r10', name:'Geneva',  centerId:'c-exec', building:'Executive Client Centre', floor:5, capacity:10, layout:'Conference',img:'linear-gradient(135deg,#8b5cf6,#22d3ee)', features:['4K display','VC suite','Catering-ready','Step-free'], av:'premium', natLight:true, catering:true, rate:240, rating:4.8, building_proximity:3 },
  ],

  // --- Existing confirmed bookings (today) ---
  bookings: [
    { id:'b1', roomId:'r1', title:'Acme Corp QBR',     start:9,   end:11,  planner:'p1', client:'Acme Corp', pax:14, status:'confirmed', catering:['c2'], services:['s2'], date:'2026-06-30' },
    { id:'b2', roomId:'r1', title:'Board sync',        start:13,  end:14.5,planner:'p1', client:'Internal',  pax:10, status:'confirmed', catering:['c1'], services:[],     date:'2026-06-30' },
    { id:'b3', roomId:'r2', title:'Investor day',      start:10,  end:16,  planner:'p2', client:'Northwind', pax:22, status:'confirmed', catering:['c3','c5'], services:['s1','s2'], date:'2026-06-30' },
    { id:'b4', roomId:'r3', title:'Design review',     start:11,  end:12,  planner:'p2', client:'Internal',  pax:7,  status:'tentative', catering:[], services:['s5'], date:'2026-06-30' },
    { id:'b5', roomId:'r5', title:'Partner reception', start:17,  end:20,  planner:'p3', client:'Globex',    pax:38, status:'confirmed', catering:['c6'], services:['s1','s4'], date:'2026-06-30' },
    { id:'b6', roomId:'r6', title:'Legal negotiation', start:9.5, end:12.5,planner:'p1', client:'Initech',   pax:9,  status:'confirmed', catering:['c1'], services:['s6'], date:'2026-06-30' },
    { id:'b7', roomId:'r8', title:'Exec offsite',      start:8.5, end:17,  planner:'p1', client:'Internal',  pax:16, status:'confirmed', catering:['c2','c3'], services:['s1'], date:'2026-06-30' },
    { id:'b8', roomId:'r3', title:'Vendor pitch',      start:14,  end:15.5,planner:'p2', client:'Soylent',   pax:6,  status:'confirmed', catering:['c5'], services:[],     date:'2026-06-30' },
    { id:'b9', roomId:'r4', title:'Standup',           start:9,   end:9.5, planner:'p2', client:'Internal',  pax:5,  status:'confirmed', catering:[], services:[],         date:'2026-06-30' },
  ],

  // --- Pending room requests awaiting planner allocation ---
  requests: [
    { id:'rq1', requester:'Jordan Lee', meeting:'Customer advisory board', audience:'External client', pax:18, date:'2026-06-30', start:14, end:17,
      centerId:'c-exec', preferredRoomId:null, features:['VC suite','catering'], catering:['c3'], services:['s1','s2'], notes:'Premium feel, working lunch, needs AV support.', status:'pending', allocatedRoomId:null },
    { id:'rq2', requester:'Sam Ortega', meeting:'Partnership kickoff', audience:'External client', pax:10, date:'2026-06-30', start:10, end:11.5,
      centerId:'c-annex', preferredRoomId:'r6', features:['VC suite'], catering:['c1'], services:[], notes:'Would love Cobalt if free.', status:'pending', allocatedRoomId:null },
  ],

  // --- AI planner insights ---
  insights: [
    { id:'i1', type:'optimize',   icon:'📉', title:'Consolidate under-filled bookings',
      detail:'“Vendor pitch” (6 pax in Atlas/8) and “Design review” (7 pax) overlap 11:00–12:00. Move Design review to Nimbus to free a catering-ready room for an inbound client request.',
      impact:'Frees 1 catering-ready room', confidence:0.86, action:'Rebook' },
    { id:'i2', type:'catering',   icon:'🍽️', title:'Catering lead-time risk',
      detail:'Globex “Partner reception” starts 17:00 today and requires Reception Canapés (48h lead). Order was placed 41h ago — confirm with caterer now or switch to Snack & Pastries (4h lead).',
      impact:'Prevents service failure', confidence:0.93, action:'Notify caterer' },
    { id:'i3', type:'request',    icon:'📥', title:'Aged request needs allocation',
      detail:'Jordan Lee’s “Customer advisory board” (18 pax, Executive Client Centre) is unallocated and starts 14:00 today. Monaco is too small (14); Vertex fits and is free. Allocate now.',
      impact:'Avoids a no-room incident', confidence:0.9, action:'Allocate' },
    { id:'i4', type:'utilization',icon:'🏢', title:'Low utilisation — Annex floor 1',
      detail:'Pine (Annex/1) is booked 8% this week vs 64% HQ average. Route small internal huddles here to protect premium client inventory.',
      impact:'Protects premium inventory', confidence:0.80, action:'Set routing rule' },
  ],
};
