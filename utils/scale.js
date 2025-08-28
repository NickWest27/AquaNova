// utils/scale.js
// Utility to set a global scale factor for responsive design

export function setGlobalScale() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const scaleX = window.innerWidth / baseWidth;
  const scaleY = window.innerHeight / baseHeight;
  const scale = Math.min(scaleX, scaleY);
  document.documentElement.style.setProperty('--scale', scale);
  console.log(`Scale script setting Global scale set to: ${scale}`);
}

// Auto-apply on load + resize
window.addEventListener('resize', setGlobalScale);
document.addEventListener('DOMContentLoaded', setGlobalScale);