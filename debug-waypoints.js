// Debug script to check waypoints
// Run this in browser console to see all waypoints

import gameStateInstance from '/game/state.js';

const waypoints = gameStateInstance.getAllWaypoints();
console.log('=== WAYPOINT DEBUG ===');
console.log(`Total waypoints: ${waypoints.length}`);
waypoints.forEach((wpt, i) => {
    const [lon, lat] = wpt.geometry.coordinates;
    console.log(`${i+1}. ${wpt.name} (${wpt.category}/${wpt.type}) - [${lat.toFixed(4)}, ${lon.toFixed(4)}] - Source: ${wpt.source || 'user'}`);
});
console.log('======================');
