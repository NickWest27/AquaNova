// game/systems/missionManager.js
// Mission system for Aqua Nova DSV
// Handles mission loading, progression, and state management

import gameStateInstance from '../state.js';

import { dlog } from '../../utils/log.js';
const PROPERTY_TRIGGERS = ['property_change', 'property_at_least', 'property_at_most'];
// Things the player does once (go somewhere, pick something up) are remembered in progress.seen, so a lesson that starts later
// still counts what was already done ("anything you have already done, I have already noted"). These are checked against that record, not only the moment they happen.
const HISTORY_TRIGGERS = ['item_pickup', 'location_enter'];
const seenKey = (type, data) => type === 'item_pickup' ? `item:${data.itemId}` : `at:${data.location}`;

class MissionManager {
    constructor() {
        this.missions = new Map();
        this.activeMissions = new Set();
        this.completedMissions = new Set();
        this.triggers = new Map();
        this.initialized = false;
    }

    async init() {
        // Load all mission files
        await this.loadMissions();
        
        // Set up trigger listeners
        this.setupTriggers();
        
        // Restore progress from the loaded save, then start anything new
        this.restoreFromState();
        // Messages promised by finished missions (safe to repeat: an id is delivered once)
        for (const id of this.completedMissions) {
            const m = this.missions.get(id);
            if (m && m.onComplete) this.executeActions(m.onComplete.filter(a => a.type === 'send_message'));
        }
        this.checkAutoStartMissions();
        
        this.initialized = true;
        dlog('MissionManager initialized');
    }

    // Rebuild the active/completed sets from saved game state.
    // Without this a reload would restart finished missions.
    restoreFromState() {
        this.activeMissions.clear();
        this.completedMissions.clear();
        const done = gameStateInstance.getProperty('mission.completedIds') || [];
        done.forEach(id => this.completedMissions.add(id));
        const objectives = gameStateInstance.getProperty('mission.objectives') || [];
        objectives.forEach(obj => {
            if (obj.missionId && this.missions.has(obj.missionId) && !this.completedMissions.has(obj.missionId)) {
                this.activeMissions.add(obj.missionId);
            }
        });
    }

    async loadMissions() {
        try {
            // Load mission index
            const response = await fetch(new URL('../../data/missions/index.json', import.meta.url));
            const missionIndex = await response.json();
            
            // Load each mission file; one bad or missing file must not stop the rest loading
            for (const missionFile of missionIndex.missions) {
                try {
                    const missionResponse = await fetch(new URL(`../../data/missions/${missionFile}`, import.meta.url));
                    if (!missionResponse.ok) throw new Error(`HTTP ${missionResponse.status}`);
                    const mission = await missionResponse.json();
                    this.missions.set(mission.id, mission);
                    dlog(`Loaded mission: ${mission.id}`);
                } catch (err) {
                    console.error(`Failed to load mission file ${missionFile}:`, err);
                }
            }
        } catch (error) {
            console.error('Failed to load missions:', error);
        }
    }

    setupTriggers() {
        // Listen to game state changes
        gameStateInstance.addObserver((state) => {
            this.checkTriggers(state);
        });

        // Custom event listeners for specific triggers
        document.addEventListener('item-pickup', (e) => {
            this.handleTrigger('item_pickup', { itemId: e.detail.itemId });
        });

        document.addEventListener('location-enter', (e) => {
            this.handleTrigger('location_enter', { location: e.detail.location });
        });

        document.addEventListener('report-sent', () => this.handleTrigger('report_sent', {}));

        document.addEventListener('dialogue-complete', (e) => {
            this.handleTrigger('dialogue_complete', { 
                characterId: e.detail.characterId,
                dialogueId: e.detail.dialogueId 
            });
        });
    }

    checkAutoStartMissions() {
        // Check which missions should auto-start based on current game state
        for (const [missionId, mission] of this.missions) {
            if (mission.autoStart && this.canStartMission(missionId)) {
                this.startMission(missionId);
            }
        }
    }

    canStartMission(missionId) {
        const mission = this.missions.get(missionId);
        if (!mission) return false;
        
        // Check if already active or completed
        if (this.activeMissions.has(missionId) || this.completedMissions.has(missionId)) {
            return false;
        }
        
        // Check prerequisites
        if (mission.prerequisites) {
            for (const prereq of mission.prerequisites) {
                if (!this.checkCondition(prereq)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    startMission(missionId) {
        const mission = this.missions.get(missionId);
        if (!mission || !this.canStartMission(missionId)) {
            return false;
        }

        this.activeMissions.add(missionId);
        
        // Add objectives to game state
        const objectives = mission.objectives.map(obj => ({
            id: `${missionId}_${obj.id}`,
            missionId: missionId,
            description: obj.description,
            status: 'active',
            required: obj.required || false
        }));
        
        const currentObjectives = gameStateInstance.getProperty('mission.objectives') || [];
        gameStateInstance.updateProperty('mission.objectives', [...currentObjectives, ...objectives]);
        
        // Execute start actions
        if (mission.onStart) {
            this.executeActions(mission.onStart);
        }
        
        // Show mission start notification
        this.showMissionNotification(mission.name, 'New Mission Started', mission);
        
        dlog(`Started mission: ${missionId}`);
        return true;
    }

    checkTriggers(gameState) {
        // Check all active missions for trigger conditions
        for (const missionId of this.activeMissions) {
            const mission = this.missions.get(missionId);
            if (!mission) continue;

            // Objectives that wait for a property to change (nothing else fires these)
            const saved = gameStateInstance.getProperty('mission.objectives') || [];
            for (const objective of mission.objectives) {
                const entry = saved.find(o => o.id === `${missionId}_${objective.id}`);
                if (!entry || entry.status === 'completed' || !this.objectiveUnlocked(mission, objective, saved)) continue;
                for (const trigger of objective.triggers || []) {
                    if ((PROPERTY_TRIGGERS.includes(trigger.type) || HISTORY_TRIGGERS.includes(trigger.type)) && this.checkTriggerCondition(trigger, null)) {
                        this.completeObjective(missionId, objective.id);
                    }
                }
            }

            this.checkMissionProgress(missionId, gameState);
        }
    }

    handleTrigger(triggerType, data) {
        dlog(`Trigger fired: ${triggerType}`, data);
        if (HISTORY_TRIGGERS.includes(triggerType)) {
            const seen = gameStateInstance.getProperty('progress.seen') || [], k = seenKey(triggerType, data);
            if (!seen.includes(k)) gameStateInstance.updateProperty('progress.seen', [...seen, k].slice(-300));
        }
        
        // Check all active missions for this trigger
        for (const missionId of this.activeMissions) {
            const mission = this.missions.get(missionId);
            if (!mission) continue;
            
            const saved = gameStateInstance.getProperty('mission.objectives') || [];
            for (const objective of mission.objectives) {
                if (objective.triggers && this.objectiveUnlocked(mission, objective, saved)) {
                    for (const trigger of objective.triggers) {
                        if (trigger.type === triggerType && this.checkTriggerCondition(trigger, data)) {
                            this.completeObjective(missionId, objective.id);
                        }
                    }
                }
            }
        }
    }

    wasSeen(type, data) { return (gameStateInstance.getProperty('progress.seen') || []).includes(seenKey(type, data)); }

    // An objective with "after": "<id>" waits until that objective is done.
    objectiveUnlocked(mission, objective, saved) {
        if (!objective.after) return true;
        const prev = saved.find(o => o.id === `${mission.id}_${objective.after}`);
        return !!prev && prev.status === 'completed';
    }

    checkTriggerCondition(trigger, data) {
        switch (trigger.type) {
            case 'property_at_least': {
                const v = Number(gameStateInstance.getProperty(trigger.property));
                return Number.isFinite(v) && v >= trigger.value;
            }
            case 'property_at_most': {
                const raw = gameStateInstance.getProperty(trigger.property);
                const v = Number(raw);
                return raw != null && Number.isFinite(v) && v <= trigger.value;
            }
            case 'report_sent':
                return true;
            case 'item_pickup':
                return data ? trigger.itemId === data.itemId : this.wasSeen('item_pickup', { itemId: trigger.itemId });
            case 'location_enter':
                return data ? trigger.location === data.location : this.wasSeen('location_enter', { location: trigger.location });
            case 'dialogue_complete':
                return !!data && trigger.characterId === data.characterId && (!trigger.dialogueId || trigger.dialogueId === data.dialogueId);
            case 'decision_made':
                return trigger.decisionId === data.decisionId && (!trigger.optionId || trigger.optionId === data.optionId);
            case 'property_change':
                const currentValue = gameStateInstance.getProperty(trigger.property);
                return currentValue === trigger.value;
            default:
                return false;
        }
    }

    checkMissionProgress(missionId, gameState) {
        const mission = this.missions.get(missionId);
        const objectives = gameStateInstance.getProperty('mission.objectives') || [];
        const missionObjectives = objectives.filter(obj => obj.missionId === missionId);
        
        // Check if all required objectives are complete
        const completedRequired = missionObjectives.filter(obj => 
            obj.required && obj.status === 'completed'
        ).length;
        
        const totalRequired = missionObjectives.filter(obj => obj.required).length;
        
        if (completedRequired === totalRequired && totalRequired > 0) {
            this.completeMission(missionId);
        }
    }

    completeObjective(missionId, objectiveId) {
        const objectives = gameStateInstance.getProperty('mission.objectives') || [];
        const fullObjectiveId = `${missionId}_${objectiveId}`;
        
        const objective = objectives.find(obj => obj.id === fullObjectiveId);
        if (!objective || objective.status === 'completed') return;
        
        objective.status = 'completed';
        objective.completedAt = new Date().toISOString();
        
        gameStateInstance.updateProperty('mission.objectives', objectives);
        
        // Execute objective completion actions
        const mission = this.missions.get(missionId);
        const missionObjective = ((mission && mission.objectives) || []).find(obj => obj.id === objectiveId);
        
        if (missionObjective && missionObjective.onComplete) {
            this.executeActions(missionObjective.onComplete);
        }
        
        // Show completion notification
        if (missionObjective) this.showObjectiveNotification(missionObjective.description, 'Objective Complete', mission);
        
        dlog(`Completed objective: ${fullObjectiveId}`);
    }

    completeMission(missionId) {
        const mission = this.missions.get(missionId);
        if (!mission || this.completedMissions.has(missionId)) return;   // a mission completes once

        this.activeMissions.delete(missionId);
        this.completedMissions.add(missionId);
        const doneIds = gameStateInstance.getProperty('mission.completedIds') || [];
        if (!doneIds.includes(missionId)) gameStateInstance.updateProperty('mission.completedIds', [...doneIds, missionId]);
        
        // Remove objectives from active list
        const objectives = gameStateInstance.getProperty('mission.objectives') || [];
        const remainingObjectives = objectives.filter(obj => obj.missionId !== missionId);
        gameStateInstance.updateProperty('mission.objectives', remainingObjectives);
        
        // Execute completion actions
        if (mission.onComplete) {
            this.executeActions(mission.onComplete);
        }
        
        // Check for follow-up missions
        if (mission.followUpMissions) {
            for (const followUpId of mission.followUpMissions) {
                if (this.canStartMission(followUpId)) {
                    setTimeout(() => this.startMission(followUpId), 1000);
                }
            }
        }
        
        document.dispatchEvent(new CustomEvent('mission-completed', { detail: { id: missionId } }));
        this.showMissionNotification(mission.name, 'Mission Complete!', mission);
        dlog(`Completed mission: ${missionId}`);
    }

    executeActions(actions) {
        for (const action of actions) {
            switch (action.type) {
                case 'set_property':
                    gameStateInstance.updateProperty(action.property, action.value);
                    break;
                case 'unlock_station':
                    gameStateInstance.unlockStation(action.station);
                    break;
                case 'crew_say':
                    document.dispatchEvent(new CustomEvent('crew-say', { detail: { role: action.role, text: action.text } }));
                    break;
                case 'aria_decision':   // ARIA puts a choice to the Captain (tablet/js/aria.js)
                    document.dispatchEvent(new CustomEvent('aria-decision', { detail: action }));
                    break;
                case 'unlock_crew':
                    gameStateInstance.unlockCrewMember(action.crewId);
                    break;
                case 'unlock_room': {   // a room opens for the story (tablet/js/rooms.js)
                    const l = gameStateInstance.getProperty('progress.roomsOpen') || [];
                    if (!l.includes(action.room)) gameStateInstance.updateProperty('progress.roomsOpen', [...l, action.room]);
                    break;
                }
                case 'add_item':
                    this.addItemToInventory(action.itemId, action.quantity || 1);
                    break;
                case 'show_dialogue':
                    this.showDialogue(action.characterId, action.dialogueId);
                    break;
                case 'add_contextual':
                    this.addContextualDialogue(action.characterId, action.context);
                    break;
                case 'spawn_interactive':
                    this.spawnInteractive(action.elementId, action.location);
                    break;
                case 'send_message':
                    this.sendMessage(action.delaySeconds ? { ...action.message, delaySeconds: action.delaySeconds } : action.message);
                    break;
                case 'start_mission':
                    if (this.startMission(action.missionId)) {   // a lesson or follow-on that starts by itself: tell the player
                        const m = this.missions.get(action.missionId);
                        document.dispatchEvent(new CustomEvent('task-started', { detail: { missionId: action.missionId, name: m && m.name, tutorial: !!(m && m.tutorial) } }));
                    }
                    break;
                default:
                    console.warn(`Unknown action type: ${action.type}`);
            }
        }
    }

    // Puts a message in the Comms inbox. The same id is never delivered twice.
    sendMessage(msg) {
        const inbox = gameStateInstance.getProperty('mission.inbox') || [];
        if (inbox.some(m => m.id === msg.id)) return;
        if (msg.delaySeconds) {   // real seconds; the due time is saved so a reload keeps the wait
            const pending = { ...(gameStateInstance.getProperty('mission.pending') || {}) };
            if (pending[msg.id] == null) { pending[msg.id] = Date.now() + msg.delaySeconds * 1000 * (this.delayScale ?? 1); gameStateInstance.updateProperty('mission.pending', pending); }
            const wait = pending[msg.id] - Date.now();
            this._scheduled ||= new Set();
            if (wait > 0) {
                if (!this._scheduled.has(msg.id)) { this._scheduled.add(msg.id); setTimeout(() => { this._scheduled.delete(msg.id); this.sendMessage(msg); }, wait); }
                return;
            }
        }
        gameStateInstance.updateProperty('mission.inbox', [...inbox, { ...msg, read: false, receivedAt: new Date().toISOString() }]);
        document.dispatchEvent(new CustomEvent('comms-message', { detail: { from: msg.from, subject: msg.subject } }));
    }

    addItemToInventory(itemId, quantity = 1) {
        const inventory = gameStateInstance.getProperty('inventory') || {};
        inventory[itemId] = (inventory[itemId] || 0) + quantity;
        gameStateInstance.updateProperty('inventory', inventory);
    }

    addContextualDialogue(characterId, context) {
        const current = gameStateInstance.getProperty(`contacts.crew.${characterId}.contextual`) || [];
        gameStateInstance.updateProperty(`contacts.crew.${characterId}.contextual`, [...current, context]);
    }

    spawnInteractive(elementId, location) {
        // Create interactive elements in specific locations
        const event = new CustomEvent('spawn-interactive', {
            detail: { elementId, location }
        });
        document.dispatchEvent(event);
    }

    showDialogue(characterId, dialogueId) {
        const event = new CustomEvent('show-dialogue', {
            detail: { characterId, dialogueId }
        });
        document.dispatchEvent(event);
    }

    checkCondition(condition) {
        switch (condition.type) {
            case 'property_equals':
                return gameStateInstance.getProperty(condition.property) === condition.value;
            case 'property_greater_than':
                return gameStateInstance.getProperty(condition.property) > condition.value;
            case 'has_item':
                const inventory = gameStateInstance.getProperty('inventory') || {};
                return (inventory[condition.itemId] || 0) >= (condition.quantity || 1);
            case 'mission_completed':
                return this.completedMissions.has(condition.missionId);
            default:
                return false;
        }
    }

    // UI Integration methods
    showMissionNotification(title, subtitle, mission) {
        // Integration with your existing notification system
        dlog(`Mission Notification: ${title} - ${subtitle}`);
        document.dispatchEvent(new CustomEvent('mission-notify', { detail: { title, subtitle, tutorial: !!(mission && mission.tutorial) } }));
        // You could integrate this with your PDA overlay system
    }

    showObjectiveNotification(description, status, mission) {
        dlog(`Objective: ${description} - ${status}`);
        document.dispatchEvent(new CustomEvent('mission-notify', { detail: { title: description, subtitle: status, tutorial: !!(mission && mission.tutorial) } }));
    }

    // Debug and utility methods
    debugMissionState() {
        dlog('=== MISSION DEBUG ===');
        dlog(`Active missions: ${Array.from(this.activeMissions).join(', ')}`);
        dlog(`Completed missions: ${Array.from(this.completedMissions).join(', ')}`);
        
        const objectives = gameStateInstance.getProperty('mission.objectives') || [];
        dlog('Current objectives:');
        objectives.forEach(obj => {
            dlog(`  ${obj.id}: ${obj.description} [${obj.status}]`);
        });
    }

    // Public API
    getActiveMissions() {
        return Array.from(this.activeMissions).map(id => this.missions.get(id));
    }

    getCurrentObjectives() {
        return gameStateInstance.getProperty('mission.objectives') || [];
    }

    forceCompleteMission(missionId) {
        // Debug helper
        this.completeMission(missionId);
    }

    triggerCustomEvent(eventType, data) {
        // Manual trigger for testing
        this.handleTrigger(eventType, data);
    }
}

// Singleton instance
const missionManagerInstance = new MissionManager();
export default missionManagerInstance;