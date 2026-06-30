# Convene — Conference Room Booking (clickable prototype)

**Professional UI with three themes** — switch live via the **Theme** swatches at the
bottom-left of the sidebar:
- **Corporate** — light, white surfaces, standard enterprise blue *(default)*
- **Slate** — light neutral with a calm indigo accent
- **Graphite** — a restrained professional dark (not neon)


A self-contained, **clickable HTML/CSS/JS prototype** — no build, no deps. Open
`index.html` in any browser. Switch between **Employee** and **Planner** with the
identity chip at the bottom-left.

```
prototype/
├── index.html   # app shell + screens
├── styles.css   # dark “workplace ops” theme
├── app.js       # wizard, ranking, availability, allocation, catering setup
├── data.js      # generated estate (120 buildings) + catering templates + SLAs
└── assets/      # screenshots
```

## Estate model — Buildings › Floors › Spaces (at scale)

The estate is **generated** so the prototype has realistic scale:

- **~120 buildings** across Americas / EMEA / APAC (searchable dropdown, favourites).
- Each building has **floors**, each floor has **spaces** (~1,500 spaces total).
- Each **space** carries: external ID, name / common name, **type**, **capacity**,
  **amenities**, and **setup / teardown** minutes — all notionally sourced from the
  **Space Management System** (mocked in `data.js`).

## Three ways to book (switch via the segmented control)

- **Guided wizard** — one decision per step; best for occasional users.
- **Express** — building search + live room grid + extras + totals on a single
  screen; fastest for power users.
- **Grid / calendar** — a rooms×hours availability grid for a building; click a
  free (green) slot to book. Busy/buffer cells are hatched, tight-capacity rooms
  amber. Clicking a slot drops you into the wizard's review (or services) step.

All three drive the same state and confirm logic.

## Book a Space — step-by-step wizard

1. **Details** — building (defaults to your **favourite ★**, or search 120
   buildings; leave blank to *Request a Room*), attendees, date, start/end,
   **setup type** (layout) and **event type**. Your **centre auto-fills** from
   your profile.
   - Building chosen → **Find rooms**. No building → **Request a room** (a planner
     allocates one in your centre).
2. **Choose a room** — all rooms in the building, AI-ranked, with availability that
   accounts for each room’s **setup/teardown buffer**; external ID, amenities and
   buffer times shown.
3. **Services** *(if “I need services & catering” is ticked)* — AV, VC, cleaning…
4. **Catering** *(same toggle)* — **per-building** menu (below).
5. **Review & confirm** — full summary, totals, and the **booking journey** with
   SLA timings. Confirms a booking, or submits a request.

## Catering — per building, multi-choice, with cutoffs

Set up under **Catering Setup** (planner) — a **master–detail admin hub**: searchable building list on the left, the selected building's full catering config on the right. Each building references a template
(Standard / Premium / Lite) and can be **overridden per building**. Items:

- **Multi-choice buffets & lunch orders** — the orderer picks N per group
  (e.g. Buffet → Starters pick 2, Mains pick 2, Sides pick 2, Dessert pick 1).
- Simpler **beverage / snack** items.
- Every item has an **order cutoff** that the booking flow **enforces**:
  a 24h buffet is **blocked for a same-day event** but available a few days out;
  a 2h coffee cart is fine same-day.

Catering Setup lets a planner edit cutoffs, add options to a choice group, and
add new items — saved per building.

## Setup & teardown time

Every space has **setup** and **teardown** minutes (Huddle 0/0 → Banquet 60/45).
A booking holds the room for `start − setup … end + teardown`; availability and
conflict detection use this **buffered window**, and the Planner Board draws the
buffer as a hatched band beside each booking.

## Requests → allocation

A request (no building chosen) lands in the planner **Requests** queue. The
planner sees AI-ranked rooms (filtered to the building, or the requester’s
region), confirms one, and it becomes a booking. Each request shows an **SLA
strip** (room / catering / AV / fully-confirmed).

## Booking journey & SLA timings

Every booking/request shows: submitted → room confirmation → catering
confirmation → AV booking → ready. Catering & AV run in parallel once the room is
secured, so **total = room confirmation + max(catering, AV)**. SLAs live in
`data.js` (`allocSla`, per-catering-type, `services[].confirmSla`).

## Admin & configuration (planner role)

- **Space Explorer** — a **Building › Floor › Room tree**; select any room to view/edit
  every attribute (name, common name, type, capacity, **setup/teardown**, rate,
  external ID) and toggle **amenities** from the catalog.
- **Amenities Catalog** — master list of amenities with full detail (category, icon,
  description, chargeable/bookable, and how many rooms use each); add new amenities.
- **Services by Building** — allocate which ancillary services each building offers
  (provider, category, price, SLA); only available services show in that building's
  booking flow.
- **Catering** — per building, assign **one or more caterers** (Metro, Gourmet Plate,
  Quick Bites, Green Leaf…), each with its own multi-choice menu and per-item order
  cutoffs. A building's caterers are **shown at the start of every booking** there.

## How this addresses Accruent EMS shortcomings

Reviews of EMS (G2 / TrustRadius / Gartner) repeatedly cite the same issues — this
prototype is designed to fix them:

| EMS shortcoming | Convene approach |
|---|---|
| Clunky, dated UI; steep learning curve | Clean, professional, themeable UI |
| Too many steps to book | Three journeys incl. one-screen **Express** and a **Grid** |
| Rigid data (long names crash it) | Plain text fields, no fragile limits; nothing crashes on input |
| Cumbersome navigation; buried space data | **Space Explorer** tree exposes every space attribute |
| Painful Outlook/Exchange setup, **no API** | Designed around system integrations (Space Mgmt, M365) + data layer |
| Complex admin config needing consultants | Simple per-building **Amenities / Services / Catering** screens |

## Where real data would come from

| Data | Source system |
|------|---------------|
| Buildings / floors / spaces / common names / amenities / setup-teardown | **Space Management System** |
| Live availability | Microsoft 365 / Google Workspace |
| Per-building catering menus | Caterer setup (admin) + caterer feed |
| Services (AV / IT / cleaning) | Ticketing |

All mocked in `data.js` so the flows are fully interactive offline.

## Best-in-class systems referenced
YAROOMS, Condeco, MRI Software, OfficeSpace, MazeMap; open-source
[LibreBooking](https://github.com/LibreBooking/librebooking).
