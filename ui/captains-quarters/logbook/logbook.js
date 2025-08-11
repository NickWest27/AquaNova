// ui/captains-quarters/logbook/logbook.js
// Handles the logbook system for Aqua Nova

class LogbookSystem {
  constructor() {
    this.currentEntryId = 1;
    this.initialize();
  }

  initialize() {
    this.updateCurrentDate();
    this.bindControls();
  }

  updateCurrentDate() {
    const el = document.getElementById('current-date');
    el.textContent = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  bindControls() {
    document.getElementById('new-entry').addEventListener('click', () => this.createEntry());
    document.getElementById('exit-logbook').addEventListener('click', () => {
      console.log('Exiting logbook...'); // Placeholder
    });
  }

  createEntry() {
    const main = document.getElementById('log-entries');
    const entryId = `LOG-${String(this.currentEntryId).padStart(4, '0')}`;

    const section = document.createElement('section');
    section.className = 'log-entry';
    section.innerHTML = `
      <h3>Log Entry (Pending)</h3>
      <div class="entry-content">
        <textarea class="log-textarea" placeholder="Enter your log entry..."></textarea>
      </div>
      <div class="entry-metadata">
        <span class="timestamp"></span>
        <span class="entry-id">${entryId}</span>
      </div>
      <button class="control-btn save-btn">Save Entry</button>
    `;

    main.appendChild(section);
    section.scrollIntoView({ behavior: 'smooth' });

    const timestampSpan = section.querySelector('.timestamp');
    timestampSpan.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

    const saveBtn = section.querySelector('.save-btn');
    saveBtn.addEventListener('click', () => {
      const content = section.querySelector('textarea').value.trim();
      if (!content) return alert('Log entry cannot be empty.');

      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      setTimeout(() => {
        saveBtn.textContent = 'Done!';

        setTimeout(() => {
          main.removeChild(section);
          this.appendSavedEntry(content, entryId);
          this.currentEntryId++;
        }, 800);

      }, 1000);
    });
  }

  appendSavedEntry(content, entryId) {
    const main = document.getElementById('log-entries');
    const section = document.createElement('section');
    section.className = 'log-entry';

    const date = new Date();
    date.setFullYear(date.getFullYear() + 50);

    section.innerHTML = `
      <h3>Saved Log</h3>
      <div class="entry-content">
        <p>${content.replace(/\n/g, '<br>')}</p>
      </div>
      <div class="entry-metadata">
        <span class="timestamp">${date.toLocaleTimeString('en-US', { hour12: false })}</span>
        <span class="entry-id">${entryId}</span>
      </div>
      <button class="control-btn revert-btn">Revert</button>
    `;

    const revertBtn = section.querySelector('.revert-btn');
    revertBtn.addEventListener('click', () => {
      alert(`Reverting game to state at ${entryId}...`);
    });

    main.appendChild(section);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new LogbookSystem();
});
