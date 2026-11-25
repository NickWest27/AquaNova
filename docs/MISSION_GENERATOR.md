# Generated missions and reputation (v8, 2026-11-23): contact, survey, distress (Tern rescues) and patrol BUILT

Status: **built and tested:** Unknown contact, Site survey, **distress calls with real Tern rescues (sinking yacht, survivors in a raft, disabled ship, submarine on the bottom)**, patrol with a temporary AO on the chart, offers, Comms Orders UI, reputation, Standings page on the Logbook, positions given as lat/long or bearing and range. Design only: mining colony and missing-vessel rescues, the compulsory calendar. **[owner]** marks the owner's decisions. Canon and tone: `STORY_BIBLE.md`. Hand-written tutorial and story missions are unchanged.

Code: `tablet/js/missionGen.js` (generator, scheduler, rescue), `tablet/js/reputation.js`, `data/gen/phrases.json`, `data/world/reputation.json`, scripted vessels in `traffic.scripted`, temporary AOs in `sim.tempAOs` (drawn by `nd.js`), Orders card in `stations/comms.js`, Standings page in `stations/log.js`. Tests: `tools/missiongen_test.py`, `tools/reputation_test.py`, `tools/orders_ui_test.py`. State: `mission.gen` (offers, defs, vessels with their `casualty` record, patrol, timers, history), `mission.genFlags.<id>.*` (near, ident, inside, served, rescue_start, rescued, saved, outcome), `mission.reputation`. The mission manager is unchanged.

## Principles
1. **The good ending is understanding, not victory.** Peaceful outcomes preferred; **Warn is an acceptable outcome** **[owner]**; a fight is the last step (future combat build).
2. **No failed missions, only different outcomes** **[owner]**: assist, assist_rescue, rescue_partial, rescue_none, document, warn_off, withdraw, too_late, quit, expired, declined, survey, patrol, patrol_partial. Each has debrief text and reputation deltas.
3. **Results are faction dependent** **[owner]**: killing a pirate pleases the Navy and angers pirates.
4. **Facts in a briefing are real**; only the prose varies.
5. **Range is not a limit** (reactors) **[owner]**. Supplies matter. **The Tern cannot resupply at an enemy base, colony or port** **[owner]** (`sendShuttle` returns `why:'enemy'`; away crew skip such docks). Survivors are not landed at an enemy dock either.
6. **The player navigates to the place [owner].** A mission **tells** the Captain where; it never sets a destination, draws a marker or says "N nm from you". The Captain enters the waypoint (lat/long, or place + bearing + distance on the course page) and must get the position right.

## Positions in briefings (built) **[owner]**
- **Lat/long** in degrees and decimal minutes (`at 40°18.6'N 070°13.3'W`), or **bearing and range from a known place** (`on a bearing of 184° true, 44.5 nm from U-853`; contacts only, when a marked place is 4 to 60 nm away). Both are accepted by the course-entry page.
- The target is the **rounded reported point**, so a careful plot reaches it exactly. Every offer ends with a "Reported position" line and the objective repeats it.
- Later ideas: a position with error (a drifting vessel since the report), a bearing from a sonar or radio source the Captain must plot, a position from two bearing lines (triangulate), a route with several waypoints.

## Time and offers (built)
- **Route time** is planned leg by leg: super cruise 100 kt where the floor is 120 m or more, 14 kt on the shelf, ×1.15 margin, plus minutes to engage.
- **An offer** has an accept-by time, an optional deadline or window, and starts its clocks **when it is delivered**. Contacts: accept-by 1 to 2 h; deadline = accept-by + 1.6 × route + 1 h. Surveys: accept-by 12 h. **Deadline means on scene** (the Aqua Nova within 3 nm).
- **Timer:** when a generated mission ends, a random **0 to 12 h** (game time) timer starts for the next offer. The first one starts after the First Survey.
- **Request new orders** (Comms, Orders card): only with no active mission and no pending offer, and it needs a transmit link.
- **Accept, Decline, expire, Quit.** Declining an **optional** offer costs nothing; a **compulsory** one costs OERA standing. **Quit** (two taps) costs `quit_optional` (small), `quit` (compulsory), or `quit_rescue` (contact already reached).
- **Away mode:** an offer pauses the game while the XO has the con, with a note on return.
- **Compulsory vs optional** **[owner]:** OERA Operations tasks are compulsory (surveys and patrols half the time); harbour, university, fisheries and rescue-coordination requests are optional. The compulsory-conflict **calendar is not built** (one mission at a time).

## Patrol (built) **[owner]**
- **Area:** a protected zone from the world data. Accepting draws a **temporary AO** on the chart: dashed amber before the window, solid and labelled "ON STATION" while it is open. Removed when the mission ends.
- **Window:** accept-by 3 h; on station from the next full hour after accept-by + 1.3 × route + 30 min, for **12 or 24 hours** (game time).
- **Coverage:** time inside the area during the window counts. **80% serves the patrol**; less ends it as `patrol_partial` (OERA −2, civil −1).
- **Poachers:** 1 to 2 unmarked trawlers appear 1 to 3 h into the window. Identify one for a decision: **warn off** (poachers −2), document, or withdraw. Optional; a quiet patrol is a valid outcome.

## Distress calls and Tern rescues (built) **[owner]**
- **Arrival:** independent of the 0 to 12 h timer: every 10 to 40 h of game time after the First Survey, even **during** a mission. Inside 300 nm, route under 5 h, accept-by 30 min, **deadline = accept-by + 1.25 × route + 15 min**.
- **Link rule:** a mayday bypasses it. Nicole: *"I am picking up a distress call. I recommend we re-establish communications."*
- **Outranks a running mission:** accepting ends the active mission as `quit_distress` with **no penalty**.
- **Types:** `sinking` yacht (3 to 4 people, 1 h), `survivors` in a raft (3 to 6, 2 h), `disabled_ship` (8 to 12, 4 h), `disabled_sub` on the bottom (6 to 10, 3 h of air; floor 80 to 600 m).
- **Flow:** go to the reported position (the Aqua Nova within 3 nm) → identify → decision **"Launch the Tern to take them off"** / stand by and call the cutter / withdraw → **rescue** → report.
- **The Tern does the rescue [owner]:**
  - **Surface casualty:** the Tern must be **surfaced (3 m or less), within 0.2 nm of the casualty and holding still** for a minute. Then up to the seats free (six seats, two pilots: **four at a time**) come aboard.
  - **Submarine:** the Tern must be **at her depth (±15 m), within 0.12 nm, holding still** for 90 s: she **docks** at the hatch.
  - **Ferry:** survivors are landed when the Tern is **back in the bay** or **within 0.4 nm of a friendly dock** (never an enemy one). More survivors than seats means several trips. The Tern's air and range already scale with people aboard (`o2HoursLeft`).
  - **Clock:** the casualty's time (the hours above) starts when the Captain chooses to rescue; Dr. Patel states it. Anyone not reached by then is lost.
- **Outcomes:** all saved `assist_rescue` (civil +6, OERA +4); some `rescue_partial` (civil +2, OERA +1); none `rescue_none` (civil −3, OERA −1). The debrief says "Saved: x of n."
- **How the Captain does it:** enter the position as the ship's waypoint, **launch the Tern** from Security, **order the Tern** from Comms (Go to the waypoint, Surface or Make depth), wait, bring her back.

### Rescue types still to build **[owner idea, 2026-11-23]**
- **Subsea mining colony or station** (flooding or power loss; many people, several Tern trips, a docking port).
- **Missing vessel** (no position: search first with WSKRs and sonar, then rescue; a stale position fits here).
- A destination choice (the requester's dock) and wounded who must go to the medical bay first.
- A submarine should not show as a ship icon on the chart and should read as a bottom contact on sonar (it is a scripted surface vessel for now).

## Comms signal **[owner]**
- **Outgoing** (reports, request for orders) needs a link; speed and latency depend on link type and signal strength (`transfer.js`).
- **Incoming offers** follow the same rule: held until a link is up, then delivered after a delay that grows with a weak signal. Distress bypasses it.

## Reputation (built)
- **Seven groups** **[owner]**: O.E.R.A. and Allies, Science community, Civil community, Allied navies, Hostile navies, Pirates, Poachers.
- **−100..+100**, tiers Hostile, Cold, Neutral, Warm, Trusted. **No drift** **[owner]**. Spill-over `delta × relation × 0.4`, once, never chained; each direct delta clamped to ±10.
- **Accidents cost civil standing** **[owner]** (collision, sunk ship).
- **Display (subtle) [owner]:** Logbook → Standings: tier word and a plain-language line per group, "Recent" changes in words. No numbers.

## Mission types
| Type | Status |
|---|---|
| Unknown contact (adrift trawler, silent survey ship, poachers) | built |
| Distress rescue (yacht, raft, disabled ship, submarine) with the Tern | built |
| Site survey | built |
| Patrol | built |
| Mining colony rescue, missing vessel | next |
| Quiet vessel, seafloor map, escort, salvage, first contact | later |

## Briefings
Pools in `phrases.json` are tagged by requester, type and reason, filled from real facts (`{where}` is the position phrase), with a no-repeat memory. Add lines there to widen the variety; no code change needed.

## Not yet done
- Mining colony and missing-vessel rescues; a visible casualty clock; hail to identify a scripted contact (untested).
- Positions with error or from two bearings.
- Compulsory-conflict calendar. A complication for surveys. Faction-aware start stance and tone by standing tier.
- `tools/tern_test.py` fails on the "Order the Tern to" menu step (it failed before these changes too; not investigated).
- Combat and the Warn/Defend ladder wait for the combat build.
