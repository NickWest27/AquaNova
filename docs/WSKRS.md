# WSKRs — design and status

Last updated: 2026-11-24. Part of the document set listed in `DEVELOPMENT.md`. Code: `tablet/js/sim.js` (model), `stations/wskr.js` (page), `nd.js` (chart), `craftview.js` (craft page and corner readouts), `contacts.js` (contact list and selection), `stations/sensors.js` (Sensors console tabs), `stations/crew.js` (orders), `science.js` (battery research), `searchPattern.js` and `searchDialog.js` (search patterns). Tests: `tools/wskr_page_test.py` (page layout, select, deselect, commands), `wskr_orders_test.py`, `wskr_chase_test.py` (speed, battery draw, link loss, readouts, selection), `searchpattern_test.py`, `science_test.py`, `notices_test.py`, `cruise_test.py`, `status_course_test.py`.

## What they are
Autonomous remote sensors, up to 4, launched from the Sensors console or the Launch Bay. Fixed names and small edges: **Scout** (charts +0.6 nm further out), **Lantern** (holds the lead, ahead of the ship), **Drifter** (swings wide, drifting in and out of the loose formation), **Sprat** (19 kt, finishes a site in 70 s). They scan and mark sites; they cannot take samples. Routed round land (floor at least 3 m). Scan (chart) ring radius 3 nm (`WSKR_CHART_NM`). On the nav display they are labelled **Sc, La, Dr, Sp**.

## The WSKR status page (owner, 2026-11-19; built from the concept art)
Sensors → **WSKRs** tab (`stations/wskr.js`). Three areas:
- **Left half: navigation chart** (`nd.js` options `trackUp`, `bigWskr`, `focus`, `onWskr`). **Aqua Nova track up**: the ship points up and the contours turn with her heading. WSKRs show as diamonds with their two-letter code; the selected one has a ring. Zoom − and + (1 to 16 nm). Tapping a diamond selects that WSKR.
- **Right half: tiles.** Nothing selected: one tile per slot (four), each with the diamond, `WSKR #n: NAME`, position, order, battery % and time left, link state. A racked WSKR shows its charge in the bay and time to full. **Tap a tile to select.**
- **Selected:** the chart **centres on that WSKR** (Aqua Nova still track up, shown where she is) and the right side becomes **one big tile**: perk text, the WSKR's synthetic view with the two readouts, then position, bearing and range from Aqua Nova, order, depth, speed, heading, link, battery, when it recalls itself, cell life, and a note (out of range, relay, task). **Tap the big tile again to deselect.**
- **Bottom: commands.** Nothing selected = **ALL WSKRS**: Deploy WSKR, Recall all, Hold formation, Search pattern, **Pattern…**, Set up a relay, formation Loose/Tight, depth Auto/Shallow/Deep. One selected = **that WSKR**: Hold formation, Manual control (adds Turn left, Turn right, Slower, Faster, Stop, Super cruise), Search pattern, **Pattern…**, Relay, **Investigate <selected contact>** (`sim.taskWskr(poi, n)`), Recall. A racked slot shows Launch. Orders need the research "WSKR formations and orders" when gates are on (Recall and Launch always work).
- Not built here: dragging the chart, tapping contacts on this chart.

## Speed and battery (owner, 2026-11-19)
- **Base speed 16 kt** (`WSKR_KT`; Sprat 19). **Recall boosts it 1.25 times (20 kt, Sprat 24)** (`WSKR_BOOST`). An escorting or relaying WSKR that falls more than 0.3 nm behind a ship going faster than (base − 3) kt boosts too, up to ship speed + 4 and never above the boost speed. `w.kt` holds the speed now; `wskrCraft().kt` reports it.
- **Battery draw rises with the square of speed** against the craft's own base speed: 20 kt on a 16 kt craft draws 1.56 times. Other draws: relay 0.6, holding station 0.8, moving 1.0, manual 0.7 to 1.3 with throttle, super speed x2.2 (`wskrDraw(w)`).
- **Super cruise:** **120 kt** (`WSKR_SUPER_KT`, times the craft's speed edge). A WSKR goes to super speed when the ship is in super cruise or its goal is more than 6 nm away (`WSKR_FAR_NM`). Manual control has a **Super cruise** toggle. The ship's own super cruise (100 kt) is in `TIME_CRUISE_AND_START.md`.
- **Battery life: 6 hours** at normal draw to start. **Research raises it: WSKR long-life cells (3 points) gives 12 h; WSKR deep-cycle cells (5 points, needs the 12 h research) gives 24 h** (`science.js` topics `wskr-battery-12`, `wskr-battery-24`; `sim.batteryHours()`; `wskrBatteryHours()`). Draw and minutes-left use the researched figure. At **15%** the WSKR is recalled on its own; at 0% it is **adrift** (`dead`) and is recovered when the ship comes within 0.15 nm. **A racked WSKR recharges in 2 h for a full charge**, in proportion to what was used (`LAUNCH_BAY_AND_SHUTTLE.md`). Battery is saved.
- **Battery time left:** each tile reads `BAT 78% · 4 h 41 min left`; the big tile adds when it comes home by itself. `wskrMinutes(w)` gives game minutes to empty and to the 15% recall at the **current** draw.

## Control link, losing it, surfacing (owner, 2026-11-19)
- The link reaches **10 nm** from the ship or a relay WSKR (`WSKR_LINK_NM`). `sim.wskrLink(w)` returns `{ nm, max, raw, ok, surfaced }` (`raw` = in range).
- **Out of range:** the WSKR keeps its order. Recall, search, task and hold orders never need the link. Only manual steering is refused when it would go farther out. The tile reads `Out of link range (12.4 of 10 nm). Surfaces in N min`.
- **Loss timer:** when the link drops the WSKR starts a timer (`w.lostAt`, game clock) and ARIA's sensors officer says so. After **10 game minutes** (`WSKR_LOST_MIN`) without contact it **surfaces** (`w.surfaced`; depth 1 m via `wskrDepthFor`), talks over the surface link (`ok` is true, so manual control works), and says it is calling in. When it is back in range it dives to its layer again and reports. Events: `wskr-link-lost`, `wskr-surfaced`, `wskr-link-back`. Not saved: the timer and surfaced flag reset on a reload.
- A **relay** extends the range only if it is near the far WSKR. A relay follows the ship, so today it adds almost nothing.

## Craft view readouts and contact selection (owner, 2026-11-19)
- **Readouts** over the WSKR synthetic view (`craftview.js`, option `readouts`; option `only:'synth'` shows just the synthetic view, used on the WSKR page), each stacked **arrow, name, BRG, RNG**: bottom left **AQUA NOVA** (green arrow), bottom right the **selected contact** (yellow arrow, "NO CONTACT" when none). Arrows are relative to the WSKR's heading (up = dead ahead). Remora does not use them yet.
- **Contact selection** (`contacts.js`): `contactList()` builds one list from all sources, each entry `{ id, tag, name, label, lat, lon, source, type }`. Today the only source is sonar (charted points of interest), tagged **S1, S2, …** in chart order, label like `S1 Canyon Head`. Later sources (radar, comms, WSKRs) add their own tags to the same list. `selectContact(id)` toggles; the selection lives in `sim.s.selContact` and is saved as `navigation.selContact`. On **Sensors → Sonar and contacts** every row has a **Select** button. The WSKR readout and the **Investigate** command follow the selection.

## Owner's rules (earlier 2026-11-19)
- **Manual control** is low priority ("probably will not get used"). Touch buttons on the WSKR page.
- **Relay**: for when Aqua Nova is very deep. The WSKR **follows the ship**, just under the surface (4 m), and relays messages and gives a GPS fix. `sim.relayUp()` makes the comms antennas behave as if at the surface; `sim.hasGps()` is true at 15 m or shallower, or with a relay up. Nothing else consumes the GPS fix yet.
- **Depth** (fleet setting, WSKRs staggered, relays excluded): **Auto** = equal layers from surface to floor; **Shallow** = surface down to just below Aqua Nova (+10 m); **Deep** = just above Aqua Nova (−10 m) down to the floor. Always at least 3 m above the floor. `wskrDepthFor(w)`.
- **Formation** (fleet setting, **measured against Aqua Nova's scan ring**): each WSKR holds where its scan ring overlaps the ship's by **5% (Loose)** or **50% (Tight)** of the smaller ring's area. The ship's ring is its sonar radius (`sim.fineNm`: 4 nm sonar on, 0.8 off, 8 sweep); a WSKR's ring is 3 nm (+0.6 Scout). They space themselves evenly round the ship; Lantern leads. Code: `ringDistance`, `formationRadius`, `WSKR_OVERLAP`. (Superseded for placement by `WSKR_SCREEN.md`.)
- With `?locked=1` the tab needs the `wskr` station.
- **Communicator**: Sensors officer orders **"Set up a relay"**, **"Stand down the relay"** and **"Status report"** (`crew.js` `EXTRA`; `HELM_AND_ORDERS.md`).

## Other orders
**Hold formation** (`escort`), **Search pattern** (`search`), **Task** (sent to a contact, now from the WSKR page or Sensors; can target one WSKR), **Recall**. Crew speech events in `app.js`: `wskr-found`, `wskr-recovered`, `wskr-low`, `wskr-dead`, `wskr-search-done`, `wskr-link-lost`, `wskr-surfaced`, `wskr-link-back`.

## Search patterns (rebuilt 2026-11-24)
- The **Search pattern** button is unchanged: an expanding square about the WSKR's position, 0.45 nm legs, 14 legs, then it rejoins.
- **Pattern…** opens the shared planner (`searchDialog.js`): expanding square, sector search, parallel track or creeping line, from a datum (here, lat/long, or a place and bearing). For **All WSKRs** the work is shared: squares and sectors start 360/n degrees apart, tracks share the width.
- `sim.orderWskr(n, 'search', { spec, datum })`. `w.pat = { lat, lon, k, t, spec }`; `patternPoints(pat)` builds the waypoints once. Next waypoint on arrival or after 30 game minutes; `wskr-search-done` at the end. Same generator as the Aqua Nova and the Tern: `SEARCH_PATTERNS.md`.

## Saved state
`navigation.wskrs[]` (lat, lon, n, name, mode, target, bat, dead, heading, pat with its `spec`), `navigation.wskrForm`, `navigation.wskrDepth`, `navigation.selContact`, `navigation.rack`.

## Still wanted
A relay that can hold a position apart from the ship; relay carrying real link strength; extra battery draw when chasing a fast ship; using the GPS fix (position drift when none); more orders by communicator (search ahead, go deep); a communicator warning when a WSKR drifts out of link range; more contact sources (radar, comms) and selecting contacts on the WSKR chart; WSKR view on the bridge VIEW screen; a lesson for WSKRs; readouts on the Remora page; WSKR search patterns drawn on the chart.
