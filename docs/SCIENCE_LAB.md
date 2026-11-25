# Aqua Nova: Science lab, ROV, analysis screens and launch bay

Last updated: 2026-11-22. Summary lives in `DEVELOPMENT.md`; this is the detail.

## Design decisions (owner, 2026-11-18)
- **Sea Crab is not the Science ROV.** The Sea Crab is a *launch* (an away boat) that ferries crew. (Later, 2026-11-19: the Aqua Nova's own shuttle is **Tern**; the Sea Crab belongs to a Sea Quest boat. See `LAUNCH_BAY_AND_SHUTTLE.md`.)
- The **Science ROV** works like a WSKR but is hand-piloted, slow and short range. It carries instruments WSKRs lack. **Working name: Remora** (constant `ROV_NAME` in `tablet/js/rov.js`). **`REMORA.md` is newer and replaces the tool list here:** she carries only a sample collector, a core drill and a magnetometer; the spectrometer and laser sampler are the ship's own instruments.
- **Launch Bay** launches away boats, the Science ROV and WSKRs; all three use the one-minute bay procedure, with Engineering in charge. Remora's tether keeps the doors open while she is out and blocks the other craft; she needs no charge but the science team unload and re-equip her after each dive (`LAUNCH_BAY_AND_SHUTTLE.md`).
- **Wireframe 3D terrain plot** (from the show's sensors screens) is for a *point of interest being studied*. Not built.
- WSKRs only scan and mark sites. Physical samples come only from the Science ROV.

## What is built
- **Science Lab room** (`scene.js`, art `science.webp` = the old medbay concept art, placeholder). **Hotspots (owner, 2026-11-22): each opens one page.** SAMPLES (the island bench and the screens) opens **only the samples page**; ANALYSIS (the rack bench) opens **only analysis**; RESEARCH (the machine) and RESEARCH COMPUTER open **only research**; **MAIN COMPUTER** opens the lab with **tabs for Samples, Analysis and Research**. Also ROV STATION, WALKWAY. Stations: `lab-samples`, `lab-analysis`, `lab-research` set `ctx.labOnly` (no tab bar), `lab` clears it (`app.js`, `stations/lab.js`). Test: `tools/limits_test.py`.
- **Samples** (`science.js`, saved in `mission.science`): water, sediment, rock core, biological, magnetic reading. Each site type gives certain kinds (`BY_SITE`); the ROV tool picks one.
- **Science ROV** (`rov.js`, `sim.s.rov`, saved in `navigation.rov`): **launched and recovered through the bay** (1 minute each, within 0.2 nm to recover, not docked), then **5 min plus 2 min per sample** to unload and re-equip before she can launch again. Touch controls on the Remora page. 2 kt, **dives and climbs at 2 m/s** (`ROV_DIVE_MPS`), **tether 1 nm** (1.5 after the "Longer tether" research). Tools work only within 0.15 nm of a site (collector and drill also within 6 m of the floor) and take game time (3 to 15 min). Result: a raw sample and a call from Dr. Patel. Drawn on the nav chart as a violet **Rm** with a dashed tether (`REMORA.md`).
- **Lab** (`stations/lab.js`): pages **Samples**, **Analysis**, **Research**.
- **Research topics** (`TOPICS` in `science.js`; topics can have `requires`, and the Research button stays off until the required topic is done): Longer tether (2, works), Deep sonar sweep (3, effect not built), WSKR formations and orders (4), Synthetic forward view (5), **WSKR long-life cells (3): WSKR battery 6 h to 12 h**, **WSKR deep-cycle cells (5, needs long-life cells): 12 h to 24 h** (`sim.batteryHours()`), **Tern long-life cells (3): shuttle battery 1 h to 3 h**, **Tern deep-cycle cells (5, needs the first): 3 h to 6 h** (`shuttleHours()` in `bayops.js`), **Tern air scrubbers (3): shuttle air 8 h to 10 h with all eight seats taken**. The formations and view topics set a flag that unlocks features when gates are on.
- **Launch Bay** (`stations/bay.js`): Engineering's bay doors card, Remora (launch, recover, unload and re-equip countdown), the four WSKRs (charge and time to full) and the shuttle Tern (charge, air, seats), with Launch / Recover / Recall.

## Analysis screens (built 2026-11-19, owner request: "analysis screens like the show")
- Each of the three instruments has a **live display** (`tablet/js/analysisView.js`, a 960 x 300 canvas per card, drawn about 60 times a second by a loop in `stations/lab.js` that stops when the station closes). Style: cyan and amber on a dark grid, monospace.
- **Material Analysis** (sediment, rock; 20 game min): 44 **spectrum bars** with seeded peaks that rise and settle as the job proceeds, and an **element table** of 8 rows (symbol, name, bar, percent). Rows fill in one by one with a flicker until each is final. Sediment: Si, Al, Fe, Ca, K, Mg, Na, Ti. Rock: Si, Fe, Mg, Ca, Al, Mn, Ni, Cr. The percentages are seeded from the sample and add to 100 (`composition(sample)`).
- **Spectral Analysis** (water, magnetic reading; 15 min): a **spectrum trace** from 400 to 800 nm with a dashed **scan cursor** sweeping left to right. Behind the cursor the trace is clean and the peaks are labelled (water: O2, CO2, Mg, Na, H2S, CH4; magnetic: Bx, By, Bz, Bt); ahead of it the trace is noisy.
- **Gene Sequencing** (biological; 30 min): a scrolling **double helix** whose rungs are coloured by base (A red, C green, G cyan, T amber) and bright where the read has got to, a **base read-out line**, a **base-pair counter** (to 30,000) and **GC %**, and a **bio monitor** heartbeat-style trace.
- States: **STANDBY** ("NO SAMPLE LOADED") when idle, **ANALYSING n%** while a job runs (progress comes from the job's game-time start and end), **COMPLETE** when done. Everything is seeded from the sample id, kind and site, so the same sample always looks the same.
- Under each screen: the status line (idle or minutes left), **Run #n** buttons for raw samples, and **Show #n** buttons (the last four finished samples for that instrument) to put a finished result back on the screen. Show never changes the saved game.
- The result sentence and the finding in PED → Findings are unchanged (`RESULT` in `science.js`).
- Tests: `tools/analysis_test.py` (three screens, standby, animation, progress changes the picture, Show; its "a Show button per finished sample" check fails and failed before the 2026-11-22 changes). Screenshots go to `tools/shots/an-*.png`.
- **Retro note (2026-11-25):** the lab screens are canvas drawings and are candidates for the "more retro displays" phase (`RETRO_SKIN_PLAN.md`), which is not started.
- **Ideas not done:** more elements and peaks for rare sites; a Medbay use of the bio monitor; sound for the instruments; the Findings tab showing the final screen of a sample.

## Next steps
1. ROV camera view and instrument readouts (magnetometer trace) in the Launch Bay.
2. Wireframe 3D terrain plot for a site being studied; real effects for the remaining research topics; missions that need samples.
3. Medbay station.
4. New Science Bay art from the owner (keep the SAMPLES, ANALYSIS, RESEARCH, REMORA, MEDBAY and WALKWAY tap areas).
