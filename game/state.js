// game/state.js
// Central game state management for Aqua Nova DSV
// Single source of truth for ALL game data
// Pure state management - no persistence logic
// Observer pattern for UI updates
// Simple get/set/update methods


class GameState {
    constructor() {
        this.state = this.getDefaultState();
        this.observers = [];
    }

    getDefaultState() {
        return {
            // Game meta information
            gameInfo: {
                version: "1.0.0",
                lastUpdated: new Date().toISOString(),
                playTime: 0,
                lastLogbookEntryId: null
            },

            // Ship navigation
            navigation: {
                location: {
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [-70.6709, 41.5223]
                    },
                    properties: {
                        name: "Woods Hole Oceanographic Institute",
                        type: "dock",
                        description: "Primary research dock and submarine base."
                    }
                },
                depth: 0,
                heading: 0,
                course: 0,
                speed: 0,
                destination: null,
                displaySettings: {
                    navDisplayRange: 10,  // Default range in nautical miles
                }
            },

            // Helm control (current and target values for autopilot)
            helm: {
                currentSpeed: 0,      // knots (-15 to 160)
                targetSpeed: 0,       // knots
                currentHeading: 0,    // degrees (0-360)
                targetHeading: 0,     // degrees
                currentDepth: 0,      // meters (0-10000, positive = down)
                targetDepth: 0,       // meters
                pitch: 0,             // degrees (-90 to 90, positive = nose up)
                roll: 0               // degrees (-180 to 180, positive = right roll)
            },

            // Bridge station state
            bridge: {
                activeStation: 'nav'
            },

            // Ship systems
            shipSystems: {
                hull: {
                    integrity: 100,
                    dockingBay: "Open",
                    moonPool: "Closed",
                    wskrsBay: "Closed"
                },
                power: {
                    leftReactorHealth: 100,
                    leftReactorOutput: 10,
                    leftReactorElectricalDraw: 0.5,
                    rightReactorHealth: 100,
                    rightReactorOutput: 10,
                    rightReactorElectricalDraw: 0.5
                },
                helm: {
                    leftDrivetrainHealth: 100,
                    rightDrivetrainHealth: 100,
                    ballastSystemHealth: 100,
                    trimSystemHealth: 100,
                    leftThrust: 0,
                    rightThrust: 0,
                    fwdBallast: 0,
                    aftBallast: 0,
                    portBallast: 0,
                    starboardBallast: 0,
                    rollTrim: 0,
                    pitchTrim: 0,
                    bowPlane: 45,
                    sternPlane: 45,
                    rudder: 0,
                    bowThrusters: 0,
                    sternThrusters: 0
                },
                lifeSupport: {
                    oxygenTankQuantity: 98,
                    nitrogenTankQuantity: 100,
                    waterTankQuantity: 50,
                    nitrogenLevels: 78.08,
                    oxygenLevels: 20.95,
                    co2Levels: 0.04,
                    co2: 400,
                    co2ScrubbersEfficiency: 100,
                    airTemperature: 22,
                    humidity: 45
                },
                sensors: {
                    shipSonar: 100,
                    wskrs: {
                        Triton: {
                            bearing: null,
                            distance: null,
                            depth: null,
                            heading: null,
                            speed: null,
                            status: "docked",
                            linkQuality: 100,
                            health: 100
                        },
                        Thalassa: {
                            bearing: null,
                            distance: null,
                            depth: null,
                            heading: null,
                            speed: null,
                            status: "docked",
                            linkQuality: 100,
                            health: 100
                        },
                        Oceanus: {
                            bearing: null,
                            distance: null,
                            depth: null,
                            heading: null,
                            speed: null,
                            status: "docked",
                            linkQuality: 100,
                            health: 100
                        }
                    },
                    radar: 100,
                    gravimeter: 100,
                    magnetometer: 100,
                    passiveAcoustics: 100,
                    cameras: 100
                },
                communications: {
                    commHealth: 100,
                    satelliteLink: 100,
                    dataDownload: 15,
                    dataUpload: 5,
                    radios: {
                        VHF1: { frequency: 156.8, status: "RX" },
                        VHF2: { frequency: 157.1, status: "OFF" },
                        UHF: { frequency: 400.0, status: "ON" },
                        HF: { frequency: 3.0, status: "OFF" }
                    },
                    quantumCommunication: {
                        status: "operational",
                        linkQuality: 100,
                        linkLoadPercentage: 0
                    },
                    communicator: { log: [] }
                }
            },

            // Crew status
            crew: {
                captain: { experience: 100, rest: "alert", status: "active" },
                executiveOfficer: { experience: 100, rest: "alert", status: "active" },
                helm: { experience: 95, rest: "alert", status: "active" },
                medical: { experience: 85, rest: "alert", status: "active" },
                engineer: { experience: 80, rest: "tired", status: "active" },
                security: { experience: 75, rest: "alert", status: "active" },
                communications: { experience: 70, rest: "alert", status: "active" },
                science: { experience: 90, rest: "alert", status: "active" },
                sensors: { experience: 60, rest: "alert", status: "active" },
                totalCrew: 8
            },

            // Contacts (dynamic state only)
            contacts: {
                crew: {
                    captain: { communicator: true, known: true, contextual: [] },
                    executiveOfficer: { communicator: true, known: true, contextual: [] },
                    helm: { communicator: true, known: true, contextual: [] },
                    science: { communicator: true, known: false, contextual: [] },
                    engineering: { communicator: true, known: false, contextual: [] },
                    security: { communicator: true, known: false, contextual: [] },
                    communications: { communicator: true, known: false, contextual: [] },
                    sensors: { communicator: true, known: false, contextual: [] }
                },
                external: {}
            },

            // Mission data
            mission: {
                currentMission: null,
                objectives: [],
                discoveries: [],
                samples: [],
                researchData: []
            },

            // Environment
            environment: {
                weather: "calm",
                seaState: 1,
                visibility: "excellent",
                waterTemperature: 20,
                airTemperature: 20,
                currentDirection: 180,
                currentStrength: 0.5
            },

            // Player progress
            progress: {
                stationsUnlocked: ["Logbook"],
                areasExplored: ["woods_hole"],
                achievementsUnlocked: ["first_boot"]
            },

            // Player inventory
            inventory: {},

            // User preferences
            settings: {
                display: {
                    width: 1920,
                    height: 1080,
                    aspectRatio: "16:9",
                    navDisplayRange: 10
                },
                audio: {
                    masterVolume: 0.8,
                    sfxVolume: 0.7,
                    musicVolume: 0.5,
                    voiceVolume: 0.9
                },
                gameplay: {
                    autoSave: true,
                    autoSaveInterval: 5,
                    tooltips: true,
                    confirmActions: true
                }
            }
        };
    }

    // Core state methods
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }

    setState(newState) {
        if (!newState || typeof newState !== 'object') {
            console.error('Invalid state provided');
            return false;
        }
        this.state = this.deepMerge(this.state, newState);
        this.updateTimestamp();
        this.notifyObservers();
        return true;
    }

    getProperty(path) {
        const keys = path.split('.');
        let current = this.state;
        
        for (const key of keys) {
            if (current[key] === undefined) return null;
            current = current[key];
        }
        return current;
    }

    updateProperty(path, value) {
        const keys = path.split('.');
        let current = this.state;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
        this.updateTimestamp();
        this.notifyObservers();
    }

    // Load from snapshot (SaveManager integration)
    loadFromSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') {
            console.error('Invalid snapshot provided');
            return false;
        }

        try {
            // Merge snapshot with defaults to handle schema updates
            const defaultState = this.getDefaultState();
            this.state = this.deepMerge(defaultState, snapshot);
            this.updateTimestamp();
            this.notifyObservers();
            return true;
        } catch (error) {
            console.error('Failed to load snapshot:', error);
            return false;
        }
    }

    // Create snapshot for SaveManager
    createSnapshot() {
        return {
            timestamp: new Date().toISOString(),
            navigation: JSON.parse(JSON.stringify(this.state.navigation)),
            shipSystems: JSON.parse(JSON.stringify(this.state.shipSystems)),
            crew: JSON.parse(JSON.stringify(this.state.crew)),
            mission: JSON.parse(JSON.stringify(this.state.mission)),
            environment: JSON.parse(JSON.stringify(this.state.environment)),
            contacts: JSON.parse(JSON.stringify(this.state.contacts)),
            progress: JSON.parse(JSON.stringify(this.state.progress)),
            inventory: JSON.parse(JSON.stringify(this.state.inventory)),
            settings: JSON.parse(JSON.stringify(this.state.settings))
        };
    }

    // Contact management
    async loadContactsData() {
        try {
            const response = await fetch('/data/contacts.json');
            if (!response.ok) {
                console.warn('Contacts file not found');
                return { crew: {}, contacts: {} };
            }
            return await response.json();
        } catch (error) {
            console.error('Failed to load contacts:', error);
            return { crew: {}, contacts: {} };
        }
    }

    async initializeContacts() {
        console.log("[Contacts] --- initializeContacts: START ---");
        const contactsData = await this.loadContactsData();

        // Merge crew contacts (preserve dynamic state)
        for (const [id, staticData] of Object.entries(contactsData.crew || {})) {
            const existing = this.getProperty(`contacts.crew.${id}`) || {};
            this.updateProperty(`contacts.crew.${id}`, {
                id,
                type: 'crew',
                ...staticData,
                communicator: existing.communicator ?? true,
                known: existing.known ?? (id === 'captain' || id === 'executiveOfficer'),
                contextual: existing.contextual ?? []
            });
        }

        // Merge external contacts
        for (const [id, staticData] of Object.entries(contactsData.contacts || {})) {
            const existing = this.getProperty(`contacts.external.${id}`) || {};
            this.updateProperty(`contacts.external.${id}`, {
                id,
                type: 'external',
                ...staticData,
                communicator: existing.communicator ?? false,
                known: existing.known ?? false,
                contextual: existing.contextual ?? []
            });
        }

        // Log concise summaries of contacts
        const crewContacts = this.getProperty("contacts.crew") || {};
        const externalContacts = this.getProperty("contacts.external") || {};
        console.log("[Contacts] Crew contacts summary:");
        Object.entries(crewContacts).forEach(([id, contact]) => {
            console.log(`  [Crew] id: ${id}, name: ${contact.name || "(unnamed)"}, known: ${!!contact.known}`);
        });
        console.log("[Contacts] External contacts summary:");
        Object.entries(externalContacts).forEach(([id, contact]) => {
            console.log(`  [External] id: ${id}, name: ${contact.name || "(unnamed)"}, known: ${!!contact.known}`);
        });
        console.log("[Contacts] --- initializeContacts: END ---");
    }

    // Navigation methods
    updateLocation(location) {
        this.updateProperty('navigation.location', location);
    }

    updateDepth(depth) {
        this.updateProperty('navigation.depth', depth);
        if (depth > 0 && this.state.shipSystems.hull.dockingBay === 'Open') {
            this.updateProperty('shipSystems.hull.dockingBay', 'Closed');
        }
    }

    updateCourse(course, speed = null) {
        this.updateProperty('navigation.course', course);
        this.updateProperty('navigation.heading', course);
        if (speed !== null) {
            this.updateProperty('navigation.speed', speed);
        }
    }
    updateNavDisplayRange(range) {
    this.updateProperty('navigation.displaySettings.navDisplayRange', range);
    }

    updateSelectedHeading(heading) {
        this.updateProperty('navigation.heading', heading);
    }

    // System methods
    updateSystemHealth(system, component, value) {
        this.updateProperty(`shipSystems.${system}.${component}`, value);
    }

    getSystemStatus(system) {
        return this.getProperty(`shipSystems.${system}`);
    }

    // Mission methods
    setCurrentMission(mission) {
        this.updateProperty('mission.currentMission', mission);
    }

    addObjective(objective) {
        const objectives = [...this.state.mission.objectives, objective];
        this.updateProperty('mission.objectives', objectives);
    }

    addDiscovery(discovery) {
        const discoveries = [...this.state.mission.discoveries, {
            ...discovery,
            timestamp: new Date().toISOString(),
            location: this.state.navigation.location
        }];
        this.updateProperty('mission.discoveries', discoveries);
    }

    // Crew methods
    unlockCrewMember(memberId) {
        this.updateProperty(`contacts.crew.${memberId}.known`, true);
    }

    // Progress methods
    unlockStation(station) {
        const stations = [...this.state.progress.stationsUnlocked];
        if (!stations.includes(station)) {
            stations.push(station);
            this.updateProperty('progress.stationsUnlocked', stations);
        }
    }

    unlockAchievement(achievement) {
        const achievements = [...this.state.progress.achievementsUnlocked];
        if (!achievements.includes(achievement)) {
            achievements.push(achievement);
            this.updateProperty('progress.achievementsUnlocked', achievements);
        }
    }

    // Status reporting
    getOverallStatus() {
        const systems = this.state.shipSystems;
        
        if (systems.hull.integrity < 25) return "CRITICAL";
        if (systems.hull.integrity < 50) return "WARNING";
        if (systems.lifeSupport.oxygenTankQuantity < 25) return "CRITICAL";
        if (systems.lifeSupport.oxygenTankQuantity < 50) return "WARNING";
        if (systems.lifeSupport.co2 > 1000) return "WARNING";
        if (systems.power.leftReactorHealth < 50 || systems.power.rightReactorHealth < 50) return "WARNING";
        
        return "OPERATIONAL";
    }

    getStatusReport() {
        const nav = this.state.navigation;
        const systems = this.state.shipSystems;
        
        return {
            location: nav.location?.properties?.name || "Unknown",
            coordinates: nav.location?.geometry?.coordinates || [0, 0],
            depth: nav.depth,
            speed: nav.speed,
            heading: nav.heading,
            status: this.getOverallStatus(),
            hull: systems.hull.integrity,
            oxygen: systems.lifeSupport.oxygenTankQuantity,
            power: Math.min(systems.power.leftReactorHealth, systems.power.rightReactorHealth),
            docked: systems.hull.dockingBay === 'Open'
        };
    }

    // Observer pattern
    addObserver(callback) {
        if (typeof callback === 'function') {
            this.observers.push(callback);
        }
    }

    removeObserver(callback) {
        this.observers = this.observers.filter(obs => obs !== callback);
    }

    notifyObservers() {
        this.observers.forEach(callback => {
            try {
                callback(this.getState());
            } catch (error) {
                console.error('Observer callback error:', error);
            }
        });
    }

    // Utility methods
    updateTimestamp() {
        this.state.gameInfo.lastUpdated = new Date().toISOString();
    }

    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] === null) {
                result[key] = null;
            } else if (Array.isArray(source[key])) {
                // Handle arrays explicitly
                result[key] = [...source[key]];
            } else if (typeof source[key] === 'object') {
                result[key] = this.deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }

    reset() {
        this.state = this.getDefaultState();
        this.notifyObservers();
    }

    // Debug info
    getSummary() {
        const report = this.getStatusReport();
        return {
            version: this.state.gameInfo.version,
            lastUpdated: this.state.gameInfo.lastUpdated,
            location: report.location,
            depth: report.depth,
            status: report.status,
            observers: this.observers.length
        };
    }
}

// Singleton instance
const gameStateInstance = new GameState();

export default gameStateInstance;
export { GameState };