// utils/scale.js
// Utility to set a global scale factor for responsive design

// Calculate both "contain" and "cover" scale, and allow up to 10% crop tolerance.
export function calculateScale(windowWidth, windowHeight, baseWidth, baseHeight) {
  // "Contain" scale fits the entire base inside the window (no cropping)
  const containScale = Math.min(windowWidth / baseWidth, windowHeight / baseHeight);
  // "Cover" scale fills the window, possibly cropping the base
  const coverScale = Math.max(windowWidth / baseWidth, windowHeight / baseHeight);
  // Allow up to 10% crop tolerance beyond "contain" scale, but never more than "cover"
  const cropTolerantScale = Math.min(coverScale, containScale * 1.1);
  return {
    containScale,
    coverScale,
    cropTolerantScale
  };
}

export function setGlobalScale() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const { cropTolerantScale } = calculateScale(window.innerWidth, window.innerHeight, baseWidth, baseHeight);
  document.documentElement.style.setProperty('--scale', cropTolerantScale);
  console.log(`Scale script setting Global scale set to: ${cropTolerantScale}`);
}

// Auto-apply on load + resize
window.addEventListener('resize', setGlobalScale);
document.addEventListener('DOMContentLoaded', setGlobalScale);