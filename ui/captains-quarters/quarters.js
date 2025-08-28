// Handles the Captains quarters system for Aqua Nova
import { setGlobalScale } from '/utils/scale.js';

const eventListeners = new Map();

document.addEventListener('DOMContentLoaded', () => {
    const logbookButton = document.getElementById('logbook-button');
    const exitButton = document.getElementById('exit-button');

    if (logbookButton) {
        addEventListenerWithCleanup(logbookButton, 'click', () => {
            console.log("Opening logbook...");
            window.location.href = './logbook/logbook.html';
        });
    }
    if (exitButton) {
        addEventListenerWithCleanup(exitButton, 'click', () => {
            console.log('Exiting quarter, returning to bridge...');
            window.location.href = '../bridge/bridge.html';
        });
    }
});

// Event listener management to prevent memory leaks
function addEventListenerWithCleanup(element, event, handler) {
    if (!element) return;
    
    const key = `${element.id || 'anonymous'}-${event}`;
    
    // Remove existing listener if present
    if (eventListeners.has(key)) {
      const oldHandler = eventListeners.get(key);
      element.removeEventListener(event, oldHandler);
    }
    
    // Add new listener
    element.addEventListener(event, handler);
    eventListeners.set(key, handler);
}

function cleanup() {
    // Remove all event listeners
    eventListeners.forEach((handler, key) => {
      const [elementId, event] = key.split('-');
      const element = document.getElementById(elementId);
      if (element) {
        element.removeEventListener(event, handler);
      }
    });
    eventListeners.clear();
}