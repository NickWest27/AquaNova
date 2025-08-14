// game/state.js
// a structure that tracks everything: ship location, systems status, crew, etc.
// game/state.js - Core game state management for Aqua Nova DSV

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
                version: "1.0.0",
                lastSaved: new Date().toISOString(),
                playTime: 0, // in minutes
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
                    dockingBay: "Open", // Dockingbay status
                    moonPool: "Closed", // Moon pool status
                    wskrsBay: "Closed", // WSKRS docking bay status
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
                    waterTankQantity: 50, // percentag
                    nitrogenLevels: 78.08, // percentage
                    oxygenLevels: 20.95, // percentage
                    co2Levels: 0.04, // percentage
                    co2: 400, // parts per million (<249 = yellow, 250-600 = normal, 601-1000 = yellow, >1001 = amber, >2000 = red)
                    co2ScrubbersEfficency: 100, // efficiency
                    airTemperature: 22, // celsius
                    humidity: 45 // percentage
                },
                sensors: {
                    shipSonar: 100, // operational percentage
                    wskrs: {
                        Triton: { // Triton WSKRS 
                            bearing: null, // degrees from ship
                            distance: null, // meters from ship
                            depth: null, // relative to ship
                            heading: null, // degrees
                            speed: null, // knots
                            status: "docked", // docked, deployed.
                            linkQuality: 100, // signal quality percentage
                            health: 100 // health percentage
                        },
                        Thalassa: { // Thalassa WSKRS
                            bearing: null, // degrees from ship
                            distance: null, // meters from ship
                            depth: null, // relative to ship
                            heading: null, // degrees
                            speed: null, // knots
                            status: "docked", // docked, deployed.
                            linkQuality: 100, // signal quality percentage
                            health: 100 // health percentage
                        },
                        Oceanus: {  
                            bearing: null, // degrees from ship
                            distance: null, // meters from ship 
                            depth: null, // relative to ship
                            heading: null, // degrees
                            speed: null, // knots
                            status: "docked", // docked, deployed.
                            linkQuality: 100, // signal quality percentage
                            health: 100 // health percentage
                        }
                    },
                    radar: 100, // operational percentage
                    gravimeter: 100, // operational percentage
                    magnetometer: 100, // operational percentage
                    passiveAccoustics: 100, // operational percentage
                    cameras: 100 // operational percentage`
                },
                communications: {
                    commHealth: 100, // operational percentage
                    satelliteLink: 100, // Link quality percentage
                    dataDownload: 15, // Download speed gigabytes per second
                    dataUpload: 5, // Upload speed gigabytes per second
                    radios: {
                        VHF1: {
                            frequency: 156.800, // MHz
                            status: "RX" // TX, RX, ON, OFF
                        },
                        VHF2: {
                            frequency: 157.100, // MHz
                            status: "OFF" // TX, RX, ON, OFF
                        },
                        UHF: {
                            frequency: 400.000, // MHz
                            status: "ON" // TX, RX, ON, OFF
                        },
                        HF: {
                            frequency: 3.000, // MHz
                            status: "OFF" // TX, RX, ON, OFF
                        }
                    },
                    quantumCommunication: { // Quantum entanglement communication system
                        status: "operational", // operational, degraded, offline
                        linkQuality: 100, // Link quality percentag
                        linkLoadPercentage: 0 // current load in percentage
                    }
                },
            },
            // Crew and personnel
            crew: {
                captain: {
                    experience: 100, // experience percentage
                    rest: "alert", // alert, tired, fatigued
                    status: "active" // Active, Inactive, Away.
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
                totalCrew: 8, // Total crew count
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
                waterTemperature: 20, // water temp in celsius
                airTemperature: 20, // surface air temp in celsius
                currentDirection: 180, // degrees
                currentStrength: 0.5 // knots
            },

            // Logbook entries (references to saved entries)
            logbook: {
                entries: [],
                totalEntries: 0,
                lastEntryId: 0
            },

            // Game progression and unlocks
            progress: {
                stationsUnlocked: ["bridge", "captains-quarters"],
                areasExplored: ["woods_hole"],
                achievementsUnlocked: []
            }
        }
    }

    initialize() {
        console.log("GameState initialized");
        this.updateTimestamp();
    }

    // Core state management methods
    getState() {
        return JSON.parse(JSON.stringify(this.state)); // Deep copy
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.updateTimestamp();
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
            this.updateProperty('navigation.coordinates', coordinates);
        }
    }

    updateDepth(depth) {
        this.updateProperty('navigation.depth', depth);
        // Update hull pressure based on depth (approximation)
        const pressure = 1 + (depth / 10); // roughly 1 atm per 10m
        this.updateProperty('shipSystems.hull.pressure', pressure);
    }

    updateCourse(course, speed = null) {
        this.updateProperty('navigation.course', course);
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

    // Mission and logbook methods
    addLogEntry(entry) {
        const logEntry = {
            id: `LOG-${String(this.state.logbook.lastEntryId + 1).padStart(4, '0')}`,
            timestamp: new Date().toISOString(),
            gameState: this.createSaveSnapshot(),
            content: entry
        };

        this.state.logbook.entries.push(logEntry);
        this.state.logbook.totalEntries++;
        this.state.logbook.lastEntryId++;
        this.updateTimestamp();
        this.notifyObservers();

        return logEntry;
    }

    // Save/Load snapshot functionality
    createSaveSnapshot() {
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

    loadFromSnapshot(snapshot) {
        if (snapshot && snapshot.timestamp) {
            this.setState({
                navigation: snapshot.navigation || this.state.navigation,
                shipSystems: snapshot.shipSystems || this.state.shipSystems,
                crew: snapshot.crew || this.state.crew,
                mission: snapshot.mission || this.state.mission,
                environment: snapshot.environment || this.state.environment,
                progress: snapshot.progress || this.state.progress
            });
            console.log(`Game state loaded from snapshot: ${snapshot.timestamp}`);
            return true;
        }
        return false;
    }

    // Observer pattern for UI updates
    addObserver(callback) {
        this.observers.push(callback);
    }

    removeObserver(callback) {
        this.observers = this.observers.filter(obs => obs !== callback);
    }

    notifyObservers() {
        this.observers.forEach(callback => callback(this.state));
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
        if (systems.hull.integrity < 50) status = "CRITICAL";
        else if (systems.power.mainReactor < 25) status = "WARNING";
        else if (systems.lifeSupport.oxygen < 80) status = "CAUTION";
        
        return status;
    }

    getStatusReport() {
        return {
            location: this.state.navigation.location,
            depth: this.state.navigation.depth,
            coordinates: this.state.navigation.coordinates,
            status: this.getOverallStatus(),
            oxygen: this.state.shipSystems.lifeSupport.oxygen,
            power: this.state.shipSystems.power.mainReactor,
            hull: this.state.shipSystems.hull.integrity
        }
    }
}

// Export for use in other modules
window.GameState = GameState;