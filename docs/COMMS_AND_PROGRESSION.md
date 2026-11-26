# Aqua Nova — Comms console, progression, tutorial chain and ARIA guidance

Last updated: 2026-11-22. Part of the document set listed in `DEVELOPMENT.md`.

## Progression design (owner, 2026-11-18)
- The first few missions are framed as **shakedown sea trials**. They are really a **tutorial** (the owner calls it **commissioning**): each task shows the player one system and, once done, **commissions** it. Tasks include: communicator pin, logbooks, PED, walking round the ship, basic piloting, navigation, sensors, WSKRs, science.
- **In development everything is unlocked.** With gates on (`?locked=1`), a system that has not been learned says it is **not commissioned yet**, with a short in-world excuse (spoken by ARIA).
- **Most basic controls can be done by giving an order to a crew member** (communicator), so a player can always get something done by talking.

### How the gates are built (`tablet/js/unlocks.js`)
- `isCommissioned(station)`: true when gates are off, when the station is in `ALWAYS` (**`ped, crew, log`**), or when it is in `progress.stationsUnlocked` (saved with the game). Old long names are accepted (`Communications` = `comms`, `Logbook` = `log`, and so on).
- Gates are **off by default**. Add `?locked=1` to the URL to play with them on.
- `openStation()` in `app.js` refuses a locked station and has ARIA give its excuse (`EXCUSES`: helm, nav, sys, sensors, comms, lab, remora, wskr, bay). A station that opens sets the flag `tutorial.opened_<name>`.
- A mission commissions a station with `{ "type": "unlock_station", "station": "wskr" }`, and a crew member with `{ "type": "unlock_crew", ... }` (see `TIME_CRUISE_AND_START.md`).

## Tutorial chain (rebuilt 2026-11-22)
Each lesson is a mission (`data/missions/*.json`, listed in `index.json`). Steps watch **flags** (`tutorial.*`, set once with `ctx.flag(name)` in `app.js`, also saved under `progress.flags`) or room entry (the `location-enter` event, sent for bridge, walkway, walkway2, science, medbay, launchbay). A mission action **`crew_say`** (`{ role, text }`) makes a crew member speak: communicator chirp plus console line, held until read. **Tutorial missions carry `"tutorial": true`**: no "New task" or "Objective complete" lines from ARIA, only the PED ticks (`UI_NOTES.md`).

| # | Mission | Steps | On completion |
|---|---|---|---|
| 1 | **First Contact** (`meetTheCrew`) | find the pin, open it, talk to ARIA | unlocks **comms**; starts Ship Tour |
| 2 | **Know Your Ship** (`shipTour`) | open the logbook, open the PED, walkway, bridge | unlocks **helm, sys** and the sensors, communications and security crew; ARIA speaks; OERA's Sea Trials orders arrive 90 s later |
| 3 | **Sea Trials** (`seaTrials`, the commissioning trip, rebuilt 2026-11-26) | orders mail from Admiral Okafor ("Commissioning orders"); **nav** commissioned as it starts. Undock, plot a course to the **Trials AO** (39.9 N 71.0 W, shelf edge, about 100 nm south), dive below 30 m, arrive (en route limits 15 kt and 300 m: ARIA warns once). **On arrival:** **eng** and **super cruise** (`cruise`) commissioned, Commander Chen speaks, "Welcome to the AO" mail. Then open the engineering computer, dive to 300 m, full speed (13 kt+), super cruise to 100 kt, up to 15 m, send the report | OERA reply (commissioned, come home via Vineyard Ledge); starts Charting a Course |
| 4 | **Charting a Course** (`navLesson`, **combined with the old Reading the Sea**) | on the way home, plot a course to **Vineyard Ledge** (about 16 nm south of Woods Hole; **then set a speed at the Helm**); open Sensors; **launch a WSKR** from the WSKR page (ship under 8 kt); run a full sweep; arrive at the ledge; scan it | unlocks **lab, remora, bay**; Dr. Patel speaks; OERA's First Survey offer arrives 60 s later |
| 5 | **First Survey** (`firstSurvey`) | Remora samples (water at Mystic Reef, rock core at Vineyard Ledge), analysis, report | a sensors officer explains the WSKRs |

(The "open Navigation" step of Charting a Course was removed 2026-11-22: see `CODE_NOTES.md`.)

- **The lesson commissions Sensors and the WSKR link when it starts** (`onStart`), not at the end, so the player can use them on the way. The old `sensorsLesson.json` is gone. The order inside the lesson: plot, then open Sensors, then WSKR and sweep (either order), arrive after plot, scan after arrive (`after` chains).
- **Story (owner, 2026-11-26):** the first logbook entry is Admiral Okafor's welcome (the owner's own text, `data/logbooks/SeaTrials.json`); the commissioning orders come later by mail; "Welcome to the AO" holds the speed paragraph. Super cruise is gated like a station: `isCommissioned('cruise')` in a `sim.cruiseGate` (app.js); refusals worded by `cruiseWhy()` in `sim.js`. Not built: the friendly escort vessels the AO mail mentions (only ordinary traffic is there).
- Flags used: `plotted_ao`, `arrived_ao` (from ship state, `syncLessonFlags`), `opened_eng`, `opened_log`, `opened_ped`, `opened_nav`, `opened_sensors`, `plotted_ledge` (a course to Vineyard Ledge is set), `arrived_ledge`, `wskr_out` (a WSKR is deployed), `swept` (full sweep), `scanned_ledge` (Vineyard Ledge scanned). Flags are sticky, so a step the player already did completes at once when its lesson starts.
- **Lessons are re-checked (2026-11-22).** `lessonNudge()` in `app.js` runs every few seconds: it calls `missionManager.checkTriggers()` and sets the ledge flags from the ship's own state (a ship already at Vineyard Ledge counts as plotted and arrived; a deployed WSKR counts). This fixes steps that stuck when a flag was already true before the lesson began.
- **Lessons start by `start_mission` actions**: there is no mail to accept and no mission log is written, and a lesson never appears in the logbook while active (the logbook lists only finished missions). Open question for the owner: show lessons in the logbook, or label them "Training".
- **Possible further merging (owner asked, 2026-11-22):** First Contact and Know Your Ship are short and could become one "Commissioning: Welcome aboard" lesson. Not done.
- Tests: `tools/tutorial_test.py` (the whole chain with `?locked=1`), `tools/lesson_test.py` (ship already at the ledge), `tools/trigger_test.py`, `tools/survey_test.py`.
- **Not done yet:** gating rooms and tap areas; gating features inside a station; a lesson for the communicator orders.

## ARIA guidance and decisions (built 2026-11-19, owner's design)
ARIA is wired into the ship's systems. She sees what the Captain does and speaks through the communicator, in place of the old pop-up toasts. Station-specific news comes from the crew member of that station. Tactical decisions come through ARIA ("Should we rescue the colonists or engage the pirates?").

**Crew reports instead of toasts** (`tell(role, text)` in `notify.js`, built on `say()`). On the bridge the line goes to the upper display. Elsewhere it is a console line, with a communicator chirp at most every 20 s. Roles: **ARIA** (locked-station excuses, engineering and medbay not built, PED collected, arrival guidance, mission log saved, new task announcements for non-tutorial missions, "Objective complete. Next: …"), **Helm** (course plotted, collision avoidance, speed held at the bay limit), **Sensors** (scan filed, sonar sweep, WSKR launch, recall and tasking), **Science** (lab analysis and research, Remora launch and recovery, bay ROV lines), **Comms** (report sending and reply, cannot transmit, antenna pulled in). A toast is kept only for plain interface feedback: errors, "saved", copy, import and export, sound test, sync messages.

**Hints** (`tablet/js/aria.js`, `checkHints()` every 5 s). A mission lists `"hints": [{ "condition": { "type": "objective_active_for", "objectiveId": "...", "seconds": N }, "message": "..." }]`. When that objective has been waiting N real seconds (and its `after` step is done), ARIA says the message once. The shown hints are saved in `progress.hintsShown`. Hints are heard at once and are not kept in the communicator. Written for First Contact (three), Know Your Ship (three) and Charting a Course (six). Messages may use `{captain}` and `{first}`.

**Decisions.** A mission action puts a choice to the Captain:
```json
{ "type": "aria_decision", "id": "colonists_or_pirates",
  "text": "{captain}, two things at once. ... What are your orders?",
  "options": [
    { "id": "rescue", "label": "Rescue the colonists", "reply": "Aye, {captain}.", "actions": [ { "type": "start_mission", "missionId": "..." } ] },
    { "id": "engage", "label": "Engage the pirates",  "reply": "Aye, {captain}. Battle stations.", "actions": [ ... ] } ] }
```
- ARIA announces it (chirp, "ARIA NEEDS A DECISION" on the bridge display). The decision waits in `progress.decisions.pending`, so it survives a reload and a revert. The pin glows, and ARIA shows a badge in the communicator contact list.
- Tapping ARIA in the communicator shows the situation and the options. A choice runs that option's `actions`, records `progress.decisions.made.<id> = <optionId>`, and ARIA answers with `reply`. A decision is asked once only.
- A later objective can wait for the answer: trigger `{ "type": "decision_made", "decisionId": "...", "optionId": "..." }` (`optionId` optional), or use the property `progress.decisions.made.<id>`.
- Any option's `actions` can be any mission action (`start_mission`, `send_message`, `set_property`, `crew_say`, and so on).
- Tests: `tools/aria_test.py` (uses a made-up colonists-or-pirates decision; no such mission exists yet).

**Not done:** ARIA noticing player actions beyond hints and new tasks (for example a first dive, low battery or a near grounding); a time limit on a decision; a way to see an open decision from the PED; real decision content (the Halcyon distress call is the natural first one); the communicator orders still answer "Captain" and not by name.

## Comms console (`stations/comms.js`, `commsLinks.js`, `commsPanels.js`, `commsModel.js`)
Tabs: **Links**, **Controls**, **Contacts**, **Mail**. It opens on Mail when there is unread mail. Modelled on the show's COMM SYSTEMS screens (concept art `comms.png`, `comms(1).png`, `comms.call.png`, `comms.contacts.png`).

**Links** (readouts):
- Four link cards: LINK 1 SAT-COM (UHF), LINK 2 LASER (blue-green), LINK 3 HF, LINK 4 VLF. Each has an MCell number, status, NORPAC and a code (call code `AQN-101-<game year>`). Tap one to select it.
- Signal panel (dB, estimated distance, frequency range, tracked location, bearing, ident) with a "COMMUNICATIONS LINK ESTABLISHED" banner.
- Satellite or shore station column (course, elevation, position, data rate, lock, tracking, and so on). Relays are fixed geostationary satellites; HF and VLF use Woods Hole and Cutler, Maine, with real bearings and distances.
- Band table (ELF, VLF, AM, HF, VHF, UHF, laser) with lamps for what the current antenna depth allows, an animated spectrum, and a small blocky world map (hand-placed rough coastlines).

**Controls**:
- **Antennas**: Mast (HF, VHF, AM, laser head; 0 to 6 m), Comm buoy (UHF satellite; 0 to 40 m), VLF wire (VLF, ELF; 0 to 100 m). Lower, Raise, Stow, Max. They move slowly and are **pulled in above 8 kt (mast), 4 kt (buoy) or 6 kt (wire)**. Antenna depth = ship depth − extension.
- Link strength falls with antenna depth: full strength down to each link's limit (UHF and laser 15 m, HF 5 m, VLF 40 m), weak up to 1.5 times that, then no carrier. Limits are in `LINKS` and `BANDS`.
- **Transmit source**: Satellite, Laser, Radio (HF). **Best signal** picks the strongest usable one.
- **Dish aim** (satellite and laser only): **Auto track** (default) or manual with 1° and 10° nudges. Misaim lowers the signal (satellite tolerance 15°, laser 4°) and past a point there is no lock.
- **Transmit report** (also on the Mail tab, and Nicole's order "Transmit a report"): starts a **timed transfer** whose speed follows the link and its signal strength, with a progress bar and sounds. Needs the active source up. Full rules in `REPORT_TRANSFER.md` (newer: no wait for OERA and no reply download).
- **EMF detector**: field in µT, a needle relative to the bow, and a label. Wrecks (strong) and docks (power cable) disturb the field out to 4 nm; the source is named within 0.4 nm.

**Contacts**:
- Directory in four tabs (Bases, Ships, Subs, Orgs) from `data/commsContacts.json`. **All contacts and their replies are placeholders I wrote.** Tap one to tune to it.
- Tuner for HF, VHF and UHF with coarse and fine steps. **Hail** needs the right frequency, the right antenna raised, and the contact in range. **Scan band** lists carriers in range with signal and bearing; tap one to tune.
- **Secured / Unsecured** toggle (shown on the call panel). Call panel shows origin, station, auth code, link, route, range and the reply, like the show's call screen.
- Hidden contacts: an entry with `"hidden": true` (Halcyon Research Station, HF 4.125 MHz, `"distress": true`) is silent and invisible until a mission adds its id to `mission.comms.active`. A mission can then watch `mission.comms.hailed` (list of contact ids) or the `comms-hail` event (`detail: { id, name, secure }`).
- Not saved across reloads: antenna positions, aim, dial settings, call log, a transfer in progress. Hailed contacts and activations are saved (`mission.comms.*`).
- Tests: `comms_test.py` (links, depth, antennas, aim, contacts); `transfer_test.py` (report transfer); `mail_test.py` and `trials_flow.py` click the Mail tab first.

## Other changes
- **Main navigation display:** the **medium (slanted) display is track up** (`createND` option `trackUp`); the large main screen stays north up. A **light dashed one-hour vector** runs from the ownship icon at the current speed. Zoom reaches 256 nm. It also draws Remora (violet Rm with a tether) and the Tern (pink Tn).
- **WSKRs and land:** movement is sub-stepped and checked against land every step; a WSKR that cannot move for several steps replans.
- **PED (tablet):** a **Communicator button** (amber chip, pulses when unread) at the end of the tab row opens the communicator and closes the PED, as a backup to the pin.
- **Offline:** `sw.js` lists the game files (run `python3 tools/update_sw.py` after adding, removing or renaming files).

## Open question: orders from the iPhone
The owner wants to **issue orders from the phone while away**. The iPhone PED has no simulation and only syncs journal notes and tasks through the gist. Option on the table: an **order channel through the gist** (phone sends an order; the iPad executes it within about 20 s and only while the game is running; the phone shows an acknowledgement). Not started; not yet agreed. (`IPHONE_PED.md`: the owner later decided the phone stays read-only.)

## Roadmap additions
1. Tutorial follow-ups: gate features inside stations, a communicator-orders lesson, possibly merge First Contact and Know Your Ship.
2. A mission using the Halcyon distress call (activate, scan, tune, hail, then act), with the first real ARIA decision.
3. Comms effects still to do: relay WSKR carrying real link strength, laser needs line of sight, secure channel required by some missions. (Report time and signal-dependent transfer: done.)
