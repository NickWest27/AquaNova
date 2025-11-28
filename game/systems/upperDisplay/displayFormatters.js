// /game/systems/upperDisplay/displayFormatters.js
// Display Formatters - Text formatting and styling utilities for upper display

import { AlertPriority } from './alertManager.js';

// Color constants matching cyber aesthetic
export const Colors = {
  CYAN: '#64ffda',
  GRAY: '#8892b0',
  WHITE: '#ffffff',
  RED: '#ff4444',
  ORANGE: '#ffa500',
  GREEN: '#00ff00'
};

// Alert priority colors
const PRIORITY_COLORS = {
  [AlertPriority.CRITICAL]: Colors.RED,
  [AlertPriority.WARNING]: Colors.ORANGE,
  [AlertPriority.ADVISORY]: Colors.CYAN,
  [AlertPriority.INFO]: Colors.GRAY,
  [AlertPriority.DEFAULT]: Colors.CYAN
};

/**
 * Format speed value for display
 * @param {number} speed - Speed in knots
 * @returns {string} Formatted speed string
 */
export function formatSpeed(speed) {
  const absSpeed = Math.abs(speed);
  const speedStr = Math.round(absSpeed).toString().padStart(3, '0');

  if (speed < 0) {
    return `REV ${speedStr} KTS`;
  } else if (speed === 0) {
    return 'SPD 000 KTS';
  } else {
    return `SPD ${speedStr} KTS`;
  }
}

/**
 * Format heading value for display
 * @param {number} heading - Heading in degrees (0-360)
 * @returns {string} Formatted heading string
 */
export function formatHeading(heading) {
  const hdg = Math.round(heading) % 360;
  return `HDG ${hdg.toString().padStart(3, '0')}°`;
}

/**
 * Format depth value for display
 * @param {number} depth - Depth in meters
 * @returns {string} Formatted depth string
 */
export function formatDepth(depth) {
  const d = Math.round(depth);
  if (d === 0) {
    return 'DEPTH SURFACE';
  }
  return `DEPTH ${d} M`;
}

/**
 * Format region name for display
 * @param {Object} location - Location object from game state
 * @returns {string} Formatted region name
 */
export function formatRegion(location) {
  if (!location || !location.properties || !location.properties.name) {
    return 'UNKNOWN REGION';
  }

  const name = location.properties.name.toUpperCase();

  // Truncate if too long (max ~40 characters for display)
  if (name.length > 40) {
    return name.substring(0, 37) + '...';
  }

  return name;
}

/**
 * Get color for alert priority
 * @param {number} priority - Alert priority level
 * @returns {string} Color hex code
 */
export function getAlertColor(priority) {
  return PRIORITY_COLORS[priority] || Colors.CYAN;
}

/**
 * Check if alert should pulse
 * @param {number} priority - Alert priority level
 * @returns {boolean} True if should pulse
 */
export function shouldPulse(priority) {
  return priority >= AlertPriority.WARNING;
}

/**
 * Format default ship status display
 * @param {Object} gameState - Game state object
 * @returns {Object} Formatted display data
 */
export function formatDefaultDisplay(gameState) {
  const helm = gameState.getProperty('helm') || {};
  const location = gameState.getProperty('navigation.location');

  const speed = helm.currentSpeed || 0;
  const heading = helm.currentHeading || 0;
  const depth = helm.currentDepth || 0;

  // Line 1: HDG | SPD | DEPTH
  const line1 = `${formatHeading(heading)} | ${formatSpeed(speed)} | ${formatDepth(depth)}`;

  // Line 2: Region name
  const line2 = formatRegion(location);

  return {
    line1,
    line2,
    color: Colors.CYAN,
    pulse: false
  };
}

/**
 * Format alert display
 * @param {Object} alert - Alert object
 * @returns {Object} Formatted display data
 */
export function formatAlertDisplay(alert) {
  if (!alert) return null;

  return {
    message: alert.message,
    color: getAlertColor(alert.priority),
    pulse: shouldPulse(alert.priority),
    priority: alert.priority
  };
}

/**
 * Calculate optimal font size based on canvas dimensions
 * @param {number} canvasHeight - Canvas height in pixels
 * @returns {number} Font size in pixels
 */
export function calculateFontSize(canvasHeight) {
  // Target ~16-18px for normal heights, scale proportionally
  const baseFontSize = Math.max(12, Math.min(20, canvasHeight * 0.18));
  return Math.round(baseFontSize);
}

/**
 * Calculate pulse opacity for animations
 * @param {number} timestamp - Current timestamp
 * @param {number} period - Pulse period in ms
 * @returns {number} Opacity value (0.6-1.0)
 */
export function calculatePulseOpacity(timestamp, period = 1500) {
  const phase = (timestamp % period) / period;
  // Sine wave between 0.6 and 1.0
  return 0.6 + 0.4 * Math.sin(phase * Math.PI * 2);
}

/**
 * Calculate ellipsis animation state
 * @param {number} timestamp - Current timestamp
 * @returns {string} Ellipsis string ('', '.', '..', '...')
 */
export function calculateEllipsis(timestamp) {
  const phase = Math.floor((timestamp % 1200) / 300);
  return '.'.repeat(phase);
}

/**
 * Animate ellipsis in message
 * @param {string} message - Message with '...' placeholder
 * @param {number} timestamp - Current timestamp
 * @returns {string} Message with animated ellipsis
 */
export function animateEllipsis(message, timestamp) {
  if (!message.includes('...')) return message;

  const ellipsis = calculateEllipsis(timestamp);
  // Replace first occurrence of '...' with animated version
  return message.replace('...', ellipsis.padEnd(3, ' '));
}
