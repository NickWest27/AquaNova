// /game/systems/upperDisplay/alertManager.js
// Alert Manager - Priority-based alert queue and condition monitoring

import gameStateInstance from '../../state.js';
import { getDepthAtPosition } from '../navComputer/navComputer.js';

// Alert priority levels (higher number = higher priority)
export const AlertPriority = {
  CRITICAL: 4,
  WARNING: 3,
  ADVISORY: 2,
  INFO: 1,
  DEFAULT: 0
};

// Alert queue (sorted by priority)
let alertQueue = [];
let currentAlert = null;
let lastCheckTimestamp = 0;
const ALERT_CHECK_INTERVAL = 1000; // Check for alerts every 1 second

// Alert deduplication tracking
let recentAlerts = new Map(); // message -> timestamp
const DEDUPE_WINDOW = 5000; // Don't show same alert within 5 seconds

// State tracking for change detection
let lastState = {
  wskrStatus: {},
  commLogLength: 0,
  regionName: null,
  lastDestinationDistance: Infinity
};

/**
 * Alert object structure
 * @typedef {Object} Alert
 * @property {number} priority - Priority level (0-4)
 * @property {string} message - Alert message text
 * @property {number} duration - Display duration in ms (0 = persistent)
 * @property {number} timestamp - Creation timestamp
 * @property {string} id - Unique identifier for deduplication
 */

/**
 * Add an alert to the queue
 * @param {number} priority - Alert priority level
 * @param {string} message - Alert message
 * @param {number} duration - Display duration in ms (0 = persistent)
 * @returns {boolean} True if alert was added, false if deduplicated
 */
export function addAlert(priority, message, duration = 5000) {
  // Check for recent duplicate
  const now = Date.now();
  if (recentAlerts.has(message)) {
    const lastTime = recentAlerts.get(message);
    if (now - lastTime < DEDUPE_WINDOW) {
      return false; // Deduplicated
    }
  }

  // Create alert object
  const alert = {
    priority,
    message,
    duration,
    timestamp: now,
    id: `${message}_${now}`
  };

  // Add to queue
  alertQueue.push(alert);

  // Sort by priority (highest first)
  alertQueue.sort((a, b) => b.priority - a.priority);

  // Limit queue size
  if (alertQueue.length > 10) {
    alertQueue = alertQueue.slice(0, 10);
  }

  // Track for deduplication
  recentAlerts.set(message, now);

  // Clean up old deduplication entries
  cleanupDeduplicationMap();

  return true;
}

/**
 * Get the current alert to display
 * @returns {Alert|null} Current alert or null
 */
export function getCurrentAlert() {
  const now = Date.now();

  // Remove expired alerts
  alertQueue = alertQueue.filter(alert => {
    if (alert.duration === 0) return true; // Persistent alerts
    return now - alert.timestamp < alert.duration;
  });

  // Return highest priority alert
  return alertQueue.length > 0 ? alertQueue[0] : null;
}

/**
 * Clear all alerts
 */
export function clearAlerts() {
  alertQueue = [];
  currentAlert = null;
}

/**
 * Clear specific alert by message
 * @param {string} message - Alert message to clear
 */
export function clearAlert(message) {
  alertQueue = alertQueue.filter(alert => alert.message !== message);
}

/**
 * Clean up old deduplication entries
 */
function cleanupDeduplicationMap() {
  const now = Date.now();
  for (const [message, timestamp] of recentAlerts.entries()) {
    if (now - timestamp > DEDUPE_WINDOW * 2) {
      recentAlerts.delete(message);
    }
  }
}

/**
 * Check for alert conditions
 * Called periodically from upper display update loop
 */
export function checkAlertConditions(timestamp) {
  // Throttle checks to 1fps
  if (timestamp - lastCheckTimestamp < ALERT_CHECK_INTERVAL) {
    return;
  }
  lastCheckTimestamp = timestamp;

  checkSeafloorProximity();
  checkDestinationProximity();
  checkWSKRDeployment();
  checkIncomingCommunications();
  checkSystemHealth();
  checkRegionChange();
}

/**
 * Check for seafloor proximity alert
 */
async function checkSeafloorProximity() {
  const currentDepth = gameStateInstance.getProperty('helm.currentDepth');
  const location = gameStateInstance.getProperty('navigation.location');

  if (!location || !location.geometry) return;

  const [lon, lat] = location.geometry.coordinates;

  try {
    const seafloorDepth = await getDepthAtPosition(lon, lat);

    if (seafloorDepth !== null) {
      // Bathymetry depths are negative, current depth is positive
      const clearance = Math.abs(seafloorDepth) - currentDepth;

      if (clearance <= 20 && clearance > 0) {
        addAlert(AlertPriority.CRITICAL, '!!! SEA FLOOR COLLISION RISK !!!', 0);
      } else if (clearance <= 50 && clearance > 20) {
        addAlert(AlertPriority.WARNING, '... APPROACHING SEA FLOOR ...', 5000);
      } else {
        // Clear seafloor alerts if clearance is safe
        clearAlert('!!! SEA FLOOR COLLISION RISK !!!');
        clearAlert('... APPROACHING SEA FLOOR ...');
      }
    }
  } catch (error) {
    // Bathymetry data not available
  }
}

/**
 * Check for destination proximity alert
 */
function checkDestinationProximity() {
  const destination = gameStateInstance.getProperty('navigation.destination');
  const location = gameStateInstance.getProperty('navigation.location');

  if (!destination || !location || !location.geometry) {
    lastState.lastDestinationDistance = Infinity;
    return;
  }

  const [shipLon, shipLat] = location.geometry.coordinates;
  const [destLon, destLat] = destination.coordinates || [0, 0];

  // Calculate distance in nautical miles
  const distance = calculateDistance(shipLon, shipLat, destLon, destLat);

  // Only alert when approaching (distance decreasing)
  if (distance < 1.0 && distance < lastState.lastDestinationDistance) {
    if (distance > 0.1) {
      addAlert(AlertPriority.ADVISORY, '... APPROACHING DESTINATION ...', 10000);
    } else {
      addAlert(AlertPriority.INFO, '... DESTINATION REACHED ...', 8000);
      clearAlert('... APPROACHING DESTINATION ...');
    }
  }

  lastState.lastDestinationDistance = distance;
}

/**
 * Check for WSKR deployment status changes
 */
function checkWSKRDeployment() {
  const wskrs = gameStateInstance.getProperty('sensors') || {};
  const wskrNames = ['triton', 'thalassa', 'oceanus'];

  wskrNames.forEach(name => {
    const wskr = wskrs[name];
    if (!wskr) return;

    const currentStatus = wskr.status || 'docked';
    const previousStatus = lastState.wskrStatus[name] || 'docked';

    // Detect deployment (docked/standby → active)
    if (currentStatus === 'active' && previousStatus !== 'active') {
      addAlert(AlertPriority.ADVISORY, `... ${name.toUpperCase()} DEPLOYED ...`, 8000);
    }

    // Detect recovery (active → docked)
    if (currentStatus === 'docked' && previousStatus === 'active') {
      addAlert(AlertPriority.INFO, `... ${name.toUpperCase()} RECOVERED ...`, 6000);
    }

    lastState.wskrStatus[name] = currentStatus;
  });
}

/**
 * Check for incoming communications
 */
function checkIncomingCommunications() {
  // This would check the communication log for new messages
  // For now, we'll leave it as a placeholder since comm system isn't fully implemented

  // Example implementation when comm system is ready:
  // const commLog = gameStateInstance.getProperty('shipSystems.communications.communicator.log');
  // if (commLog && commLog.length > lastState.commLogLength) {
  //   addAlert(AlertPriority.INFO, '... INCOMING COMMUNICATION ...', 6000);
  //   lastState.commLogLength = commLog.length;
  // }
}

/**
 * Check system health for warnings
 */
function checkSystemHealth() {
  const hull = gameStateInstance.getProperty('hull');
  const power = gameStateInstance.getProperty('power');
  const helm = gameStateInstance.getProperty('helm');

  // Hull integrity
  if (hull && hull.integrity < 50) {
    addAlert(AlertPriority.CRITICAL, '!!! HULL INTEGRITY CRITICAL !!!', 0);
  } else if (hull && hull.integrity < 75) {
    addAlert(AlertPriority.WARNING, '... HULL DAMAGE DETECTED ...', 5000);
  } else {
    clearAlert('!!! HULL INTEGRITY CRITICAL !!!');
    clearAlert('... HULL DAMAGE DETECTED ...');
  }

  // Reactor health
  if (power) {
    const leftReactor = power.leftReactorHealth || 100;
    const rightReactor = power.rightReactorHealth || 100;

    if (leftReactor < 30 || rightReactor < 30) {
      addAlert(AlertPriority.CRITICAL, '!!! REACTOR FAILURE !!!', 0);
    } else if (leftReactor < 60 || rightReactor < 60) {
      addAlert(AlertPriority.WARNING, '... REACTOR DEGRADATION ...', 5000);
    } else {
      clearAlert('!!! REACTOR FAILURE !!!');
      clearAlert('... REACTOR DEGRADATION ...');
    }
  }

  // Drivetrain health
  if (helm) {
    const leftDrive = helm.leftDrivetrainHealth || 100;
    const rightDrive = helm.rightDrivetrainHealth || 100;

    if (leftDrive < 40 || rightDrive < 40) {
      addAlert(AlertPriority.WARNING, '... PROPULSION SYSTEM DEGRADED ...', 5000);
    } else {
      clearAlert('... PROPULSION SYSTEM DEGRADED ...');
    }
  }
}

/**
 * Check for region changes
 */
function checkRegionChange() {
  const location = gameStateInstance.getProperty('navigation.location');

  if (location && location.properties && location.properties.name) {
    const currentRegion = location.properties.name;

    if (lastState.regionName && lastState.regionName !== currentRegion) {
      addAlert(AlertPriority.INFO, `... ENTERING ${currentRegion.toUpperCase()} ...`, 6000);
    }

    lastState.regionName = currentRegion;
  }
}

/**
 * Calculate distance between two coordinates in nautical miles
 * @param {number} lon1 - Longitude 1
 * @param {number} lat1 - Latitude 1
 * @param {number} lon2 - Longitude 2
 * @param {number} lat2 - Latitude 2
 * @returns {number} Distance in nautical miles
 */
function calculateDistance(lon1, lat1, lon2, lat2) {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
