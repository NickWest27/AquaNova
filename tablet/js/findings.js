// Filing a scan of a site (from the Sensors station or from a WSKR). Shows in PED → Findings.
import { gameState } from './persist.js';

export const findings = () => gameState.getProperty('mission.discoveries') || [];
export const scanned = (p) => findings().some((f) => f.id === `poi-${p.id}`);
/** Returns false if the site was already scanned. */
export function fileScan(p) {
  if (scanned(p)) return false;
  gameState.updateProperty('mission.discoveries', [...findings(), { id: `poi-${p.id}`, name: p.name, description: p.text || `Scanned ${p.name}.`, type: p.type, scannedAt: new Date().toISOString() }]);
  return true;
}
