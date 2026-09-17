import { SIZES, FORMATIONS, buildFormation } from './formations.js';
import { PITCH_THEMES, PATTERNS, EXPORT_FORMATS, TOKEN_FACTOR, pitchGeometry, drawPitch, drawKit, renderLineup, labelFor } from './render.js';

const STORE_KEY = 'lineupbuilder.v2';
const CITY_BLUE = '#6cabdd';
const CITY_NAVY = '#1c2c5b';
const COLORS = [CITY_BLUE, CITY_NAVY, '#d62839', '#9f1239', '#f97316', '#facc15', '#16a34a', '#0f766e', '#1d4ed8', '#6d28d9', '#111827', '#ffffff'];

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const ICONS = {
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  bench: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
};

function icon(name, size = 16) {
  const t = document.createElement('template');
  t.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.flat().filter((c) => c != null && c !== false));
  return n;
}

/* ================================================================ state */

// state.slots holds every spot on the pitch. Formation spots (f: true) come first and
// persist while empty; free spots (f: false) are added anywhere and vanish once empty.

let state = load() || createState();
let editing = null; // { pid } or { slot } (an empty formation spot)
let geo = null;
let drag = null;

function createState() {
  return {
    v: 2,
    seq: 0,
    mode: 'formation',
    teamName: '',
    subtitle: '',
    coach: '',
    size: 11,
    formation: '4-3-3',
    kit: { primary: CITY_BLUE, secondary: '#ffffff', number: CITY_NAVY, pattern: 'solid' },
    gkKit: { primary: '#facc15', secondary: '#111827', number: '#111827', pattern: 'solid' },
    pitch: 'classic',
    token: 'shirt',
    show: { names: true, numbers: true, roles: false },
    export: { format: 'wide', title: true, bench: true, scale: 1 },
    bulkTarget: 'pitch',
    players: {},
    slots: formationSlots('4-3-3'),
    bench: [],
  };
}

function formationSlots(name, pids = []) {
  return buildFormation(name).map((s, i) => ({ ...s, f: true, pid: pids[i] ?? null }));
}

function newPlayer(props = {}) {
  state.seq += 1;
  const id = `p${state.seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  state.players[id] = { id, name: '', number: '', captain: false, gk: false, kit: null, ...props };
  return id;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.v === 2 && Array.isArray(s.slots) && Array.isArray(s.bench) && s.players) {
      const base = createState();
      return { ...base, ...s, export: { ...base.export, ...s.export }, show: { ...base.show, ...s.show } };
    }
  } catch {
    /* storage unavailable or corrupt */
  }
  return null;
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, 200);
}

const kitFor = (p, gk) => p.kit || (gk ? state.gkKit : state.kit);
const isGKSpot = (slot, p) => (slot.f ? slot.role === 'GK' : !!p?.gk);

function roleOf(slot, p) {
  if (slot.f) return slot.role;
  if (p?.gk) return 'GK';
  return slot.x < 0.36 ? 'DEF' : slot.x < 0.66 ? 'MID' : 'FWD';
}

function tokenFactor() {
  const base = state.mode === 'free' ? TOKEN_FACTOR[11] : TOKEN_FACTOR[state.size];
  const n = state.slots.filter((s) => s.pid).length;
  return n > 14 ? base * Math.max(0.72, Math.sqrt(14 / n)) : base;
}

function locate(pid) {
  const i = state.slots.findIndex((s) => s.pid === pid);
  if (i >= 0) return { where: 'slot', i };
  const b = state.bench.indexOf(pid);
  return b >= 0 ? { where: 'bench', i: b } : null;
}

function nextNumber() {
  const used = new Set(Object.values(state.players).map((p) => Number(p.number)).filter(Boolean));
  for (let n = 1; n < 100; n++) if (!used.has(n)) return String(n);
  return '';
}

// Open positions on the pitch that don't overlap anyone already placed.
function freeSpots(count, gk) {
  const taken = state.slots.filter((s) => s.pid).map((s) => ({ x: s.x, y: s.y }));
  const candidates = [];
  if (gk) {
    for (const x of [0.05, 0.13]) for (const y of [0.5, 0.3, 0.7, 0.12, 0.88]) candidates.push({ x, y });
  } else {
    const rows = [0.12, 0.31, 0.5, 0.69, 0.88];
    for (const x of [0.22, 0.38, 0.54, 0.7, 0.86]) for (const y of rows) candidates.push({ x, y });
    for (const x of [0.3, 0.46, 0.62, 0.78]) for (const y of [0.215, 0.405, 0.595, 0.785]) candidates.push({ x, y });
  }
  const out = [];
  for (const c of candidates) {
    if (out.length >= count) break;
    if (taken.every((t) => Math.hypot(t.x - c.x, (t.y - c.y) * 0.65) > 0.095)) {
      out.push(c);
      taken.push(c);
    }
  }
  return out;
}

function prune() {
  state.slots = state.slots.filter((s) => s.f || s.pid);
}

function setFormation(name) {
  const fixed = state.slots.filter((s) => s.f).map((s) => s.pid);
  state.formation = name;
  state.slots = [...formationSlots(name, fixed), ...state.slots.filter((s) => !s.f)];
}

function setSize(n) {
  if (n === state.size) return;
  const fixed = state.slots.filter((s) => s.f).map((s) => s.pid);
  state.size = n;
  state.formation = FORMATIONS[n][0];
  state.bench.unshift(...fixed.slice(n).filter(Boolean));
  state.slots = [...formationSlots(state.formation, fixed), ...state.slots.filter((s) => !s.f)];
  if (editing?.slot != null) closeEditor();
}

function setMode(mode) {
  if (mode === state.mode) return;
  if (editing?.slot != null) closeEditor();
  const filled = state.slots.filter((s) => s.pid);
  if (mode === 'free') {
    state.slots = filled.map((s) => ({ x: s.x, y: s.y, f: false, pid: s.pid }));
  } else {
    // Snap players into the formation: a goalkeeper in goal, outfielders back to front.
    const gk = filled.find((s) => state.players[s.pid].gk);
    const outfield = filled.filter((s) => !state.players[s.pid].gk).sort((a, b) => a.x - b.x || a.y - b.y);
    const slots = formationSlots(state.formation);
    const used = new Set();
    if (gk) {
      slots[0].pid = gk.pid;
      used.add(gk);
    }
    slots.slice(1).forEach((slot, i) => {
      if (outfield[i]) {
        slot.pid = outfield[i].pid;
        used.add(outfield[i]);
      }
    });
    state.slots = slots;
    // Anyone left over stays on the pitch, nudged into open space if they now overlap someone.
    for (const s of filled.filter((x) => !used.has(x))) {
      const p = state.players[s.pid];
      const crowded = state.slots.some((o) => o.pid && Math.hypot(o.x - s.x, (o.y - s.y) * 0.65) < 0.06);
      const [pos] = crowded ? freeSpots(1, p.gk) : [];
      state.slots.push({ x: pos ? pos.x : s.x, y: pos ? pos.y : s.y, f: false, pid: s.pid });
    }
  }
  state.mode = mode;
}

function substitute(pid, slotIndex) {
  const bi = state.bench.indexOf(pid);
  const slot = state.slots[slotIndex];
  if (bi < 0 || !slot) return;
  if (slot.pid) state.bench[bi] = slot.pid;
  else state.bench.splice(bi, 1);
  slot.pid = pid;
}

// Place a player on the pitch: at a given point, else an empty formation spot, else any open
// space (in formation mode only when extras are allowed).
function placeOnPitch(pid, at, allowExtra = true) {
  if (at) {
    state.slots.push({ x: clamp(at.x, 0, 1), y: clamp(at.y, 0, 1), f: false, pid });
    return true;
  }
  const gk = state.players[pid].gk;
  if (state.mode === 'formation') {
    const i = state.slots.findIndex((s) => s.f && !s.pid && (s.role === 'GK') === gk);
    if (i >= 0) {
      state.slots[i].pid = pid;
      return true;
    }
    if (!allowExtra) return false;
  }
  const [pos] = freeSpots(1, gk);
  if (!pos) return false;
  state.slots.push({ ...pos, f: false, pid });
  return true;
}

function commit() {
  prune();
  save();
  renderToolbar();
  renderTokens();
  renderBench();
  if (editing) renderDrawer();
}

/* ======================================================== shared widgets */

function kitCanvas(size, kit, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const box = Math.ceil(size * 1.3);
  const c = document.createElement('canvas');
  c.width = Math.round(box * dpr);
  c.height = Math.round(box * dpr);
  c.style.width = `${box}px`;
  c.style.height = `${box}px`;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  drawKit(ctx, box / 2, box / 2, size, kit, { style: state.token, pixelRatio: dpr, ...opts });
  return c;
}

function seg(options, value, onChange, cls = '') {
  const wrap = el('div', { class: `seg ${cls}`, role: 'group' });
  for (const o of options) {
    const b = el('button', { type: 'button', class: o.value === value ? 'on' : '', title: o.title }, o.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onChange(o.value);
    });
    wrap.append(b);
  }
  return wrap;
}

function toggle(label, on, onChange) {
  const b = el('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(on) }, el('span', { class: 'switch-track' }, el('span', { class: 'switch-thumb' })), el('span', {}, label));
  b.addEventListener('click', () => {
    on = !on;
    b.setAttribute('aria-checked', String(on));
    onChange(on);
  });
  return b;
}

const field = (label, control, cls = '') => el('div', { class: `field ${cls}` }, el('span', { class: 'field-label' }, label), control);

function colorPicker(value, onChange) {
  const wrap = el('div', { class: 'swatches' });
  const input = el('input', { type: 'color', value, 'aria-label': 'Custom colour' });
  const custom = el('label', { class: 'swatch custom', title: 'Custom colour' }, input);
  const mark = () => {
    wrap.querySelectorAll('.swatch[data-c]').forEach((b) => b.classList.toggle('on', b.dataset.c === value.toLowerCase()));
    custom.classList.toggle('on', !COLORS.includes(value.toLowerCase()));
    custom.style.setProperty('--c', value);
    input.value = value;
  };
  const set = (v) => {
    value = v;
    mark();
    onChange(v);
  };
  for (const c of COLORS) {
    wrap.append(el('button', { type: 'button', class: 'swatch', style: `--c:${c}`, title: c, dataset: { c }, onclick: () => set(c) }));
  }
  input.addEventListener('input', () => set(input.value));
  wrap.append(custom);
  mark();
  return wrap;
}

function kitEditor(kit, onChange) {
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  return el(
    'div',
    { class: 'kit-editor' },
    field('Pattern', seg(PATTERNS.map((p) => ({ value: p, label: cap(p) })), kit.pattern, (v) => { kit.pattern = v; onChange(); }, 'full')),
    field('Shirt', colorPicker(kit.primary, (v) => { kit.primary = v; onChange(); })),
    field('Trim & pattern', colorPicker(kit.secondary, (v) => { kit.secondary = v; onChange(); })),
    field('Number', colorPicker(kit.number, (v) => { kit.number = v; onChange(); })),
  );
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* =============================================================== toolbar */

function syncInput(sel, value) {
  const n = $(sel);
  if (document.activeElement !== n) n.value = value;
}

function renderToolbar() {
  syncInput('#teamName', state.teamName);
  syncInput('#subtitle', state.subtitle);
  syncInput('#coachName', state.coach);

  $('#modeSeg').replaceChildren(
    seg([{ value: 'formation', label: 'Formation', title: 'Pick a formation' }, { value: 'free', label: 'Freeform', title: 'Place any number of players anywhere' }], state.mode, (m) => { setMode(m); commit(); }),
  );
  const free = state.mode === 'free';
  $('#grpSize').hidden = free;
  $('#grpFormation').hidden = free;

  $('#sizeSeg').replaceChildren(
    seg(SIZES.map((n) => ({ value: n, label: `${n}v${n}`, title: `${n}-a-side` })), state.size, (n) => { setSize(n); commit(); }),
  );
  $('#formationSel').replaceChildren(...FORMATIONS[state.size].map((f) => el('option', { value: f, selected: f === state.formation }, f)));

  renderKitButtons();

  const theme = PITCH_THEMES[state.pitch] || PITCH_THEMES.classic;
  $('#pitchLabel').textContent = theme.name;
  $('#pitchSw').replaceChildren(
    ...Object.entries(PITCH_THEMES).map(([key, t]) =>
      el('button', {
        type: 'button',
        class: `pitch-sw${key === state.pitch ? ' on' : ''}`,
        title: t.name,
        'aria-label': `${t.name} pitch`,
        style: `--a:${t.a};--b:${t.b};--line:${t.line}`,
        onclick: () => { state.pitch = key; layoutStage(); commit(); },
      }),
    ),
  );

  $('#tokenSeg').replaceChildren(
    seg([{ value: 'shirt', label: 'Shirts' }, { value: 'disc', label: 'Discs' }], state.token, (v) => { state.token = v; commit(); }),
  );

  const chips = [['names', 'Names'], ['numbers', 'Numbers'], ['roles', 'Positions']];
  $('#showChips').replaceChildren(
    ...chips.map(([key, label]) =>
      el('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.show[key]), onclick: () => { state.show[key] = !state.show[key]; commit(); } }, label),
    ),
  );

  $('#bulkTarget').replaceChildren(
    seg([{ value: 'pitch', label: 'Pitch', title: 'Fill the pitch first; extras go to the bench' }, { value: 'bench', label: 'Bench' }], state.bulkTarget, (v) => { state.bulkTarget = v; save(); }),
  );

  const onPitch = state.slots.filter((s) => s.pid).length;
  $('#pitchCount').textContent = `${onPitch} on pitch · ${state.bench.length} on bench`;
  $('#clearPitchBtn').disabled = onPitch === 0;
}

function renderKitButtons() {
  $('#kitPreview').replaceChildren(kitCanvas(24, state.kit, { shadow: false }));
  $('#gkPreview').replaceChildren(kitCanvas(24, state.gkKit, { shadow: false }));
}

/* ================================================================= pitch */

const stage = $('#stage');
const pitchCanvas = $('#pitch');
const tokensEl = $('#tokens');

function layoutStage() {
  const w = stage.clientWidth;
  if (!w) return;
  const orient = w < 720 ? 'v' : 'h';
  const h = Math.round(orient === 'h' ? Math.max(w / 1.9, Math.min(w / 1.58, window.innerHeight - 170)) : w * 1.5);
  stage.style.height = `${h}px`;
  const dpr = window.devicePixelRatio || 1;
  pitchCanvas.width = Math.round(w * dpr);
  pitchCanvas.height = Math.round(h * dpr);
  pitchCanvas.style.width = `${w}px`;
  pitchCanvas.style.height = `${h}px`;
  const ctx = pitchCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  geo = pitchGeometry({ x: 0, y: 0, w, h }, orient);
  drawPitch(ctx, geo, state.pitch, 20);
  renderTokens();
}

function positionToken(t, slot) {
  const p = geo.map(slot.x, slot.y);
  t.style.left = `${p.x}px`;
  t.style.top = `${p.y}px`;
}

function renderTokens() {
  if (!geo || drag?.moved) return;
  const size = Math.round(clamp(geo.short * tokenFactor(), 28, 84));
  tokensEl.style.setProperty('--size', `${size}px`);
  tokensEl.style.setProperty('--fs', `${Math.max(11, size * 0.27)}px`);
  const box = Math.ceil(size * 1.3);

  tokensEl.replaceChildren(
    ...state.slots.map((slot, i) => {
      const p = state.players[slot.pid];
      const selected = editing && (editing.pid ? editing.pid === slot.pid : editing.slot === i);
      const t = el('div', { class: `token${p ? '' : ' empty'}${selected ? ' selected' : ''}`, dataset: { slot: i } });
      const label = el('div', { class: 'label' });
      const role = roleOf(slot, p);
      if (p) {
        const c = kitCanvas(size, kitFor(p, isGKSpot(slot, p)), { number: state.show.numbers ? p.number : '', captain: p.captain });
        c.className = 'kit';
        c.style.left = c.style.top = `${-box / 2}px`;
        t.append(c);
        const lab = labelFor(p.name, role, state.show);
        if (lab.main) label.append(el('span', { class: 'pill' }, lab.main));
        if (lab.sub) label.append(el('span', { class: 'role' }, lab.sub));
        t.title = `${p.name || 'Unnamed'}${p.number ? ` #${p.number}` : ''} · ${role}`;
      } else {
        t.append(el('div', { class: 'ring' }, '+'));
        label.append(el('span', { class: 'role' }, role));
        t.title = `Empty ${role} — click to fill`;
      }
      t.append(label);
      positionToken(t, slot);
      return t;
    }),
  );
  $('#stageEmpty').hidden = state.slots.some((s) => s.pid) || state.mode === 'formation';
}

function addPlayerToPitch(at) {
  const pid = newPlayer({ number: nextNumber() });
  if (!placeOnPitch(pid, at)) {
    state.bench.push(pid);
    toast('No open space on the pitch — added to the bench');
  }
  commit();
  openEditor({ pid }, true);
}

/* ================================================================= bench */

const benchEl = $('#bench');
const benchGrid = $('#benchGrid');

function renderBench() {
  if (drag?.moved) return;
  $('#benchCount').textContent = state.bench.length;
  benchGrid.replaceChildren(
    ...state.bench.map((pid) => {
      const p = state.players[pid];
      const selected = editing?.pid === pid;
      return el(
        'div',
        { class: `sub-card${selected ? ' selected' : ''}`, dataset: { pid }, title: 'Drag onto the pitch to bring on' },
        el('div', { class: 'sub-kit' }, kitCanvas(38, kitFor(p, p.gk), { number: state.show.numbers ? p.number : '', captain: p.captain })),
        el(
          'div',
          { class: 'sub-info' },
          el('div', { class: `sub-name${p.name ? '' : ' muted'}` }, p.name || 'Unnamed'),
          el('div', { class: 'sub-meta' }, [p.gk ? 'Goalkeeper' : 'Substitute', p.number ? `#${p.number}` : ''].filter(Boolean).join(' · ')),
        ),
        el('span', { class: 'sub-edit', 'aria-hidden': 'true' }, icon('pencil', 14)),
      );
    }),
    el('button', { type: 'button', class: 'add-card', onclick: addSub }, icon('plus'), 'Add substitute'),
  );
}

function addSub() {
  const pid = newPlayer({ number: nextNumber() });
  state.bench.push(pid);
  commit();
  openEditor({ pid }, true);
}

/* ============================================================= bulk add */

// "Haaland 9", "9 Haaland", "Haaland (9)", "#9 Haaland" or just "Haaland".
function parseList(text) {
  return text
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      let m = t.match(/^#?(\d{1,2})[.):\-\s]+(.+)$/);
      if (m) return { number: m[1], name: m[2].trim() };
      m = t.match(/^(.+?)\s*(?:\(|#|-|\s)\s*(\d{1,2})\)?$/);
      if (m) return { name: m[1].trim(), number: m[2] };
      return { name: t, number: '' };
    });
}

function bulkAdd() {
  const outfield = parseList($('#bulkPlayers').value);
  const keepers = parseList($('#bulkGks').value);
  if (!outfield.length && !keepers.length) {
    toast('Paste some player names first');
    $('#bulkPlayers').focus();
    return;
  }
  let pitch = 0;
  let bench = 0;
  const add = ({ name, number }, gk) => {
    const pid = newPlayer({ name: name.slice(0, 28), number, gk });
    if (state.bulkTarget === 'pitch' && placeOnPitch(pid, null, false)) pitch++;
    else {
      state.bench.push(pid);
      bench++;
    }
  };
  keepers.forEach((e) => add(e, true));
  outfield.forEach((e) => add(e, false));
  $('#bulkPlayers').value = '';
  $('#bulkGks').value = '';
  commit();
  const total = pitch + bench;
  const parts = [pitch && `${pitch} on the pitch`, bench && `${bench} on the bench`].filter(Boolean).join(', ');
  toast(`Added ${total} player${total === 1 ? '' : 's'} — ${parts}`);
}

/* ============================================================ drag & drop */

function hitTarget(x, y) {
  const n = document.elementFromPoint(x, y);
  if (!n) return null;
  const tok = n.closest('.token');
  if (tok && tok !== drag.el) return { kind: 'slot', i: Number(tok.dataset.slot), el: tok };
  const card = n.closest('.sub-card');
  if (card && card !== drag.el) return { kind: 'card', pid: card.dataset.pid, el: card };
  if (n.closest('#stage')) return { kind: 'pitch', el: drag.kind === 'bench' ? stage : null };
  if (n.closest('#bench')) return { kind: 'bench', el: drag.kind === 'slot' ? benchEl : null };
  return null;
}

function setTarget(t) {
  if (drag.target?.el === t?.el && drag.target?.kind === t?.kind) return;
  drag.target?.el?.classList.remove('drop-target');
  drag.target = t;
  t?.el?.classList.add('drop-target');
}

tokensEl.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('.token');
  if (!t || e.button !== 0) return;
  e.preventDefault();
  const i = Number(t.dataset.slot);
  const slot = state.slots[i];
  const r = stage.getBoundingClientRect();
  const c = geo.map(slot.x, slot.y);
  drag = { kind: 'slot', i, el: t, sx: e.clientX, sy: e.clientY, moved: false, ox: slot.x, oy: slot.y, offX: e.clientX - r.left - c.x, offY: e.clientY - r.top - c.y, target: null };
});

benchGrid.addEventListener('pointerdown', (e) => {
  const card = e.target.closest('.sub-card');
  if (!card || e.button !== 0) return;
  const canDrag = e.pointerType === 'mouse' || !!e.target.closest('.sub-kit');
  if (canDrag) e.preventDefault();
  drag = { kind: 'bench', pid: card.dataset.pid, el: card, sx: e.clientX, sy: e.clientY, moved: false, canDrag, target: null };
});

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    if (drag.kind === 'bench' && !drag.canDrag) {
      drag = null;
      return;
    }
    drag.moved = true;
    document.body.classList.add('is-dragging');
    if (drag.kind === 'slot') drag.el.classList.add('dragging');
    else {
      const p = state.players[drag.pid];
      drag.ghost = el('div', { class: 'drag-ghost' }, kitCanvas(52, kitFor(p, p.gk), { number: state.show.numbers ? p.number : '', captain: p.captain }), p.name ? el('span', { class: 'pill' }, p.name) : null);
      document.body.append(drag.ghost);
      drag.el.classList.add('lifting');
    }
    requestAnimationFrame(autoScroll);
  }
  updateDrag(e.clientX, e.clientY);
});

function updateDrag(x, y) {
  drag.lastX = x;
  drag.lastY = y;
  if (drag.kind === 'slot') {
    const r = stage.getBoundingClientRect();
    const pt = geo.unmap(x - r.left - drag.offX, y - r.top - drag.offY);
    const slot = state.slots[drag.i];
    slot.x = clamp(pt.x, -0.03, 1.03);
    slot.y = clamp(pt.y, -0.02, 1.02);
    positionToken(drag.el, slot);
  } else {
    drag.ghost.style.left = `${x}px`;
    drag.ghost.style.top = `${y}px`;
  }
  setTarget(hitTarget(x, y));
}

// Scroll the page while dragging near the top or bottom edge of the viewport.
function autoScroll() {
  if (!drag?.moved) return;
  const edge = 72;
  const y = drag.lastY;
  let dy = 0;
  if (y < edge) dy = -Math.ceil((edge - y) / 3);
  else if (y > window.innerHeight - edge) dy = Math.ceil((y - (window.innerHeight - edge)) / 3);
  if (dy) {
    const before = window.scrollY;
    window.scrollBy(0, dy);
    if (window.scrollY !== before) updateDrag(drag.lastX, drag.lastY);
  }
  requestAnimationFrame(autoScroll);
}

function endDrag() {
  drag.target?.el?.classList.remove('drop-target');
  drag.el.classList.remove('dragging', 'lifting');
  drag.ghost?.remove();
  document.body.classList.remove('is-dragging');
}

window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  endDrag();
  drag = null;

  if (!d.moved) {
    if (d.kind === 'slot') {
      const pid = state.slots[d.i].pid;
      openEditor(pid ? { pid } : { slot: d.i });
    } else openEditor({ pid: d.pid });
    return;
  }

  const tg = d.target;
  if (d.kind === 'slot') {
    const s = state.slots[d.i];
    const restore = () => Object.assign(s, { x: d.ox, y: d.oy });
    if (tg?.kind === 'slot' && tg.i !== d.i) {
      restore();
      const other = state.slots[tg.i];
      [s.pid, other.pid] = [other.pid, s.pid];
    } else if (tg?.kind === 'card') {
      restore();
      const bi = state.bench.indexOf(tg.pid);
      if (s.pid) state.bench[bi] = s.pid;
      else state.bench.splice(bi, 1);
      s.pid = tg.pid;
      toast('Substitution made');
    } else if (tg?.kind === 'bench') {
      restore();
      if (s.pid) {
        state.bench.push(s.pid);
        s.pid = null;
        toast('Moved to the bench');
      }
    }
  } else if (tg?.kind === 'slot') {
    substitute(d.pid, tg.i);
    toast('Substitution made');
  } else if (tg?.kind === 'pitch') {
    const r = stage.getBoundingClientRect();
    state.bench.splice(state.bench.indexOf(d.pid), 1);
    placeOnPitch(d.pid, geo.unmap(e.clientX - r.left, e.clientY - r.top));
  } else if (tg?.kind === 'card' && tg.pid !== d.pid) {
    state.bench.splice(state.bench.indexOf(d.pid), 1);
    state.bench.splice(state.bench.indexOf(tg.pid), 0, d.pid);
  }
  commit();
});

window.addEventListener('pointercancel', () => {
  if (!drag) return;
  const d = drag;
  endDrag();
  drag = null;
  if (d.kind === 'slot' && d.moved) Object.assign(state.slots[d.i], { x: d.ox, y: d.oy });
  commit();
});

stage.addEventListener('dblclick', (e) => {
  if (e.target.closest('.token')) return;
  const r = stage.getBoundingClientRect();
  const pt = geo.unmap(e.clientX - r.left, e.clientY - r.top);
  if (pt.x < -0.03 || pt.x > 1.03 || pt.y < -0.03 || pt.y > 1.03) return;
  addPlayerToPitch(pt);
});

/* ================================================================ editor */

const drawer = $('#drawer');
const drawerBody = $('#drawerBody');

function openEditor(ref, focusName = false) {
  editing = ref;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  renderDrawer();
  renderTokens();
  renderBench();
  if (focusName) $('#playerName')?.focus({ preventScroll: true });
}

function closeEditor() {
  if (!editing) return;
  editing = null;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  renderTokens();
  renderBench();
}

const closeButton = () => el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: closeEditor }, icon('x', 18));

function renderDrawer() {
  drawerBody.replaceChildren();
  if (!editing) return;
  if (editing.slot != null) return renderEmptySlot();

  const p = state.players[editing.pid];
  const loc = p && locate(p.id);
  if (!loc) return closeEditor();
  const onPitch = loc.where === 'slot';
  const slot = onPitch ? state.slots[loc.i] : null;
  const isGK = () => (onPitch ? isGKSpot(slot, p) : p.gk);

  const preview = el('div', { class: 'drawer-kit' });
  const title = el('h3');
  const meta = el('div', { class: 'drawer-meta' });
  const refreshHead = () => {
    preview.replaceChildren(kitCanvas(52, kitFor(p, isGK()), { number: p.number, captain: p.captain }));
    title.textContent = p.name || 'Unnamed player';
    title.classList.toggle('muted', !p.name);
    meta.textContent = onPitch ? `On the pitch · ${roleOf(slot, p)}` : `Substitute${p.gk ? ' · Goalkeeper' : ''}`;
  };
  const update = () => {
    refreshHead();
    save();
    renderTokens();
    renderBench();
  };
  refreshHead();

  const nameInput = el('input', { id: 'playerName', class: 'input', value: p.name, placeholder: 'Player name', maxlength: '28', autocomplete: 'off', spellcheck: 'false' });
  nameInput.addEventListener('input', () => { p.name = nameInput.value; update(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });
  const numInput = el('input', { class: 'input num', value: p.number, placeholder: '#', inputmode: 'numeric', maxlength: '2', autocomplete: 'off' });
  numInput.addEventListener('input', () => {
    numInput.value = numInput.value.replace(/\D/g, '').slice(0, 2);
    p.number = numInput.value;
    update();
  });

  const kitWrap = el('div', { class: 'kit-wrap' });
  const renderKit = () => {
    kitWrap.replaceChildren(
      seg([{ value: 'team', label: isGK() ? 'Goalkeeper kit' : 'Team kit' }, { value: 'custom', label: 'Custom kit' }], p.kit ? 'custom' : 'team', (v) => {
        p.kit = v === 'custom' ? { ...kitFor(p, isGK()) } : null;
        update();
        renderKit();
      }, 'full'),
      p.kit ? kitEditor(p.kit, update) : el('p', { class: 'note' }, 'Uses the shared kit. Change it from Kits in the toolbar, or switch to a custom kit for just this player.'),
    );
  };
  renderKit();

  const actions = el('div', { class: 'drawer-actions' });
  if (onPitch) {
    actions.append(
      el('button', { type: 'button', class: 'btn', onclick: () => { slot.pid = null; state.bench.push(p.id); commit(); toast('Moved to the bench'); } }, icon('bench'), 'Move to bench'),
      el('button', { type: 'button', class: 'btn danger', onclick: () => { slot.pid = null; delete state.players[p.id]; closeEditor(); commit(); } }, icon('trash'), 'Remove player'),
    );
  } else {
    const sel = el(
      'select',
      { class: 'input', 'aria-label': 'Bring on for' },
      el('option', { value: '' }, 'Bring on for…'),
      ...state.slots.map((s, i) => {
        const q = state.players[s.pid];
        const who = q ? q.name || (q.number ? `#${q.number}` : 'Unnamed') : 'Empty';
        return el('option', { value: String(i) }, `${roleOf(s, q)} — ${who}`);
      }),
    );
    sel.addEventListener('change', () => {
      if (sel.value === '') return;
      substitute(p.id, Number(sel.value));
      commit();
      toast('Substitution made');
    });
    actions.append(
      el('button', { type: 'button', class: 'btn', onclick: () => { state.bench.splice(state.bench.indexOf(p.id), 1); if (!placeOnPitch(p.id)) { state.bench.push(p.id); toast('No open space on the pitch'); } commit(); } }, icon('plus'), 'Put on the pitch'),
      field('Substitution', el('div', { class: 'select' }, sel)),
      el('button', { type: 'button', class: 'btn danger', onclick: () => { state.bench.splice(state.bench.indexOf(p.id), 1); delete state.players[p.id]; closeEditor(); commit(); } }, icon('trash'), 'Delete player'),
    );
  }

  drawerBody.append(
    el('div', { class: 'drawer-head' }, preview, el('div', { class: 'drawer-title' }, title, meta), closeButton()),
    el(
      'div',
      { class: 'drawer-section' },
      el('div', { class: 'section-title' }, 'Player'),
      el('div', { class: 'field-row' }, field('Name', nameInput, 'grow'), field('Number', numInput)),
      el(
        'div',
        { class: 'switches' },
        toggle('Captain', p.captain, (v) => {
          Object.values(state.players).forEach((x) => { x.captain = false; });
          p.captain = v;
          update();
        }),
        !slot?.f && toggle('Goalkeeper', p.gk, (v) => { p.gk = v; update(); renderKit(); }),
      ),
    ),
    el('div', { class: 'drawer-section' }, el('div', { class: 'section-title' }, 'Kit'), kitWrap),
    actions,
  );
}

function renderEmptySlot() {
  const i = editing.slot;
  const slot = state.slots[i];
  if (!slot) return closeEditor();
  if (slot.pid) {
    editing = { pid: slot.pid };
    return renderDrawer();
  }
  const fill = (pid) => {
    substitute(pid, i);
    editing = { pid };
    commit();
  };
  const create = () => {
    const pid = newPlayer({ number: slot.role === 'GK' ? '1' : nextNumber(), gk: slot.role === 'GK' });
    slot.pid = pid;
    editing = { pid };
    commit();
    $('#playerName')?.focus();
  };

  drawerBody.append(
    el('div', { class: 'drawer-head' }, el('div', { class: 'drawer-kit' }, el('div', { class: 'ring-lg' }, '+')), el('div', { class: 'drawer-title' }, el('h3', {}, 'Empty position'), el('div', { class: 'drawer-meta' }, slot.role)), closeButton()),
    el(
      'div',
      { class: 'drawer-section' },
      el('div', { class: 'section-title' }, 'Pick from the bench'),
      state.bench.length
        ? el(
            'div',
            { class: 'pick-list' },
            ...state.bench.map((pid) => {
              const p = state.players[pid];
              return el('button', { type: 'button', class: 'pick', onclick: () => fill(pid) }, kitCanvas(30, kitFor(p, slot.role === 'GK'), { number: p.number, shadow: false }), el('span', { class: p.name ? '' : 'muted' }, p.name || 'Unnamed'), p.number ? el('small', {}, `#${p.number}`) : null);
            }),
          )
        : el('p', { class: 'note' }, 'The bench is empty. Add players in bulk below the pitch, or create one here.'),
    ),
    el('div', { class: 'drawer-actions' }, el('button', { type: 'button', class: 'btn', onclick: create }, icon('plus'), 'Create new player')),
  );
}

/* ============================================================ kit popover */

const pop = $('#kitPop');
let popKey = null;

function openKitPop(btn, key) {
  if (popKey === key && !pop.hidden) return closePop();
  popKey = key;
  const preview = el('div', { class: 'pop-kit' });
  const draw = () => preview.replaceChildren(kitCanvas(40, state[key], { number: key === 'gkKit' ? '1' : '10' }));
  const refresh = () => {
    draw();
    save();
    renderTokens();
    renderBench();
    renderKitButtons();
    if (editing) renderDrawer();
  };
  pop.replaceChildren(
    el('div', { class: 'pop-head' }, preview, el('div', {}, el('strong', {}, key === 'kit' ? 'Outfield kit' : 'Goalkeeper kit'), el('small', {}, 'Applies to every player without a custom kit'))),
    kitEditor(state[key], refresh),
  );
  draw();
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.left = `${clamp(r.left, 12, window.innerWidth - pop.offsetWidth - 12)}px`;
  pop.style.top = `${r.bottom + window.scrollY + 8}px`;
  document.querySelectorAll('.kit-btn').forEach((b) => b.setAttribute('aria-expanded', String(b === btn)));
}

function closePop() {
  pop.hidden = true;
  popKey = null;
  document.querySelectorAll('.kit-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

/* ================================================================ export */

const modal = $('#exportModal');
const fontsReady = Promise.all(
  ['800 40px "Barlow Condensed"', '700 40px "Barlow Condensed"', '600 40px "Barlow Condensed"', '500 20px Inter', '600 20px Inter', '700 20px Inter'].map((f) => document.fonts.load(f)),
).catch(() => {});

function buildRenderData() {
  return {
    teamName: state.teamName,
    subtitle: state.subtitle,
    coach: state.coach,
    formation: state.mode === 'formation' ? state.formation : '',
    pitch: state.pitch,
    token: state.token,
    show: state.show,
    factor: tokenFactor(),
    accent: state.kit.primary,
    accent2: state.kit.secondary,
    starters: state.slots
      .filter((s) => s.pid)
      .map((s) => {
        const p = state.players[s.pid];
        return { x: s.x, y: s.y, role: roleOf(s, p), name: p.name, number: p.number, captain: p.captain, kit: kitFor(p, isGKSpot(s, p)) };
      }),
    bench: state.bench.map((pid) => {
      const p = state.players[pid];
      return { name: p.name, number: p.number, captain: p.captain, gk: p.gk, kit: kitFor(p, p.gk) };
    }),
  };
}

const currentFormat = () => EXPORT_FORMATS.find((f) => f.id === state.export.format) || EXPORT_FORMATS[1];

function openExport() {
  closePop();
  modal.hidden = false;
  document.body.classList.add('modal-open');
  renderExportSide();
  requestAnimationFrame(drawPreview);
}

function closeExport() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function renderExportSide() {
  const s = state.export;
  $('#formatList').replaceChildren(
    ...EXPORT_FORMATS.map((f) => {
      const k = 28 / Math.max(f.w, f.h);
      return el(
        'button',
        { type: 'button', class: `format${f.id === s.format ? ' on' : ''}`, onclick: () => { s.format = f.id; save(); renderExportSide(); drawPreview(); } },
        el('span', { class: 'format-icon' }, el('span', { style: `width:${Math.round(f.w * k)}px;height:${Math.round(f.h * k)}px` })),
        el('span', { class: 'format-text' }, el('strong', {}, f.name), el('small', {}, f.ratio)),
      );
    }),
  );
  $('#exportInclude').replaceChildren(
    ...[['title', 'Title & coach'], ['bench', 'Substitutes']].map(([key, label]) =>
      el('button', { type: 'button', class: 'chip', 'aria-pressed': String(s[key]), onclick: () => { s[key] = !s[key]; save(); renderExportSide(); drawPreview(); } }, label),
    ),
  );
  $('#exportQuality').replaceChildren(
    seg([{ value: 1, label: 'Standard' }, { value: 2, label: 'High · 2×' }], s.scale, (v) => { s.scale = v; save(); renderExportSide(); }, 'full'),
  );
  const f = currentFormat();
  $('#exportSize').textContent = `${f.w * s.scale} × ${f.h * s.scale} px`;
}

async function drawPreview() {
  if (modal.hidden) return;
  await fontsReady;
  const f = currentFormat();
  const box = $('#previewBox');
  const bw = box.clientWidth - 48;
  const bh = box.clientHeight - 48;
  if (bw <= 0 || bh <= 0) return;
  const k = Math.min(bw / f.w, bh / f.h);
  const c = $('#previewCanvas');
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.floor(f.w * k);
  const cssH = Math.floor(f.h * k);
  c.width = Math.round(cssW * dpr);
  c.height = Math.round(cssH * dpr);
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  const ctx = c.getContext('2d');
  ctx.setTransform(c.width / f.w, 0, 0, c.height / f.h, 0, 0);
  renderLineup(ctx, f.w, f.h, buildRenderData(), { ...state.export, pixelRatio: c.width / f.w });
}

function renderFull() {
  const f = currentFormat();
  const s = state.export.scale;
  const c = document.createElement('canvas');
  c.width = f.w * s;
  c.height = f.h * s;
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  renderLineup(ctx, f.w, f.h, buildRenderData(), { ...state.export, pixelRatio: s });
  return c;
}

const toBlob = (c) => new Promise((resolve) => c.toBlob(resolve, 'image/png'));
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');

async function downloadImage() {
  await fontsReady;
  const f = currentFormat();
  const blob = await toBlob(renderFull());
  if (!blob) return toast('Could not create the image');
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `${slug(state.teamName) || 'lineup'}-${f.id}-${f.ratio.replace(':', 'x')}.png` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Image downloaded');
}

async function copyImage() {
  try {
    const blob = fontsReady.then(() => toBlob(renderFull()));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Image copied to clipboard');
  } catch {
    toast('Copying images is not supported in this browser');
  }
}

/* ================================================================== init */

function init() {
  document.querySelectorAll('[data-icon]').forEach((n) => n.prepend(icon(n.dataset.icon)));

  const bindText = (sel, key) => {
    $(sel).addEventListener('input', (e) => { state[key] = e.target.value; save(); });
    $(sel).addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  };
  bindText('#teamName', 'teamName');
  bindText('#subtitle', 'subtitle');
  bindText('#coachName', 'coach');

  $('#formationSel').addEventListener('change', (e) => { setFormation(e.target.value); commit(); });
  $('#kitBtn').addEventListener('click', (e) => openKitPop(e.currentTarget, 'kit'));
  $('#gkBtn').addEventListener('click', (e) => openKitPop(e.currentTarget, 'gkKit'));

  $('#addPitchBtn').addEventListener('click', () => addPlayerToPitch());
  $('#clearPitchBtn').addEventListener('click', () => {
    const pids = state.slots.map((s) => s.pid).filter(Boolean);
    if (!pids.length) return;
    state.bench.unshift(...pids);
    state.slots.forEach((s) => { s.pid = null; });
    if (editing?.slot != null) closeEditor();
    commit();
    toast(`Moved ${pids.length} player${pids.length === 1 ? '' : 's'} to the bench`);
  });

  $('#bulkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    bulkAdd();
  });
  for (const sel of ['#bulkPlayers', '#bulkGks']) {
    $(sel).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        bulkAdd();
      }
    });
  }

  $('#resetBtn').addEventListener('click', () => {
    if (!window.confirm('Start over? All players, kits and settings will be cleared.')) return;
    state = createState();
    editing = null;
    drawer.classList.remove('open');
    closePop();
    layoutStage();
    commit();
    toast('Lineup cleared');
  });

  $('#exportBtn').addEventListener('click', openExport);
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeExport(); });
  $('#downloadBtn').addEventListener('click', downloadImage);
  if (window.ClipboardItem && navigator.clipboard?.write) $('#copyBtn').addEventListener('click', copyImage);
  else $('#copyBtn').hidden = true;

  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.kit-btn')) closePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!pop.hidden) closePop();
    else if (!modal.hidden) closeExport();
    else closeEditor();
  });

  let lastW = 0;
  new ResizeObserver(() => {
    if (stage.clientWidth !== lastW) {
      lastW = stage.clientWidth;
      layoutStage();
    }
  }).observe(stage);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layoutStage();
      closePop();
      drawPreview();
    }, 60);
  });

  renderToolbar();
  layoutStage();
  renderBench();
  fontsReady.then(() => {
    layoutStage();
    renderBench();
    renderKitButtons();
  });
}

init();
