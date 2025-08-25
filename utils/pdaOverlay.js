// PDA Overlay Utility for Aqua Nova

let pdaVisible = false;
let pdaElement = null;

export function initPDAOverlay() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault(); // Prevent default tab behavior
      togglePDA();
    }
  });
}

function togglePDA() {
  if (!pdaElement) createPDA();

  pdaVisible = !pdaVisible;
  pdaElement.style.display = pdaVisible ? 'block' : 'none';
}

function createPDA() {
  pdaElement = document.createElement('div');
  pdaElement.id = 'pda-overlay';
  pdaElement.innerHTML = `
    <img src="assets/images/PDAframe.png" alt="PDA Frame" />
    <div class="pda-ui"></div>
  `;

  Object.assign(pdaElement.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '360px',
    height: '640px',
    zIndex: '9999',
    pointerEvents: 'none',
    display: 'none'
  });

  document.body.appendChild(pdaElement);
}
