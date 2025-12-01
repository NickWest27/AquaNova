// Sensors Station Handler
import gameStateInstance from '/game/state.js';
import saveManagerInstance from '/game/saveManager.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';
import { initCommunicatorOverlay } from '/utils/communicatorOverlay.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Sensors station loading...');

    // Initialize SaveManager to load game state from logbook
    await saveManagerInstance.init(gameStateInstance);

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
