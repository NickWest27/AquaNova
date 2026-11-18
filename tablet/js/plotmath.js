// Course entry maths. No imports, so it runs in Node tests too.
//   lat/long        : a point typed as decimal degrees or degrees and minutes, e.g. 40.25, 40 15.5N, -72.2, 72°12'W
//   place           : go to a place (a marker, or the ship itself)
//   place + bearing : the point 5 nm from the place on that bearing
//   place + bearing + distance : the point that far from the place on that bearing
export const DEFAULT_LEG_NM = 5, MAX_LEG_NM = 400, MIN_FLOOR_M = 8, NM_PER_DEG = 60;

/** Parse one coordinate. Returns a number in degrees, or null. */
export function parseCoord(text, isLat) {
  if (text == null) return null;
  let t = String(text).trim().toUpperCase().replace(/[°′'’"″]/g, ' ').replace(/,/g, '.').trim();
  if (!t) return null;
  let sign = 1;
  const hemi = t.match(/[NSEW]/g);
  if (hemi) {
    if (hemi.length > 1) return null;
    const h = hemi[0];
    if (isLat ? !'NS'.includes(h) : !'EW'.includes(h)) return null;
    if (h === 'S' || h === 'W') sign = -1;
    t = t.replace(/[NSEW]/, ' ').trim();
  }
  const parts = t.split(/\s+/);
  if (parts.length > 3 || !parts.every((p) => /^-?\d+(\.\d+)?$/.test(p))) return null;
  let v = Math.abs(parseFloat(parts[0]));
  if (parts[1] != null) { const m = parseFloat(parts[1]); if (m < 0 || m >= 60) return null; v += m / 60; }
  if (parts[2] != null) { const sec = parseFloat(parts[2]); if (sec < 0 || sec >= 60) return null; v += sec / 3600; }
  if (parts[0].startsWith('-') || parts[0].startsWith('−')) sign = -sign;
  v *= sign;
  return Math.abs(v) <= (isLat ? 90 : 180) ? v : null;
}

/** Parse a bearing (0 to 360 degrees). Returns degrees or null. */
export function parseBearing(text) {
  const t = String(text == null ? '' : text).replace(/[°\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = parseFloat(t); return v <= 360 ? v % 360 : null;
}

export const project = (from, brgDeg, nm) => {
  const r = (brgDeg * Math.PI) / 180;
  const lat = from.lat + (nm * Math.cos(r)) / NM_PER_DEG;
  return { lat, lon: from.lon + (nm * Math.sin(r)) / (NM_PER_DEG * Math.cos((from.lat * Math.PI) / 180)) };
};

/** input: { mode:'latlon', lat, lon } or { mode:'place', place, bearing, distance } (strings).
 *  env: { ship:{lat,lon}, pois:[...], inside(lat,lon), floorAt(lat,lon) }.  Returns { ok:true, point:{lat,lon,name?,poi?} } or { ok:false, error }. */
export function resolveTarget(input, env) {
  let point, poi = null, label;
  if (input.mode === 'latlon') {
    const lat = parseCoord(input.lat, true), lon = parseCoord(input.lon, false);
    if (lat == null) return { ok: false, error: 'Latitude not understood. Try 40.25 or 40 15.5 N.' };
    if (lon == null) return { ok: false, error: 'Longitude not understood. Try -72.2 or 72 12 W.' };
    point = { lat, lon };
  } else {
    const ref = input.place === 'ship' ? env.ship : env.pois.find((p) => String(p.id) === String(input.place));
    if (!ref) return { ok: false, error: 'Pick a place.' };
    const hasB = String(input.bearing == null ? '' : input.bearing).trim() !== '', hasD = String(input.distance == null ? '' : input.distance).trim() !== '';
    if (!hasB && hasD) return { ok: false, error: 'A distance needs a bearing.' };
    if (!hasB) {
      if (input.place === 'ship') return { ok: false, error: 'Give a bearing, or pick another place.' };
      return { ok: true, point: ref, poi: ref };
    }
    const brg = parseBearing(input.bearing);
    if (brg == null) return { ok: false, error: 'Bearing must be 0 to 360 degrees.' };
    let nm = DEFAULT_LEG_NM;
    if (hasD) { nm = parseFloat(String(input.distance).replace(',', '.')); if (!(nm > 0) || nm > MAX_LEG_NM || !/^\s*\d+([.,]\d+)?\s*$/.test(String(input.distance))) return { ok: false, error: `Distance must be more than 0 and at most ${MAX_LEG_NM} nm.` }; }
    point = project(ref, brg, nm);
  }
  if (!env.inside(point.lat, point.lon)) return { ok: false, error: 'That point is outside the charted area.' };
  const fl = env.floorAt(point.lat, point.lon);
  if (fl == null || fl < MIN_FLOOR_M) return { ok: false, error: 'That point is land or water too shallow for the ship.' };
  return { ok: true, point };
}
