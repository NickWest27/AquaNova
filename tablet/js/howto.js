// "Ask about…" how-to pages. Each crew member explains the screens they know. The steps are short, one action each, in plain imperative English,
// and they match the buttons on the screen. {captain} is filled in when the answer is spoken.
// GUIDES[crewId] = [{ label, items: [{ id, label, intro, steps: [..] }] }]
import { fill } from './player.js';

const G = (id, label, intro, steps) => ({ id, label, intro, steps });
export const GUIDES = {
  communications: [
    { label: 'The Comms pages', items: [
      G('links', 'Links page', 'This page shows the state of each link, Captain.', ['Open the Comms station.', 'Tap Links.', 'Read the bands and the signal bar for each link.', 'A weak or missing signal means the antenna is too deep or not raised. See Controls.']),
      G('controls', 'Controls page', 'Controls is where you move the antennas and choose how to transmit.', ['Open the Comms station.', 'Tap Controls.', 'Antennas: tap + Raise, − Lower, Stow or Max for the Mast, the Comm buoy or the VLF wire.', 'Transmit source: tap Satellite, Laser or Radio (HF). Tap Best signal to pick the strongest.', 'Dish aim: leave Auto track ON. It follows the satellite.', 'Tap Transmit report when the line above it says Ready.']),
      G('contacts', 'Contacts page', 'Contacts is the radio. You tune it, scan it and hail with it.', ['Open the Comms station.', 'Tap Contacts.', 'Directory: tap Bases, Ships, Subs or Orgs. Tap a name to tune to it.', 'Tune: tap HF, VHF or UHF. Tap the arrows to move the frequency.', 'Tap Scan band to look for carriers. Tap Hail to call.', 'The reply shows under Call.']),
      G('mail', 'Mail page', 'Mail holds the messages that come in and the reports that go out.', ['Open the Comms station.', 'Tap Mail.', 'Inbox: tap a message to read it.', 'If a message offers a mission, tap Accept mission.', 'Outbox: see the reports you sent.']),
    ] },
    { label: 'Comms tasks', items: [
      G('antenna', 'Raise an antenna', 'An antenna must reach the surface to work, Captain.', ['Go to periscope depth or shallower. Ask Marcus.', 'Open the Comms station. Tap Controls.', 'Find the antenna for your link: Mast for HF, VHF and laser, Comm buoy for satellite, VLF wire for VLF.', 'Tap + Raise until the bar is full, or tap Max.', 'Wait. The antenna moves slowly.', 'Do not go fast. The Mast comes in above 8 knots, the Comm buoy above 4 knots, the VLF wire above 6 knots.']),
      G('report', 'Send a report', 'To send a report you need a link that works.', ['Go to periscope depth or shallower.', 'Open the Comms station. Tap Controls.', 'Raise the antenna for your link.', 'Tap Best signal, or tap the source you want.', 'Make sure the line above Transmit report says Ready.', 'Tap Transmit report. Wait for the bar to fill. O.E.R.A. will answer.']),
      G('hail', 'Hail a ship or a base', 'Hailing needs the Mast above the water.', ['Go to periscope depth or shallower.', 'Open the Comms station. Raise the Mast on Controls.', 'Tap Contacts.', 'Tap Bases, Ships, Subs or Orgs. Tap a name. The dial moves to its frequency.', 'Tap Hail.', 'Read the reply under Call. A ship answers only if it is in range.']),
      G('scan', 'Find a signal', 'You can look for any carrier on a band.', ['Raise the antenna for the band. HF and VHF use the Mast. UHF uses the Comm buoy.', 'Open the Comms station. Tap Contacts.', 'Tap the band: HF, VHF or UHF.', 'Tap Scan band.', 'Carriers found shows each one with its bearing. A red one is a distress signal.', 'Tap one to tune to it. Tap Hail.']),
      G('relay', 'Keep the surface link when deep', 'Deep down our antennas cannot reach the surface, Captain. Three things help.', ['Float the comm buoy: Comms, Controls, Comm buoy, + Raise. It works to about 40 metres and below 4 knots.', 'Put a WSKR up as a relay: tell Alex, Set up a relay. It must stay within 10 miles of us.', 'Or put the Tern up as a relay: tell me, Order the Tern to, Set up a relay. Within 10 miles too.', 'I tell you when we lose the surface link, and when it is back.']),
      G('lpi', 'Talk to a colony underwater', 'The LPI link is quiet sound through the water, Captain. Nobody hears it, and it works at any depth.', ['Open the Comms station. Tap Contacts.', 'Tap the LPI band.', 'Tune to the colony or mine. Meridian Habitat is on 13.3 kHz. Or tap Scan band.', 'Tap Hail.', 'The range is about 25 miles. In the deep sound channel, 600 to 1200 metres down, it is about 120 miles.', 'LPI does not reach the surface. For OERA we need an antenna, the buoy or a relay.']),
    ] },
  ],
  helm: [
    { label: 'Buttons on my pages', items: [
      G('b-nav', 'Bridge NAV page', 'The NAV page is the chart, Captain. The buttons:', ['Dest: make the destination. Pick a Place, type a Lat / Long, or give a Bearing / Distance from a place. Done or Cancel.', 'Route: the list of waypoints from where we are. Tap a row, then + adds one after it, − deletes it, the arrows move it. Done keeps it, Cancel drops it.', 'Plot: I plot the Route round the land. Speed and depth stay as they are.', 'The two yellow keys left of the centre display: + zooms in, − zooms out.', 'PAN: arrows move the chart. Tap PAN again to come back to the ship.', 'SHW: switch Ships, Subs, Base, Orgs and Labels on or off.', 'The round trackpad right of the centre display (DSP): put this page on the main screen.']),
      G('b-hlm', 'Bridge HLM page', 'HLM is for steering by hand. The buttons:', ['Port and Stbd: turn 10 degrees.', 'Slow and Fast: 10 percent less or more throttle.', 'Stop: no throttle. The course is kept.', 'Up and Dn: change depth a step.', 'Srfc: take her to the surface.', 'NOE: hug the floor, 10 metres off the bottom. Tap again to stop.', 'Cruise: super cruise on or off.', 'The round trackpad (DSP): put this page on the main screen.']),
      G('b-helm', 'Helm station', 'The Helm station has two levers, a dial and a row of buttons:', ['Left lever: speed. Right lever: depth. Dial: heading.', 'STOP: no throttle.', 'SURFACE, PERISCOPE, DIVE 500: go to that depth.', 'SET DEPTH: type a depth.', 'PORT 10° and STBD 10°: turn.', 'DOCK: dock or undock. It needs a dock, the surface and under 1.5 knots.', 'SUPER CRUISE: on or off. It needs deep water ahead.', 'HUG FLOOR: follow the bottom.']),
      G('b-navst', 'Navigation station', 'The Navigation station is the big chart:', ['− and +: zoom.', 'Tap a marker to pick it.', 'PLOT A COURSE: the waypoint dialog, and I plot it at once.', 'SEARCH PATTERN: a search round a point.']),
    ] },
    { label: 'The Helm pages', items: [
      G('helm', 'Helm station', 'The Helm has a lever on each side and a dial in the middle.', ['Open the Helm station.', 'Left lever: speed. Move it to Stop, Half or Full.', 'Right lever: depth. Move it up for shallow and down for deep.', 'Dial: tap or drag it to set the heading.', 'Buttons under the dial: Stop, Surface, Periscope, Dive 500, Port 10°, Stbd 10°.', 'The Dock, Super cruise and Hug floor buttons are below.']),
      G('nav', 'Navigation station', 'Navigation shows the chart and plots courses.', ['Open the Navigation station.', 'Tap Map range − or + to zoom.', 'Tap a marker on the chart. Its name shows under Destination.', 'Tap Plot a course. Follow the steps in the window.', 'The ship steers to the place by itself. Tap Cancel course to stop.']),
    ] },
    { label: 'Helm tasks', items: [
      G('depth', 'Change depth', 'You can set the depth three ways, Captain.', ['Helm station: move the right lever.', 'Helm station: tap Surface, Periscope or Dive 500.', 'Communicator: ask me. Tap Give an order, Depth.', 'The helm will not take us into the floor. It holds off the bottom.']),
      G('dock', 'Dock and undock', 'Docking needs the right place and a slow ship.', ['Go to a dock. The ship must be on the surface.', 'Slow to less than 1.5 knots.', 'Open the Helm station. Tap Dock.', 'To leave, tap the Dock button again. It is lit while we are docked.', 'You can also ask me to dock or undock on the communicator.']),
      G('hug', 'Hug the floor', 'Hugging the floor keeps us 10 metres above the bottom.', ['Be at sea, not docked, with deep enough water.', 'Open the Helm station. Tap Hug floor.', 'The helm follows the floor up and down. It slows on steep slopes.', 'Tap Hug floor again, or set a depth, to stop.']),
      G('cruise', 'Super cruise', 'Super cruise is for long, fast runs.', ['Be at sea, not docked, with power.', 'Open the Helm station. Tap Super cruise.', 'Set the throttle and the heading as usual.', 'Tap Super cruise again to go back to normal cruise.']),
    ] },
  ],
  sensors: [
    { label: 'Buttons on my pages', items: [
      G('b-sonar', 'SONAR page', 'The SONAR page is what we hear, Captain. The buttons:', ['A contact in the list: tap it for its details. Tap again to close.', 'Source: listen with the ship or with a WSKR.', 'Active: ping. We hear twice as far, but everyone hears us. Tap again for passive.', 'Full sweep: a mapping sweep. It fills in the chart to 12 miles and uses a lot of power.', '− and +: the range.', 'Probe (with a contact picked): send a WSKR to it.', 'Scan site (at a site): scan it.']),
      G('b-wskr', 'WSKRS page', 'The WSKRS page runs the four drones. The buttons:', ['A WSKR tile: pick that WSKR. The chart centres on it.', 'DEPLOY WSKR: launch the next one.', 'RECALL ALL: bring them all home.', 'IN FORMATION: back to the ring round the ship.', 'SEARCH: a search pattern for the picked WSKR.', 'SET UP A RELAY: a WSKR holds back to relay the link.', 'AUTO-INTERCEPT: WSKRs go to new contacts by themselves.', 'WIDE, NARROW, AUTO: the size of the formation.', 'SHALLOW, DEEP: their running depth.', '− and +: the chart range.']),
      G('b-snr', 'Bridge SNR page', 'SNR is the sonar on the bridge:', ['Source: the ship or a WSKR.', 'Active: ping, and hear twice as far. Everyone hears us.', 'Full sweep: a mapping sweep all round. It uses a lot of power.', 'With a contact picked (right panel): Scan, Probe (send a WSKR), Clear.', 'The yellow keys: the range. NAV follows.', 'The round trackpad (DSP): put it on the main screen.']),
    ] },
    { label: 'Sensor tasks', items: [
      G('sweep', 'Run a mapping sweep', 'A full sweep maps the sea floor round us out to 12 miles, Captain. It does not find ships.', ['Open the Sensors station. The SONAR page opens.', 'Tap Full sweep.', 'Wait about 40 seconds. The sweep turns once round the ship.', 'The chart fills in out to 12 miles.', 'The sweep uses a lot of power while it runs.']),
      G('active', 'Go active', 'Passive sonar only listens. Active sonar pings, Captain.', ['Open the Sensors station, or the SNR page on the bridge.', 'Tap Active. Or tell me: Go active.', 'Each ping spreads out like a ripple. When it passes a ship, we hear that ship twice as far.', 'Everyone hears the ping. Poachers run. Hostile ships come to look.', 'Tap Active again, or tell me Go passive, to stop.']),
      G('wskr', 'Launch a WSKR', 'We carry four WSKRs. Each one is a mobile listening post.', ['Be at sea, not docked.', 'Open the Sensors station.', 'Tap WSKRs.', 'Tap Deploy WSKR.', 'Wait. The WSKR leaves the bay and spreads out round us.']),
      G('identify', 'Identify a ship', 'There are four ways to put a name to a ship.', ['AIS ships identify themselves.', 'Any ship within 4 nautical miles is identified.', 'A WSKR within 2 nautical miles identifies a ship.', 'Within 6 nautical miles (12 if its signature is on file): open the Sensors station, tap the contact on the SONAR page, then tap Scan. Wait about 10 seconds.', 'You can also hail the ship on VHF. See Nicole.']),
      G('fix', 'Get a fix on a contact', 'One bearing shows only a direction. Two bearings show a place.', ['A dashed line on the chart is a bearing. The ship is somewhere on it.', 'Deploy a WSKR. On the SONAR page tap the contact, then tap Probe, or let the WSKRs spread.', 'Move the WSKR to a different side of the contact. The two lines must cross at 20 degrees or more.', 'When the lines cross, the chart shows the ship with a dashed ring. The ring is the error.', 'A smaller ring means a better fix.']),
      G('scansite', 'Scan a site', 'Scanning needs the ship at the site.', ['Go to the site. Use the Navigation station.', 'Open the Sensors station. The SONAR page opens.', 'Tap Scan site.', 'Or send a WSKR: on the WSKRs page tap a WSKR, tap the site on the chart, then tap Investigate.', 'The result goes into the log and the lab.']),
    ] },
  ],
  science: [
    { label: 'Buttons on my pages', items: [
      G('b-lab', 'Science Lab', 'The lab has three tabs, Captain:', ['SAMPLES: what we hold and where it came from.', 'ANALYSIS: pick a lab and a sample, then Analyse.', 'RESEARCH: spend points. Each RESEARCH button starts one topic.']),
      G('b-remora', 'Remora station', 'Remora is ours to fly:', ['LAUNCH: out through the main bay.', 'Send Remora to: pick a site.', 'The tools (when she is out): take a sample at the site.', 'AUTO RETURN: she comes home by herself.', 'RECOVER: back into the bay, then unload.']),
      G('b-bay', 'Launch Bay', 'The Launch Bay runs the doors and the craft:', ['LAUNCH (main bay): Remora or the Tern, one at a time.', 'PILOTS and PAX: who goes in the Tern.', 'RECALL: call the Tern back.', 'LAUNCH on a WSKR bay: that WSKR goes out.', 'The airlock line fills as the lock floods and empties as it drains.']),
    ] },
    { label: 'Science tasks', items: [
      G('launch', 'Launch Remora', 'Remora is our science ROV, Captain.', ['Be at sea, not docked.', 'Open the Science Lab. Tap the ROV Station.', 'Tap Launch. Wait for the bay to finish.', 'You can also launch from the Launch Bay.']),
      G('sample', 'Take a sample', 'Remora takes samples at sites on the sea floor.', ['Launch Remora.', 'Tap Send Remora to. Pick a site.', 'Wait until Remora is at the site.', 'Tap a tool: Sample collector, Core drill or Magnetometer. Only tools that fit the site show.', 'Wait for the timer to end.', 'Tap Recover, or Auto return. The samples go to the lab.']),
      G('analyse', 'Analyse a sample', 'Samples go to the lab computers.', ['Open the Science Lab.', 'Tap the Main Computer.', 'Pick Material, Spectral or Gene analysis.', 'Pick a sample. Tap Analyse.', 'Wait for the bar to fill. Each finished analysis gives one research point.']),
    ] },
  ],
  executiveOfficer: [
    { label: 'Buttons on the bridge', items: [
      G('b-desk', 'The bridge desk', 'The desk under the main screen has three panels, Captain:', ['Left: the pages. NAV, HLM, TAC, SNR, VW, SYS. The page shows on the middle display.', 'Middle: the buttons for that page. Ask the crew member who looks after it.', 'Right: more buttons for that page (PAN and SHW on NAV; Up, Dn, Srfc, NOE, Cruise on HLM; Scan, Probe, Clear on SNR).', 'Left of the centre display: two yellow keys for the range. Right of it: the round trackpad, DSP (the page on the main screen).', 'TAC: not installed yet.', 'VW: Lights, and SHOW CAMERA or SHOW SYNTHETIC for the view ahead.']),
      G('b-crew', 'Talking to the crew', 'You can reach anyone two ways:', ['Tap the pin, then tap a name.', 'On the bridge, tap Nicole or Alex at their consoles.', 'When someone has news, the line opens by itself.', 'EMERGENCY: orders such as Sound General Alarm.']),
    ] },
    { label: 'Ship screens', items: [
      G('bridge', 'The bridge screens', 'The bridge has a main screen and a desk below it.', ['The Main Screen shows the chart. Use the two yellow keys left of the Centre Display to zoom.', 'Tap the round trackpad right of the Centre Display (DSP) to show the Centre Display on the Main Screen. Tap it again for the chart.', 'Tap PAN to move the chart. The Centre Desk Strip shows arrows. Tap PAN again to centre on the ship.', 'The Left Desk Panel picks the page: NAV, HELM, SYS or VIEW.']),
      G('ped', 'The PED and tasks', 'The PED holds your tasks.', ['Tap PED in the top-right corner.', 'Open Tasks.', 'Read the steps for each task.', 'Steps tick off by themselves.']),
      G('log', 'The logbook', 'The logbook is on your desk.', ['Go to your quarters.', 'Tap the logbook on the desk.', 'Tap + New entry to write. Tap an entry to read it.', 'Revert here goes back to that point in the log.']),
    ] },
  ],
  engineering: [
    { label: 'Buttons on my pages', items: [
      G('b-eng', 'Engineering computer', 'The engineering computer is the console in Engineering, Captain. The buttons:', ['GENERAL ALARM: sound it. While it sounds, it reads SECURE ALARM.', 'A system in the list: show its picture, health and reading.', 'On a diagram: tap a pump, valve, fan or breaker to switch it.', 'REPAIR: send a team. We have two. STAND DOWN calls one back.', 'Cooler and Warmer (Heating/Cooling): the cabin set point.']),
      G('b-sys', 'Systems page', 'Systems is the quick view:', ['LIGHTS: the outside lights on or off.', 'SONAR: active sonar on or off.']),
    ] },
    { label: 'Engineering screens', items: [
      G('sys', 'Systems page', 'Systems shows how the ship is.', ['Open the Systems station, or tap SYS on the bridge.', 'Hull shows damage.', 'Life support shows air and scrubbers.', 'Power shows the plant and the battery.', 'Switches turn systems on and off.']),
    ] },
  ],
};

/** The folders of how-to pages for one crew member: [{ label, items: [{ id, label }] }]. */
export const guidesFor = (crewId) => (GUIDES[crewId] || []).map((f) => ({ label: f.label, items: f.items.map((i) => ({ id: i.id, label: i.label })) }));
/** The answer for one page: an opening line, then one numbered line per step. */
export function askGuide(crewId, id) {
  for (const f of GUIDES[crewId] || []) for (const i of f.items) if (i.id === id) return fill(`${i.intro}\n${i.steps.map((s, n) => `${n + 1}. ${s}`).join('\n')}`);
  return null;
}
