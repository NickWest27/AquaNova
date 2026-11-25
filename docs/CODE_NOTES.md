# Code notes: how things are wired (2026-11-22 clean-up)

The owner is restarting the mission, so the game carries **no old-save compatibility code**. Do not add shims for old saves; change the data and start fresh. (A save made before 2026-11-22 21:30 holds a `navLesson_open` step that no longer exists, so that lesson cannot finish in such a save: start a new game.)

## Orders menu (`tablet/js/stations/crew.js`)
- **An order exists if it is in `ORDERS` (runs at once) or `PARAM` (asks for a number first).** The menu shows it when it sits in that person's `TREE` folders and its `show()` predicate is true.
- `data/contacts.json` `commands` now only lists orders that are **not built yet**; they appear under "Not available yet". There is no `EXTRA` list and no typo alias any more. **This replaces the `EXTRA` description in `DEVELOPMENT.md` and `WSKRS.md`.**
- To add an order: write it in `ORDERS` or `PARAM`, add it to the person's `TREE`. Nothing else.

## Missions (`game/systems/missionManager.js`)
- `restoreFromState` only rebuilds the active and completed sets. No migration, no orphan handling, no text refresh.
- Mission files load one by one; a bad file is logged and skipped.
- Lesson flags that come from ship state (plotted to Vineyard Ledge, arrived, WSKR out) are set by `syncLessonFlags()` in `app.js`, about once a second, then triggers are re-checked.
- **Charting a Course (owner, 2026-11-22) starts at "Plot a course to Vineyard Ledge".** There is no "open the Navigation station" step: the Captain already uses the NAV display, and the bridge's small displays never opened the station anyway, so that step could not be ticked. If the Captain waits, ARIA's hint (60 s) says where to tap. Then Sensors, WSKR, sweep, arrive, scan.

## Depth and the floor
- **The floor limit holds everywhere, harbour included (2026-11-22).** Before, the dredged-harbour exemption (within 2 nm of a dock) also switched off terrain protection, so a Dive 50 m near Woods Hole took the ship 40 m below the chart floor with no warning. Now `HARBOR_CLEAR` (3 m) replaces the 8 m keel and 10 m hug margin inside the harbour: Marcus holds the ship that far off the floor and says so (`avoid-on`, wording uses the margin). Outside the harbour nothing changed. Test: `tools/avoid_test.py`; lesson test: `tools/bridge_lesson_test.py`.

## Still untidy
- `syncLessonFlags()` hard-codes Vineyard Ledge. A data-driven version (flags declared in the mission file as sim conditions) would be cleaner; do it when a second lesson needs it.
- `PARAM` handling for "Make your speed" in `utils/communicatorOverlay.js` (desktop version) still tests for the old typo; leave it, the desktop build is the design reference.
