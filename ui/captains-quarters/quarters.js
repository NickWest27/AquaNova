// Handles the Captains quarters system for Aqua Nova
import { setGlobalScale } from '/utils/scale.js';
import missionManager from '/game/systems/missionManager.js';

const eventListeners = new Map();

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Quarters loading...');
    
    // Initialize mission system if not already done
    if (!missionManager.initialized) {
        console.log('Initializing mission system...');
        await missionManager.init();
    }
    
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
            console.log('Exiting quarters, returning to bridge...');
            window.location.href = '../bridge/bridge.html';
        });
    }
    // Fire location enter event for missions
    console.log('Firing location-enter event for quarters');
    const locationEvent = new CustomEvent('location-enter', {
        detail: { location: 'quarters' }
    });
    document.dispatchEvent(locationEvent);
    
    // Add keyboard handler for communicator tutorial
    addEventListenerWithCleanup(document, 'keydown', (e) => {
        if (e.key.toLowerCase() === 'c') {
            // Set tutorial property when C is pressed
            gameStateInstance.updateProperty('tutorial.communicator_opened', true);
            console.log('Communicator tutorial property set');
        }
    });
    
    console.log('Quarters initialization complete');
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