# Populating the world (plan and status, updated 2026-11-22)

**Status:** places and marine traffic (with AIS, sonar bearings, fixes and identification) are built and pushed (branch `feature/tablet`). Fauna, traffic missions and combat are not.

## Owner decisions (2026-11-21)
- **Tone: SeaQuest.** Colonies, pirates, secret bases, fictitious organisations.
- **Factions:** O.E.R.A., pirates, poachers, miners (several groups), fictitious organisations, cargo, fishing, oil, pleasure craft, foreign governments.
- **Hostiles:** pirates and poachers are hostile by default. **Boldness varies** per vessel (0 = runs, 1 = fights).
- **Traffic can be dangerous.** Now: you can collide; later: patrol for poachers, then combat.
- **A sunk ship stays sunk across saves.**
- **Outside the Area of Operations, traffic thins to nothing.**
- **Goal:** randomise and keep the cost low.
- **Sensing:** commercial and friendly ships have AIS, so their position is known. Other ships are heard on sonar as a bearing only; a fix needs a second bearing from a WSKR. A ship stays unidentified until confirmed (see Identity). You can only hit surface traffic when on or just below the surface.
- **Identity:** a hail identifies a ship; a WSKR within 2 nm identifies it; inside 4 nm of the Aqua Nova it is identified; inside 8 nm it can be selected and a sensor sweep identifies it.

## Built: places (`data/world/places.json`, `factions.json`)
- 26 new sites appended after the old ones (old ids unchanged). Types: `dock` (ports, bases, colonies, mines, platform; `kind` = port, base, colony, mine, platform), `hideout`, `sanctuary` (has a `radius` in nm), `wreck`, `canyon`, `vent`, `seamount`, `seep`.
- **Real:** Boston, New York, Newport, Bermuda, Horta, Ponta Delgada, Funchal; Andrea Doria, USS San Diego, U-853, SS Portland; Hudson Canyon, Bear and Kelvin seamounts, Baltimore Canyon seep, Lost City, Menez Gwen.
- **Fiction:** Meridian Habitat (free colony), Deepcut Station, Lucky Strike Sulphide Works, Rainbow Camp (the three mining groups: Deepcut Mining Consortium, Abyssal Metals Cooperative, Ridgeline Extraction Ltd), Sable Shelf-1 Platform (oil), Concord Station Echo (foreign listening post, wary), Sargasso Haven (pirate anchorage), two poacher-visited sanctuaries.
- Every inhabited place has a hail-able VHF contact (own channel, reply from the place or its faction). Chart marker shapes: square = dock, hexagon = colony, mine or platform, triangle = site. Colour: red = hostile, amber = wary.
- **Known gap:** Andrea Doria and the Titanic sit in the hole in the chart (40–45°N, 70–65°W for the first) until the owner exports that tile. They are outside the Area of Operations until then.
- Test: `tools/world_test.py`.

## Built: marine traffic (`tablet/js/traffic.js`, `data/world/traffic.json`)
- **Seeded cells** (20 nm). `world.seed` in the save decides the sea. A vessel sails back and forth along a leg; its position is a pure function of the game clock. Nothing but the seed, `world.sunk` and `world.wrecks` is saved.
- **Active bubble** 20 nm, cap 16. Traffic step cost measured 0.17 ms in the test with the bubble full.
- **Zones:** open water, shelf (fishing), five shipping lanes, ports; mining tenders near mines, supply boats near platforms; raiders near Sargasso Haven (160 nm); poachers inside sanctuaries. No traffic where the chart has no data.
- **Eleven kinds:** cargo, tanker, trawler, yacht, patrol cutter, foreign frigate, research vessel, mining tender, platform supply boat, raider, poacher.
- **Hostiles react inside 6 nm:** boldness 0.5 or more closes in, below that runs. Poacher boldness 0–0.5, raider 0.4–1.0.
- **Ships stay on water (2026-11-22).** Each leg is checked against the chart: every sample point needs depth of at least `max(10, draft × 2 + 4)` m. A leg is retried up to 14 times; if none has water the vessel is not made. The reacting-vessel step also refuses to move a ship into water shallower than 10 m. Distances and longitude steps use `cos(latitude)` (`SK`) so a leg is the length it claims. Cell building keeps the fixed longitude scale so the seeded sea does not change.

### How the ship learns about traffic
| Source | What you get |
|---|---|
| **AIS** (cargo, tanker, trawler, yacht, cutter, research, tender, supply boat) within 20 nm | Exact position, heading, name, faction. Chevron on the chart, tagged AIS. |
| **Sonar** (no AIS: navy, raiders, poachers; or any ship when AIS is off) | **Bearing only.** Dashed line from the ship on the chart, "no range yet". Range scales with ship size. |
| **Fix** | Two bearings crossing at 20° or more (ship sonar plus a linked WSKR, or two WSKRs) give a position with an error ring. Bearings carry small noise, so a fix is worse when the lines are nearly parallel. |
| **Identity** | Unidentified until one of: AIS; a **hail** answered on VHF; a **WSKR** within 2 nm; the ship **within 4 nm** of the Aqua Nova; or a **sensor sweep** (Sensors page, ship inside 8 nm, takes 20 game seconds). |

- **Assumption (easy to change):** AIS is only received when the VHF mast antenna is usable (`gates.ais` in `commsModel.js`). One line to relax.
- Sensors lists ships with bearing, fix error or AIS. **Select** is offered once a ship has a position or is inside 8 nm; **Sweep** appears for unidentified ships inside 8 nm. Selected ships with a position get tags T1, T2… on the chart.
- **Contact symbols** (`contactIcons.js`, Sub Command style): surface, sub, installation, unknown; colour by affiliation.
- **Collisions** need depth below the ship's draft plus 4 m, so only on or just below the surface. They cost hull (sim.hurt, one hit per 30 game seconds). A small vessel hit at 3 kt or more sinks, leaves a **wreck POI** (Remora can sample it) and ARIA comments. Large ships are only dented.
- **Alerts:** Sensors calls out hostile contacts and close large traffic (bridge notices HOSTILE CONTACT, SURFACE TRAFFIC, COLLISION).
- **Not built:** ships are not drawn on the bridge synthetic view; no sleep/away encounter rolls; vessels turn round at the ends of their legs; submarines; combat; poacher report mission.
- Test: `tools/traffic_test.py` (density by zone, no traffic off the chart, ships over water, same seed same sea, step cost, poacher boldness, reaction, hail names a ship, AIS with and without the mast, bearing only, WSKR fix, WSKR camera, 4 nm identity, sensor sweep range, no collision when deep, ramming and sinking, sunk ships survive a reload).

## Next
1. **Marine life** (`data/world/fauna.json`): zones by depth band and region; deep scattering layer that rises at night; sonar biological contacts; scan and sample to the lab with species labels; protected species tied to the sanctuaries.
2. **Missions:** Halcyon distress call (the AO decision); a poacher patrol (find by bearings and fix, identify, report; no combat); a shipping-lane survey; a whale tagging job.
3. **Away and sleep:** seeded encounter rolls summarised in ARIA's brief.
4. **Later:** combat and boarding, submarines, pirate attacks on miners.

## Still open
- Collision damage numbers (currently 2% + 1.5% per knot, once per 30 game seconds, from the old bump rule).
- How much of the Atlantic to fill first; only the Atlantic strip has sea-floor data (Mariana and Hawaii have none).
- Hostility of the foreign navy and Ridgeline (set to "wary" for now).
- Whether AIS should need the mast up (now yes).
- Selecting a bearing-only contact inside 8 nm marks it selected on the card only; it has no chart tag until it has a position.
