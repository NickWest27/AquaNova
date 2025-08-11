README - Data Folder Overview

This folder contains static JSON data files used by the AquaNova2 game
to provide configuration, story elements, game state, and location info.

---

locations.json

  - Format: GeoJSON FeatureCollection
  - Purpose: Stores known geographic points of interest such as docks,
    reefs, and trenches.
  - Structure:
      * "geometry": GeoJSON Point [longitude, latitude]
      * "properties": Includes
          - "name"        : Friendly name
          - "type"        : Category (dock, reef, trench, etc.)
          - "description" : Optional UI or log description
  - Usage: Used to display friendly location names and determine submarine
    proximity status (e.g., "Docked" when near docks).
  - Note: This format is compatible with future integration of marine data
    from sources like OpenSeaMap.

---

logbook.json

  - Format: JSON
  - Purpose: Stores the ship’s digital logbook entries, recording key events,
    system statuses, missions, discoveries, and environmental conditions.
  - Structure:
      * "entries": An array of log entries, each with:
          - "id": Unique identifier
          - "timestamp": ISO 8601 date/time string
          - "type": Entry category (e.g., system_log, mission_update)
          - "classification": Security or importance level
          - "author": Who created the entry (e.g., System, Captain)
          - "content": Text of the log entry
          - "gameSnapshot": Object capturing the game state at time of entry, including:
              • Navigation data (location, coordinates, depth, speed)
              • Ship systems status (hull, power, propulsion, life support, sensors)
              • Crew status and details
              • Current mission info
              • Environmental conditions
              • Progress data (stations unlocked, areas explored, achievements)
          - "metadata": Additional info such as importance, tags, and revert permissions
      * "statistics": Summary data like total entries, missions, distances
      * "settings": Logbook behavior settings (auto-save, max entries, compression)

  - Usage: Provides a persistent record of gameplay progress and state snapshots,
    enabling save/load functionality, mission tracking, and player journaling.

---