# Aqua Nova — course vs speed, terrain protection, status reports, tapes (2026-11-19, evening)

Addendum to `TIME_CRUISE_AND_START.md`. Newer than the other docs where they differ.

## Course and speed are independent (owner, 2026-11-19)
- **Plotting a course steers only** (horizontal navigation). It no longer sets the throttle to 50%; the ship keeps whatever speed the Helm has. Helm says "Speed unchanged" or, if stopped, "We are not under way. Set a speed when you are ready."
- **Speed changes keep the course:** the Helm lever, the bridge Faster/Slower buttons, the communicator "Make your speed" and **All stop** no longer clear the plotted course. (`sim.stop()` now sets the throttle to 0 only.)
- **Cancelling the course keeps the speed:** Navigation → **Cancel course** calls the new `sim.cancelCourse()`.
- **Changing heading by hand still cancels the course** (dial, Port/Stbd, "Come left/right", "Make your heading"), because it overrides the steering.
- The autopilot still slows for sharp turns and on arrival (`autopilotCap`) and sets the throttle to 0 on arrival. The communicator order "Let's go home" still starts at 50% because it is a "go" order.
- Charting a Course lesson text now says to set a speed at the Helm as well. Tests: `tools/status_course_test.py`; `trials_flow.py` waits for the upload now.

(2026-11-23: manual control now keeps the route; see `BRIDGE_CONSOLE.md`.)

## Terrain protection: Chen keeps us off the floor (owner, 2026-11-19)
- When a depth order would put the ship into the floor within about **one minute of travel** (0.08 to 4 nm lookahead along the course), the helm holds **10 m above the lowest ground in that stretch** instead. Like Hug the floor, but only ever **at or above the ordered depth**: when the ground falls away the ship goes back to the ordered depth and never deeper.
- The order itself is kept in `targetDepth`; the held depth is local to the step in `sim.js` (`want`). `s.avoiding` is true while it is holding.
- **Chen's messages:** `avoid-on` — "the sea floor is rising ahead … I am holding N metres" (error style, notice "COLLISION AVOIDANCE", at most once per 20 s); `avoid-off` — "The floor has dropped away. Continuing to N metres."
- Not active: while hugging the floor, docked, or when `s.autoAvoid === false` (the sea-floor test turns it off to test grounding). **Changed 2026-11-22:** the harbour zone no longer switches it off; see `CODE_NOTES.md` (`HARBOR_CLEAR`).
- Test: `tools/avoid_test.py`. Hug the floor and the 10 m figure are in `TIME_CRUISE_AND_START.md`.

## Status reports in the communicator (owner, 2026-11-19)
- **Every station officer has "Status report"** under Give an order: Helm (heading, speed, depth, keel clearance, throttle, ordered depth, course and ETA, modes), Sensors (sonar, floor depth, WSKRs by name, Remora, contacts within 4 nm), Engineering ("Engineering status report": battery, power draw, shore power, hull, oxygen), Science (crew health, air, Remora), Security, Communications (mail, laser, satellite and HF links, relay, mast).
- **ARIA's "Status Report" is the complete ship report:** position or dock, heading and speed, course and ETA, battery, oxygen, hull, power draw, modes (super cruise, hug, avoidance), sonar, WSKRs and Remora, link states, mail, the current objective and crew readiness.
- Code: `statusReport(id, extra)` in `chat.js` (built from the same ship snapshot as the small talk), wired through `ORDERS['Status Report' | 'Status report' | 'Engineering status report']` in `stations/crew.js`. Order functions now receive `(ctx, crewId)`.

## Synthetic view tapes
- **KTS** is printed above the speed tape and **M** above the depth tape. The **depth tape runs downward**: 0 at the top, deeper at the bottom, numbers positive. (`vtape` in `synth.js`.)

## Test fixes made on the way
- `seafloor_test.py` pins 30x time and switches terrain protection off; `console_test.py` accepts any game year; `trials_flow.py` waits for the report upload.

## The communicator menu, tidied (owner, 2026-11-27)
- Reaching a crew member is meeting them: their introduction completes First Contact (no small talk needed).
- Top menu for each crew member: **Ask about …** (topics and "Buttons on my pages"), **Orders …** (folders from `TREE` in `stations/crew.js`, each order shown only when it makes sense), **EMERGENCY** (from `EMERGENCY`, only real actions: ARIA the general alarm; Marcus all stop, all ahead flank, emergency dive; Ryan emergency blow, discharge fire suppression, close the bulkheads), then **Someone else** and **That's all**.
- Gone: small talk, every placeholder order (security sweep, boarding party, reactor scram, medical alert and the like), the "Other orders" and "Not available yet" folders, duplicates and typos. The menu comes from the code only, so old saves (which keep their own copy of the crew's lines) get the tidy menu too.
- Renamed: Report to my quarters is now Take me to my quarters; Passive listening mode is Go passive (with Go active); Run crew diagnostics is Crew health report; Ryan's Emergency surface is now a real Emergency blow (uses the air bank). Prepare for dive (Ryan) is gone: depth is Marcus's job.
- Wording: each crew member greets you when the line opens (GREET); "Back", "Something else", "Someone else", "That's all", "Not yet" replace the longer lines.
- (2026-11-27, later) Every line that opens another menu ends with "…" (no arrows). A crew member with six orders or fewer shows them straight away under Orders (no folders); more than six keep their folders. Departure clearance is Nicole's (a radio call to the harbour), not Marcus's. ARIA's "Let's take her to sea" is one tap inside Orders when docked.
