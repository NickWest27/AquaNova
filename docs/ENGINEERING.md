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

## Flow diagrams (2026-11-26)
Each system's page is an interactive diagram (`tablet/js/engDiagrams.js`, drawn by `tablet/js/schematic.js`): pumps (spin while running),
fans, valves (green open, red shut), breakers, tanks with levels, units, nozzles, watertight doors and the blow lever, joined by pipes and
wires coloured by what they carry (power yellow, sea blue, fresh water light blue, air white, O2 green, CO2 grey, coolant orange, agent
red, gas violet). Live lines flow. **Tap a part to switch it.** The components (`PARTS` in `engineering.js`, saved in `eng.parts`) are real:
a system works only when its chain is complete, and all start on/open, so an untouched ship behaves as before.

| System | Parts (tap) | What the chain does |
|---|---|---|
| Power relays | fusion drive (online/standby), relays A-D | Loads are live through a closed relay from the main bus |
| Propulsion | coolant pump, sea intake, port and starboard jet pumps | Each jet is half the thrust; no intake, no thrust; coolant pump off: the fusion drive goes down (no super cruise) |
| CO2 scrubbers | fan, bank A and bank B valves | One bank: normal; both: boost; fan off or no bank: off |
| O2 | feed pump, electrolyser, tank valve | Feed and electrolyser make O2; the tank backs up the air only with its valve open |
| Water | sea intake, HP pump, distribution pump | Intake and HP pump make water; distribution off: nobody draws water |
| Heating/cooling | sea pump, heat pump, cabin fan | All three hold the cabin at the set point (Cooler / Warmer buttons) |
| Fire suppression | master valve, AUTO switch, the burning zone's nozzle | Master valve shut: no automatic or manual discharge; tap the burning nozzle to discharge |
| Bulkheads | forward and aft doors, forward and aft bilge pumps | A compartment drains only with its bilge pump on |
| Ballast | bank valve, EMERGENCY BLOW lever | Bank valve shut: no blow |
| Air charge | snorkel intake, compressor, bank valve | Charges only near the surface with all three |

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

## The Engineering room is alive (2026-11-26)
The room picture shows the state of the ship (`updateEng()` in `scene.js`, styles "Engineering room" in `tablet.css`):
- **Power cores:** cyan pulse = fusion drive online; steady amber = standby; flickering red = fault (switched on but not working, e.g. no coolant).
- **Console screens** (warped onto the console with `slanted`): main = FUSION, BATTERY, FIRE, FLOOD, TEAMS; left = relays A to D (lit = closed); right = NORMAL or ALARM.
- **Alarm:** during a fire or flooding the room edges pulse red and a lamp flashes over the hatch.
Inspiration note: the owner's brief (hydro-jets, quantum fusion drive) echoes 90s TV subs, e.g. SeaQuest DSV (twin fusion reactors, water-jet propulsion, fuel from seawater per fan wikis). Ours stays original.

## Saving
`navigation.eng` (the whole engineering state).
