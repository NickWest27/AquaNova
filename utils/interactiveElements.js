// utils/interactiveElements.js
// System for spawning and managing interactive elements for missions

import missionManager from '/game/systems/missionManager.js';

class InteractiveElementManager {
    constructor() {
        this.activeElements = new Map();
        this.elementDefinitions = new Map();
        this.init();
    }

    init() {
        // Listen for spawn requests from mission system
        document.addEventListener('spawn-interactive', (e) => {
            this.spawnElement(e.detail.elementId, e.detail.location);
        });

        // Define interactive elements
        this.defineElements();
    }

    defineElements() {
        // Communicator pickup element
        this.elementDefinitions.set('communicator_pickup', {
            type: 'pickup',
            cssClass: 'interactive-pickup communicator-pickup',
            position: { left: '65%', top: '45%', width: '8%', height: '12%' },
            cursor: 'pointer',
            tooltip: 'Personal Communicator - Click to pick up',
            onClick: () => {
                this.pickupItem('communicator');
                this.removeElement('communicator_pickup');
            }
        });

        // Add more interactive elements as needed
        this.elementDefinitions.set('logbook_interact', {
            type: 'examine',
            cssClass: 'interactive-examine logbook-examine',
            position: { left: '12%', bottom: '37%', width: '11%', height: '16%' },
            cursor: 'pointer',
            tooltip: 'Ship\'s Logbook - Click to examine',
            onClick: () => {
                this.examineItem('logbook');
            }
        });
    }

    spawnElement(elementId, location) {
        const definition = this.elementDefinitions.get(elementId);
        if (!definition) {
            console.warn(`Unknown interactive element: ${elementId}`);
            return;
        }

        // Create the DOM element
        const element = this.createElement(elementId, definition, location);
        
        // Add to appropriate container based on location
        const container = this.getLocationContainer(location);
        if (container) {
            container.appendChild(element);
            this.activeElements.set(elementId, element);
            
            // Add entrance animation
            element.style.animation = 'fadeInGlow 1s ease-out';
            
            console.log(`Spawned interactive element: ${elementId} at ${location}`);
        }
    }

    createElement(elementId, definition, location) {
        const element = document.createElement('div');
        element.id = `interactive-${elementId}`;
        element.className = `interactive-element ${definition.cssClass}`;
        element.style.cssText = `
            position: absolute;
            left: ${definition.position.left};
            top: ${definition.position.top || 'auto'};
            bottom: ${definition.position.bottom || 'auto'};
            width: ${definition.position.width};
            height: ${definition.position.height};
            cursor: ${definition.cursor};
            border: calc(2px * var(--scale)) solid transparent;
            border-radius: calc(8px * var(--scale));
            transition: all 0.3s ease;
            background: rgba(100, 255, 218, 0.1);
            opacity: 1;
            z-index: 10;
        `;

        // Add hover effects
        element.addEventListener('mouseenter', () => {
            element.style.borderColor = '#64ffda';
            element.style.boxShadow = '0 0 calc(20px * var(--scale)) rgba(100, 255, 218, 0.5)';
            element.style.background = 'rgba(100, 255, 218, 0.2)';
            
            if (definition.tooltip) {
                this.showTooltip(element, definition.tooltip);
            }
        });

        element.addEventListener('mouseleave', () => {
            element.style.borderColor = 'transparent';
            element.style.boxShadow = 'none';
            element.style.background = 'rgba(100, 255, 218, 0.1)';
            this.hideTooltip();
        });

        // Add click handler
        element.addEventListener('click', () => {
            this.handleElementClick(elementId, definition);
        });

        // Add pulsing animation for important items
        if (definition.type === 'pickup') {
            element.style.animation = 'pulse 3s infinite';
        }

        return element;
    }

    getLocationContainer(location) {
        switch (location) {
            case 'quarters_desk':
            case 'quarters':
                return document.querySelector('.quarters-overlay');
            case 'bridge':
                return document.querySelector('.bridge-overlay');
            case 'logbook':
                return document.querySelector('#log-entries');
            default:
                return document.body;
        }
    }

    handleElementClick(elementId, definition) {
        // Add click effect
        const element = this.activeElements.get(elementId);
        if (element) {
            element.style.transform = 'scale(0.95)';
            setTimeout(() => {
                element.style.transform = 'scale(1)';
            }, 100);
        }

        // Execute the click handler
        if (definition.onClick) {
            definition.onClick();
        }
    }

    pickupItem(itemId) {
        // Fire pickup event for mission system
        const event = new CustomEvent('item-pickup', {
            detail: { itemId }
        });
        document.dispatchEvent(event);

        // Show pickup animation/notification
        this.showPickupNotification(itemId);
    }

    examineItem(itemId) {
        const event = new CustomEvent('item-examine', {
            detail: { itemId }
        });
        document.dispatchEvent(event);
    }

    removeElement(elementId) {
        const element = this.activeElements.get(elementId);
        if (element) {
            // Fade out animation
            element.style.animation = 'fadeOutGlow 0.5s ease-in forwards';
            
            setTimeout(() => {
                if (element.parentNode) {
                    element.parentNode.removeChild(element);
                }
                this.activeElements.delete(elementId);
            }, 500);
        }
    }

    showPickupNotification(itemId) {
        // Create pickup notification
        const notification = document.createElement('div');
        notification.className = 'pickup-notification';
        notification.textContent = `Picked up: ${this.getItemName(itemId)}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(100, 255, 218, 0.9);
            color: var(--primary-blue);
            padding: 12px 24px;
            border-radius: 6px;
            font-weight: bold;
            z-index: 10000;
            animation: pickupNotification 3s ease-out forwards;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    showTooltip(element, text) {
        this.hideTooltip(); // Remove any existing tooltip
        
        const tooltip = document.createElement('div');
        tooltip.className = 'interactive-tooltip';
        tooltip.textContent = text;
        tooltip.style.cssText = `
            position: absolute;
            bottom: -40px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.9);
            color: #64ffda;
            padding: calc(8px * var(--scale)) calc(12px * var(--scale));
            border-radius: calc(4px * var(--scale));
            font-size: calc(12px * var(--scale));
            white-space: nowrap;
            pointer-events: none;
            border: calc(1px * var(--scale)) solid #64ffda;
            z-index: 1000;
            animation: tooltipFadeIn 0.3s ease-out;
        `;

        element.appendChild(tooltip);
    }

    hideTooltip() {
        const tooltip = document.querySelector('.interactive-tooltip');
        if (tooltip) {
            tooltip.parentNode.removeChild(tooltip);
        }
    }

    getItemName(itemId) {
        const itemNames = {
            'communicator': 'Personal Communicator',
            'logbook': 'Ship\'s Logbook',
            'keycard': 'Access Keycard'
        };
        return itemNames[itemId] || itemId;
    }

    // Debug methods
    listActiveElements() {
        console.log('Active interactive elements:', Array.from(this.activeElements.keys()));
    }

    forceSpawn(elementId, location = 'quarters') {
        this.spawnElement(elementId, location);
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
@keyframes fadeInGlow {
    0% { 
        opacity: 0; 
        transform: scale(0.8); 
        box-shadow: 0 0 0 rgba(100, 255, 218, 0);
    }
    100% { 
        opacity: 1; 
        transform: scale(1); 
        box-shadow: 0 0 calc(15px * var(--scale)) rgba(100, 255, 218, 0.3);
    }
}

@keyframes fadeOutGlow {
    0% { 
        opacity: 1; 
        transform: scale(1); 
    }
    100% { 
        opacity: 0; 
        transform: scale(0.8); 
    }
}

@keyframes pickupNotification {
    0% { 
        opacity: 0; 
        transform: translateX(-50%) translateY(-20px); 
    }
    10%, 90% { 
        opacity: 1; 
        transform: translateX(-50%) translateY(0); 
    }
    100% { 
        opacity: 0; 
        transform: translateX(-50%) translateY(-20px); 
    }
}

@keyframes tooltipFadeIn {
    0% { opacity: 0; transform: translateX(-50%) translateY(5px); }
    100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes pulse {
    0%, 100% { 
        box-shadow: 0 0 calc(5px * var(--scale)) rgba(100, 255, 218, 0.3); 
    }
    50% { 
        box-shadow: 0 0 calc(15px * var(--scale)) rgba(100, 255, 218, 0.8); 
    }
}

.interactive-element:hover {
    animation-play-state: paused;
}
`;
document.head.appendChild(style);

// Singleton instance
const interactiveElementManager = new InteractiveElementManager();
export default interactiveElementManager;