# Aqua Nova — Development Notes (main document)

Last updated: 2026-11-20 (night), with a header note added 2026-11-25. This is the hub: the current state in brief, with a pointer to the topic document for each area. **Topic documents are current; where an older sentence in one of them disagrees with this page, tell the owner and fix it, do not guess.**

**Note, 2026-11-25:**
- All the topic documents now live in the repo's `docs/` folder, and the Claude Project holds the same copies. The root `DEVELOPMENT.md` is an old stub from 2026-11-17; **this file is the real one**.
- The branch the owner works on is **`tablet`** (it was `feature/tablet`); `main` is the desktop version. Published at `/tablet/` and `/desktop/` (see `CLAUDE.md`).
- A **retro reskin** is under way (frames and art only, same game). Start with `HANDOFF.md`, `RETRO_SKIN_PLAN.md` and `RETRO_PALETTE.md`. The bridge is done; other rooms follow as the owner sends 320×240 frames.
- Newer documents not in the map below: `MISSION_GENERATOR.md`, `SONAR_PAGE.md`, `BRIDGE_CONSOLE.md`, `BAY_AUTOMATION.md`, `REMORA.md`, `TERN_ORDERS.md`, `SEARCH_PATTERNS.md`, `WSKR_SCREEN.md`, `WORLD_POPULATION.md`, `AIR_AND_SCRUBBERS.md`, `SHIP_AND_PROPULSION.md`, `IPHONE_PED.md`, `SCREENS.md`, `CODE_NOTES.md`, `CONTACT_TRACKING.md` (detection chance, tracks, signatures on file). Where they disagree with this page, they are newer.
- `ASSET_SPEC.md` is at `Guides/ASSET_SPEC.md`.

## Source of truth
- **Code lives on GitHub: `NickWest27/AquaNova`** (web version). Hosted on GitHub Pages at `https://nickwest27.github.io/AquaNova/` (iPad edition at `/tablet/`).
- The tablet branch holds the **iPad tablet edition** (`tablet/`) and the **iPhone PED** (`ped/`). The owner tests on a real iPad and iPhone every time (do not remind them to).
- Project files in this Claude Project (images, PDFs) are reference material; the repo wins for code.
- `NickWest27/aquaNovaPart1` — older web snapshot. `NickWest27/AquaNovaPico` — PICO-8, parked. `NickWest27/Body-Clock` — the owner's other app; its sync design is our model.
- Desktop version (repo root `index.html`, `ui/`, `utils/…`) is the design reference for the PED and communicator look. Do not change shared data in ways that break it (`data/locations.json` is shared; tablet overrides live in `data/seafloor/pois.json`).

## Document map
| Document | What is in it |
|---|---|
| `DEVELOPMENT.md` (this) | State, rooms, craft, science summary, tests, decisions, roadmap, known problems |
| `STORY_BIBLE.md` | Theme, **Areas of Operation**, characters, names, backstories, canon |
| `AWAY_AND_SLEEP.md` | **Sleep: "Crew has the con" (close the app, the crew sail on), standing orders, sleep rules (samples, supply runs), ARIA's briefing, the phone estimate** |
| `TIME_CRUISE_AND_START.md` | Game calendar (50 years ahead), saves and resume, mission-log rules, crew reachability and icons, custom depth, hug the floor, **dive rate**, nav and WSKR display, synthetic view perspective, real-time default and time compression, super cruise, start and silence rules, ship tour |
| `HELM_AND_ORDERS.md` | **Course and speed are independent**, terrain protection (Chen), status reports in the communicator, synthetic-view tapes |
| `REPORT_TRANSFER.md` | Sending reports to OERA: timed upload, progress bar, sounds |
| `COMMS_AND_PROGRESSION.md` | Commissioning gates, tutorial chain, ARIA guidance, new-task announcements, hints and decisions, Comms console |
| `LAUNCH_BAY_AND_SHUTTLE.md` | **Launch bay rules (1 minute, speed damage, Engineering), Remora in the bay, the shuttle Tern (battery and air), WSKR recharge, "Ask about…" topics** |
| `PED_AND_MISSION_LOGS.md` | Arrival sign-in, player name, mission flow and mission logs, PED tabs and settings, screen rules |
| `UI_NOTES.md` | Console line, bridge notice stack, synthetic window and instruments, communicator transcript, communicator history |
| `SCIENCE_LAB.md` | Samples, Remora, lab, **analysis screens**, research (WSKR and Tern topics), Launch Bay |
| `WSKRS.md` | WSKR design and status, **the WSKR status page** |
| `SEAFLOOR_MAPS_PLAN.md` | Real sea-floor data (**30–42.4°N, 74.63°W–0°W, two grids, detail box round Hudson Canyon**), sizes, fog of war, **Area of Operations limit**, grounding, contours |

## Story and canon
- This is **a game now, not a coding course.** Player: retired naval captain, pulled out of retirement. Captain **Elena Voss** was relieved at the last minute, so the player is Captain. **XO / AI: ARIA** (crew id `executiveOfficer`). Ship built by **O.E.R.A.** (Oceanic Exploration and Research Alliance) at Woods Hole. Inspired by SeaQuest DSV. **Day 1 is 50 years after the day the game was first started** (calendar in `TIME_CRUISE_AND_START.md`; it was a fixed 16 Aug 2074 before). Theme: **who decides what the deep is for** (see `STORY_BIBLE.md`).
- **Areas of Operation (owner, 2026-11-20):** the ship's advanced nature means the funding nations limit where she may go. The chart limits are the **Area of Operations**, a political no-transgression zone (see the sea-floor section and `STORY_BIBLE.md`).
- **Crew (renamed 2026-11-19):** ARIA; Marcus Chen (helm); Dr. Samira Patel (science and medical); Alex Torres (sensors); Ryan Chen (chief engineer, **in charge of the launch bay**); Lt. Daniel Kim (security); Nicole Brooks (comms). **Contacts:** Admiral Catherine Okafor (Director of Operations), Cdr. Sarah Mitchell (harbour master), Dr. Thomas Webb (research). Names come from `data/contacts.json`, which overrides saved names on load. Pronouns are traditional.
- **Stations:** Bridge, Helm, Communications, Sensors, Engineering, Science/Medical. Built: Navigation, Helm, Systems, Sensors (with a WSKRs tab), Comms, Logbook, Science Lab, Remora, Launch Bay control. **Not built: Engineering, Medbay equipment** (the rooms exist; the stations do not).
- **Art:** the owner does not paint or draw it. They **generate concept art and drop it in the shared `Concept art` folder** (`~/AquaNova/Concept art` on their Mac); we turn it into room scenes (tap areas, signs, live displays in the cutouts). Prefer features over art when nothing has been supplied. **Since 2026-11-25 new room art is 320×240 retro frames with transparent holes** (`RETRO_SKIN_PLAN.md`).

## Art status and wanted list (owner, 2026-11-19; retro update 2026-11-25)
**In the game from supplied art (old style):** Walkway A1 (`walkway.webp`), Walkway AN-1 (`walkway-an1.webp`), Medbay (`medbay.webp`), Launch Bay (`launchbay.webp`, temporary). **Retro:** the Bridge (`tablet/retro/assets/bridge.png`). **Still placeholder:** Quarters (`quarters.webp`), Science Lab (`science.webp` = old medbay concept art).

**How a retro frame goes in:** see `RETRO_SKIN_PLAN.md` (swap the image in `scene.js`, move the screen and hotspot boxes to the new holes, add the `stage-4x3` class for that scene).

**How an old-style image went in:** convert to 1920x1080 `.webp` in `tablet/assets/` (crop the sides if it is not 16:9; a transparent cutout lets a live layer sit *behind* the art), measure tap areas and screen corners in stage pixels, run `python3 tools/update_sw.py`, run smoke, bridge and science tests.

## Craft: what each one is (owner, 2026-11-18, updated 2026-11-19)
- **Tern** = the Aqua Nova's shuttle (an away boat, built 2026-11-19; the old "Sea Crab" name belonged to a Sea Quest boat and is gone). Ferries crew, supplies and away teams so the ship does not dock. 20 kt; **battery 1 h, research 3 h then 6 h; air 8 h with all eight aboard, research 10 h, refills in 1 h**; 2 pilots (1 and a link will do) and 6 passengers, navigation and radio but no scanning. `LAUNCH_BAY_AND_SHUTTLE.md`. **While the Captain sleeps with the crew in charge, the Tern can make a supply run to a close port** (`AWAY_AND_SLEEP.md`).
- **WSKRs** = autonomous remote sensors, controlled from the Sensors console. They only scan and mark sites; they **cannot take physical samples**. Details in `WSKRS.md`.
- **Remora** = the Science ROV (working name; constant `ROV_NAME` in `rov.js`). Hand-piloted, slow, short range, carries instruments WSKRs lack. **Launched and recovered through the bay; her tether keeps the doors open and blocks the other craft; the science team unload and re-equip her after each dive.** (`REMORA.md`)
- **Launch Bay** = a separate room, reached from walkway AN-1. WSKRs, Remora and the shuttle are launched and recovered there with a one-minute procedure; **Engineering (Ryan) warns when speed damages the ship or the doors** (`LAUNCH_BAY_AND_SHUTTLE.md`).

## Device design
- **Landscape only** on iPad. **No station button bar**: stations open from hotspots/displays.
- **Hotspot labels are hidden** (signs on the art stay); **press and hold** a scene to show them. **No bottom info bar:** stations fill the screen, and crew/ARIA lines show as a short-lived pill (about 7 s).
- **Resume rule:** coming back to a game that has read the welcome logbook, or after Update now, **opens the Logbook** (back returns to the Quarters). What loads is the exit save, else the last entry (see `TIME_CRUISE_AND_START.md`). Tests start on the bridge unless `?resume=1`.
- **Station back button names the room you came from.**
- **Top-right corner**: the **PED** button and the **communicator pin**. **Tap outside the PED or the communicator to close it; neither has a close button.**
- **Communicator pin** = crew voice (`toggleComm()`, `stations/crew.js`), menu flow. **Comms station** = satellite/laser/radio link for mail, reports and contacts (needs the right antenna up and the sub shallow enough; a relay WSKR following the ship stands in for the antenna at depth).
- **Simulated voice goes through the communicator.** The upper display shows a short label.
- **iPhone PED** = portrait web app in the PDA frame (`ped/`, `IPHONE_PED.md`). **Logbook** (laptop in quarters) = the save system. Logbook entries are documents: **they never show ticks or strike-through** (progress lives in PED → Tasks).
- **Toggle buttons rule:** fixed label, **filled = on**. **Tasks and objectives belong in the PDA** (PED → Tasks). **PED → Contacts lists only people the Captain has met** (`progress.met.<id>`).
- **Update now** (PED → Settings → Game version) unregisters the service worker, clears the caches and re-fetches every game file.
- Test hooks: `window.__aq = { open, scene, toggleQuarters, notify, console }` (`__aq.scene('sleep')` opens the Sleep dialog).

## Rooms and scenes (`scene.js`)
- **Bridge** (retro frame since 2026-11-25; 4:3 stage while on the bridge), **Quarters** (placeholder art; the PED and pin glow only after the welcome logbook is read).
- **Walkway A1** (art `walkway.webp`, cropped to 16:9; **new games start here**): lit **signs** over the doors (SCIENCE, MEDICAL, QUARTERS, BRIDGE). Invisible tap areas. Floor tap area **AN-1 DECK ▼** leads on.
- **Walkway AN-1** (`walkway-an1.webp`, scene `walkway2`): "◂ LAUNCH BAY" / "ENGINEERING ▸"; LAUNCH BAY opens the Launch Bay, ENGINEERING says "not built yet". Floor tap area **A1 DECK ▼** leads back.
- **Medbay** (`medbay.webp`): the window cutout shows **the sea outside** (marine snow, "EXTERNAL VIEW · depth m"). EXAM TABLE (locked), WALKWAY ▸.
- **Science Lab** (`science.webp`, placeholder): SAMPLES, ANALYSIS, RESEARCH, REMORA, MEDBAY, WALKWAY ▸.
- **Launch Bay** (`launchbay.webp`, temporary art): BAY CONTROL, WALKWAY, INNER AIRLOCK, REMORA.
- Scene names in `openScene` (`app.js`): `bridge, quarters, walkway, walkway2, science, medbay, launchbay`; `WHERE` gives the back-button names. Stations load from `tablet/js/stations/<name>.js`. Commissioning gates apply to stations only (`unlocks.js`), not rooms.

## Science (summary; full notes in `SCIENCE_LAB.md` and `REMORA.md`)
- **Samples** (`mission.science`): water, sediment, rock core, biological, magnetic reading, collected by **Remora** (tether 1 nm, 1.5 after research; tools work within 0.15 nm of a site). **While the Captain sleeps, the science team can also take samples at a point of interest the ship stopped at** (`AWAY_AND_SLEEP.md`).
- **Lab**: Samples / **Analysis** / Research. Three instruments, one job each: **Material Analysis** (20 game min), **Spectral Analysis** (15), **Gene Sequencing** (30). **Each instrument has a live display** that fills in as the job runs; finished samples can be shown again with **Show #n**. A finished job files a finding and gives **1 research point**.
- **Research topics**: Longer tether (2), Deep sonar sweep (3, effect not built), WSKR formations and orders (4), Synthetic forward view (5), **WSKR long-life cells (3, battery 6 h to 12 h)**, **WSKR deep-cycle cells (5, needs the first, 12 h to 24 h)**, **Tern long-life cells (3, shuttle battery 1 h to 3 h)**, **Tern deep-cycle cells (5, needs the first, 3 h to 6 h)**, **Tern air scrubbers (3, shuttle air 8 h to 10 h)**. With `?locked=1` formations and the synthetic view stay locked until researched. A topic can `require` another.
- Counters missions can watch: `mission.science.stats.launched`, `.samples`, `.analysed`, `<kind>_<site_slug>`. Survey bonus: `awardSurveyBonus()` pays 3 points once.
- Tests: `science_test.py`, `survey_test.py`, `analysis_test.py`.

## WSKRs (full notes in `WSKRS.md`)
- Up to 4, fixed names and edges (Scout, Lantern, Drifter, Sprat); nav labels **Sc, La, Dr, Sp**. **Base speed 16 kt, 20 on recall**, draw rises with speed. Orders: hold formation, manual, search pattern, **relay**, investigate a selected contact, recall. Fleet **depth** and **formation** settings. **Battery 6 h at base speed to start; research makes it 12 h, then 24 h.** 15% auto-recall, **2 h full recharge in the bay**. **Control link 10 nm; 10 minutes without it and the WSKR surfaces.** **Super cruise 120 kt.** Launches and recoveries use the bay (1 minute). Selected **contact** (`contacts.js`) shows in the craft view readouts.
- **WSKR status page** (Sensors → WSKRs, rebuilt 2026-11-19 from the concept art): **chart on the left, Aqua Nova track up**; **four tiles on the right**; tap a tile or a chart diamond to select: the chart centres on that WSKR (ship still track up) and the right becomes **one big tile** with the synthetic view and more detail; **tap the big tile again to deselect**. **Commands along the bottom act on all WSKRs, or on the selected one.** Test: `wskr_page_test.py`. (Later: `WSKR_SCREEN.md`, `SONAR_PAGE.md`, `BAY_AUTOMATION.md`.)

## Craft view and synthetic vision (`craftview.js`, `synth.js`, `bridge.js`)
- **Craft page** (Remora): vertical profile, synthetic forward view, contour map centred on the craft. The WSKR page now shows only the synthetic view of the selected WSKR (option `only:'synth'`) with two stacked **readouts** over it (Aqua Nova bottom left; selected contact bottom right: arrow, name, bearing, range).
- **Synthetic vision** is a window: fixed 70° view, 1 nm, line of sight only, plan-grid perspective, no labels, **horizon line and speed (KTS), heading and depth (M, downward from the surface) tapes**. Known contours solid, interpolated dashed. Details in `UI_NOTES.md` and `TIME_CRUISE_AND_START.md`. Test: `synth_test.py`.
- **Navigation display** (`nd.js`) can run **track up** with the contours turning with the heading, centre on a chosen WSKR (`focus`), draw big WSKR diamonds (`bigWskr`) and report a tapped WSKR (`onWskr`). **It draws the Area of Operations limit** (red hatch and dashed line outside the charted area).
- Not built: wireframe 3D terrain plot for a point of interest.

## Mail, missions and reports
- **Comms inbox** with a 90 s style zoom window. Messages stamped with the game clock. Test: `mail_test.py`.
- Missions deliver messages and start by **Accept mission**; accepting and completing write **mission logs** (rules in `PED_AND_MISSION_LOGS.md`). Triggers: `property_at_least`, `property_at_most`, `property_change`, `report_sent`, `decision_made`; field `after`; actions `send_message` (optional `delaySeconds`), `start_mission`, `set_property`, `unlock_station`, `unlock_crew`, `aria_decision`, `crew_say`. **Lessons start by `start_mission` actions; ARIA announces each new task** (`task-started`, `COMMS_AND_PROGRESSION.md`). Generated missions: `MISSION_GENERATOR.md`.
- **Sending a report takes time** (upload; `report_sent` fires when the upload ends; `REPORT_TRANSFER.md`).
- **First Contact** → Sea Trials (undock, dive below 30 m, 5 kt, back to 15 m, transmit report) → OERA reply and First Survey offer 60 s later. **First Survey**: Remora, water sample at Mystic Reef, core at Vineyard Ledge, analyse, send findings; 3 research points.

## Notices and held messages (`notify.js`)
- On the bridge, notices go to the **upper display** (title plus body lines, cleared after 5 s). Elsewhere the crew member calls in: **one chirp (at most every 20 s) and a line on the console pill**. `say(role, text, kind, opts)`; `tell(role, text, kind)`.
- **Held messages**: `mission` and `error` messages wait until read in the communicator; the pin pulses. Incoming mail: Comms says "Captain, sorry to interrupt, but we have an incoming message."
- **Silence rule:** nobody chirps until the communicator pin is picked up (`hush`).

## Bridge console (`bridge.js`, `scene.js`)
Now documented in `BRIDGE_CONSOLE.md` (pages NAV, HLM, TAC, SNR, VW, SYS; centre display, controls, right desk bank of six; master range). Screen names: `SCREENS.md`. The retro frame changed only the art and screen positions (`RETRO_SKIN_PLAN.md`). Nav zoom reaches 256 nm.

## Course, speed, depth and the autopilot
- **Course and speed are independent** (owner, 2026-11-19): plotting steers only; speed changes and All stop keep the course; Cancel course keeps the speed. Manual heading changes cancel the course (since 2026-11-23 the route is kept: `BRIDGE_CONSOLE.md`). (`HELM_AND_ORDERS.md`)
- **Plot a course** (`plot.js`, `plotmath.js`): Lat/Long and Place/Bearing tabs; refused with a reason when unsafe, docked or **outside the Area of Operations**. **Routing** (`route.js`): grid A*, obstacles widened, line-of-sight smoothing. Ship floor at least keel + 2 m; WSKRs 3 m.
- **Autopilot** (`sim.js`): `autopilotCap(headingError, distanceNm)`; turn first, then speed up; slows for arrival. **Handling is in real seconds:** turn rate 6°/s slow down to 3°/s at 14 kt (1.5°/s in super cruise), acceleration 1.2 kt/s (3 in cruise), braking 2 kt/s. **Dive rate depends on speed** (speed × tan 20°, 0.5 m/s minimum, 3 m/s cap, 10 in super cruise). `pace()` is constant 1, so handling is the same at every time compression.
- **Depth help:** custom depth keypad; **Hug the floor** (10 m off the bottom); **terrain protection** (Chen holds 10 m off the floor and warns when a depth order would hit it within a minute, then resumes the ordered depth). See `TIME_CRUISE_AND_START.md` and `HELM_AND_ORDERS.md`.

## Communicator (`stations/crew.js`, `chat.js`, `topics.js`)
- **Menu flow** (see `UI_NOTES.md` for the voice and typing channel that was tried and set aside): pick a person → Make small talk / **Ask about …** / Give an order / Report an emergency → reply → One more thing / Someone else / That's all. **Since 2026-11-22 the menu is grouped in folders** and an order exists if it is in `ORDERS` or `PARAM` (`CODE_NOTES.md`; this replaces the old `EXTRA` list). A live transcript shows what the crew said (`UI_NOTES.md`). Contacts have role icons.
- **Ask about… topics (phase 3, built 2026-11-19):** per-person topics that unlock with `progress.talk` count, a lesson flag or another topic, told once then ticked; ARIA puts off "Captain Voss" differently each time (`declines`). 21 topics written from the story bible (**ARIA's "our Area of Operations" added 2026-11-20**). `LAUNCH_BAY_AND_SHUTTLE.md`, `topics.js`.
- **Status reports:** every station officer has "Status report"; **ARIA's "Status Report" is the full ship report** (`HELM_AND_ORDERS.md`).
- **First meetings (`INTRO` in `crew.js`):** each crew member introduces themselves once, saved in `progress.met.<id>`.
- **Small talk that knows the ship (`chat.js`):** Hello, Goodbye, Thank you and That is all for now map to intents. A **hello** gets a greeting plus **one status sentence from that person's own domain**, built from the sim. Thanks, goodbye and done have four lines each per person. **Memory:** `progress.talk.<id> = { n, used }`. Nicole also gives link status, radio chatter and gossip (`PED_AND_MISSION_LOGS.md`). Tests: `tools/chat_test.py`, `tools/topics_test.py`.
- **Retro idea (owner, 2026-11-25):** static crew portraits with speech boxes in place of icons. Not started (`RETRO_SKIN_PLAN.md`).

## Sleep and "Crew has the con" (`away.js`; full notes in `AWAY_AND_SLEEP.md`)
- **Sleep** (Quarters) has two modes: **Skip time** (jump 2 to 24 h, or until arrival) and **Crew has the con**: choose the crew's time limit (4, 8, 12, 24 h), tap Sleep, and **close the app**. The app cannot run while closed, so **on return the game runs the real elapsed time forward (1 game second per real second, capped at 48 h) under standing orders, then ARIA briefs the Captain**.
- **Standing orders:** keep the course and speed; **hold when the Area of Operations limit is about 6 nm ahead**; stop on arrival, on a shoal, at low air (under 30%) or battery (under 20%) (the crew surface), at hull under 60%, or when a craft is lost; stand down at the Captain's limit.
- **Sleep rules (owner, 2026-11-20):** one hour after a stop, still asleep: **an away team takes the Tern for supplies from a port within 40 nm** (supplies no longer change air or battery), and five minutes later **the science team send Remora down at the point of interest**. Neither happens after a stand-down.
- **iPhone:** the status carries the plan and a forecast; the **Status tab shows a "Crew has the con" card** (dead reckoning, and says so).
- Saved in `navigation.away`. Muted catch-up (`sim.muted`). Tests: `away_test.py`.

## Sonar and fog of war
- Rough contours show always. **Fine contours** show where the ship or a WSKR has looked: radius sonar on 4 nm, off 0.8, sweep 8, WSKR 3 (+0.6 Scout). Charted cells saved as a run-length string in `navigation.charted`. **The string starts with the chart width (`w7463` now); old strings without it are treated as 463 columns wide and remapped.** Charting never changes the size of the game files; only the saved string grows a little. (Passive sonar contacts: `SONAR_PAGE.md`.)

## Real sea floor and the Area of Operations
- GEBCO-derived, **extended twice (2026-11-19, 2026-11-20)**: map **30.0–42.4°N, 74.63°W–0°W**. **Two depth grids:** detail (0.005°, box 74.63–69.0°W, 37.0–42.4°N) and wide (0.02°, whole map). **Deep ocean outside the detail box shows only the 500 m lines.** `python3 tools/make_seafloor.py --src <folder>` writes `data/seafloor/` (**about 12.9 MB**). Keel 8 m; shoals stop the ship; impacts cost hull; the dock repairs about 6%/hour. Deep Trench Alpha in Hudson Canyon; Canyon Head 39.62°N 72.45°W.
- **Area of Operations (owner, 2026-11-20):** everything off the charted area is a **no-transgression zone**: red hatch and dashed line on every chart; Helm warns about 6 nm (or 2 minutes) out; the ship stops at the line with no damage; plotting beyond is refused; ARIA has a topic. **Missing tiles: 40–45°N 70–65°W and 40–45°N 50–40°W.** The Halcyon call (40.3°N, 69.5°W) and the Titanic site (41.73°N, 49.95°W) are outside the AO today. (`SEAFLOOR_MAPS_PLAN.md`, `STORY_BIBLE.md`)

## Time, saves, sync, sound, offline
- Game clock `sim.s.clock`; **default is real time**. PED → Settings → Time compression: Real time, 5x, 15x, 30x, 60x, 120x. Sleep keeps the ship moving. **The sim only runs while the app is open and in front** (it pauses when hidden); only "Crew has the con" covers a closed app.
- **Where the game lives:** the service worker keeps every file in the browser cache on the first load, so play is offline after that; the game checks GitHub for updates when online. Memory holds the two depth grids, the rough lines and the chart bitmap; fine tiles load on demand (40 kept). Nothing streams during play.
- Logbook entry = save point; Revert and Restart work on every synced device. `createSnapshot()` keeps fixed top-level keys; new saved values live under `mission.*`, `navigation.*`, `progress.*`. After a load the ship holds still. `snapshotSim()` copies the sim into GameState (tests call it before reading saved values). Checkpoints use the real clock; entries use game time.
- iPhone PED sync = one encrypted secret gist; merge keeps journals and tasks from both devices.
- Sound: Web Audio, PED → Settings (includes data-transfer chirps). Offline: `sw.js` network first. **After adding or renaming files run `python3 tools/update_sw.py`.** (Programmatic sound is a planned retro direction: `RETRO_SKIN_PLAN.md`.)

## Tests (run one at a time; they share a headless Chrome; `pkill -f chrome` between, and never start two runs at once)
`python3 tools/smoke.py` first (loads each screen at iPad size from a `/AquaNova/` subpath), then as needed: `tablet_test`, `tablet_flow`, `trials_flow`, `bridge_test`, `dock_sleep_test`, `sync_test`, `offline_test`, `restart_test`, `revert_test`, `ui_test`, `console_test`, `crew_test`, `chat_test`, `topics_test`, `seafloor_test`, `seafloor_wide_test`, `ao_test`, `away_test`, `notices_test`, `route_flow`, `science_test`, `survey_test`, `analysis_test`, `mail_test`, `update_test`, `comms_test`, `transfer_test`, `unlock_test`, `intake_test`, `aria_test`, `synth_test`, `wskr_orders_test`, `wskr_chase_test`, `wskr_page_test`, `bay_test`, `cruise_test`, `hug_test`, `avoid_test`, `depthpad_test`, `status_course_test`, `transcript_test`, `calendar_test`, `labels_test`, `resume_test`, `ped_test`, `missionlog_test`, `tutorial_test`, `shiptour_test`, plus the newer `sonar_test`, `missiongen_test`, `reputation_test`, `orders_ui_test`, `route_console_test`, `bridge_lesson_test`, `traffic_test`, `world_test`, `wskr_bay_test` (all `tools/*.py`); node: `merge_test.mjs`, `autopilot_test.mjs` (pinned to 30x), `plotmath_test.mjs`, `route_test.mjs`. Several older tests pin the time scale to 30x because they were written for real-time-by-default; `bay_test` runs at 120x. The WSKR battery tests expect the 6 h base and the Tern tests the 1 h base (no research). `tools/shots/` holds screenshots (git-ignored); look at them. Long batches hit the 120 s tool limit: run them in the background and poll the log. `away_test` backdates `sim.away.real` to fake time passing.
- **Known failing (2026-11-25):** `tern_test`, `bay_test` (ROV sample), `wskr_chase_test`, `notices_test`, `bridge_test` (the "Scan" step). They failed before the retro work.

## Decision log
- 2026-11-17: web version; plain HTML/CSS/ES modules; 1920x1080 stage; landscape only; gist sync.
- 2026-11-18 (day): offline service worker; sound; missions by message; walkway; sleep and docking; PED/communicator overlays; real sea floor; held messages; toggle buttons; routing round land; fog of war; objectives in PDA Tasks.
- 2026-11-18 (night): science lab with Remora, samples, analysis and research; launch bay as its own room; WSKRs named Scout, Lantern, Drifter, Sprat; craft pages with synthetic vision; Update now bypasses the HTTP cache; mail zoom window; First Survey mission.
- 2026-11-19: comms console; commissioning gates (`?locked=1`); console line replaces floating popups; communicator voice channel tried and **reverted to the menu flow**; walkways A1 and AN-1 and the medbay room built from the owner's concept art; owner wants a new Science Bay, Bridge and Quarters.
- 2026-11-19 (later): bug-note sync removed; new game starts with the arrival sign-in; player name tokens; ARIA guidance, hints and decisions; synthetic vision on the bridge VIEW screen; WSKR rules (relay, staggered depth, formation by overlap, battery, WSKR page).
- 2026-11-19 (evening): **real time is the default**, time compression setting; **super cruise**; A1 start with ARIA silent until the pin; hidden labels with long press, no bottom bar; **handling in real seconds**; resume at the logbook; **story bible**, renamed characters, first-meeting introductions; communicator small talk that knows the ship.
- 2026-11-19 (night): **bridge notice stack**; squid icon; ARIA "Objective complete. Next: …"; **game calendar 50 years ahead**; mission-log duplicate guards; communicator **live transcript and role icons**; **custom depth keypad and Hug the floor**; **synthetic view as a window**; checkpoint clock fix; nav zoom to 256 nm; WSKR codes Sc/La/Dr/Sp; **speed-dependent dive rate**.
- 2026-11-19 (late night): **timed report transfer**; logbooks never cross out tasks; KTS/M units and downward depth tape; **terrain protection**; **status reports** and ARIA's full report; **course and speed independent**; **lab analysis screens**; document cleanup; ARIA announces new tasks; WSKR battery minutes and link explanation.
- 2026-11-19 (22:30): **WSKR 16 kt base, 20 kt on recall, draw rises with speed; stacked craft-view readouts; selectable contacts (S1…); WSKR surfaces after 10 min without a link; "Ask about…" topics; launch bay rules and door damage; shuttle Tern (seats, airlocks, away teams); WSKR 2 h recharge.**
- 2026-11-19 (23:30): **WSKR battery is 6 h at the start; research takes it to 12 h and then 24 h.** **WSKR status page rebuilt.** **Track-up chart** added to `nd.js`.
- 2026-11-19 (23:59): **Engineering runs the bay** ("ya killing the bay doors"). **Remora uses the bay**. **Tern battery starts at 1 h.** **Tern air: 8 h with all eight seats taken.**
- 2026-11-19 (after midnight): **sea floor extended to 60°W**, two grids, fog-of-war string carries its width.
- 2026-11-20: **Areas of Operation** (owner). **Whole 30–40°N strip imported out to 0°W.**
- 2026-11-20 (later): **Sleep with the app closed ("Crew has the con")**; sleep rules (away team, Remora).
- 2026-11-21 to 2026-11-23: world population (places and traffic), sonar page, route console, generated missions and reputation, Tern orders, bay automation (see the topic documents).
- 2026-11-24: **branches set**: `main` = desktop, `tablet` = what we work on.
- 2026-11-25: **retro reskin** (frames and art only, not a redesign); the owner's bridge frame is in the real game; why retro, in the owner's words, is in `RETRO_SKIN_PLAN.md`; **all topic documents copied into the repo's `docs/`**.

## Roadmap
0. **Retro reskin, room by room** (owner sends 320×240 frames; `RETRO_SKIN_PLAN.md`, `HANDOFF.md`). Later, the owner's ideas: more-retro info displays, static portraits with speech boxes, programmatic sound, programmatic animation and cut scenes.
1. **Communicator dialogue, next phases (agreed 2026-11-19; phases 1, 2 and 3 are done):**
   - **Phase 4 Conversations authored as data.** One JSON file per person: topics with `when` conditions, lines, and `effects`. Move `TOPICS` (`topics.js`) and the `CREW` tables in `chat.js` into this format.
   - **Phase 5 Story conversations with choices.** Use the ARIA decision system. Choices set flags that later missions read.
   - Grow the topics with the story (the Voss thread). **Owner to read the topics for tone.**
   - **Not planned:** free text or a language model at runtime (breaks offline play, drifts out of character, cannot be tested).
2. **Halcyon distress mission** (activate, scan, tune, hail, then act): the first real ARIA decision, Nicole hears it first. **It sits just outside the Area of Operations, so answering it can be the choice to cross the line** (owner to decide).
3. **Tutorial follow-ups:** gate features inside stations, a communicator-orders lesson, a real WSKR lesson, a lesson for the bay (Remora, shuttle), **a lesson for sleeping with the crew in charge**.
4. **Away boats, next:** destinations beyond docks, away-team missions (`pax`/`ashore` triggers, named team members, supplies as items), a dry dock to repair the doors, consequences when Tern's air runs out, Engineering and Medbay stations.
5. **WSKR extras still open:** relay that holds a position apart from the ship, extra battery draw when chasing, GPS drift without a fix, communicator warning when a WSKR leaves link range, more contact sources, a WSKR lesson.
6. **Real effect for the deep sonar sweep topic**; more missions (deep survey at Canyon Head, a point of interest studied with the wireframe terrain plot, the Mid-Atlantic Ridge and Azores to be surveyed). Marine life, mining colony and missing-vessel rescues, combat (`WORLD_POPULATION.md`, `MISSION_GENERATOR.md`).
7. Merge `tablet` work to `main` only when the owner asks. **Sea floor: the two missing tiles, a fine detail box round the Mid-Atlantic Ridge if wanted, missions that redraw the AO, echo-sounder strip, more real POIs.** Report transfer: cancel button, size by content.
8. **Sleep, next:** repeated sampling and Remora dives by the crew, farther ports, more kinds of supplies, the crew re-routing round a block, a push or message to the phone when the ship stops, an away team in trouble, the AO redrawn by a mission.

## Known problems
- Crew voice replies and held messages are not kept between sessions. A course cannot be plotted while docked. A WSKR task to an unreachable site makes the WSKR hold and retry.
- Between contours depth is interpolated; the synthetic view looks smooth and blocky. **The north-east block (north of 40°N, east of 70°W) has no data and is red (outside the AO). Deep ocean outside the canyon detail box shows only 500 m lines.**
- The deep sonar sweep topic has no effect yet. Messages already in an old save have no game date.
- The GPS fix is only shown; nothing uses it yet. WSKR link-loss timer resets on reload. Bay door damage cannot be repaired yet (no dry dock). Docking with Remora out drops her without the unload step.
- With a 1 h battery Tern's range is about 17 nm until the cells are researched, so some dock trips are refused at first. The same limit applies to the sleep-time supply run.
- The WSKR chart cannot be dragged. The command bar wraps to two lines when many commands show.
- When ARIA's new-task line arrives while a topic reply is on screen, the reply block shows the newer line (the transcript still has both).
- At high time compression the turning arc covers more sea floor, because handling is in real seconds.
- A report in mid-upload is lost on reload. Small talk lines and topics were written in one pass: they need the owner's read for tone.
- The walkway A1 art is 2:1 and is cropped to 16:9. `tablet_test.py` reports audio warnings under headless Chrome.
- The sea-floor numbers (draw times, heap about 33 MB, chart bitmap about 9.3 MB) were measured in headless Chrome, not on a real iPad.
- The Area of Operations limit is the chart edge, so it cannot move yet.
- **Sleep with the app closed has only been tested in headless Chrome by faking the elapsed time.** On a real iPad, iOS may kill the app without a hide event; then the plan falls back to the time the Captain went to sleep.
- Retro: the other rooms still use the old art, and the info displays are not retro (by the owner's choice for now). The TAC, SNR, VW and SYS pages on the new bridge centre display are not re-checked; the centre chart's labels can overlap (existing behaviour).
