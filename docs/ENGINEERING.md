# Engineering computer

Owner request, 2026-11-26: ship health and daily running. The Aqua Nova has a **hydro-jet propulsion system** and a **quantum fusion drive**.
The computer lets the Captain see and control the ship's systems, bring her to life, and handle damage and repairs, so she feels like a real
and complex machine. Code: `tablet/js/engineering.js` (model), `tablet/js/stations/eng.js` (the page). Opened from the Engineering room
(the console and the power cores). Test: `tools/eng_test.py`.

## The rule that keeps the game fair
**With every system healthy and switched on, the ship behaves exactly as before** (battery, air, CO2, speed, super cruise). The new systems only
matter when the Captain switches something off, or damage, fire or flooding takes one out.

## The ten systems
Each has a **health** (0-100). Below 50 it is DEGRADED, at 0 it is OFFLINE. Each sits on one of four **power relays**.

| System | Relay | What it does | When it fails |
|---|---|---|---|
| Power relays | - | Four buses: A propulsion, B life support, C sensors and comms, D hotel (lights, heat, water) | Open a relay and everything on it stops |
| Propulsion | A | Two hydro-jets (port, starboard) and the quantum fusion drive | Hydro-jet health limits top speed (one jet out: half speed). Fusion drive offline: no super cruise |
| CO2 scrubbers | B | Single-use canisters (unchanged). Modes: normal, boost (twice the canister use, clears CO2 fast), off | Off or offline while submerged: CO2 climbs about 0.5% an hour |
| O2 | B | Electrolysis O2 generator, and an O2 reserve tank | Generator off or offline while submerged: oxygen falls about 8% an hour (the tank first) |
| Water | D | Fresh-water tank and desalinator | Desalinator off: the tank falls about 2% an hour (two days) |
| Heating/cooling | D | Holds the cabin at the set temperature (18-24 °C) | Off: the cabin drifts toward the sea temperature |
| Fire suppression | C | Armed: a fire is put out automatically after 20 s (uses agent). Disarmed: the Captain discharges by hand | A fire burns the systems in its compartment |
| Bulkheads | C | Watertight doors: forward and aft | A leak floods its compartment; close the bulkhead to contain it |
| Ballast | A | Fore and aft tanks follow the dive; EMERGENCY BLOW drives her to the surface | Needs the air charge |
| Air charge | A | High-pressure air bank (250 bar). The compressor recharges it near the surface (shallower than 20 m) | An emergency blow uses 60% |

## Damage, fire, flooding and repairs
- **Damage:** every impact (`sim.hurt`) also damages a system, in turn round the list, by twice the hull damage.
- **Fire:** a hit of 15% or more (a collision at about 9 kt or faster; touching bottom slowly does not) starts a fire in the compartment of the system it damaged. A fire takes 2 health a minute from the systems
  there. Armed suppression puts it out in 20 s (25% agent each time); disarmed, the Captain taps DISCHARGE.
- **Flooding:** a hit of 20% or more (about 12 kt) opens a leak in the forward or aft compartment (and damages the Bulkheads system). While its bulkhead
  is open, the flood costs 1% hull a minute; closing the bulkhead contains it. **If the Captain has not closed it after a minute, the damage-control crew close it themselves** (and say so); the Captain can reopen it. Repairing Bulkheads to full seals the leak, and the pumps
  then clear the water in 10 minutes. Docking seals leaks.
- **Repairs:** two damage-control teams. Tap a system, then REPAIR: a team restores 25 health an hour (100 an hour when docked).
  Repairs do not mend the hull itself (the dock does, as before).

## Crew have the con
The XO runs damage control: closes a flooding compartment, sends a team to seal the leak, discharges by hand if suppression is off, and sends free teams to the worst-hurt systems (`damageControl` in `away.js`).

## Saving
`navigation.eng` (the whole engineering state).
