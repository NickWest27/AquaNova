// utils/displayManager.js
// Unified display management system combining scaling and settings

export class DisplayManager {
  constructor() {
    // Core scaling properties
    this.baseWidth = 1920;
    this.baseHeight = 1080;
    this.currentScale = 1;
    this.scaleMode = 'cropTolerant';
    this.maxCropTolerance = 0.1;
    
    // Settings with defaults
    this.settings = {
      // Display settings
      resolution: 'auto',
      customWidth: 1920,
      customHeight: 1080,
      scaleMode: 'cropTolerant',
      uiScale: 1.0,
      
      // Future settings
      audioVolume: 1.0,
      sfxVolume: 1.0,
      autoSave: true,
      theme: 'default'
    };
    
    // Resolution presets
    this.presetResolutions = [
      { name: 'Auto (Recommended)', key: 'auto', width: null, height: null, ratio: null },
      { name: 'Fullscreen', key: 'fullscreen', width: null, height: null, ratio: null },
      { name: '16:9 HD (1920×1080)', key: '16:9', width: 1920, height: 1080, ratio: 16/9 },
      { name: '16:10 (1920×1200)', key: '16:10', width: 1920, height: 1200, ratio: 16/10 },
      { name: '4:3 Classic (1600×1200)', key: '4:3', width: 1600, height: 1200, ratio: 4/3 },
      { name: '21:9 Ultrawide (2560×1080)', key: '21:9', width: 2560, height: 1080, ratio: 21/9 },
      { name: 'Square (1080×1080)', key: '1:1', width: 1080, height: 1080, ratio: 1/1 },
      { name: 'Custom', key: 'custom', width: 1920, height: 1080, ratio: null }
    ];
    
    this.init();
  }

  // =========================================================================
  // INITIALIZATION AND EVENT HANDLING
  // =========================================================================

  init() {
    this.loadSettings();
    this.bindEvents();
    this.applySettings();
  }

  bindEvents() {
    // Throttled resize handler
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        this.updateScale();
      }, 16); // ~60fps throttling
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.updateScale(), 100);
    });
    
    // Initial scale on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.updateScale());
    } else {
      this.updateScale();
    }
  }

  // =========================================================================
  // CORE SCALING ENGINE
  // =========================================================================

  calculateScale(windowWidth, windowHeight) {
    const containScale = Math.min(windowWidth / this.baseWidth, windowHeight / this.baseHeight);
    const coverScale = Math.max(windowWidth / this.baseWidth, windowHeight / this.baseHeight);
    const cropTolerantScale = Math.min(coverScale, containScale * (1 + this.maxCropTolerance));
    
    return {
      containScale,
      coverScale,
      cropTolerantScale,
      windowWidth,
      windowHeight,
      aspectRatio: windowWidth / windowHeight,
      baseAspectRatio: this.baseWidth / this.baseHeight
    };
  }

  updateScale() {
    const scaleData = this.calculateScale(window.innerWidth, window.innerHeight);
    
    // Choose scale based on mode
    let selectedScale;
    switch (this.scaleMode) {
      case 'contain':
        selectedScale = scaleData.containScale;
        break;
      case 'cover':
        selectedScale = scaleData.coverScale;
        break;
      case 'cropTolerant':
      default:
        selectedScale = scaleData.cropTolerantScale;
        break;
    }
    
    this.currentScale = selectedScale;
    
    // Apply UI scale multiplier
    const effectiveScale = selectedScale * this.settings.uiScale;
    
    // Set CSS custom properties
    const root = document.documentElement.style;
    root.setProperty('--scale', selectedScale);
    root.setProperty('--ui-scale', this.settings.uiScale);
    root.setProperty('--effective-scale', effectiveScale);
    root.setProperty('--inverse-scale', 1 / selectedScale);
    root.setProperty('--base-width', this.baseWidth + 'px');
    root.setProperty('--base-height', this.baseHeight + 'px');
    root.setProperty('--window-width', scaleData.windowWidth + 'px');
    root.setProperty('--window-height', scaleData.windowHeight + 'px');
    
    // Calculate scaled dimensions
    const scaledWidth = this.baseWidth * selectedScale;
    const scaledHeight = this.baseHeight * selectedScale;
    
    root.setProperty('--scaled-width', scaledWidth + 'px');
    root.setProperty('--scaled-height', scaledHeight + 'px');
    
    // Calculate offsets for centering
    const offsetX = (scaleData.windowWidth - scaledWidth) / 2;
    const offsetY = (scaleData.windowHeight - scaledHeight) / 2;
    
    root.setProperty('--offset-x', offsetX + 'px');
    root.setProperty('--offset-y', offsetY + 'px');
    
    // Emit events
    this.emitScaleChanged(selectedScale, scaleData, scaledWidth, scaledHeight, offsetX, offsetY);
    
    console.log(`Display: ${this.baseWidth}×${this.baseHeight} @ ${selectedScale.toFixed(3)}x (${this.scaleMode})`);
    
    return this.currentScale;
  }

  emitScaleChanged(scale, scaleData, scaledWidth, scaledHeight, offsetX, offsetY) {
    const event = new CustomEvent('scaleChanged', {
      detail: { scale, scaleData, scaledWidth, scaledHeight, offsetX, offsetY }
    });
    document.dispatchEvent(event);
  }

  // =========================================================================
  // SETTINGS MANAGEMENT
  // =========================================================================

  setResolution(resolutionKey, customWidth = null, customHeight = null, skipUpdate = false) {
    const preset = this.presetResolutions.find(p => p.key === resolutionKey);
    if (!preset) {
      console.error('Invalid resolution preset:', resolutionKey);
      return false;
    }

    let targetWidth, targetHeight;

    switch (resolutionKey) {
      case 'auto':
        targetWidth = 1920;
        targetHeight = 1080;
        break;
        
      case 'fullscreen':
        targetWidth = window.innerWidth;
        targetHeight = window.innerHeight;
        break;
        
      case 'custom':
        targetWidth = customWidth || this.settings.customWidth;
        targetHeight = customHeight || this.settings.customHeight;
        this.settings.customWidth = targetWidth;
        this.settings.customHeight = targetHeight;
        break;
        
      default:
        targetWidth = preset.width;
        targetHeight = preset.height;
        break;
    }

    // Validate dimensions
    if (targetWidth < 320 || targetHeight < 240 || targetWidth > 7680 || targetHeight > 4320) {
      console.error('Invalid resolution:', targetWidth, targetHeight);
      return false;
    }

    // Update virtual resolution
    this.baseWidth = targetWidth;
    this.baseHeight = targetHeight;
    this.settings.resolution = resolutionKey;
    
    if (!skipUpdate) {
      this.updateScale();
      this.saveSettings();

      // Emit resolution change event
      const event = new CustomEvent('resolutionChanged', {
        detail: { resolutionKey, width: targetWidth, height: targetHeight, preset }
      });
      document.dispatchEvent(event);
    }

    console.log(`Resolution: ${targetWidth}×${targetHeight} (${resolutionKey})`);
    return true;
  }

  setScaleMode(mode, skipUpdate = false) {
    if (['contain', 'cover', 'cropTolerant'].includes(mode)) {
      this.scaleMode = mode;
      this.settings.scaleMode = mode;
      
      if (!skipUpdate) {
        this.updateScale();
        this.saveSettings();
      }
      return true;
    }
    return false;
  }

  setUIScale(scale, skipUpdate = false) {
    if (scale >= 0.5 && scale <= 2.0) {
      this.settings.uiScale = scale;
      
      if (!skipUpdate) {
        this.updateScale(); // This will apply the new UI scale
        this.saveSettings();
      }
      return true;
    }
    return false;
  }

  setSetting(key, value) {
    if (key in this.settings) {
      this.settings[key] = value;
      this.saveSettings();
      
      // Apply specific settings immediately
      switch (key) {
        case 'scaleMode':
          this.setScaleMode(value);
          break;
        case 'uiScale':
          this.setUIScale(value);
          break;
        case 'resolution':
          this.setResolution(value);
          break;
      }
      
      return true;
    }
    return false;
  }

  // =========================================================================
  // DATA GETTERS
  // =========================================================================

  getSetting(key) {
    return this.settings[key];
  }

  getAllSettings() {
    return { ...this.settings };
  }

  getScaleInfo() {
    return {
      scale: this.currentScale,
      mode: this.scaleMode,
      baseWidth: this.baseWidth,
      baseHeight: this.baseHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      uiScale: this.settings.uiScale
    };
  }

  getCurrentDisplayInfo() {
    const scaleInfo = this.getScaleInfo();
    const actualRatio = scaleInfo.windowWidth / scaleInfo.windowHeight;
    const virtualRatio = scaleInfo.baseWidth / scaleInfo.baseHeight;
    
    return {
      windowSize: `${scaleInfo.windowWidth}×${scaleInfo.windowHeight}`,
      virtualSize: `${scaleInfo.baseWidth}×${scaleInfo.baseHeight}`,
      actualRatio: actualRatio.toFixed(2),
      virtualRatio: virtualRatio.toFixed(2),
      scale: scaleInfo.scale.toFixed(3),
      mode: scaleInfo.mode,
      uiScale: scaleInfo.uiScale.toFixed(1)
    };
  }

  getResolutionPresets() {
    return this.presetResolutions.map(preset => ({
      ...preset,
      isCurrent: this.settings.resolution === preset.key
    }));
  }

  getRecommendedSettings() {
    const ratio = window.innerWidth / window.innerHeight;
    const pixelDensity = window.devicePixelRatio || 1;
    const screenSize = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);
    
    let recommendations = {
      resolution: 'auto',
      scaleMode: 'cropTolerant',
      uiScale: 1.0,
      reasons: []
    };

    // Recommend resolution based on aspect ratio
    if (Math.abs(ratio - 16/9) < 0.1) {
      recommendations.resolution = '16:9';
      recommendations.reasons.push('16:9 aspect ratio detected');
    } else if (Math.abs(ratio - 16/10) < 0.1) {
      recommendations.resolution = '16:10';
      recommendations.reasons.push('16:10 aspect ratio detected');
    } else if (Math.abs(ratio - 21/9) < 0.1) {
      recommendations.resolution = '21:9';
      recommendations.reasons.push('Ultrawide display detected');
    }

    // Recommend UI scale based on pixel density and screen size
    if (pixelDensity > 2 || screenSize < 1000) {
      recommendations.uiScale = 1.2;
      recommendations.reasons.push('High DPI or small screen - larger UI recommended');
    } else if (screenSize > 2000) {
      recommendations.uiScale = 0.9;
      recommendations.reasons.push('Large screen - smaller UI may be preferable');
    }

    // Recommend scale mode based on aspect ratio
    const commonRatios = [16/9, 16/10, 4/3, 21/9];
    const isCommonRatio = commonRatios.some(r => Math.abs(ratio - r) < 0.1);
    
    if (!isCommonRatio) {
      recommendations.scaleMode = 'contain';
      recommendations.reasons.push('Unusual aspect ratio - contain mode recommended');
    }

    return recommendations;
  }

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================

  scale(value) {
    return value * this.currentScale;
  }

  unscale(value) {
    return value / this.currentScale;
  }

  virtualToScreen(x, y) {
    const offsetX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--offset-x'));
    const offsetY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--offset-y'));
    
    return {
      x: x * this.currentScale + offsetX,
      y: y * this.currentScale + offsetY
    };
  }

  screenToVirtual(x, y) {
    const offsetX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--offset-x'));
    const offsetY = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--offset-y'));
    
    return {
      x: (x - offsetX) / this.currentScale,
      y: (y - offsetY) / this.currentScale
    };
  }

  // =========================================================================
  // PERSISTENCE
  // =========================================================================

  saveSettings() {
    try {
      localStorage.setItem('aquaNova_settings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('aquaNova_settings');
      if (saved) {
        const parsedSettings = JSON.parse(saved);
        this.settings = { ...this.settings, ...parsedSettings };
        console.log('Settings loaded:', this.settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  applySettings() {
    // Apply all settings without triggering updateScale() for each one
    
    // Apply resolution (skip update)
    if (this.settings.resolution && this.settings.resolution !== 'auto') {
      this.setResolution(this.settings.resolution, null, null, true);
    }
    
    // Apply scale mode (skip update)
    this.setScaleMode(this.settings.scaleMode, true);
    
    // Apply UI scale (skip update)
    this.setUIScale(this.settings.uiScale, true);
    
    // Now call updateScale only once with all settings applied
    this.updateScale();
    
    console.log('Settings applied:', this.settings);
  }

  resetSettings() {
    const confirmed = confirm('Reset all settings to defaults?');
    if (confirmed) {
      localStorage.removeItem('aquaNova_settings');
      this.settings = {
        resolution: 'auto',
        customWidth: 1920,
        customHeight: 1080,
        scaleMode: 'cropTolerant',
        uiScale: 1.0,
        audioVolume: 1.0,
        sfxVolume: 1.0,
        autoSave: true,
        theme: 'default'
      };
      
      // Reset core properties
      this.baseWidth = 1920;
      this.baseHeight = 1080;
      this.scaleMode = 'cropTolerant';
      
      this.applySettings();
      return true;
    }
    return false;
  }

  exportSettings() {
    const settingsData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: this.settings,
      currentResolution: {
        width: this.baseWidth,
        height: this.baseHeight
      }
    };
    
    const blob = new Blob([JSON.stringify(settingsData, null, 2)], 
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aquanova_display_settings.json';
    a.click();
    
    URL.revokeObjectURL(url);
  }

  async importSettings(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (data.settings) {
        this.settings = { ...this.settings, ...data.settings };
        
        // Apply imported resolution if available
        if (data.currentResolution) {
          this.baseWidth = data.currentResolution.width;
          this.baseHeight = data.currentResolution.height;
        }
        
        this.saveSettings();
        this.applySettings();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }

  // =========================================================================
  // DEBUG UTILITIES
  // =========================================================================

  showDebugInfo() {
    const info = this.getScaleInfo();
    console.table(info);
    
    const debugDiv = document.createElement('div');
    debugDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.8);
      color: #64ffda;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      border: 1px solid #64ffda;
      border-radius: 4px;
    `;
    
    debugDiv.innerHTML = `
      Scale: ${info.scale.toFixed(3)}<br>
      UI Scale: ${info.uiScale}x<br>
      Mode: ${info.mode}<br>
      Base: ${info.baseWidth}×${info.baseHeight}<br>
      Window: ${info.windowWidth}×${info.windowHeight}<br>
      Scaled: ${Math.round(info.baseWidth * info.scale)}×${Math.round(info.baseHeight * info.scale)}
    `;
    
    document.body.appendChild(debugDiv);
    setTimeout(() => debugDiv.remove(), 5000);
  }
}

// =========================================================================
// HELPER FUNCTIONS FOR ELEMENT MANAGEMENT
// =========================================================================

export function applyVirtualResolution(element, virtualWidth, virtualHeight) {
  if (!element) return;
  
  element.style.position = 'absolute';
  element.style.top = '50%';
  element.style.left = '50%';
  element.style.width = virtualWidth + 'px';
  element.style.height = virtualHeight + 'px';
  element.style.transform = 'translate(-50%, -50%) scale(var(--scale))';
  element.style.transformOrigin = 'center center';
}

export function createResponsiveElement(tagName, virtualWidth, virtualHeight, className = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  applyVirtualResolution(element, virtualWidth, virtualHeight);
  return element;
}

// =========================================================================
// SINGLETON INSTANCE AND LEGACY COMPATIBILITY
// =========================================================================

export const displayManager = new DisplayManager();

// Legacy compatibility functions
export function calculateScale(windowWidth, windowHeight, baseWidth, baseHeight) {
  return displayManager.calculateScale(windowWidth, windowHeight);
}

export function setGlobalScale() {
  return displayManager.updateScale();
}

// Global debug function
window.showDisplayDebug = () => displayManager.showDebugInfo();

export default displayManager;