// Bootstraps the game
// main.js - Bootstrap and splash screen functionality for Aqua Nova

class SplashScreen {
    constructor() {
        this.initialize();
    }

    initialize() {
        this.createBubbles();
        this.bindControls();
        this.startBubbleGeneration();
    }

    createBubble() {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        
        const size = Math.random() * 15 + 5;
        bubble.style.width = size + 'px';
        bubble.style.height = size + 'px';
        bubble.style.left = Math.random() * 100 + '%';
        bubble.style.animationDuration = (Math.random() * 10 + 10) + 's';
        bubble.style.animationDelay = Math.random() * 5 + 's';
        
        document.getElementById('particles').appendChild(bubble);
        
        // Clean up bubble after animation
        setTimeout(() => {
            if (bubble.parentNode) {
                bubble.remove();
            }
        }, 20000);
    }

    createBubbles() {
        // Create initial bubbles
        for(let i = 0; i < 10; i++) {
            setTimeout(() => this.createBubble(), i * 200);
        }
    }

    startBubbleGeneration() {
        // Continuously generate new bubbles
        setInterval(() => this.createBubble(), 800);
    }

    bindControls() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') {
                this.startDiving();
            }
        });
        
        // Click interaction for mobile/accessibility
        document.addEventListener('click', () => {
            const prompt = document.getElementById('start-prompt');
            prompt.style.transform = 'scale(1.1)';
            setTimeout(() => {
                prompt.style.transform = 'scale(1)';
            }, 200);
        });
    }

    startDiving() {
        const prompt = document.getElementById('start-prompt');
        prompt.textContent = 'DIVING... SYSTEMS ENGAGED';
        prompt.classList.add('diving');
        
        // Add diving sound effect or animation here if desired
        console.log('Initiating dive sequence...');
        
        // Brief delay for feedback, then navigate to logbook
        setTimeout(() => {
            this.navigateToLogbook();
        }, 2000);
    }

    navigateToLogbook() {
        // Navigate to the captain's quarters logbook
        window.location.href = 'ui/captains-quarters/logbook/logbook.html';
    }
}

// Initialize the splash screen when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SplashScreen();
});

// Additional utility functions for future use
const AquaNova = {
    // Game state will be managed here later
    gameState: {
        initialized: false,
        currentLocation: 'splash'
    },
    
    // Navigation helper for future stations
    navigateTo: function(station) {
        console.log(`Navigating to: ${station}`);
        // This will be expanded when we add the router
    }
};