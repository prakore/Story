# Convene — Client Conference Room Booking (clickable prototype)

A self-contained, **clickable HTML/CSS/JS prototype** of a best-in-class client
conference-room booking suite with **AI room recommendation**, **planner
management** and an **AI recommendations** screen. No build step, no
dependencies — open `index.html` in any browser.

```
prototype/
├── index.html   # app shell + all screens
├── styles.css   # dark “workplace ops” theme
├── app.js       # navigation, AI recommender, planner, booking drawer
├── data.js      # mock data (rooms, catering, services, bookings, insights)
└── assets/      # screenshots of each screen
```

## Screens (all clickable)

1. **Dashboard** — KPIs, “needs your attention” AI insights, top rooms.
2. **AI Room Finder** — describe a meeting (attendees, client tier, building,
   must-have features, free-text notes) → ranked rooms with a **% match score
   and a plain-English “why”**. Transparent weighted scoring in `recommend()`.
3. **Rooms** — full catalogue, synced (conceptually) from IWMS + M365.
4. **Planner Board** — timeline grid (rooms × 08:00–20:00), bookings
   color-coded by status, planner workload, booked value incl. catering/services.
   Click a block → booking detail; click an empty slot → draft a new booking.
5. **Recommendations** — proactive planner intelligence (utilisation, catering
   lead-time risk, VIP upsell, sustainability) each with a confidence bar and a
   one-click action.
6. **Booking drawer** — add **catering** and **services** with live totals,
   then confirm — the new booking appears on the Planner Board.

## How the “AI” works (prototype)

`app.js → recommend(req)` scores every room with a transparent, weighted model
so each result is **explainable** (capacity fit, required features, client tier
→ premium AV, building proximity, rating, natural light). Swap this function for
a real ranking/LLM service without touching the UI. Smart prefill also suggests a
working-lunch menu when the brief mentions lunch, and AV standby for Tier-1 clients.

## Where real data would come from

This mirrors how the best-in-class systems researched (YAROOMS, Condeco, MRI
Software, OfficeSpace, MazeMap) integrate internal systems:

| Data | Source system |
|------|---------------|
| Space / floor attributes | IWMS / facilities (Condeco, MRI, archibus) |
| Live availability | Microsoft 365 / Google Workspace 2-way calendar sync |
| Catering menu | Caterer product feed (MazeMap “shop” model) |
| Ancillary services | AV / IT / cleaning / security ticketing |

In this prototype everything is mocked in `data.js` so the flows are fully
interactive offline.

## Refinements (v1.1)

- **Realistic, spread scores** — replaced saturated "everything's 99%" with a
  weighted model that produces a believable range (e.g. 80% → 9%).
- **Time-aware availability** — the finder takes a start time + duration and
  marks rooms **● Available / ● Busy at that time**, naming the clashing booking.
- **Conflict-blocking** — the booking drawer checks for overlaps live, shows a
  warning, and disables *Confirm* until the time is free (also enforces 08:00–20:00).
- **Click-to-time on the planner** — click an empty slot and the start time is
  inferred from where you clicked.
- **Persistence** — bookings & dismissed insights survive a page reload via
  `localStorage`; *Reset demo* on the Planner Board restores the seed data.

## Best-in-class systems referenced

- **Commercial:** YAROOMS (Open API + services-at-booking), Condeco & MRI
  Software (enterprise catering/AV provider workflows), OfficeSpace, MazeMap.
- **Open source to reuse:** [LibreBooking](https://github.com/LibreBooking/librebooking)
  (PHP, GPL-3.0, REST API, custom resource attributes for catering/services).
