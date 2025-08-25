// game/state.js
// Game state management for Aqua Nova DSV
// This module tracks ship status, location, player state, and more.
// One source of truth for the game state.
// Integrated with logbook-based save system

class GameState {
    constructor() {
        this.state = this.getDefaultState();
        this.observers = [];
        this.initialize();
    }

    getDefaultState() {
        return {
            // Game meta information
            gameInfo: {
                logbookId: null,
                campaignTitle: null,
                version: "1.0.0",
                createdAt: new Date().toISOString(),
                description: "",
                lastSaved: new Date().toISOString(),
                lastPlayed: null,
                playTime: 0,
                difficulty: "normal"
            },

            // Ship location and navigation
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
                depth: 0, // meters, 0 = surface/dry dock
                heading: 0, // degrees magnetic
                course: 0, // degrees
                speed: 0, // knots
                destination: null
            },

            // Ship status and systems
            shipSystems: {
                hull: {
                    integrity: 100, // percentage
                    dockingBay: "Open", // Docking bay status
                    moonPool: "Closed", // Moon pool status
                    wskrsBay: "Closed" // WSKRS docking bay status
                },
                power: {
                    leftReactorHealth: 100, // health percentage
                    leftReactorOutput: 10, // Output Megawatts
                    leftReactorElectricalDraw: 0.5, // current power draw Megawatts
                    rightReactorHealth: 100, // health percentage
                    rightReactorOutput: 10, // Output Megawatts
                    rightReactorElectricalDraw: 0.5 // current power draw Megawatts
                },
                helm: {
                    leftDrivetrainHealth: 100, // health percentage of drivetrain
                    rightDrivetrainHealth: 100, // health percentage of drivetrain
                    ballastSystemHealth: 100, // health percentage of ballast system
                    trimSystemHealth: 100, // health percentage of trim system
                    leftThrust: 0, // current thrust percentage
                    rightThrust: 0, // current thrust percentage
                    fwdBallast: 0, // Forward ballast tank fill percentage
                    aftBallast: 0, // Aft ballast tank fill percentage
                    portBallast: 0, // Port ballast tank fill percentage
                    starboardBallast: 0, // Starboard ballast tank fill percentage
                    rollTrim: 0, // roll trim angle in degrees
                    pitchTrim: 0, // pitch trim angle in degrees
                    bowPlane: 45, // bow plane angle in degrees
                    sternPlane: 45, // stern plane angle in degrees
                    rudder: 0, // rudder angle in degrees
                    bowThrusters: 0, // bow thruster percentage
                    sternThrusters: 0 // stern thruster percentage
                },
                lifeSupport: {
                    oxygenTankQuantity: 98, // percentage
                    nitrogenTankQuantity: 100, // percentage
                    waterTankQantity: 50, // percentage
                    nitrogenLevels: 78.08, // percentage
                    oxygenLevels: 20.95, // percentage
                    co2Levels: 0.04, // percentage
                    co2: 400, // parts per million
                    co2ScrubbersEfficency: 100, // efficiency
                    airTemperature: 22, // celsius
                    humidity: 45 // percentage
                },
                sensors: {
                    shipSonar: 100, // operational percentage
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
                    passiveAccoustics: 100,
                    cameras: 100
                },
                communications: {
                    commHealth: 100,
                    satelliteLink: 100,
                    dataDownload: 15, // Gbps
                    dataUpload: 5, // Gbps
                    radios: {
                        VHF1: {
                            frequency: 156.800,
                            status: "RX"
                        },
                        VHF2: {
                            frequency: 157.100,
                            status: "OFF"
                        },
                        UHF: {
                            frequency: 400.000,
                            status: "ON"
                        },
                        HF: {
                            frequency: 3.000,
                            status: "OFF"
                        }
                    },
                    quantumCommunication: {
                        status: "operational",
                        linkQuality: 100,
                        linkLoadPercentage: 0
                    }
                }
            },

            // Display & UI settings
            displaySettings: {
                navDisplayRange: 10,  // NM
                // later: brightness, overlays toggled on/off, etc.
            },

            // Crew and personnel
            crew: {
                captain: {
                    experience: 100,
                    rest: "alert",
                    status: "active"
                },
                executiveOfficer: {
                    experience: 100,
                    rest: "alert",
                    status: "active"
                },
                medical: {
                    experience: 85,
                    rest: "alert",
                    status: "active"
                },
                engineer: {
                    experience: 80,
                    rest: "tired",
                    status: "active"
                },
                security: {
                    experience: 75,
                    rest: "alert",
                    status: "active"
                },
                communications: {
                    experience: 70,
                    rest: "alert",
                    status: "active"
                },
                science: {
                    experience: 90,
                    rest: "alert",
                    status: "active"
                },
                sensors: {
                    experience: 60,
                    rest: "alert",
                    status: "active"
                },
                totalCrew: 8
            },

            // Mission and exploration data
            mission: {
                currentMission: null,
                objectives: [],
                discoveries: [],
                samples: [],
                researchData: []
            },

            // Environment and world state
            environment: {
                weather: "calm",
                seaState: 1, // 0-9 scale
                visibility: "excellent",
                waterTemperature: 20, // celsius
                airTemperature: 20, // celsius
                currentDirection: 180, // degrees
                currentStrength: 0.5 // knots
            },

            // Logbook statistics
            statistics: {
                totalEntries: 0,
                totalMissions: 0,
                firstEntry: null,
                lastEntry: null
            },

            // Logbook settings
            settings: {
                autoSave: true,
                autoSaveInterval: 5,
                maxEntries: 1000,
                compressionEnabled: false
            },

            // Game progression and unlocks
            progress: {
                stationsUnlocked: ["captains-quarters"],
                areasExplored: ["woods_hole"],
                achievementsUnlocked: ["first_boot"]
            }
        };
    }

    initialize() {
        console.log("GameState initialized");
        this.updateTimestamp();
        
        // Try to load from localStorage if available
        this.loadFromCache();
    }

    // Load state from localStorage
    loadFromCache() {
        try {
            const cached = localStorage.getItem('aquaNova_gameState');
            if (cached) {
                const cachedState = JSON.parse(cached);
                this.state = { ...this.getDefaultState(), ...cachedState };
                console.log('GameState loaded from cache');
                this.notifyObservers();
            }
        } catch (error) {
            console.error('Failed to load cached game state:', error);
        }
    }

    // Save state to localStorage
    saveToCache() {
        try {
            localStorage.setItem('aquaNova_gameState', JSON.stringify(this.state));
            console.log('GameState saved to cache');
        } catch (error) {
            console.error('Failed to cache game state:', error);
        }
    }

    // Core state management methods
    getState() {
        return JSON.parse(JSON.stringify(this.state)); // Deep copy
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.updateTimestamp();
        this.saveToCache();
        this.notifyObservers();
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
        this.saveToCache();
        this.notifyObservers();
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

    // Navigation methods
    updateLocation(location, coordinates = null) {
        this.updateProperty('navigation.location', location);
        if (coordinates) {
            this.updateProperty('navigation.location.geometry.coordinates', coordinates);
        }
    }

    updateDepth(depth) {
        this.updateProperty('navigation.depth', depth);
        // Update status based on depth
        if (depth > 0 && this.state.shipSystems.hull.dockingBay === 'Open') {
            this.updateProperty('shipSystems.hull.dockingBay', 'Closed');
        }
    }

    updateCourse(course, speed = null) {
        this.updateProperty('navigation.course', course);
        this.updateProperty('navigation.heading', course); // Sync heading with course
        if (speed !== null) {
            this.updateProperty('navigation.speed', speed);
        }
    }

    // Ship systems methods
    updateSystemHealth(system, component, value) {
        this.updateProperty(`shipSystems.${system}.${component}`, value);
    }

    getSystemStatus(system) {
        return this.getProperty(`shipSystems.${system}`);
    }

    getAllSystemsStatus() {
        return {
            hull: this.getSystemStatus('hull'),
            power: this.getSystemStatus('power'),
            helm: this.getSystemStatus('helm'),
            lifeSupport: this.getSystemStatus('lifeSupport'),
            sensors: this.getSystemStatus('sensors'),
            communications: this.getSystemStatus('communications')
        };
    }

    // Mission methods
    setCurrentMission(mission) {
        this.updateProperty('mission.currentMission', mission);
    }

    addObjective(objective) {
        const objectives = [...this.state.mission.objectives, objective];
        this.updateProperty('mission.objectives', objectives);
    }

    completeObjective(objectiveId) {
        const objectives = this.state.mission.objectives.map(obj => 
            obj.id === objectiveId ? { ...obj, completed: true } : obj
        );
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
    updateCrewMember(member, property, value) {
        this.updateProperty(`crew.${member}.${property}`, value);
    }

    getCrewStatus() {
        const crew = this.state.crew;
        const active = Object.values(crew).filter(member => 
            typeof member === 'object' && member.status === 'active'
        ).length;
        
        return {
            active,
            total: crew.totalCrew,
            efficiency: this.calculateCrewEfficiency()
        };
    }

    calculateCrewEfficiency() {
        const crew = this.state.crew;
        let totalEfficiency = 0;
        let count = 0;
        
        Object.entries(crew).forEach(([key, member]) => {
            if (typeof member === 'object' && member.experience !== undefined) {
                let efficiency = member.experience;
                
                // Rest affects efficiency
                if (member.rest === 'tired') efficiency *= 0.8;
                if (member.rest === 'fatigued') efficiency *= 0.6;
                
                // Status affects efficiency
                if (member.status !== 'active') efficiency *= 0.3;
                
                totalEfficiency += efficiency;
                count++;
            }
        });
        
        return count > 0 ? Math.round(totalEfficiency / count) : 0;
    }

    // Environment methods
    updateEnvironment(property, value) {
        this.updateProperty(`environment.${property}`, value);
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

    // Observer pattern for UI updates
    addObserver(callback) {
        this.observers.push(callback);
    }

    removeObserver(callback) {
        this.observers = this.observers.filter(obs => obs !== callback);
    }

    notifyObservers() {
        this.observers.forEach(callback => {
            try {
                callback(this.state);
            } catch (error) {
                console.error('Observer callback error:', error);
            }
        });
    }

    // Utility methods
    updateTimestamp() {
        this.state.gameInfo.lastSaved = new Date().toISOString();
    }

    // Status check methods
    getOverallStatus() {
        const systems = this.state.shipSystems;
        let status = "OPERATIONAL";
        
        // Check critical systems
        if (systems.hull.integrity < 25) status = "CRITICAL";
        else if (systems.hull.integrity < 50) status = "WARNING";
        else if (systems.lifeSupport.oxygenTankQuantity < 25) status = "CRITICAL";
        else if (systems.lifeSupport.oxygenTankQuantity < 50) status = "WARNING";
        else if (systems.lifeSupport.co2 > 1000) status = "WARNING";
        else if (systems.power.leftReactorHealth < 50 || systems.power.rightReactorHealth < 50) status = "WARNING";
        
        return status;
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
            crew: this.getCrewStatus(),
            docked: systems.hull.dockingBay === 'Open'
        };
    }

    // Create a snapshot for logbook saves
    createSnapshot() {
        return {
            timestamp: new Date().toISOString(),
            navigation: { ...this.state.navigation },
            shipSystems: JSON.parse(JSON.stringify(this.state.shipSystems)),
            crew: { ...this.state.crew },
            mission: { ...this.state.mission },
            environment: { ...this.state.environment },
            progress: { ...this.state.progress }
        };
    }

    // Load from a snapshot (for logbook revert functionality)
    loadFromSnapshot(snapshot) {
        if (!snapshot || !snapshot.timestamp) {
            console.error('Invalid snapshot provided');
            return false;
        }
        
        try {
            // Merge snapshot with current state, keeping gameInfo
            this.state = {
                ...this.state,
                navigation: snapshot.navigation || this.state.navigation,
                shipSystems: snapshot.shipSystems || this.state.shipSystems,
                crew: snapshot.crew || this.state.crew,
                mission: snapshot.mission || this.state.mission,
                environment: snapshot.environment || this.state.environment,
                progress: snapshot.progress || this.state.progress
            };
            
            this.updateTimestamp();
            this.saveToCache();
            this.notifyObservers();
            
            console.log(`State loaded from snapshot: ${snapshot.timestamp}`);
            return true;
        } catch (error) {
            console.error('Failed to load from snapshot:', error);
            return false;
        }
    }

    // Reset to default state
    reset() {
        this.state = this.getDefaultState();
        this.saveToCache();
        this.notifyObservers();
        console.log('GameState reset to defaults');
    }

    // Get a summary for debugging
    getSummary() {
        const report = this.getStatusReport();
        return {
            version: this.state.gameInfo.version,
            lastSaved: this.state.gameInfo.lastSaved,
            location: report.location,
            depth: report.depth,
            status: report.status,
            stationsUnlocked: this.state.progress.stationsUnlocked.length
        };
    }
}

// Export for use in other modules or make globally available
export default GameState;