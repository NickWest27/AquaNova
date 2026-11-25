# WSKR sonar screen (formation rebuilt 2026-11-24)

Owner request: WSKRs should buzz around and sit on acoustic bearing lines so first contact is an intercept, and extra WSKRs should space themselves. **This supersedes the "Formation" bullet in `WSKRS.md`** (the old ring with a scan-ring overlap). Code: `tablet/js/sim.js` (`screenSlot`, `SCREEN_ARC`, `SCREEN_BUZZ_DEG`, `stepWskrs`), `sonar.js` (auto-intercept hook), `stations/wskr.js` (buttons). Test: `tools/screen_test.py`.

## Stations
`screenSlot(i, n, form, underway)` gives each WSKR in formation a bearing off the ship's heading and a ring multiplier. The ring radius is still `formationRadius` (Drifter still swings wide).
- **Under way (over 1 kt):** a fan across the bow. One WSKR: dead ahead. Two: ±55° (wide). Three: 0 and ±110° (wide). The lead (Lantern) takes the centre.
- **Wide / Narrow** (the old Loose / Tight, same saved values): the fan is ±110° wide, ±45° narrow.
- **Extras:** the fourth WSKR goes on an outer line (1.8 times the radius) between two inner ones.
- **At rest:** no bow, so they picket all round, evenly spaced.
- **Buzzing:** each weaves ±10° (±5° narrow) along its line on a 5 game-minute cycle, out of step with the others.

## Auto-intercept
Every 5 game seconds (`sonar.js`): a WSKR in formation is sent (`sim.trailWskr`) to close on an **unidentified ship with a sonar fix**, nearest WSKR first, one contact at a time. At least one WSKR always stays in the screen, so it does nothing with a single WSKR. When the contact is identified the WSKR is released back to its station. A contact is chased once. Crew speak both events. Button **Auto-intercept: on/off** on the WSKR page (`sim.setWskrAuto`, saved as `navigation.wskrAuto`).
- **Leash [owner, 2026-11-24]:** the screen only starts a chase when the contact is within **6 nm of the ship** (`AUTO_START_NM`), and a WSKR on an auto-chase **breaks off at 8 nm from the ship** (`AUTO_LEASH_NM`), returns to its station and the crew say so. The WSKR link is 10 nm. **Investigate (sent by hand) has no limit.**
- A fix needs two listeners hearing the contact on different bearings, so a ship that hears it alone gets only a bearing and no intercept yet.

## Buttons (same day)
One **Search…** button (opens the pattern planner, `SEARCH_PATTERNS.md`). **Rejoin formation** replaces Hold formation, and reads **In formation** (greyed) when they already are.

## Not built
- Bearing lines are not drawn on the chart.
- Instruments are not used to place WSKRs: stations ignore the contact picture until something is unidentified.
- Intercept of bearing-only contacts (send one WSKR to cross the bearing to get a fix).
- `wskr_chase_test.py` and `notices_test.py` fail (they also fail before this work; not investigated).
