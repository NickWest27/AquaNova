// Handles the Captains quarters system for Aqua Nova
import { setGlobalScale } from '/utils/scale.js';

function openLogbook() {
    window.location.href = '/logbook/logbook.html';
}

function exitToBridge() {
    window.location.href = '/bridge/bridge.html';
}

document.addEventListener('DOMContentLoaded', () => {
    const logbookButton = document.getElementById('logbook-button');
    const exitButton = document.getElementById('exit-button');

    if (logbookButton) {
        logbookButton.addEventListener('click', openLogbook);
    }

    if (exitButton) {
        exitButton.addEventListener('click', exitToBridge);
    }
});
