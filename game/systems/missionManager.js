// game/systems/missionManager.js
// Mission system for Aqua Nova DSV
// Handles mission loading, progression, and state management

import gameStateInstance from '/game/state.js';

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
        
        // Start initial missions based on game state
        this.checkAutoStartMissions();
        
        this.initialized = true;
        console.log('MissionManager initialized');
    }

    async loadMissions() {
        try {
            // Load mission index
            const response = await fetch('/data/missions/index.json');
            const missionIndex = await response.json();
            
            // Load each mission file
            for (const missionFile of missionIndex.missions) {
                const missionResponse = await fetch(`/data/missions/${missionFile}`);
                const mission = await missionResponse.json();
                
                this.missions.set(mission.id, mission);
                console.log(`Loaded mission: ${mission.id}`);
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
        this.showMissionNotification(mission.name, 'New Mission Started');
        
        console.log(`Started mission: ${missionId}`);
        return true;
    }

    checkTriggers(gameState) {
        // Check all active missions for trigger conditions
        for (const missionId of this.activeMissions) {
            const mission = this.missions.get(missionId);
            if (!mission) continue;
            
            this.checkMissionProgress(missionId, gameState);
        }
    }

    handleTrigger(triggerType, data) {
        console.log(`Trigger fired: ${triggerType}`, data);
        
        // Check all active missions for this trigger
        for (const missionId of this.activeMissions) {
            const mission = this.missions.get(missionId);
            if (!mission) continue;
            
            for (const objective of mission.objectives) {
                if (objective.triggers) {
                    for (const trigger of objective.triggers) {
                        if (trigger.type === triggerType && this.checkTriggerCondition(trigger, data)) {
                            this.completeObjective(missionId, objective.id);
                        }
                    }
                }
            }
        }
    }

    checkTriggerCondition(trigger, data) {
        switch (trigger.type) {
            case 'item_pickup':
                return trigger.itemId === data.itemId;
            case 'location_enter':
                return trigger.location === data.location;
            case 'dialogue_complete':
                return trigger.characterId === data.characterId;
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
        const missionObjective = mission.objectives.find(obj => obj.id === objectiveId);
        
        if (missionObjective && missionObjective.onComplete) {
            this.executeActions(missionObjective.onComplete);
        }
        
        // Show completion notification
        this.showObjectiveNotification(missionObjective.description, 'Objective Complete');
        
        console.log(`Completed objective: ${fullObjectiveId}`);
    }

    completeMission(missionId) {
        const mission = this.missions.get(missionId);
        if (!mission) return;

        this.activeMissions.delete(missionId);
        this.completedMissions.add(missionId);
        
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
        
        this.showMissionNotification(mission.name, 'Mission Complete!');
        console.log(`Completed mission: ${missionId}`);
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
                case 'unlock_crew':
                    gameStateInstance.unlockCrewMember(action.crewId);
                    break;
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
                default:
                    console.warn(`Unknown action type: ${action.type}`);
            }
        }
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
    showMissionNotification(title, subtitle) {
        // Integration with your existing notification system
        console.log(`Mission Notification: ${title} - ${subtitle}`);
        // You could integrate this with your PDA overlay system
    }

    showObjectiveNotification(description, status) {
        console.log(`Objective: ${description} - ${status}`);
    }

    // Debug and utility methods
    debugMissionState() {
        console.log('=== MISSION DEBUG ===');
        console.log(`Active missions: ${Array.from(this.activeMissions).join(', ')}`);
        console.log(`Completed missions: ${Array.from(this.completedMissions).join(', ')}`);
        
        const objectives = gameStateInstance.getProperty('mission.objectives') || [];
        console.log('Current objectives:');
        objectives.forEach(obj => {
            console.log(`  ${obj.id}: ${obj.description} [${obj.status}]`);
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