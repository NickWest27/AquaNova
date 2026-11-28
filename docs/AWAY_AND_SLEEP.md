# Sleep and "Crew has the con" (away mode)

> **Checked 2026-11-25 against the newer systems.** WSKR launch bays: the crew slow the ship for a WSKR coming aboard (unchanged). **Remora out on her tether:** the XO holds the ship (speed 0), brings her home (auto return), takes her aboard, then carries on; the tether never parts under way. If it parts anyway, the crew stop for the lost craft (`craft`, Remora). The science team do not use Remora while a new tether is being spliced. Tests: `tools/tether_test.py` (XO checks), `away_test.py`, `dock_sleep_test.py`, `wskr_bay_test.py`.

Status: **built 2026-11-20** (owner request: keep the sub moving while the iPad app is closed). Code: `tablet/js/away.js`, the Sleep dialog in `app.js`, `sim.away` in `persist.js`, the phone view in `ped/ped.js`. Test: `tools/away_test.py`. Updated the same day: the science team now use Remora, and supplies are plain supplies.

## The idea
The app cannot run while it is closed. So the ship does not really move while the Captain is away: **on return the game runs the same simulation forward for the real time that passed, with standing orders for the crew, then ARIA briefs the Captain.** The Captain goes to sleep first ("before I close the iPad I need to go to sleep").

## Two kinds of sleep (Sleep hotspot in the Quarters)
- **2026-11-28 (owner): both run the same crew logic.** Skip time = `skipTime(hours)`: the plan is armed and caught up at once, with the XO's briefing. The old `sim.warp` jump is no longer used by the dialog.
- **Skip time** (the old Sleep): jump the clock 2, 4, 8, 12 or 24 hours, or until arrival (`sim.warp`). Unchanged.
- **Crew has the con**: pick the crew's time limit (4, 8, 12 or 24 h), tap Sleep, a "Good night, Captain" screen appears. **Close the app whenever you like.** "Wake up now" ends it at once with a briefing of anything that happened.

## How it works
- `armAway(maxH)` saves the plan in `navigation.away` (saved with the game, so a reload or a killed app still wakes up properly) and stamps the real time.
- When the page is hidden or closed (`visibilitychange`, `pagehide`) it **stamps the real time and the ship's state again**, saves the exit save, and pushes the status to the phone.
- On return `catchUp()` restores the standing orders (a load holds the ship still, so it puts the throttle and speed back) and **runs `sim.step` for the real elapsed time at 1 game second per real second, whatever the time compression**. It is muted and capped at 48 simulated hours. Under 90 seconds away: no briefing.
- Nothing random happens. Only things the game can compute: sea floor, the Area of Operations limit, battery, air, hull, craft already launched.

## The crew's standing orders
1. Keep the course and speed set when you went to sleep.
2. **Hold when the Area of Operations limit is about 6 nm ahead** (or two minutes of travel at speed). No damage.
3. **Stop on arrival**, **on a shoal**, **when supplies are low** (air under 30% or battery under 20%: the crew bring her up and hold), **hull under 60%**, or **if a craft is lost**.
4. **Stand down after the Captain's time limit** (4 to 24 h). After a stand-down nothing more happens.
5. **If the Captain is still asleep an hour after a stop** (not after a stand-down), in this order:
   - **The away team (at +1 h).** If a port is within 40 nm and the Tern can reach it (her range is about 17 nm until her battery research is done), an away team takes the Tern for **supplies: food, science equipment, mail and the like**. The trip is the run both ways plus 45 minutes at the dock, and it only starts if it fits in the time left. **Supplies no longer change air or battery** (owner's decision). The Tern's battery drops for the return leg and she is back on charge.
   - **Remora (at +1 h 5 min).** Five minutes after the away team, so the Tern has left first (Remora's tether holds the bay doors open and blocks other launches), the **science team send Remora down at the point of interest** the ship arrived at. It takes samples with its tools (collector, laser, spectrometer, and the magnetometer at a wreck), so it can bring up biological samples. A dive needs under 20 minutes and must fit in the time left. Remora then goes through the normal **re-equip** (5 minutes plus 2 minutes per sample). **If the bay is busy** (Remora already out, or still re-equipping), the team take samples with the ship's own gear instead (spectrometer, laser, magnetometer).
   - Both only happen while catching up (the end of the sleep is known), so they never start a job that is not finished when the Captain wakes.

Later additions (see `BAY_AUTOMATION.md`): Marcus slows the ship to 8 kt for bay jobs while the crew have the con; WSKRs recalled for low battery relaunch by themselves when charged. Generated missions pause the game while the XO has the con (see `MISSION_GENERATOR.md`).

## ARIA's briefing
A modal on return: how long the Captain was away, where the ship left from and is now, nautical miles covered, a timed log of what the crew did (Remora samples, the supply run, craft or low-supply events), why the ship stopped, the status (battery, oxygen, hull), and "Your orders, Captain?" or "Quiet watch".

## The iPhone PED
The status gets an `away` block (the plan, the real stamp, the crew limit, a forecast). **The phone's Status tab shows a "Crew has the con" card: estimated position, progress bar, distance to go and ETA, or where it will hold.** It is dead reckoning from that plan: the phone cannot run the simulation. The card says so.

## Known limits and ideas
- **Real elapsed time counts 1 to 1**, even at 120x compression. The cap on simulated time is 48 h.
- If iOS kills the app with no hide event, the plan falls back to the time the Captain went to sleep.
- The phone shows old data if the iPad could not sync when it went to sleep.
- Not built: repeated sampling, ports far away, delivering a mail message with the supplies, an away team in danger, the crew redrawing the course when blocked, an ARIA message to the phone when the ship stops. Since supplies no longer restore air or battery, a stop for low air or battery is a hold on the surface until the Captain returns.
- Missions and mail keep their normal timers during catch-up.
