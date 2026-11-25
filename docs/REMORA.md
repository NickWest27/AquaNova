# Remora: the unmanned sample collector

Built 2026-11-20 on the owner's description: **a small unmanned remote deep sea sample collector. It drills and collects samples that it returns to the lab to be analysed.** This doc supersedes the Remora parts of `SCIENCE_LAB.md` and `LAUNCH_BAY_AND_SHUTTLE.md` where they differ. Code: `tablet/js/rov.js` (the craft, controls, tether bar), `stations/remora.js` (the page), `bayops.js` (launch, recovery, unload, re-equip), `away.js` (the crew's dive), `science.js` (tools). Tests: `tools/remora_test.py`, `tools/science_test.py`, `tools/survey_test.py`, `tools/bay_test.py`.

## What she carries (owner, 2026-11-20)
- **Three tools: a sample collector, a core drill and a magnetometer.** She does not analyse anything; the lab does. The spectrometer and laser sampler are **the ship's own instruments** (the science team use them in the sleep rules when Remora is busy). They have no button on her page.
- **Sample collector:** water, biological and sediment samples (by site type). **A water sample can be taken anywhere in the water.** Bio and sediment need her within 6 m of the sea floor. 5 minutes.
- **Core drill:** rock cores, within 6 m of the sea floor. 15 minutes.
- **Magnetometer:** magnetic readings at wrecks. 3 minutes. No sea floor needed.
- A tool that cannot take anything at the place she is at is **hidden**. A tool that needs the sea floor is shown but greyed until she is low enough.

## Live readings vs physical samples
- **Magnetic readings are data. They go up the tether to the lab at once** (live), take no storage, and work when she is full. (My default; the owner can change it.)
- **Physical samples** (water, bio, sediment, rock) stay in her storage.

## Piloting: set and go (owner, 2026-11-20: hand holding was tedious)
All taps, no holding. State is on `s.rov`: `thrSet` (0-1 of 2 kt), `hdgTo`, `depTo`, `go`.
- **Slower / Faster:** speed in quarter steps (0 to 100%). She keeps going until told to stop. **Stop** clears speed, heading and depth targets and any trip.
- **Yaw left / Yaw right:** each tap moves the target heading 10 degrees; she turns to it at 40 deg/s and holds it. She does not drive far off line while still swinging round.
- **Up / Down:** each tap moves the target depth 10 m. **She dives and climbs at 2 m per second** (`ROV_DIVE_MPS` in `rov.js`; owner, 2026-11-22: 8 m/s was too fast; auto return uses the same rate). Never below the floor (floor - 0.5 m).
- **To floor:** target depth 3 m off the bottom, inside the 6 m the tools need.
- **Go to...:** pick a site within her tether (nearest six, with distance and bearing). She drives at 2 kt and stops within 0.03 nm of it; the science officer announces "on station". Land or a taut tether stops the trip and the science officer says so.
- Any of these cancels Auto return; Auto return and starting a tool clear them. Old hold-style input (`r.cmd`) still works for tests and cancels the set controls it overlaps.
- The page shows the targets (speed, turning to, going to depth, driving to).

## On the nav map (owner, 2026-11-22)
While she is out, the chart (`nd.js`) shows a **violet rounded square marked Rm** with a **dashed violet tether line to the ship**. WSKRs stay yellow or orange diamonds. It is not drawn on her own craft view.

## The mission, step by step
1. **Deploy** from the launch bay (1 minute; her tether holds the doors open).
2. **Get her to a site:** Go to, or set speed and heading. 2 knots. Tether 1 nm (1.5 nm with research). Tether bar on her page and Launch Bay card.
3. **Collect a sample** or take a reading.
4. **Come home:** pilot her back, or **Auto return** (2 knots, to the ship's depth, stops within 0.03 nm and at the ship's depth, then waits). She does not take herself aboard: **Recover** is a bay operation (1 minute, ship at 8 kt or less, within 0.2 nm).
5. **Aboard: unloading.** The team unload her **one sample per 2 minutes. Each sample reaches the lab only when it is unloaded.** Then the **5 minute re-equip**. She cannot launch until that is done.

## Limited storage
- **3 samples** (`REMORA_STORE`). When full, collector and drill buttons are disabled (the magnetometer is not).
- Saved with her (`navigation.rov.cargo`) and with the bay (`navigation.bay.rearm.cargo`).
- Direct `sim.recoverRov()` (tests) delivers at once; the bay calls `recoverRov(false)`.

## When the Captain is asleep (Crew has the con)
The science team send her down five minutes after the away team (see `AWAY_AND_SLEEP.md`). Abstract: collector sample and core where the site allows, at most 3, within a 25 minute dive. The crew dive does not take magnetometer readings yet.

## Not built / ideas
- Research that raises the storage or her speed.
- Magnetometer in the crew dive at wrecks.
- A waypoint plotted on the craft view (tap to send her there).
- Battery on the Remora; auto return when it runs low.
- Auto return and Go to respect land only as a stop. No route-finding.
