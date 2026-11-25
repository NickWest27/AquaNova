# Tern orders, radio contact and check-ins

Built 2026-11-20 (owner request). **This doc supersedes `LAUNCH_BAY_AND_SHUTTLE.md` where they differ**: the Tern's air is now 7 h (9 h with research), she is no longer limited to docks, and she has depth and a safe depth (see `AIR_AND_SCRUBBERS.md`). Code: `tablet/js/tern.js` (orders, radio, check-ins, Security launches), `bayops.js` (movement and modes), `stations/crew.js` (the menus), `app.js` (the crew's speech), `missionGen.js` (rescues), `searchDialog.js` (search planner). Test: `tools/tern_test.py`.

## Who controls her
- **In the bay: Security (Lt. Kim)** prepares an away team and launches her. Communicator, Security, Commands, **"Launch the Tern to"**: **Supply run (closest dock)**, **Search and rescue**, or **Go to** a destination. Engineering refuses a launch below 800 m. Supply run: the away team (2) go to the dock, cycle the airlock and come home; **on return the supplies are delivered: food, science equipment, mail and fresh CO2 scrubbers** (scrubbers back to 100%). Search and rescue goes to the nearest adrift WSKR, or to the ship's current waypoint; with neither, Security asks for a position. The trip must fit her range there and back, and the place must be inside the Area of Operations.
- **Out of the bay: Nicole (COMMS) by radio.** Communicator, Communications, Commands: **"Call back the Tern"**, **"Report on the Tern"**, and **"Order the Tern to"**: Hold position, Surface, Set up a relay, Return to mission, Make depth (10 to 800 m), Make heading, Make speed (all stop to 20 kt), Go to (docks, the nearest points of interest, the ship's waypoint), **Run a search pattern …** (opens the planner, see `SEARCH_PATTERNS.md`).
- The Tern is **not shown on the Sensors WSKR page**.
- **Enemy docks [owner, 2026-11-23]:** the Tern cannot resupply at an enemy base, colony or port (hostile navies, pirates, poachers). `sendShuttle` refuses with `why:'enemy'`; the away crew skip such docks.

## Modes (added to follow, going, exchange, moored, returning)
`goto` (to a position, then `station`), `station` (hold at a depth), `steer` (heading and speed until land or the Area of Operations edge blocks her, then `station`), `relay` (up at the surface keeping station with the ship; **counts as a relay for comms and GPS** like a relay WSKR), **`search`** (flies a search pattern, 10 knots; see below). `mission` remembers the last assigned task (supply, goto, search and rescue, or search), and **"Return to mission"** resumes it.
- She has her own **depth** (3 m a second), default 20 m on trips, the surface for a relay. **On the surface she is limited to 7 knots.** `goto` stops within 0.15 nm of the point.
- Six seats: two pilots and **four passengers** (`SHUTTLE_SEATS`, `pax`). Air scales with people aboard.

## Search patterns (built 2026-11-24)
The Captain picks a pattern (expanding square, sector, parallel track, creeping line) and a datum in the planner. Nicole passes `orderTern({ kind: 'search', spec, datum })`. She flies the waypoints at 10 knots (a waypoint counts within 0.05 nm), at her held depth. **Refused** when under two points are open water, or when the pattern plus the trip home needs more hours than battery and air allow. At the end she holds station (`shuttle-search-done`, "Search pattern finished"). Low battery or air sends her home. **Return to mission** resumes at the same waypoint. State is saved (`sh.pat`). Full details: `SEARCH_PATTERNS.md`.

## Rescuing people (built 2026-11-23, owner rules)
Generated distress missions (`MISSION_GENERATOR.md`) use the Tern to take survivors off a casualty and ferry them home.
- **Surface casualty** (yacht, raft, disabled ship): the Tern must be **surfaced (3 m or less)**, within **0.2 nm** of the casualty and holding still for a minute. Four at a time board (`pax` rises).
- **Submarine on the bottom:** the Tern must be **at her depth (±15 m)**, within **0.12 nm**, holding still for 90 s. She **docks** at the hatch.
- **Landing:** survivors are landed when the Tern is back in the bay (`shuttle-aboard`) or within 0.4 nm of a **friendly** dock. More survivors than seats means several trips.
- The Captain sets the ship's waypoint to the reported position, launches the Tern (Security), orders her (Comms): Go to the waypoint, Surface or Make depth. The casualty has a clock; anyone not reached in time is lost.

## Radio contact (owner rules)
- She is manned, so **out of contact she keeps to her last mission**. Contact: alongside the ship, within 20 nm of the ship, or within 20 nm of a dock.
- **Once an hour she surfaces for 2 minutes and tries to check in.** On the surface her radio reaches 40 nm (ship or a dock). A successful check-in: COMMS says so with position, battery and air, and waiting orders are sent. A failed one: **"the Tern has missed a check-in"**, and she tries again in an hour. Events: `shuttle-lostlink`, `shuttle-contact`, `shuttle-checkin`, `shuttle-missed`.
- **Any order given while she is out of contact waits (up to 6, same kind replaced) and is sent when contact returns.** Nicole says why: **"out of communications range, N miles away"**, or **"has missed a check-in, last contact HH:MM"**, and that she is keeping to her last mission. A Tern adrift with no power does not answer.
- Saved with `navigation.shuttle` (depth, orders, queue, contact times, search pattern).

## Not built / ideas
- Away mode's own supply run is still the abstract version (it does not fly the Tern).
- No Tern on the chart or navigation display (so her search pattern is not drawn); no WSKR-style formation or relay range limits for the Tern relay beyond 20 nm.
- A weather or sea-state reason for a missed check-in.
- `tools/tern_test.py` currently fails at the "Order the Tern to" menu step (also before the rescue work and the search work; not investigated).
