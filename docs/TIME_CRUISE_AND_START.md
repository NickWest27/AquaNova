# Aqua Nova — calendar, saves, depth and dive rate, time, super cruise, start rules and ship tour

Last updated: 2026-11-19 (late night). Part of the document set listed in `DEVELOPMENT.md`. Course and speed, terrain protection and status reports are in `HELM_AND_ORDERS.md`.

## Game calendar (owner, 2026-11-19)
- **Day 1 of the game is 50 years after the day the game was first started** (a game first played on 19 Nov 2026 starts on 19 Nov 2076, clock 06:00). It was a fixed 16 Aug 2074; that date in old saves and docs is out of date.
- The date is kept **on the logbook** as `epoch` (midnight UTC of Day 1), set by `ensureEpoch()` in `game/saveManager.js`. `timeBase.epoch` in `sim.js` is loaded from it in `loadGame()`; `gameDateText()` and `gameNowISO()` use it.
- **Logbook entries are stamped with game time** (`addLogEntry` passes `gameNowISO()`), so M.LOG-0001 and later entries sort correctly (newest on top). Before this, entries used the real clock while M.LOG-0001 was dated 2074, which put them out of order.
- **Old logbooks migrate once:** no `epoch` → one is set, M.LOG-0001 is moved to Day 1 at 06:00, and later real-dated entries follow in the same order, one minute after. "Restart from the beginning" keeps the same calendar.
- The call origin code on the comms console uses the game year (`AQN-101-<year>`). The ship registry `DSV-2074-DSRV` in `data/logbook.json` (old desktop file) is unchanged.
- Test: `tools/calendar_test.py`.

## Saves and resume
- On start, the game loads `logbook.checkpoint` (the exit save, written when the app is hidden or closed, before sleep, and at every logbook entry) if there is one, else the snapshot of the last log entry. Any entry counts, mission log or manual. An Update now reload comes back to where the Captain was.
- **Checkpoints are always stamped with the real clock.** The sync merge (`utils/ledgerSync.js`) keeps the newest checkpoint by timestamp; a checkpoint stamped with game time (2076) beat every real exit save and sent the Captain back to an old position. Future-stamped checkpoints are corrected on load.

## Mission logs: one of each
- A mission has one "accepted" and one "complete" mission log. `missionLog.js` checks the logbook itself (`hasLog`) before writing, and `completeMission()` ignores a mission that is already complete. The cause of the duplicate the owner once saw is unknown; existing duplicates stay until the logbook is restarted or reverted. Logbook entries never show ticks (`PED_AND_MISSION_LOGS.md`). Test: `tools/transcript_test.py`.

## ARIA objective lines
- When an objective completes, ARIA says **"Objective complete. Next: <next objective>."** (`mission-notify` listener in `app.js`). With nothing left: "Objective complete."

## Crew reachability and icons
- `say()` marks a crew member `known` once they have spoken, and completing the Ship Tour **bridge** step (`unlock_crew` in `shipTour.json`) unlocks Sensors, Communications and Security (before this Nicole, Torres and Kim could be reached only while a message from them was unread). Boot repairs older saves that have already been to the bridge (`app.js`).
- **Communicator contacts have role icons** (`tablet/js/icons.js`, `crewIcon(id)`): ARIA eye, helm wheel, science flask, engineering gear, sensors scope, comms antenna, security shield. Portrait art can replace these later (see `RETRO_SKIN_PLAN.md`: static portraits with speech boxes).

## Custom depth and Hug the floor
- **Custom depth:** a touch keypad (`depthPad.js`, `askDepth()`), reached from the communicator (Helm → Give an order → Make your depth → Custom depth …) and the Helm station (**Set depth …** chip). Shows the safe depth for the position; the ship stops at the safe depth if more is asked. Maximum 6000 m. Test: `tools/depthpad_test.py`.
- **Hug the floor:** `sim.setHug(true)` (`sim.js`). The helm keeps the ship **10 m above the sea floor** (`HUG_ALT`), looking ahead along the course (**about 60 s of travel, 0.08 to 4 nm**) so it climbs before a rise. Needs at least `HUG_MIN_FLOOR` (30 m) of water; refused when docked. **Any depth order ends it** (`setDepth`), as does docking or water that turns too shallow (`hug-off` event, Helm says so). Orders: Helm → "Hug the floor" / "Stop hugging the floor"; Helm station **Hug floor** chip (filled = on). Not saved across reloads. Test: `tools/hug_test.py`. (A depth order alone is also protected from hitting the floor: see terrain protection in `HELM_AND_ORDERS.md`.) The hold logic was improved 2026-11-22: see `UI_NOTES.md`.

## Dive rate
- **The dive rate depends on forward speed** (`diveRate(kt, cruise)` in `sim.js`). The ship dives like a plane, limited to a **20° pitch**: rate = speed × tan 20°, never below **0.5 m/s** (hovering and thrusters when stopped or slow), capped at **3 m/s** (**10 m/s in super cruise**). It replaces the old fixed 8 m/s.
- Examples: stopped 0.5 m/s; 5 kt 0.9 m/s; 14 kt 2.6 m/s; 60 kt 3 m/s (cap); 100 kt super cruise 10 m/s. A 300 m dive at 14 kt takes about two minutes. Surfacing uses the same rate.
- Test: `tools/hug_test.py` (checks the values above).

## Nav and WSKR display
- **Nav zoom goes out to 256 nm** (`RANGES` in `nd.js`: 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256). Place names are hidden beyond 32 nm except the selected one and the destination.
- **WSKR labels on the nav display are Sc, La, Dr, Sp** (Scout, Lantern, Drifter, Sprat; `WSKR_CODES` in `sim.js`), not W1 to W4.
- **WSKR page rows show bearing and distance** from the ship, for example `BRG 196° · 1.3 nm` (`toward(s, w)` in `stations/wskr.js`).

## Synthetic view
- Looks like a window: fixed 70° FOV, 1 nm view distance, line of sight only, plan-grid perspective, no labels or legends; horizon line and speed, heading and depth tapes on top. Full description in `UI_NOTES.md`. Test: `tools/synth_test.py`.

## Time compression
- The default is **real time** (1x): 1 real second = 1 game second. (It was 30x until 2026-11-19.)
- **PED → Settings → Time compression**: Real time (default), 5x, 15x, 30x, 60x, 120x. Saved in `settings.timeScale`; applied on load in `restoreSim()`; a save with no choice gets real time.
- Code (`sim.js`): `TIMESCALE` is a live `export let`, changed with `setTimeScale(n)`; `TIME_SCALES` lists the choices. **Handling is in real seconds:** `pace()` is constant 1, so turns, speed changes and dives take the same real time at any setting (6°/s slow, 3°/s at 14 kt, 1.5°/s in super cruise; dive rate as above). `sim.step(dt)` takes real seconds and splits into pieces of at most 8 game seconds, so 120x does not skip over land or the floor. At high compression the turning arc covers more sea floor.
- Sleep still fast-forwards. Several older tests pin the scale to 30x. Report transfers use real seconds at any setting.

## Super cruise
- **Aqua Nova: 100 kt** (`SUPER_KT`). Toggle: **Helm** station (Super cruise button), **Bridge** HELM row (Cruise), or the Helm officer's communicator orders "Engage super cruise" / "Disengage super cruise".
- Needs: not docked, power available, and **at least 120 m of water under the ship and at 3, 6 and 9 nm ahead** (`superWaterAhead`). If the water ahead turns unsafe it **drops out of cruise on its own** (`cruise-off` event; Helm says so). Faster acceleration (3 kt/s) and braking (6 kt/s). Power and battery drain are scaled up. Time warp steps smaller (6 s) while cruising. `sim.maxKt()` gives the current top speed (gauges use it).
- **WSKRs: 120 kt**; see `WSKRS.md`.
- Test: `tools/cruise_test.py` (uses Deep Trench Alpha, because Canyon Head is only 115 m deep).

## Start and silence rules
- **New game starts in Walkway A1** (`openScene('walkway')`). The sign-in PED is shown there.
- **ARIA and communicator chirps stay silent until the communicator pin has been picked up.** Rule: while objective `meetTheCrew_pickup_communicator` is active, `commsLocked()` is true and `say()` returns early (`hush` in `notify.js`); `checkHints()` in `aria.js` also returns early. Automated tests (webdriver) are not hushed, unless the URL has `?intake=1`.
- Test: `tools/intake_test.py` (A1 start, silence before the pin).

## Ship tour and lesson flags
- **Steps count what was already done.** Ship Tour objective `log` also completes on `progress.read_welcome`, and `ped` also completes on `progress.got_ped` (collecting the PED), so they finish the moment the tour starts. The tour's opening line no longer lists them.
- **ARIA names only what is left.** For a locked helm or systems station, `excuse()` in `unlocks.js` lists the unfinished tour steps ("Still to do on the ship tour: walk the main walkway, visit the bridge."), or tells the Captain to call her first when the tour has not started.
- **Lesson flags are saved.** `flag()` in `app.js` writes `progress.flags.<name>` as well as `tutorial.<name>`, and boot copies them back, so a reload (or the resume at the logbook) does not forget what has been done.
- Test: `tools/shiptour_test.py`.

## Home-screen icon
- The tablet icon is the squid logo (`tablet/assets/icon-v2-180.png`, built from the project's 96 px `favicon.png`). The file was renamed so iOS fetches it again; the old home-screen shortcut must be removed and re-added. A 512 px original would be sharper. The PED icon (`ped/icon-180.png`) is unchanged.

## Smaller changes
- WSKR manual control link range is 10 nm (`WSKR_LINK_NM`).
- PED tab row no longer shows a stray "false" (a `cond && el()` inside `replaceChildren`).
- Sign-in declaration is longer: truth declaration plus the penalty for falsifying records.
- Marcus's introduction no longer says he has flown every sea trial (the sea trials have not started); he spent the fitting-out in the simulator.
- `sw.js`: 164 files.
