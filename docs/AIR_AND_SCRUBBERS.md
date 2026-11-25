# Air, CO2 scrubbers, surface running and crush depths

Built 2026-11-20 on the owner's rules. Code: `tablet/js/sim.js` (systems block, constants), `bayops.js` (the Tern), `away.js`, `chat.js`, `stations/crew.js` and `helm.js` (periscope depth). Test: `tools/air_test.py`.

## Rules (owner)
- **CO2 scrubbers are single use.** Oxygen does not fall while scrubbers last. Scrubbers wear only while the ship is **submerged** (depth 3 m or more). **The surface does not use them.**
- **The Aqua Nova carries scrubbers for months.** Game value: `SCRUB_DAYS = 90` (about 1% a day submerged).
- **Air can be replenished at the surface** (oxygen up about 30% an hour). Docked: oxygen refills and fresh canisters come aboard.
- **Supplies** (the away team's run, or any dock) restock the scrubbers.
- **All the owner's subs are limited to 7 knots on the surface and can go faster when submerged.** `SURFACE_KT = 7`, `SURFACE_M = 3`. Done for the Aqua Nova. The Tern's trips run submerged at her 20 kt (she has no depth model of her own for travel, so she is not limited).

## Numbers
- Scrubbers at 0 and submerged: oxygen falls about 100% in 12 hours. CO2 follows the scrubbers.
- **The Tern: 7 hours of air with 8 aboard** (9 with the "Tern air scrubbers" research). Her air is her scrubber stock: used only while submerged, not while she rides alongside a surfaced ship. Back to full in an hour at the bay or a dock. (`LAUNCH_BAY_AND_SHUTTLE.md`, newer, says 8 h and 10 h.)

## Depths (owner confirmed 2026-11-20)
- **Periscope depth: 10 m** (`PERISCOPE_M`). Order "Make periscope depth" (Chen, in all saves) and a "Periscope" button on the Helm.
- **Aqua Nova crush depth: 11,000 m** (`CRUSH_M`), a little more than the deepest known point on Earth (the Challenger Deep, about 10,935 m). Pressure strain on the hull starts at 80% of crush (8,800 m). The in-game depth limit stays 6,000 m because the chart only goes that deep.
- **Tern: crush depth 1,000 m (`TERN_CRUSH_M`), safe depth 800 m (`TERN_SAFE_M`).**

## The Tern and the 800 m rule (owner)
- **Launch:** Engineering says it is not safe to launch the Tern below 800 m. Bring the ship up first.
- **Once she is launched and the bay doors are closed, the Aqua Nova may go below 800 m.** There is no cap on the ship.
- **Standoff:** if the ship is below 800 m while the Tern is out (following, or coming home), she **formates at a safe distance (0.25 nm) and a safe depth (600 m at most)** and hails **COMMS**: "You are below 800 metres... we are holding off your beam at a safe distance and a safe depth. Bring her up above 800 metres and we will come in."
- **Recovery** is refused (`standoff`) until the ship is above 800 m. Then she hails again ("We are closing and ready to dock") and comes alongside.
- A Tern still on a trip (going, at the dock, or landed) is not affected. The rule applies when she is with the ship.
- The standoff flag is saved. Not built: ARIA or Engineering warnings before a dive when the Tern is out.

## Crew away mode
Scrubbers under 15% while submerged: the crew surface and hold. Low oxygen still makes them surface too, and on the surface the air refills.

## ARIA
The science report gives the scrubber percentage.
