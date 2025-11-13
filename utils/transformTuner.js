// utils/transformTuner.js  (TEMPORARY TOOL)
(() => {
  // --- configuration: which elements are tunable ---
  const TUNABLE_SELECTORS = [
    '.upper-display',
    '.main-screen',
    '.left-display',
    '.right-display',
    '.center-display',
    '.left-console',
    '.right-console',
    '.center-console',
    '#keyboard-unit-container',
    '.left-buttons',
    '.right-buttons'
  ];

  // Utility
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const z = 999999;

  // Create style (panel + debug outlines)
  const style = document.createElement('style');
  style.textContent = `
    #tuner-panel {
      position: fixed; right: 16px; top: 16px; z-index: ${z};
      width: 360px; max-height: calc(100vh - 32px); overflow: auto;
      background: rgba(10,20,35,.95); border: 1px solid rgba(100,255,218,.35);
      border-radius: 8px; padding: 12px; font: 12px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: #e6f1ff; box-shadow: 0 6px 30px rgba(0,0,0,.45);
    }
    #tuner-panel h3 { margin: 0 0 8px; font-size: 14px; color: #64ffda; }
    #tuner-panel .row { display: grid; grid-template-columns: 1fr 58px 58px; gap: 6px; align-items: center; margin: 6px 0; }
    #tuner-panel label { opacity: .9; }
    #tuner-panel input[type="range"] { width: 100%; }
    #tuner-panel input[type="number"] { width: 56px; padding: 4px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.15); color: #e6f1ff; border-radius: 4px; }
    #tuner-panel select { width: 100%; padding: 4px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.15); color: #e6f1ff; border-radius: 4px; }
    #tuner-panel .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    #tuner-panel button { padding: 8px; background: rgba(17,34,64,.9); color: #64ffda; border: 1px solid #64ffda55; border-radius: 6px; cursor: pointer; }
    #tuner-panel button:hover { background: rgba(17,34,64,1); }
    #tuner-panel .sep { height: 1px; background: rgba(255,255,255,.08); margin: 8px 0; }
    .tuner-outline { outline: 1px dashed rgba(100,255,218,.9) !important; outline-offset: -1px; }
  `;
  document.head.appendChild(style);

  // Build panel
  const panel = document.createElement('div');
  panel.id = 'tuner-panel';
  panel.innerHTML = `
    <h3>Bridge Transform Tuner (temp)</h3>
    <div class="row" style="grid-template-columns: 1fr;">
      <select id="tuner-target"></select>
    </div>

    <div class="sep"></div>

    <div class="row"><label>Top %</label><input id="topRange" type="range" min="-10" max="110" step="0.1"><input id="topNum" type="number" step="0.1"></div>
    <div class="row"><label>Left %</label><input id="leftRange" type="range" min="-10" max="110" step="0.1"><input id="leftNum" type="number" step="0.1"></div>
    <div class="row"><label>Width %</label><input id="widthRange" type="range" min="1" max="100" step="0.1"><input id="widthNum" type="number" step="0.1"></div>
    <div class="row"><label>Height %</label><input id="heightRange" type="range" min="1" max="100" step="0.1"><input id="heightNum" type="number" step="0.1"></div>

    <div class="sep"></div>

    <div class="row"><label>RotateX °</label><input id="rxRange" type="range" min="-89" max="89" step="0.1"><input id="rxNum" type="number" step="0.1"></div>
    <div class="row"><label>RotateY °</label><input id="ryRange" type="range" min="-89" max="89" step="0.1"><input id="ryNum" type="number" step="0.1"></div>
    <div class="row"><label>RotateZ °</label><input id="rzRange" type="range" min="-180" max="180" step="0.1"><input id="rzNum" type="number" step="0.1"></div>

    <div class="row"><label>SkewX °</label><input id="skxRange" type="range" min="-45" max="45" step="0.1"><input id="skxNum" type="number" step="0.1"></div>
    <div class="row"><label>SkewY °</label><input id="skyRange" type="range" min="-45" max="45" step="0.1"><input id="skyNum" type="number" step="0.1"></div>

    <div class="row"><label>Scale</label><input id="sRange" type="range" min="0.5" max="2" step="0.01"><input id="sNum" type="number" step="0.01"></div>

    <div class="row" style="grid-template-columns: 1fr;">
      <label>Transform origin</label>
      <select id="originSel">
        <option>center center</option>
        <option>top left</option>
        <option>top center</option>
        <option>top right</option>
        <option>center left</option>
        <option>center right</option>
        <option>bottom left</option>
        <option>bottom center</option>
        <option>bottom right</option>
      </select>
    </div>

    <div class="sep"></div>

    <div class="btns">
      <button id="toggleOutline">Toggle outlines</button>
      <button id="copyCSS">Copy CSS</button>
    </div>
    <div class="btns" style="margin-top:6px;">
      <button id="resetEl">Reset element</button>
      <button id="resetAll">Reset ALL</button>
    </div>
  `;
  document.body.appendChild(panel);

  // State
  const targets = TUNABLE_SELECTORS
    .map(sel => $$(sel))
    .flat()
    .filter((el, i, arr) => arr.indexOf(el) === i);

  const targetSel = $('#tuner-target');
  targets.forEach((el, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = el.id ? `#${el.id}` : (el.className ? `.${el.className}` : el.tagName.toLowerCase());
    targetSel.appendChild(opt);
  });

  if (!targets.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No tunable elements found';
    targetSel.appendChild(opt);
  }

  // Inputs
  const inputs = {
    top: [$('#topRange'), $('#topNum')],
    left: [$('#leftRange'), $('#leftNum')],
    width: [$('#widthRange'), $('#widthNum')],
    height: [$('#heightRange'), $('#heightNum')],
    rx: [$('#rxRange'), $('#rxNum')],
    ry: [$('#ryRange'), $('#ryNum')],
    rz: [$('#rzRange'), $('#rzNum')],
    skx: [$('#skxRange'), $('#skxNum')],
    sky: [$('#skyRange'), $('#skyNum')],
    s: [$('#sRange'), $('#sNum')],
    origin: $('#originSel'),
  };

  // LocalStorage keys
  const keyFor = (el) => `tuner:${location.pathname}:${el.tagName}:${el.id}:${el.className}`;

  // Apply to element
  function apply(el, state) {
    el.style.top = `${state.top}%`;
    el.style.left = `${state.left}%`;
    el.style.width = `${state.width}%`;
    el.style.height = `${state.height}%`;
    el.style.transformOrigin = state.origin;

    // Build transform
    const t = [];
    if (state.s !== 1) t.push(`scale(${state.s})`);
    if (state.rx || state.ry || state.rz) {
      if (state.rx) t.push(`rotateX(${state.rx}deg)`);
      if (state.ry) t.push(`rotateY(${state.ry}deg)`);
      if (state.rz) t.push(`rotateZ(${state.rz}deg)`);
    }
    if (state.skx || state.sky) {
      t.push(`skew(${state.skx}deg, ${state.sky}deg)`);
    }
    el.style.transform = t.join(' ') || 'none';
  }

  function read(el) {
    const cs = getComputedStyle(el);
    const parsePct = (prop) => parseFloat(cs[prop]) / parseFloat(getComputedStyle(el.parentElement)[prop]) * 100;
    // Try to read existing percentages; fall back to defaults
    const topPct = parseFloat(cs.top) ? (cs.top.endsWith('%') ? parseFloat(cs.top) : (parseFloat(cs.top) / el.parentElement.clientHeight * 100)) : 0;
    const leftPct = parseFloat(cs.left) ? (cs.left.endsWith('%') ? parseFloat(cs.left) : (parseFloat(cs.left) / el.parentElement.clientWidth * 100)) : 0;
    const widthPct = cs.width.endsWith('%') ? parseFloat(cs.width) : (el.clientWidth / el.parentElement.clientWidth * 100);
    const heightPct = cs.height.endsWith('%') ? parseFloat(cs.height) : (el.clientHeight / el.parentElement.clientHeight * 100);

    // Transform parsing (simple)
    const m = cs.transform === 'none' ? null : cs.transform;
    let rx=0, ry=0, rz=0, skx=0, sky=0, s=1;
    // We won’t fully parse matrix3d; we rely on saved state or sliders.
    const saved = JSON.parse(localStorage.getItem(keyFor(el)) || 'null');

    return saved || {
      top: Number.isFinite(topPct) ? topPct : 0,
      left: Number.isFinite(leftPct) ? leftPct : 0,
      width: Number.isFinite(widthPct) ? widthPct : 10,
      height: Number.isFinite(heightPct) ? heightPct : 10,
      rx, ry, rz, skx, sky, s,
      origin: cs.transformOrigin || 'center center',
    };
  }

  function writeInputs(state) {
    const setPair = (pair, v) => { pair[0].value = v; pair[1].value = v; };
    setPair(inputs.top, state.top);
    setPair(inputs.left, state.left);
    setPair(inputs.width, state.width);
    setPair(inputs.height, state.height);
    setPair(inputs.rx, state.rx);
    setPair(inputs.ry, state.ry);
    setPair(inputs.rz, state.rz);
    setPair(inputs.skx, state.skx);
    setPair(inputs.sky, state.sky);
    setPair(inputs.s, state.s);
    inputs.origin.value = state.origin;
  }

  function currentEl() {
    const idx = parseInt(targetSel.value, 10) || 0;
    return targets[idx];
  }

  function currentState() {
    const el = currentEl();
    return JSON.parse(localStorage.getItem(keyFor(el)) || 'null') || read(el);
  }

  function save(el, state) {
    localStorage.setItem(keyFor(el), JSON.stringify(state));
  }

  // Sync handlers
  function bindPair(name, min, max) {
    const [range, num] = inputs[name];
    const handler = () => {
      const el = currentEl();
      if (!el) return;
      const st = currentState();
      let v = parseFloat(range.value);
      if (Number.isFinite(parseFloat(num.value)) && document.activeElement === num) v = parseFloat(num.value);
      if (min !== undefined) v = clamp(v, min, max);
      st[name] = v;
      range.value = v; num.value = v;
      apply(el, st); save(el, st);
    };
    range.addEventListener('input', handler);
    num.addEventListener('input', handler);
  }

  bindPair('top', -10, 110);
  bindPair('left', -10, 110);
  bindPair('width', 1, 100);
  bindPair('height', 1, 100);
  bindPair('rx', -89, 89);
  bindPair('ry', -89, 89);
  bindPair('rz', -180, 180);
  bindPair('skx', -45, 45);
  bindPair('sky', -45, 45);
  bindPair('s', 0.5, 2);

  inputs.origin.addEventListener('change', () => {
    const el = currentEl(); if (!el) return;
    const st = currentState();
    st.origin = inputs.origin.value;
    apply(el, st); save(el, st);
  });

  // Outline toggle
  $('#toggleOutline').addEventListener('click', () => {
    targets.forEach(el => el.classList.toggle('tuner-outline'));
  });

  // Copy CSS
  $('#copyCSS').addEventListener('click', async () => {
    const el = currentEl(); if (!el) return;
    const st = currentState();
    const sel = el.id ? `#${el.id}` :
                (el.className ? '.' + [...el.classList].join('.') : el.tagName.toLowerCase());
    const css = `${sel} {
  top: ${st.top}%;
  left: ${st.left}%;
  width: ${st.width}%;
  height: ${st.height}%;
  transform-origin: ${st.origin};
  transform: ${[
    st.s !== 1 ? `scale(${st.s})` : '',
    st.rx ? `rotateX(${st.rx}deg)` : '',
    st.ry ? `rotateY(${st.ry}deg)` : '',
    st.rz ? `rotateZ(${st.rz}deg)` : '',
    (st.skx || st.sky) ? `skew(${st.skx}deg, ${st.sky}deg)` : ''
  ].filter(Boolean).join(' ') || 'none'};
}`;
    try {
      await navigator.clipboard.writeText(css);
      alert('CSS copied to clipboard!');
    } catch {
      console.log(css);
      alert('Could not access clipboard. CSS printed to console.');
    }
  });

  // Reset buttons
  $('#resetEl').addEventListener('click', () => {
    const el = currentEl(); if (!el) return;
    localStorage.removeItem(keyFor(el));
    const st = read(el);
    writeInputs(st); apply(el, st); save(el, st);
  });
  $('#resetAll').addEventListener('click', () => {
    targets.forEach(el => localStorage.removeItem(keyFor(el)));
    const el = currentEl(); if (!el) return;
    const st = read(el);
    writeInputs(st); apply(el, st); save(el, st);
  });

  // Initialize first selection
  if (targets.length) {
    const el = currentEl();
    const st = read(el);
    writeInputs(st); apply(el, st); save(el, st);
  }
})();