/* Aqua Nova offline cache. Asks the network first (so updates arrive on the next open) and
   falls back to the saved copy when offline or slow. Covers the iPad game (tablet/) and the
   iPhone PED (ped/). Only same-origin GET requests are handled: GitHub sync calls go straight to
   the network. Run `python3 tools/update_sw.py` after adding or renaming files. */
const VERSION = '741bfe8abe';
const CACHE = 'aquanova-' + VERSION;
const ASSETS = [
 "tablet/",
 "ped/",
 "data/contacts.json",
 "data/locations.json",
 "data/logbook.json",
 "data/logbooks/MaidenVoyage.json",
 "data/logbooks/SeaTrials.json",
 "data/missions/index.json",
 "data/missions/meetTheCrew.json",
 "data/missions/seaTrials.json",
 "data/readme.txt",
 "game/saveManager.js",
 "game/state.js",
 "game/systems/missionManager.js",
 "ped/icon-180.png",
 "ped/index.html",
 "ped/manifest.webmanifest",
 "ped/ped.css",
 "ped/ped.js",
 "tablet/assets/bridge.webp",
 "tablet/assets/comm-pin.webp",
 "tablet/assets/icon-180.png",
 "tablet/assets/pda-frame.webp",
 "tablet/assets/quarters.webp",
 "tablet/assets/splash.webp",
 "tablet/index.html",
 "tablet/js/app.js",
 "tablet/js/audio.js",
 "tablet/js/nd.js",
 "tablet/js/persist.js",
 "tablet/js/scene.js",
 "tablet/js/sim.js",
 "tablet/js/stations/comms.js",
 "tablet/js/stations/crew.js",
 "tablet/js/stations/helm.js",
 "tablet/js/stations/log.js",
 "tablet/js/stations/nav.js",
 "tablet/js/stations/ped.js",
 "tablet/js/stations/sensors.js",
 "tablet/js/stations/systems.js",
 "tablet/js/sync.js",
 "tablet/js/ui.js",
 "tablet/js/util.js",
 "tablet/manifest.webmanifest",
 "tablet/tablet.css",
 "utils/debugPanel.js",
 "utils/ledgerSync.js",
 "utils/log.js"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('aquanova-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Network first, so an update arrives on the next open. If the network is slow (2.5 s) or gone,
  // the saved copy answers, and the fresh copy still finishes saving in the background.
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const fallback = () => cache.match(req, { ignoreSearch: true }).then((c) => c || (req.mode === 'navigate' ? cache.match(url.pathname.includes('/ped/') ? 'ped/index.html' : 'tablet/index.html') : Response.error()));
    const net = fetch(req, { cache: 'no-cache' }).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
    const slow = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
    try {
      const first = await Promise.race([net, slow]);
      if (first) return first;
      net.catch(() => null);
      return (await fallback()) || net;
    } catch (err) { return fallback(); }
  }));
});
