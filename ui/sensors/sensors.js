// Sensors Station Handler
import { initPDAOverlay } from '/utils/pdaOverlay.js';
import { initCommunicatorOverlay } from '/utils/communicatorOverlay.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('Sensors station loading...');

    // Initialize overlays
    initPDAOverlay();
    initCommunicatorOverlay();

    // Setup navigation back to bridge
    const bridgeButton = document.getElementById('bridge-button');
    if (bridgeButton) {
        bridgeButton.addEventListener('click', () => {
            console.log('Returning to bridge...');
            window.location.href = '../bridge/bridge.html';
        });
    }

    console.log('Sensors station ready');
});
