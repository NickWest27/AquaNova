# Bridge console: standard layout (owner, 2026-11-22; pages arrive one at a time)

Code: `tablet/js/bridge.js` (`createBridgeConsole`), screen corners in `scene.js`, route model in `sim.js`, fix dialog in `plot.js`, chart drawing in `nd.js`, SNR in `sonarView.js` (see `SONAR_PAGE.md`). Tests: `tools/route_console_test.py`, `tools/bridge_lesson_test.py`, `tools/sonar_test.py`.

Note (2026-11-25): the retro reskin changed only the frame art and the screen positions in `scene.js`; the console itself is unchanged. See `RETRO_SKIN_PLAN.md`.

## The rule
| Screen | Job |
|---|---|
| **Left desk panel** | **Page selection**: NAV, HLM, TAC, SNR, VW, SYS |
| **Centre display** | Shows the selected page |
| **Centre controls** | Controls that belong to the selected page |
| **Right desk panel** | **View settings** of the selected page, always **a bank of six** (two rows of three). A page with fewer than six buttons leaves **blank place holders** (dim, dead). DSP is on every page. |
| Main screen, top strip, Comms and Sensors mini screens | Unchanged for now |

Code: each page gives `v: [buttons]`; the console adds DSP (and PAN, SHW on NAV), pads to six with `.bbtn.blank`, and builds the two rows.

**One master range (2026-11-23).** The range − and + on the right desk is one range for the whole console: NAV and SNR, the centre display and the main screen all show the same range, whichever page or screen it is pressed on. Steps: 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256 nm. It starts at 8 nm. Code: `nd.setRange` for NAV (all copies), `view.range` in `sonarView.js` for SNR, linked by `setSnrRange` and `onSnrRange` in `bridge.js`. A new page with a range must join this link. (The Sensors station's SNR tab shares the SNR value.)

## Pages
| Page | State |
|---|---|
| **NAV** | Built 2026-11-23 (below) |
| **HLM** | Built 2026-11-23 (below) |
| **TAC** | Placeholder "NOT INSTALLED". Spec to come. |
| **SNR** | Built 2026-11-23: passive sonar. See `SONAR_PAGE.md`. |
| **VW** | The old VIEW page (synthetic or camera). Spec to come. |
| **SYS** | The old SYS page. Spec to come. |

Old page ids `helm` and `view` are now `hlm` and `vw`. The old per-page right-desk readouts (never shown) were deleted.

## NAV page
**Controls (centre).** Each opens a dialog for data entry.
- **Dest:** sets the final fix (replaces the last fix, or becomes the only fix). Does not plot.
- **Fix:** adds a fix to the end of the route (it becomes the new destination). Place, place-bearing, place-bearing/distance, or lat/long, with an optional **name** and **depth**. A place with nothing added is that place itself; anything else makes a **waypoint named WP[number]** (or your name).
- **Route:** the ordered list of fixes: add, edit (waypoints), delete, move up, move down. The last is marked DEST. Shows bearing and distance from the previous fix. **Turn points (TP) are not listed and not editable.** Clear route empties it.
- **Plot:** calculates the legs between the ship and each fix in order, checks each leg against land and shoals, and adds **turn points (TP1, TP2…)** where needed. Sets the destination and the course. Plot works from where the ship is, so it is also **return to route** after manual control.

**Manual control** (Port, Stbd, the heading dial, a heading order) drops the course (the destination clears) but **keeps the route**. Plot again returns to it. Fixes the ship passes leave the route. At the last fix the route is empty and the ship stops.

**View settings (right desk).** − , range readout, + (master range); DSP (show this display on the main screen), PAN (arrows replace the controls), SHW (switches replace the controls): **Ships, Subs, Base, Orgs, Labels**. Ships are the traffic contacts, Base is the docks. **Subs and Orgs switch nothing yet** (no such contacts exist). **Labels** turns the ship labels (and the bearing numbers on bearing-only lines) off and on; place names stay. Six slots, all used.

**On the chart:** amber dashed line through the route (dim straight preview until plotted), a cross and name for each waypoint, a small square labelled TPn for each turn point.

**Ship contacts (2026-11-23).** Symbol, course vector and text are about **half size on the large main screen** (`ik` and `kf` in `nd.js`; the medium display is unchanged). The label is three short lines: the name; `BRG 218° 4.2nm` (where the contact is **from us**, with AIS or FIX before it); `CRS 090° 12kt` (its **course**, the same direction as its vector, then its speed). The old single line mixed bearing and speed and was mistaken for the heading.

## HLM page
**Controls.** Port and Stbd (10° each), **Stop** (red, throttle 0, course kept), Slow and Fast (10% of full throttle), Up and Dn (50 m), Srfc, **NOE** (nap of the earth, the old Hug the floor), Cruise. **No Dock button**: docking is by voice (Marcus's Docking folder).

**Display.** Heading dial in the middle. **Left: speed tape** (boxed current speed, orange triangle and small number at the set speed, green trend vector). **Right: depth tape** (boxed actual depth, orange triangle and number at the set depth, red ground line with a red shaded area below it, green vertical-speed vector). Tape scale: speed 20 kt window (80 kt in super cruise), depth 120 m window. A set value off the scale pins to the tape edge.

**Trend vectors:** show where the value will be in `TREND_S` = 3 seconds (constant at the top of the tape code, owner may tune it). The vector **never goes past the set value**: ordering 10 kt, the vector stops at 10 kt. Same for the vertical-speed vector and the set depth.

**View settings (right desk).** DSP, five blanks.

## Route model (sim)
- `s.fixes`: the route (ordered fixes). `s.wpt`: the destination, always the last fix, set only while a course is plotted. `s.route`: steering points (the fixes and the turn points). `s.wpN`: the WP counter.
- `sim.setWpt(p)` (orders, missions, the Navigation station) replaces the route with one destination and plots it. `sim.plotRoute()`, `sim.clearRoute()`, `sim.cancelCourse()` (manual: keeps the route), `sim.newFix()`.
- Saved as `navigation.fixes`, `navigation.destination`, `navigation.wpN`. (`navigation.waypoint` is gone.)
- The Navigation station still uses the old one-destination dialog (A to B). The lesson **Charting a Course** now reads "set Dest to Vineyard Ledge and tap Plot".

## Open
- Subs and Orgs contacts; TAC, VW, SYS specs.
- The route list has no per-leg ETA yet.

## Dest, Route, Plot (owner, 2026-11-27)
- **Dest** opens the waypoint dialog: a known **Place**, a **Lat / Long**, or **Bearing / Distance** from a place. Done or Cancel. No name or depth (waypoints are WP1, WP2, ...). The waypoint becomes the end of the Route.
- **Route** opens the Route editor: row 0 is the present position, the waypoints below. Tap a row to select it. **+** adds a waypoint after it (the same dialog), **−** deletes it, **▲ ▼** move it, **Done** keeps the changes, **Cancel** drops them. A changed Route needs Plot again.
- **Plot** plots the Route round the land. Speed and depth do not change.
- The **Fix** button is gone (Route + does the same).
- **Mission areas** are amber boxes on every chart (`nd.js`): a mission's `"area": { name, lat0, lat1, lon0, lon1 }` (the Trials AO) and patrol areas (dashed until the window opens; the inside test is the same box, `missionGen.js`). An area is never a destination: the player makes a waypoint inside it.
- The lower display's NAV page is north up (track up is gone from the bridge), with range rings at a quarter, half or the whole range setting carried out to the corners. The WSKR station's chart keeps track up.
