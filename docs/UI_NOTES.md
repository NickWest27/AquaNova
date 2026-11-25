# Aqua Nova — UI notes: console line, notices, synthetic window and communicator

Last updated: 2026-11-22. Part of the document set listed in `DEVELOPMENT.md`.

## No floating popups (owner, 2026-11-18)
Floating cards break realism, so feedback goes to **one docked readout**, the **console line** (`#console-line`, bottom edge, `consoleLine()` in `util.js`).
- `toast(text, kind)` writes to the console line. On the **bridge** it still goes to the **upper display** only.
- **Inside a station** the line is part of the layout (the station is shortened by 2.4 rem; `body.has-line`) and stays until replaced, dimming after 7 s. **In rooms** it appears over the bottom edge and fades after 7 s.
- **Crew calls away from the bridge** (`say()` in `notify.js`): one communicator chirp (at most every 20 s) and the line. Held messages add "(tap the pin to answer)" and the pin pulses. The floating crew cards are gone.
- **Still dialogs:** modals for real decisions (Sleep, new log entry, revert, erase and restart, plot a course), and the PED and communicator overlays.
- **Station overlays:** the report transfer bar (`.xfer`, top right, not tappable) shows on the stage in every scene (`REPORT_TRANSFER.md`).
- Tests read `#console-line`.

## Bridge upper display: notice stack (owner, 2026-11-19)
Sequences like undocking ("Disconnecting shore power…", "Releasing the clamps…") show on the **upper display** as a title.
- The **newest notice is the title**: large, bright, uppercase (40 px, shrinks to 30 or 21 px for longer text; mission = amber, error = red).
- When something new arrives, the old title **drops down and becomes a body line** (dim, one line, prefixed with the officer's surname). Three lines at most.
- After **5 s with no change** all notices clear and the normal readout (place, position, BAT / O₂ / HULL) returns.
- Code: `notice` event (`detail: { text, kind, who }`) from `say()` and `toast()`; the stack lives in `bridge.js` (`notes`, `NOTE_HOLD`, `paintNotes()`), styles `.bt-stack`, `.bt-title`, `.bt-body` in `tablet.css`. Chen's collision warning shows here as "COLLISION AVOIDANCE".
- **Tutorial missions are quiet (2026-11-22).** A mission with `"tutorial": true` (meetTheCrew, shipTour, navLesson, sensorsLesson; not seaTrials) does not trigger ARIA's "Objective complete" or "New mission" lines. `missionManager` sends the flag in `mission-notify` and `task-started`; `app.js` returns early on it.

## Synthetic view is a window (owner, 2026-11-19)
- **Hidden lines are removed** (floating horizon in `synth.js`): a line, marker or sampling ring is drawn only where it rises above the highest nearer ground in that screen column. Nothing behind a ridge or a slope shows.
- **Perspective:** the floor is drawn from a **plan grid** (rows at fixed forward distances, columns at fixed 16 m lateral offsets), so lines running away from the ship converge to the horizon instead of standing vertical.
- **Fixed view:** 70° field of view, 1 nm of sight, a constant height stretch `EXAG = 5` (true scale, 1, looks flat; change the constant if wanted). **No range buttons** on the bridge VIEW console.
- **No labels or legends.** Known contours are solid green (major lines thicker), interpolated ones dashed blue. Site markers (yellow triangles with a dashed reach ring) and the ship marker stay, without names.
- **Instruments:** a **horizon line** (the level line of sight, with a centre reticle); a **heading tape** across the top (ticks every 5°, numbers every 15°, boxed current heading); a **speed tape** on the left (**KTS** label above; 1 kt ticks, numbers every 5, boxed value with one decimal); a **depth tape** on the right (**M** label above). **The depth tape runs downward: 0 (the surface) at the top, deeper at the bottom**, numbers positive; ticks and numbers get coarser with depth (1/10 m under 100 m, 10/50 m under 600 m, 50/250 m below). The craft passes `speed` to `draw()` (bridge: `s.speed`; craft pages: `c.kt`). `vtape(…, unit, inv)` draws a tape.
- Flat ground shows few or no lines (contours every 5 to 10 m on the shelf). The test spot is a slope at 39.9°N 71.7°W facing north. Test: `tools/synth_test.py`.

## Saves and resume
- See `TIME_CRUISE_AND_START.md` (what loads on start; checkpoints use the real clock). Short form: the **exit save** loads if there is one, otherwise the last entry's snapshot; any entry counts.

## Communicator: live transcript (owner, 2026-11-19)
A crew member's **voice and running notes** belong in the communicator, not only on the upper display.
- Every `say()` call for a crew role is also written to an in-memory transcript (`logLine()` / `transcript(id)` in `notify.js`) and fires a `crew-line` event. What the Captain says is logged too.
- The communicator shows earlier lines in a small scrolling log (`.comm-log`) and the **newest line as the big reply block**. It updates live while open, so the undock commentary appears as it happens.
- The transcript is **not saved** across reloads.
- Contacts show **role icons** (`icons.js`) and stay reachable once they have spoken (see `TIME_CRUISE_AND_START.md`). Station officers answer "Status report" and ARIA gives the full ship report (`HELM_AND_ORDERS.md`).

## Communicator: back to the menu version (owner, 2026-11-19)
The owner tried the voice/typing channel and found it **hard to remember crew names and the speech options**, so the communicator is **back to the original menu flow** (restored from commit `51bd0c2`): pick a person, then Make small talk / Give an order / Report an emergency, then the line, then "One more thing" / "Someone else" / "That's all". The pin is a single tap again; tap outside closes; no close button.

**Tried and set aside** (still in git history, commit `40ecdd7`, in case it comes back):
- *Voice channel* (`35e3346`): a transcript plus one line to speak or type; browser speech recognition (`webkitSpeechRecognition`); a phrase parser (`normalize()`/`understand()`) for crew names and orders; press and hold on the pin for voice, single tap for quiet typing; a **Settings → Voice commands** option, off by default (the browser's speech service may send audio to Apple or Google).
- *Tap-the-lines version* (simulated voice, plain text lines, crew ask back for numbers): never committed; it was kept in a git stash.
- **Lesson:** the owner wanted a *simulated* voice communicator (the show's badge) with an easy way to see who and what to say. Next time: keep the options visible, show names with roles, avoid free text.

## Communicator: grouped menu, current dialogue, how-to guides (owner, 2026-11-22)
- **Folders, not a flat list.** Each crew member has a `TREE` in `stations/crew.js` (executiveOfficer, helm, sensors, engineering, science, communications, security). Folders hold orders, topics and guides. Example for Marcus: *Give an order → Depth* holds periscope depth, make your depth and hug the floor together.
- **Only relevant options show.** Each leaf has a `show()` predicate on ship state: dock or undock (never both), periscope depth only when the ship is not already within 1.5 m of it, and so on. Folders are re-resolved on every render from a **trail of labels**, so options follow the ship while the menu is open. An empty folder disappears.
- **Ask about… → How do I…** Topics sit under a **Background** folder. **Guides** (`tablet/js/howto.js`: `GUIDES`, `guidesFor`, `askGuide`) are numbered steps in ASD-STE100 style, shown with `white-space: pre-line`. Nicole: comms pages; Marcus: helm and nav; Alex: sensors; Samira: science; ARIA: bridge, PED, log; Ryan: systems.
- **Dialogue stays current.** Held crew messages carry `key`, `valid` and `ttl` (`notify.js`). `retire(key)` drops a message when it no longer applies (the bay launch line key `bay` is retired in `finishOp`); `prune()` drops expired or invalid ones. Held lines are **not filed to the transcript until read** (`takeHeld`), unless that person's communicator is already open (`setOpenCrew`). So stale lines such as "Remora is being readied" never reach past conversations; only dialogue the Captain actually saw does.
- **Contacts page taps (Comms).** The kind bar was rebuilt on every refresh and ate presses; it now rebuilds only when its signature changes (`commsPanels.js`).
- Tests: `tools/dialogue_test.py`, `tools/crew_test.py`, `tools/topics_test.py`, `tools/comms_test.py`.

## Tutorial missions: history triggers (2026-11-22)
Missions can now complete from things already done. `HISTORY_TRIGGERS` in `missionManager.js` (item pickup, location enter) check `progress.seen`, so an action taken before the objective opened still counts. `meetTheCrew` objectives are chained with `after`. `dialogue_complete` matches on `dialogueId`, and the XO's tour dialogue only fires it for the Executive Officer.

## Hug floor (2026-11-22)
`hugHold()` in `sim.js` holds the altitude (`HUG_ALT` 10 m) as the floor changes, using a look-ahead limited by lead time rather than a minimum over the window. On slopes steeper than about 17–20° (`PITCH_TAN`) or where the needed dive rate would pass `MAX_DIVE_MPS` (3), the ship slows so it can keep up. `hugTarget()` stays for terrain protection. Test: `tools/hug_hold_test.py`.

## Lab instrument screens
- Canvas displays in the Science Lab (`analysisView.js`); see `SCIENCE_LAB.md`.

## Comms Links page fit
Link cards use four short lines (`● TX` beside the title, "NORPAC <code>" on one line) so nothing wraps or overlaps at 1180 × 820.
