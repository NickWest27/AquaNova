// utils/mfd/pages/helmPage.js
// Helm control MFD page - controls ship speed, heading, and depth

import gameStateInstance from '/game/state.js';

class HelmPage {
    static init(mfd) {
        // Initialize helm page state
        const defaultState = {
            mode: 'control',  // 'control' mode
            selectedParameter: null  // 'speed', 'heading', or 'depth' when awaiting input
        };

        mfd.setPageState(defaultState, 'helm');
        console.log('Helm page initialized');
    }

    static getSoftKeys(mfd) {
        const state = mfd.getPageState('helm');

        // 15 button layout: L1-L5, C1-C5, R1-R5
        return {
            labels: [
                '▲',        // L1: Speed up
                'SPD',      // L2: Speed (keyboard entry)
                '▼',        // L3: Speed down
                '',         // L4: Empty
                '◄',        // L5: Heading left
                '', '', '', '', 'HDG',  // C1-C4: Empty, C5: Heading (keyboard entry)
                '▲',        // R1: Depth up (shallower)
                'DEP',      // R2: Depth (keyboard entry)
                '▼',        // R3: Depth down (deeper)
                '',         // R4: Empty
                '►'         // R5: Heading right
            ],
            actions: [
                () => this.adjustSpeed(mfd, 5),           // L1: +5 knots
                () => this.requestSpeedInput(mfd),        // L2: Keyboard entry
                () => this.adjustSpeed(mfd, -5),          // L3: -5 knots
                null,                                      // L4
                () => this.adjustHeading(mfd, -5),        // L5: -5 degrees
                null, null, null, null,                   // C1-C4
                () => this.requestHeadingInput(mfd),      // C5: Heading keyboard entry
                () => this.adjustDepth(mfd, -10),         // R1: -10m (shallower)
                () => this.requestDepthInput(mfd),        // R2: Keyboard entry
                () => this.adjustDepth(mfd, 10),          // R3: +10m (deeper)
                null,                                      // R4
                () => this.adjustHeading(mfd, 5)          // R5: +5 degrees
            ],
            states: [
                { type: 'momentary', selected: false },  // L1: Speed up arrow
                { type: 'momentary', selected: false },  // L2: SPD (keyboard entry)
                { type: 'momentary', selected: false },  // L3: Speed down arrow
                null,                                     // L4: Empty
                { type: 'momentary', selected: false },  // L5: Heading left arrow
                null, null, null, null,                  // C1-C4
                { type: 'momentary', selected: false },  // C5: HDG (keyboard entry)
                { type: 'momentary', selected: false },  // R1: Depth up arrow
                { type: 'momentary', selected: false },  // R2: DEP (keyboard entry)
                { type: 'momentary', selected: false },  // R3: Depth down arrow
                null,                                     // R4: Empty
                { type: 'momentary', selected: false }   // R5: Heading right arrow
            ]
        };
    }

    // Speed adjustment methods
    static adjustSpeed(mfd, delta) {
        const currentTarget = gameStateInstance.getProperty('helm.targetSpeed') || 0;
        let newSpeed = currentTarget + delta;

        // Clamp to valid range: -15 to 160 knots
        newSpeed = Math.max(-15, Math.min(160, newSpeed));

        gameStateInstance.updateProperty('helm.targetSpeed', newSpeed);
        mfd.needsRedraw = true;

        console.log(`Helm: Target speed set to ${newSpeed} knots`);
    }

    static requestSpeedInput(mfd) {
        const state = mfd.getPageState('helm');
        state.selectedParameter = 'speed';
        mfd.setPageState(state, 'helm');

        mfd.requestKeyboardInput('SPEED: ', 'helm_speed', 5);
        console.log('Helm: Speed input requested');
    }

    // Heading adjustment methods
    static adjustHeading(mfd, delta) {
        const currentTarget = gameStateInstance.getProperty('helm.targetHeading') || 0;
        console.log(`Helm: Adjusting heading from ${currentTarget}° by ${delta}°`);

        let newHeading = currentTarget + delta;

        // Wrap heading: 0-360 degrees
        if (newHeading < 0) newHeading += 360;
        if (newHeading >= 360) newHeading -= 360;

        gameStateInstance.updateProperty('helm.targetHeading', Math.round(newHeading));
        mfd.needsRedraw = true;

        console.log(`Helm: Target heading set to ${Math.round(newHeading)}°`);
    }

    static requestHeadingInput(mfd) {
        const state = mfd.getPageState('helm');
        state.selectedParameter = 'heading';
        mfd.setPageState(state, 'helm');

        mfd.requestKeyboardInput('HEADING: ', 'helm_heading', 3);
        console.log('Helm: Heading input requested');
    }

    // Depth adjustment methods
    static adjustDepth(mfd, delta) {
        const currentTarget = gameStateInstance.getProperty('helm.targetDepth') || 0;
        let newDepth = currentTarget + delta;

        // Clamp to valid range: 0 to 10000 meters
        newDepth = Math.max(0, Math.min(10000, newDepth));

        gameStateInstance.updateProperty('helm.targetDepth', newDepth);
        mfd.needsRedraw = true;

        console.log(`Helm: Target depth set to ${newDepth}m`);
    }

    static requestDepthInput(mfd) {
        const state = mfd.getPageState('helm');
        state.selectedParameter = 'depth';
        mfd.setPageState(state, 'helm');

        mfd.requestKeyboardInput('DEPTH: ', 'helm_depth', 5);
        console.log('Helm: Depth input requested');
    }

    // Keyboard input handler
    static handleKeyboardInput(mfd, data) {
        console.log('Helm page received keyboard input:', data);

        const { context, input } = data;

        switch (context) {
            case 'helm_speed': {
                const speed = parseFloat(input);
                if (!isNaN(speed)) {
                    const clampedSpeed = Math.max(-15, Math.min(160, speed));
                    gameStateInstance.updateProperty('helm.targetSpeed', clampedSpeed);
                    console.log(`Helm: Target speed set to ${clampedSpeed} knots via keyboard`);
                    mfd.needsRedraw = true;
                } else {
                    console.warn(`Invalid speed input: ${input}`);
                }
                break;
            }

            case 'helm_heading': {
                const heading = parseFloat(input);
                if (!isNaN(heading)) {
                    let clampedHeading = heading % 360;
                    if (clampedHeading < 0) clampedHeading += 360;
                    gameStateInstance.updateProperty('helm.targetHeading', Math.round(clampedHeading));
                    console.log(`Helm: Target heading set to ${Math.round(clampedHeading)}° via keyboard`);
                    mfd.needsRedraw = true;
                } else {
                    console.warn(`Invalid heading input: ${input}`);
                }
                break;
            }

            case 'helm_depth': {
                const depth = parseFloat(input);
                if (!isNaN(depth)) {
                    const clampedDepth = Math.max(0, Math.min(10000, depth));
                    gameStateInstance.updateProperty('helm.targetDepth', clampedDepth);
                    console.log(`Helm: Target depth set to ${clampedDepth}m via keyboard`);
                    mfd.needsRedraw = true;
                } else {
                    console.warn(`Invalid depth input: ${input}`);
                }
                break;
            }

            default:
                console.warn(`Unknown helm context: ${context}`);
        }

        // Clear selected parameter
        const state = mfd.getPageState('helm');
        state.selectedParameter = null;
        mfd.setPageState(state, 'helm');
    }
}

export default HelmPage;
