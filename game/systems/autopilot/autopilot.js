// game/systems/autopilot/autopilot.js
// Physics-based autopilot simulator for submarine control
// Handles speed, heading, and depth control with realistic dynamics

import gameStateInstance from '/game/state.js';

class Autopilot {
    constructor() {
        this.lastUpdateTime = Date.now();
        this.enabled = true;

        // Physics constants
        this.SPEED_ACCELERATION = 0.5;  // knots per second
        this.SPEED_DECELERATION = 0.8;  // knots per second (faster decel)
        this.MAX_SPEED = 160;
        this.MIN_SPEED = -15;

        this.HEADING_TURN_RATE_BASE = 1.0;  // degrees per second at low speed
        this.HEADING_TURN_RATE_MAX = 3.0;   // degrees per second at high speed
        this.SPEED_FOR_MAX_TURN = 20;       // speed at which max turn rate is achieved

        this.DEPTH_RATE_PER_PITCH = 0.5;    // meters per second per degree of pitch
        this.MAX_PITCH_ANGLE = 30;          // Maximum pitch angle in degrees
        this.PITCH_RATE = 2.0;              // degrees per second pitch change rate

        this.ROLL_RATE = 5.0;               // degrees per second roll change rate
        this.MAX_ROLL_ANGLE = 25;           // Maximum roll angle during turns

        this.BALLAST_DEPTH_RATE = 0.2;      // meters per second via ballast (low speed)
        this.BALLAST_SPEED_THRESHOLD = 3;   // speed below which ballast is primary
    }

    update() {
        if (!this.enabled) return;

        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;  // Convert to seconds
        this.lastUpdateTime = now;

        // Clamp deltaTime to prevent huge jumps
        const dt = Math.min(deltaTime, 0.1);

        // Update all dynamics
        this.updateSpeed(dt);
        this.updateHeading(dt);
        this.updateDepth(dt);
        this.updatePitch(dt);
        this.updateRoll(dt);
    }

    updateSpeed(dt) {
        const current = gameStateInstance.getProperty('helm.currentSpeed') || 0;
        const target = gameStateInstance.getProperty('helm.targetSpeed') || 0;

        if (Math.abs(current - target) < 0.1) {
            gameStateInstance.updateProperty('helm.currentSpeed', target);
            return;
        }

        const accel = current < target ? this.SPEED_ACCELERATION : -this.SPEED_DECELERATION;
        let newSpeed = current + accel * dt;

        // Don't overshoot
        if (accel > 0 && newSpeed > target) newSpeed = target;
        if (accel < 0 && newSpeed < target) newSpeed = target;

        // Clamp to limits
        newSpeed = Math.max(this.MIN_SPEED, Math.min(this.MAX_SPEED, newSpeed));

        gameStateInstance.updateProperty('helm.currentSpeed', newSpeed);
    }

    updateHeading(dt) {
        const current = gameStateInstance.getProperty('helm.currentHeading') || 0;
        const target = gameStateInstance.getProperty('helm.targetHeading') || 0;
        const speed = Math.abs(gameStateInstance.getProperty('helm.currentSpeed') || 0);

        // Calculate shortest angular difference
        let diff = target - current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        if (Math.abs(diff) < 0.5) {
            gameStateInstance.updateProperty('helm.currentHeading', target);
            return;
        }

        // Turn rate increases with speed
        const speedFactor = Math.min(speed / this.SPEED_FOR_MAX_TURN, 1.0);
        const turnRate = this.HEADING_TURN_RATE_BASE +
                        (this.HEADING_TURN_RATE_MAX - this.HEADING_TURN_RATE_BASE) * speedFactor;

        const maxTurn = turnRate * dt;
        let turn = Math.sign(diff) * Math.min(Math.abs(diff), maxTurn);

        let newHeading = current + turn;

        // Wrap heading
        if (newHeading < 0) newHeading += 360;
        if (newHeading >= 360) newHeading -= 360;

        gameStateInstance.updateProperty('helm.currentHeading', newHeading);
    }

    updateDepth(dt) {
        const currentDepth = gameStateInstance.getProperty('helm.currentDepth') || 0;
        const targetDepth = gameStateInstance.getProperty('helm.targetDepth') || 0;
        const speed = Math.abs(gameStateInstance.getProperty('helm.currentSpeed') || 0);
        const pitch = gameStateInstance.getProperty('helm.pitch') || 0;

        if (Math.abs(currentDepth - targetDepth) < 0.5) {
            gameStateInstance.updateProperty('helm.currentDepth', targetDepth);
            return;
        }

        let depthChange = 0;

        if (speed > this.BALLAST_SPEED_THRESHOLD) {
            // Use pitch-based depth change at speed
            // Positive pitch = nose up = decreasing depth (going shallower)
            // Negative pitch = nose down = increasing depth (going deeper)
            depthChange = -pitch * this.DEPTH_RATE_PER_PITCH * speed * 0.1 * dt;
        } else {
            // Use ballast at low speed
            const depthDiff = targetDepth - currentDepth;
            const direction = Math.sign(depthDiff);
            depthChange = direction * this.BALLAST_DEPTH_RATE * dt;

            // Don't overshoot
            if (Math.abs(depthChange) > Math.abs(depthDiff)) {
                depthChange = depthDiff;
            }
        }

        let newDepth = currentDepth + depthChange;

        // Clamp to limits
        newDepth = Math.max(0, Math.min(10000, newDepth));

        gameStateInstance.updateProperty('helm.currentDepth', newDepth);
    }

    updatePitch(dt) {
        const currentDepth = gameStateInstance.getProperty('helm.currentDepth') || 0;
        const targetDepth = gameStateInstance.getProperty('helm.targetDepth') || 0;
        const speed = Math.abs(gameStateInstance.getProperty('helm.currentSpeed') || 0);
        const currentPitch = gameStateInstance.getProperty('helm.pitch') || 0;

        // Only pitch at speed
        if (speed < this.BALLAST_SPEED_THRESHOLD) {
            // At low speed, gradually level out
            if (Math.abs(currentPitch) > 0.1) {
                const levelingRate = this.PITCH_RATE * dt;
                let newPitch = currentPitch - Math.sign(currentPitch) * Math.min(Math.abs(currentPitch), levelingRate);
                gameStateInstance.updateProperty('helm.pitch', newPitch);
            }
            return;
        }

        // Calculate desired pitch based on depth error
        const depthError = targetDepth - currentDepth;
        const desiredPitch = -Math.sign(depthError) *
                            Math.min(Math.abs(depthError) * 0.1, this.MAX_PITCH_ANGLE);

        // Gradually adjust pitch toward desired
        const pitchError = desiredPitch - currentPitch;
        const maxPitchChange = this.PITCH_RATE * dt;
        let pitchChange = Math.sign(pitchError) * Math.min(Math.abs(pitchError), maxPitchChange);

        let newPitch = currentPitch + pitchChange;

        // Clamp pitch
        newPitch = Math.max(-this.MAX_PITCH_ANGLE, Math.min(this.MAX_PITCH_ANGLE, newPitch));

        gameStateInstance.updateProperty('helm.pitch', newPitch);
    }

    updateRoll(dt) {
        const current = gameStateInstance.getProperty('helm.currentHeading') || 0;
        const target = gameStateInstance.getProperty('helm.targetHeading') || 0;
        const speed = Math.abs(gameStateInstance.getProperty('helm.currentSpeed') || 0);
        const currentRoll = gameStateInstance.getProperty('helm.roll') || 0;

        // Calculate heading difference
        let diff = target - current;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // Only roll if turning and at speed
        if (Math.abs(diff) < 2 || speed < this.BALLAST_SPEED_THRESHOLD) {
            // Level out roll
            if (Math.abs(currentRoll) > 0.1) {
                const levelingRate = this.ROLL_RATE * dt;
                let newRoll = currentRoll - Math.sign(currentRoll) * Math.min(Math.abs(currentRoll), levelingRate);
                gameStateInstance.updateProperty('helm.roll', newRoll);
            }
            return;
        }

        // Calculate desired roll based on turn
        const turnIntensity = Math.min(Math.abs(diff) / 45, 1.0);  // 0-1 based on turn angle
        const speedFactor = Math.min(speed / 20, 1.0);  // 0-1 based on speed
        const desiredRoll = Math.sign(diff) * turnIntensity * speedFactor * this.MAX_ROLL_ANGLE;

        // Gradually adjust roll toward desired
        const rollError = desiredRoll - currentRoll;
        const maxRollChange = this.ROLL_RATE * dt;
        let rollChange = Math.sign(rollError) * Math.min(Math.abs(rollError), maxRollChange);

        let newRoll = currentRoll + rollChange;

        // Clamp roll
        newRoll = Math.max(-this.MAX_ROLL_ANGLE, Math.min(this.MAX_ROLL_ANGLE, newRoll));

        gameStateInstance.updateProperty('helm.roll', newRoll);
    }

    // Calculate trend values for display
    getTrendValues() {
        const currentSpeed = gameStateInstance.getProperty('helm.currentSpeed') || 0;
        const targetSpeed = gameStateInstance.getProperty('helm.targetSpeed') || 0;
        const currentHeading = gameStateInstance.getProperty('helm.currentHeading') || 0;
        const targetHeading = gameStateInstance.getProperty('helm.targetHeading') || 0;
        const currentDepth = gameStateInstance.getProperty('helm.currentDepth') || 0;
        const targetDepth = gameStateInstance.getProperty('helm.targetDepth') || 0;
        const pitch = gameStateInstance.getProperty('helm.pitch') || 0;
        const speed = Math.abs(currentSpeed);

        // Speed trend: where will speed be in 10 seconds?
        const speedAccel = currentSpeed < targetSpeed ? this.SPEED_ACCELERATION : -this.SPEED_DECELERATION;
        const speedTrend = currentSpeed + speedAccel * 10;

        // Heading trend: where will heading be in 10 seconds?
        let headingDiff = targetHeading - currentHeading;
        if (headingDiff > 180) headingDiff -= 360;
        if (headingDiff < -180) headingDiff += 360;

        const speedFactor = Math.min(speed / this.SPEED_FOR_MAX_TURN, 1.0);
        const turnRate = this.HEADING_TURN_RATE_BASE +
                        (this.HEADING_TURN_RATE_MAX - this.HEADING_TURN_RATE_BASE) * speedFactor;
        let headingTrend = currentHeading + Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), turnRate * 10);
        if (headingTrend < 0) headingTrend += 360;
        if (headingTrend >= 360) headingTrend -= 360;

        // Depth trend: where will depth be in 10 seconds?
        let depthTrend = currentDepth;
        if (speed > this.BALLAST_SPEED_THRESHOLD) {
            depthTrend = currentDepth - pitch * this.DEPTH_RATE_PER_PITCH * speed * 0.1 * 10;
        } else {
            const depthDiff = targetDepth - currentDepth;
            depthTrend = currentDepth + Math.sign(depthDiff) * Math.min(Math.abs(depthDiff), this.BALLAST_DEPTH_RATE * 10);
        }
        depthTrend = Math.max(0, Math.min(10000, depthTrend));

        return {
            speedTrend,
            headingTrend,
            depthTrend
        };
    }

    enable() {
        this.enabled = true;
        this.lastUpdateTime = Date.now();
        console.log('Autopilot enabled');
    }

    disable() {
        this.enabled = false;
        console.log('Autopilot disabled');
    }

    reset() {
        this.lastUpdateTime = Date.now();
    }
}

// Singleton instance
const autopilot = new Autopilot();

export default autopilot;
