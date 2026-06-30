/* ============================================================
   Mock data layer
   In a real deployment this is hydrated from internal systems:
   - Space/floor data  -> IWMS / facilities (e.g. Condeco, MRI, archibus)
   - Calendar/occupancy -> Microsoft 365 / Google Workspace
   - Catering menu      -> caterer "shop" feed (MazeMap-style)
   - Services           -> AV, IT, cleaning, security ticketing
   ============================================================ */

const DATA = {
  // --- People / planners (workspace experience managers) ---
  planners: [
    { id: 'p1', name: 'Ava Mendel',   role: 'Workplace Experience Lead', avatar: 'AM', load: 12 },
    { id: 'p2', name: 'Tomás Reyes',  role: 'Facilities Coordinator',     avatar: 'TR', load: 7  },
    { id: 'p3', name: 'Priya Nair',   role: 'Catering Coordinator',       avatar: 'PN', load: 9  },
  ],

  // --- Catering menu (would come from caterer feed) ---
  catering: [
    { id: 'c1', name: 'Barista Coffee & Tea Cart', price: 6,  unit: 'per person', lead: 2,  tags: ['beverage'],  veg: true },
    { id: 'c2', name: 'Continental Breakfast',      price: 14, unit: 'per person', lead: 12, tags: ['breakfast'], veg: true },
    { id: 'c3', name: 'Working Lunch Buffet',       price: 24, unit: 'per person', lead: 24, tags: ['lunch'],     veg: true },
    { id: 'c4', name: 'Premium Boxed Lunch',        price: 19, unit: 'per person', lead: 18, tags: ['lunch'],     veg: true },
    { id: 'c5', name: 'Afternoon Snack & Pastries', price: 9,  unit: 'per person', lead: 4,  tags: ['snack'],     veg: true },
    { id: 'c6', name: 'Client Reception Canapés',   price: 32, unit: 'per person', lead: 48, tags: ['reception'], veg: false },
  ],

  // --- Ancillary services ---
  services: [
    { id: 's1', name: 'AV Technician on standby',     price: 120, unit: 'flat',        icon: '🎛️' },
    { id: 's2', name: 'Video conferencing setup',     price: 60,  unit: 'flat',        icon: '📹' },
    { id: 's3', name: 'Room reset / deep clean',      price: 45,  unit: 'flat',        icon: '🧹' },
    { id: 's4', name: 'Reception & visitor escort',   price: 75,  unit: 'flat',        icon: '🛎️' },
    { id: 's5', name: 'Whiteboard / flipchart pack',  price: 15,  unit: 'flat',        icon: '📝' },
    { id: 's6', name: 'Translation / captioning',     price: 200, unit: 'flat',        icon: '🌐' },
  ],

  // --- Rooms (would come from IWMS / floor data) ---
  rooms: [
    {
      id: 'r1', name: 'Summit', building: 'HQ Tower', floor: 14, capacity: 16,
      layout: 'Boardroom', img: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
      features: ['4K display', 'Dual screen', 'VC suite', 'Catering-ready', 'Step-free'],
      av: 'premium', natLight: true, catering: true, rate: 180, rating: 4.9, building_proximity: 1,
    },
    {
      id: 'r2', name: 'Horizon', building: 'HQ Tower', floor: 14, capacity: 24,
      layout: 'Theatre', img: 'linear-gradient(135deg,#0ea5e9,#22d3ee)',
      features: ['Stage', 'PA system', 'VC suite', 'Catering-ready', 'Hearing loop', 'Step-free'],
      av: 'premium', natLight: true, catering: true, rate: 260, rating: 4.8, building_proximity: 1,
    },
    {
      id: 'r3', name: 'Atlas', building: 'HQ Tower', floor: 9, capacity: 8,
      layout: 'Conference', img: 'linear-gradient(135deg,#f59e0b,#f97316)',
      features: ['Display', 'VC suite', 'Whiteboard wall', 'Catering-ready'],
      av: 'standard', natLight: true, catering: true, rate: 90, rating: 4.6, building_proximity: 2,
    },
    {
      id: 'r4', name: 'Nimbus', building: 'HQ Tower', floor: 9, capacity: 6,
      layout: 'Huddle', img: 'linear-gradient(135deg,#10b981,#34d399)',
      features: ['Display', 'VC suite', 'Whiteboard'],
      av: 'standard', natLight: false, catering: false, rate: 55, rating: 4.4, building_proximity: 2,
    },
    {
      id: 'r5', name: 'Vertex', building: 'Annex', floor: 2, capacity: 40,
      layout: 'Banquet', img: 'linear-gradient(135deg,#ec4899,#f43f5e)',
      features: ['Stage', 'PA system', 'Catering kitchen', 'Catering-ready', 'Step-free', 'Hearing loop'],
      av: 'premium', natLight: true, catering: true, rate: 420, rating: 4.7, building_proximity: 4,
    },
    {
      id: 'r6', name: 'Cobalt', building: 'Annex', floor: 3, capacity: 12,
      layout: 'Boardroom', img: 'linear-gradient(135deg,#3b82f6,#6366f1)',
      features: ['4K display', 'VC suite', 'Catering-ready', 'Step-free'],
      av: 'premium', natLight: true, catering: true, rate: 140, rating: 4.7, building_proximity: 4,
    },
    {
      id: 'r7', name: 'Pine', building: 'Annex', floor: 1, capacity: 4,
      layout: 'Huddle', img: 'linear-gradient(135deg,#14b8a6,#22d3ee)',
      features: ['Display', 'Whiteboard'],
      av: 'basic', natLight: false, catering: false, rate: 35, rating: 4.2, building_proximity: 4,
    },
    {
      id: 'r8', name: 'Aurora', building: 'HQ Tower', floor: 20, capacity: 18,
      layout: 'Boardroom', img: 'linear-gradient(135deg,#a855f7,#ec4899)',
      features: ['4K display', 'Dual screen', 'VC suite', 'Catering-ready', 'Skyline view', 'Step-free'],
      av: 'premium', natLight: true, catering: true, rate: 230, rating: 5.0, building_proximity: 1,
    },
  ],

  // --- Existing bookings for the planner timeline (today) ---
  // start/end are 24h decimal hours
  bookings: [
    { id: 'b1', roomId: 'r1', title: 'Acme Corp QBR',        start: 9,    end: 11,   planner: 'p1', client: 'Acme Corp',    pax: 14, status: 'confirmed', catering: ['c2'], services: ['s2'] },
    { id: 'b2', roomId: 'r1', title: 'Board sync',           start: 13,   end: 14.5, planner: 'p1', client: 'Internal',     pax: 10, status: 'confirmed', catering: ['c1'], services: [] },
    { id: 'b3', roomId: 'r2', title: 'Investor day',         start: 10,   end: 16,   planner: 'p2', client: 'Northwind',    pax: 22, status: 'confirmed', catering: ['c3','c5'], services: ['s1','s2'] },
    { id: 'b4', roomId: 'r3', title: 'Design review',        start: 11,   end: 12,   planner: 'p2', client: 'Internal',     pax: 7,  status: 'tentative', catering: [], services: ['s5'] },
    { id: 'b5', roomId: 'r5', title: 'Partner reception',    start: 17,   end: 20,   planner: 'p3', client: 'Globex',       pax: 38, status: 'confirmed', catering: ['c6'], services: ['s1','s4'] },
    { id: 'b6', roomId: 'r6', title: 'Legal negotiation',    start: 9.5,  end: 12.5, planner: 'p1', client: 'Initech',      pax: 9,  status: 'confirmed', catering: ['c1'], services: ['s6'] },
    { id: 'b7', roomId: 'r8', title: 'Exec offsite',         start: 8.5,  end: 17,   planner: 'p1', client: 'Internal',     pax: 16, status: 'confirmed', catering: ['c2','c3'], services: ['s1'] },
    { id: 'b8', roomId: 'r3', title: 'Vendor pitch',         start: 14,   end: 15.5, planner: 'p2', client: 'Soylent',      pax: 6,  status: 'confirmed', catering: ['c5'], services: [] },
    { id: 'b9', roomId: 'r4', title: 'Standup',             start: 9,    end: 9.5,  planner: 'p2', client: 'Internal',     pax: 5,  status: 'confirmed', catering: [], services: [] },
  ],

  // --- AI-surfaced planner recommendations / insights ---
  insights: [
    { id: 'i1', type: 'optimize',   icon: '📉', title: 'Consolidate under-filled bookings',
      detail: '“Vendor pitch” (6 pax in Atlas/8) and “Design review” (7 pax) overlap 11:00–12:00. Move Design review to Nimbus to free a catering-ready room for an inbound client request.',
      impact: 'Frees 1 catering-ready room', confidence: 0.86, action: 'Rebook' },
    { id: 'i2', type: 'catering',   icon: '🍽️', title: 'Catering lead-time risk',
      detail: 'Globex “Partner reception” starts 17:00 today and requires Reception Canapés (48h lead). Order was placed 41h ago — confirm with caterer now or switch to Snack & Pastries (4h lead).',
      impact: 'Prevents service failure', confidence: 0.93, action: 'Notify caterer' },
    { id: 'i3', type: 'upsell',     icon: '✨', title: 'Experience upgrade for VIP client',
      detail: 'Acme Corp QBR is a Tier-1 account with no AV technician booked. Similar Tier-1 sessions add an AV tech 78% of the time. Suggest adding AV standby (+$120).',
      impact: '+$120 · higher CSAT', confidence: 0.71, action: 'Suggest add-on' },
    { id: 'i4', type: 'utilization', icon: '🏢', title: 'Low utilisation — Annex floor 1',
      detail: 'Pine (Annex/1) is booked 8% this week vs 64% HQ average. Route small internal huddles here to protect premium client inventory in HQ Tower.',
      impact: 'Protects premium inventory', confidence: 0.80, action: 'Set routing rule' },
    { id: 'i5', type: 'sustainability', icon: '🌱', title: 'Right-size for energy savings',
      detail: '“Standup” (5 pax) is in Nimbus but a 4-seat huddle (Pine) covers it. Right-sizing 3 recurring meetings cuts HVAC load on floor 9 by ~11%.',
      impact: '~11% HVAC saving', confidence: 0.68, action: 'Right-size' },
  ],
};
