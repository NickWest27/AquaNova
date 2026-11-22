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
    ] },
  ],
  helm: [
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
    { label: 'Sensor tasks', items: [
      G('sweep', 'Run a sonar sweep', 'A full sweep charts the sea around us in detail, Captain.', ['Open the Sensors station.', 'Tap Full sweep.', 'Wait. The sweep runs for a while and shows more of the chart.', 'Contacts appear in the list.']),
      G('wskr', 'Launch a WSKR', 'We carry four WSKRs. Each one is a mobile listening post.', ['Be at sea, not docked.', 'Open the Sensors station.', 'Tap Deploy WSKR.', 'Wait. The WSKR leaves the bay and spreads out round us.', 'Tap WSKR page to set its depth, speed and formation.']),
      G('identify', 'Identify a ship', 'There are four ways to put a name to a ship.', ['AIS ships identify themselves.', 'Any ship within 4 nautical miles is identified.', 'A WSKR within 2 nautical miles identifies a ship.', 'Within 8 nautical miles: open the Sensors station, tap Select on the contact, then tap Sweep. Wait about 20 seconds.', 'You can also hail the ship on VHF. See Nicole.']),
      G('fix', 'Get a fix on a contact', 'One bearing shows only a direction. Two bearings show a place.', ['A dashed line on the chart is a bearing. The ship is somewhere on it.', 'Deploy a WSKR. Tap Send WSKR and pick the contact, or let it spread.', 'Move the WSKR to a different side of the contact. The two lines must cross at 20 degrees or more.', 'When the lines cross, the chart shows the ship with a dashed ring. The ring is the error.', 'A smaller ring means a better fix.']),
      G('scansite', 'Scan a site', 'Scanning needs the ship at the site.', ['Go to the site. Use the Navigation station.', 'Open the Sensors station.', 'Tap the site in the list. Tap Scan.', 'The result goes into the log and the lab.']),
    ] },
  ],
  science: [
    { label: 'Science tasks', items: [
      G('launch', 'Launch Remora', 'Remora is our science ROV, Captain.', ['Be at sea, not docked.', 'Open the Science Lab. Tap the ROV Station.', 'Tap Launch. Wait for the bay to finish.', 'You can also launch from the Launch Bay.']),
      G('sample', 'Take a sample', 'Remora takes samples at sites on the sea floor.', ['Launch Remora.', 'Tap Send Remora to. Pick a site.', 'Wait until Remora is at the site.', 'Tap a tool: Sample collector, Core drill or Magnetometer. Only tools that fit the site show.', 'Wait for the timer to end.', 'Tap Recover, or Auto return. The samples go to the lab.']),
      G('analyse', 'Analyse a sample', 'Samples go to the lab computers.', ['Open the Science Lab.', 'Tap the Main Computer.', 'Pick Material, Spectral or Gene analysis.', 'Pick a sample. Tap Analyse.', 'Wait for the bar to fill. Each finished analysis gives one research point.']),
    ] },
  ],
  executiveOfficer: [
    { label: 'Ship screens', items: [
      G('bridge', 'The bridge screens', 'The bridge has a main screen and a desk below it.', ['The Main Screen shows the chart. Use RANGE − and + on the right panel to zoom.', 'Tap DSP on the right panel to show the Centre Display on the Main Screen. Tap DSP again for the chart.', 'Tap PAN to move the chart. The Centre Desk Strip shows arrows. Tap PAN again to centre on the ship.', 'The Left Desk Panel picks the page: NAV, HELM, SYS or VIEW.']),
      G('ped', 'The PED and tasks', 'The PED holds your tasks.', ['Tap PED in the top-right corner.', 'Open Tasks.', 'Read the steps for each task.', 'Steps tick off by themselves.']),
      G('log', 'The logbook', 'The logbook is on your desk.', ['Go to your quarters.', 'Tap the logbook on the desk.', 'Tap + New entry to write. Tap an entry to read it.', 'Revert here goes back to that point in the log.']),
    ] },
  ],
  engineering: [
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
