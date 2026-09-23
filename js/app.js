import { SIZES, FORMATIONS, buildFormation } from './formations.js';
import { PITCH_THEMES, PATTERNS, EXPORT_FORMATS, TOKEN_FACTOR, pitchGeometry, drawPitch, drawKit, renderLineup, labelFor } from './render.js';
import { emptyAnalysis, drawAnalysis, hasMarkings } from './analysis.js';
import { createAnalysis } from './analysis-ui.js';
import { createLibrary } from './library.js';

const STORE_KEY = 'lineupbuilder.v2';
const CITY_BLUE = '#6cabdd';
const CITY_NAVY = '#1c2c5b';
const OPP_RED = '#d62839';
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
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  analysis: '<path d="M4 19c3-1 4.5-4 6-7s3.5-5 7-6"/><path d="m14 4 3.2 2L15 9"/><circle cx="5" cy="6" r="2"/><path d="M15 16l4 4M19 16l-4 4"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
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
let analysis = null; // analysis-mode controller, created in init()
let library = null; // saved-lineups controller, created in init()

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
    oppKit: { primary: OPP_RED, secondary: '#ffffff', number: '#ffffff', pattern: 'solid' },
    oppGkKit: { primary: '#16a34a', secondary: '#ffffff', number: '#ffffff', pattern: 'solid' },
    opp: { show: true, name: '', coach: '', shape: '4-3-3', layout: 'half', target: 'pitch' },
    oppBench: [],
    tokenScale: 1,
    pitch: 'classic',
    token: 'shirt',
    show: { names: true, numbers: true, roles: false },
    export: { format: 'wide', title: true, bench: true, analysis: true, scale: 1 },
    bulkTarget: 'pitch',
    analysis: emptyAnalysis(),
    savedId: null,
    players: {},
    slots: formationSlots('4-3-3'),
    bench: [],
  };
}

// With both teams shown in "own halves", each formation is packed into its own half.
const toHalf = (x) => 0.035 + x * 0.53;

function formationSlots(name, pids = [], half = false) {
  return buildFormation(name).map((s, i) => ({ ...s, x: half ? toHalf(s.x) : s.x, f: true, pid: pids[i] ?? null }));
}

function newPlayer(props = {}) {
  state.seq += 1;
  const id = `p${state.seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  state.players[id] = { id, name: '', number: '', captain: false, gk: false, kit: null, ...props };
  return id;
}

// Fill in any fields missing from older saves.
function normalize(s) {
  const base = createState();
  const a = s.analysis || {};
  return {
    ...base,
    ...s,
    export: { ...base.export, ...s.export },
    show: { ...base.show, ...s.show },
    opp: { ...base.opp, ...s.opp },
    analysis: { ...base.analysis, ...a, overlays: { ...base.analysis.overlays, ...a.overlays }, style: { ...base.analysis.style, ...a.style } },
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.v === 2 && Array.isArray(s.slots) && Array.isArray(s.bench) && s.players) return normalize(s);
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
    library?.updateIndicator();
  }, 200);
}

/* Teams: every player has team 'home' (default) or 'away'. Away players only ever stand on the
   pitch in free spots; they have no bench and never fill your formation. */
const isAway = (p) => p?.team === 'away';
const slotIsAway = (s) => isAway(state.players[s.pid]);
// Spots that are drawn and exported: the opposition can be hidden as a whole.
const visibleSlot = (s) => !slotIsAway(s) || state.opp.show;
const awayPids = () => state.slots.filter(slotIsAway).map((s) => s.pid);
const halfLayout = () => state.opp.layout === 'half' && awayPids().length > 0;
// Each team has its own bench.
const benchOf = (pid) => (isAway(state.players[pid]) ? state.oppBench : state.bench);

function kitFor(p, gk) {
  if (p.kit) return p.kit;
  if (isAway(p)) return gk ? state.oppGkKit : state.oppKit;
  return gk ? state.gkKit : state.kit;
}

// Where a player (or the ball) stands on the pitch, ignoring any running animation.
function posOf(pid) {
  if (pid === 'ball') return state.analysis.items.find((i) => i.type === 'ball')?.pts[0] || null;
  const s = state.slots.find((x) => x.pid === pid);
  return s && visibleSlot(s) ? { x: s.x, y: s.y } : null;
}

// Drop a deleted player's runs, spotlights and links.
function forgetPlayer(pid) {
  const a = state.analysis;
  delete a.paths[pid];
  a.spotlight = a.spotlight.filter((x) => x.pid !== pid);
  for (const it of a.items) if (it.type === 'link') it.pids = it.pids.filter((x) => x !== pid);
  a.items = a.items.filter((it) => it.type !== 'link' || it.pids.length > 1);
}

function removePlayer(pid) {
  const i = state.slots.findIndex((s) => s.pid === pid);
  if (i >= 0) state.slots[i].pid = null;
  for (const bench of [state.bench, state.oppBench]) {
    const b = bench.indexOf(pid);
    if (b >= 0) bench.splice(b, 1);
  }
  delete state.players[pid];
  forgetPlayer(pid);
}

const hasContent = () => Object.keys(state.players).length > 0 || !!state.teamName.trim() || hasMarkings(state.analysis);
const onScreenTokenSize = () => (geo ? Math.round(clamp(geo.short * tokenFactor(), 20, 110)) : 40);
const isGKSpot = (slot, p) => (slot.f ? slot.role === 'GK' : !!p?.gk);

function roleOf(slot, p) {
  if (slot.f) return slot.role;
  if (p?.gk) return 'GK';
  const x = isAway(p) ? 1 - slot.x : slot.x;
  return x < 0.36 ? 'DEF' : x < 0.66 ? 'MID' : 'FWD';
}

// Token size relative to the pitch: the format's base size, shrunk a little when the pitch is
// crowded, then the user's own scale on top.
function tokenFactor() {
  const base = state.mode === 'free' ? TOKEN_FACTOR[11] : TOKEN_FACTOR[state.size];
  const n = state.slots.filter((s) => s.pid && visibleSlot(s)).length;
  const crowd = n > 14 ? Math.max(0.72, Math.sqrt(14 / n)) : 1;
  return base * crowd * (state.tokenScale || 1);
}

function locate(pid) {
  const i = state.slots.findIndex((s) => s.pid === pid);
  if (i >= 0) return { where: 'slot', i };
  const b = benchOf(pid).indexOf(pid);
  return b >= 0 ? { where: 'bench', i: b } : null;
}

function nextNumber(team = 'home') {
  const used = new Set(Object.values(state.players).filter((p) => (p.team || 'home') === team).map((p) => Number(p.number)).filter(Boolean));
  for (let n = 1; n < 100; n++) if (!used.has(n)) return String(n);
  return '';
}

// Open positions that don't overlap anyone already placed. The opposition's are mirrored:
// they defend the right-hand goal.
function freeSpots(count, gk, team = 'home') {
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
  for (const c0 of candidates) {
    if (out.length >= count) break;
    const c = team === 'away' ? { x: 1 - c0.x, y: 1 - c0.y } : c0;
    if (taken.every((t) => Math.hypot(t.x - c.x, (t.y - c.y) * 0.65) > 0.095)) {
      out.push(c);
      taken.push(c);
    }
  }
  return out;
}

// The opposition's formation, turned round to attack from right to left.
const oppShapeSlots = () =>
  buildFormation(state.opp.shape).map((s) => ({ x: 1 - (state.opp.layout === 'half' ? toHalf(s.x) : s.x), y: 1 - s.y, role: s.role }));

// Re-lay both teams after the opposition appears, disappears or changes layout.
function relayout() {
  if (state.mode === 'formation') setFormation(state.formation);
  arrangeOpposition();
}

// Snap the opposition into their shape: keeper in goal, outfielders back to front.
function arrangeOpposition() {
  const spots = state.slots.filter(slotIsAway);
  const shape = oppShapeSlots();
  const gk = spots.find((s) => state.players[s.pid].gk);
  const outfield = spots.filter((s) => s !== gk).sort((a, b) => b.x - a.x || b.y - a.y);
  if (gk) Object.assign(gk, { x: shape[0].x, y: shape[0].y });
  outfield.slice(0, shape.length - 1).forEach((s, i) => Object.assign(s, { x: shape[i + 1].x, y: shape[i + 1].y }));
}

// First position in the opposition's shape nobody from their team is standing on.
function openOppShapeSpot(gk) {
  const taken = state.slots.filter(slotIsAway);
  const shape = oppShapeSlots();
  const choices = gk ? shape.slice(0, 1) : shape.slice(1);
  return choices.find((c) => taken.every((t) => Math.hypot(t.x - c.x, t.y - c.y) > 0.03)) || null;
}

function prune() {
  state.slots = state.slots.filter((s) => s.f || s.pid);
}

function setFormation(name) {
  const fixed = state.slots.filter((s) => s.f).map((s) => s.pid);
  state.formation = name;
  state.slots = [...formationSlots(name, fixed, halfLayout()), ...state.slots.filter((s) => !s.f)];
}

function setSize(n) {
  if (n === state.size) return;
  const fixed = state.slots.filter((s) => s.f).map((s) => s.pid);
  state.size = n;
  state.formation = FORMATIONS[n][0];
  state.bench.unshift(...fixed.slice(n).filter(Boolean));
  state.slots = [...formationSlots(state.formation, fixed, halfLayout()), ...state.slots.filter((s) => !s.f)];
  if (editing?.slot != null) closeEditor();
}

function setMode(mode) {
  if (mode === state.mode) return;
  if (editing?.slot != null) closeEditor();
  const away = state.slots.filter((s) => s.pid && slotIsAway(s));
  const filled = state.slots.filter((s) => s.pid && !slotIsAway(s));
  if (mode === 'free') {
    state.slots = [...filled.map((s) => ({ x: s.x, y: s.y, f: false, pid: s.pid })), ...away];
  } else {
    // Snap players into the formation: a goalkeeper in goal, outfielders back to front.
    const gk = filled.find((s) => state.players[s.pid].gk);
    const outfield = filled.filter((s) => !state.players[s.pid].gk).sort((a, b) => a.x - b.x || a.y - b.y);
    const slots = formationSlots(state.formation, [], halfLayout());
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
    state.slots = [...slots, ...away];
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

// Bring a substitute on for whoever is in a spot. Only works within a team; the
// opposition never fills your empty formation spots.
function substitute(pid, slotIndex) {
  const bench = benchOf(pid);
  const bi = bench.indexOf(pid);
  const slot = state.slots[slotIndex];
  if (bi < 0 || !slot) return false;
  const away = isAway(state.players[pid]);
  if (slot.pid ? slotIsAway(slot) !== away : away) return false;
  if (slot.pid) bench[bi] = slot.pid;
  else bench.splice(bi, 1);
  slot.pid = pid;
  return true;
}

// Place a player on the pitch: at a given point, else an empty formation spot (or, for the
// opposition, an open spot in their shape), else any open space — in formation mode only
// when extras are allowed.
function placeOnPitch(pid, at, allowExtra = true) {
  if (at) {
    state.slots.push({ x: clamp(at.x, 0, 1), y: clamp(at.y, 0, 1), f: false, pid });
    return true;
  }
  const p = state.players[pid];
  if (isAway(p)) {
    const pos = openOppShapeSpot(p.gk) || (allowExtra ? freeSpots(1, p.gk, 'away')[0] : null);
    if (!pos) return false;
    state.slots.push({ x: pos.x, y: pos.y, f: false, pid });
    return true;
  }
  if (state.mode === 'formation') {
    const i = state.slots.findIndex((s) => s.f && !s.pid && (s.role === 'GK') === p.gk);
    if (i >= 0) {
      state.slots[i].pid = pid;
      return true;
    }
    if (!allowExtra) return false;
  }
  const [pos] = freeSpots(1, p.gk);
  if (!pos) return false;
  state.slots.push({ ...pos, f: false, pid });
  return true;
}

let lastHalf = null;

function commit() {
  prune();
  // Opposition arriving on (or leaving) the pitch repacks your formation into its half.
  const half = halfLayout();
  if (lastHalf !== null && half !== lastHalf && state.mode === 'formation') setFormation(state.formation);
  lastHalf = half;
  save();
  renderToolbar();
  renderTokens();
  renderBench();
  renderOpposition();
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

  const onPitch = state.slots.filter((s) => s.pid && !slotIsAway(s)).length;
  const opp = awayPids().length;
  $('#pitchCount').textContent = `${onPitch} on pitch · ${state.bench.length} on bench${opp ? ` · ${opp} opposition` : ''}`;
  $('#clearPitchBtn').disabled = onPitch === 0;
  $('#clearStartersBtn').disabled = onPitch === 0;
  renderSizeControl();
}

function renderSizeControl() {
  const pct = Math.round((state.tokenScale || 1) * 100);
  const range = $('#sizeRange');
  if (document.activeElement !== range) range.value = String(pct);
  $('#sizeValue').textContent = `${pct}%`;
  $('#sizeDown').disabled = pct <= 60;
  $('#sizeUp').disabled = pct >= 140;
}

function setTokenScale(pct) {
  state.tokenScale = clamp(Math.round(pct / 5) * 5, 60, 140) / 100;
  save();
  renderSizeControl();
  renderTokens();
}

// Every kit preview on the page (toolbar and opposition panel); keeper kits show a 1.
function renderKitButtons() {
  document.querySelectorAll('[data-kit-preview]').forEach((n) => {
    const key = n.dataset.kitPreview;
    n.replaceChildren(kitCanvas(24, state[key], { shadow: false, number: key.endsWith('GkKit') || key === 'gkKit' ? '1' : '' }));
  });
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
  for (const layer of [$('#analysisLayer'), $('#analysisTop')]) {
    layer.width = pitchCanvas.width;
    layer.height = pitchCanvas.height;
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
  }
  const ctx = pitchCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  geo = pitchGeometry({ x: 0, y: 0, w, h }, orient);
  drawPitch(ctx, geo, state.pitch, 20);
  renderTokens();
}

function positionToken(t, slot) {
  const at = (slot.pid && analysis?.displayPos(slot.pid)) || slot;
  const p = geo.map(at.x, at.y);
  t.style.left = `${p.x}px`;
  t.style.top = `${p.y}px`;
}

function renderTokens() {
  if (!geo || drag?.moved) return;
  const size = onScreenTokenSize();
  tokensEl.style.setProperty('--size', `${size}px`);
  tokensEl.style.setProperty('--fs', `${Math.max(10, size * 0.27)}px`);
  const box = Math.ceil(size * 1.3);

  tokensEl.replaceChildren(
    ...state.slots.map((slot, i) => {
      if (!visibleSlot(slot)) return null;
      const p = state.players[slot.pid];
      const selected = editing && (editing.pid ? editing.pid === slot.pid : editing.slot === i);
      const t = el('div', { class: `token${p ? '' : ' empty'}${isAway(p) ? ' away' : ''}${selected ? ' selected' : ''}`, dataset: { slot: i } });
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
    }).filter(Boolean),
  );
  $('#stageEmpty').hidden = state.slots.some((s) => s.pid) || state.mode === 'formation' || !!analysis?.isOpen();
  analysis?.render();
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
  $('#benchClearBtn').disabled = !state.bench.length;
  benchGrid.replaceChildren(...state.bench.map((pid) => subCard(pid, 38)), el('button', { type: 'button', class: 'add-card', onclick: addSub }, icon('plus'), 'Add substitute'));
}

function subCard(pid, kitSize) {
  const p = state.players[pid];
  const selected = editing?.pid === pid;
  return el(
    'div',
    { class: `sub-card${selected ? ' selected' : ''}`, dataset: { pid }, title: 'Drag onto the pitch to bring on' },
    el('div', { class: 'sub-kit' }, kitCanvas(kitSize, kitFor(p, p.gk), { number: state.show.numbers ? p.number : '', captain: p.captain })),
    el(
      'div',
      { class: 'sub-info' },
      el('div', { class: `sub-name${p.name ? '' : ' muted'}` }, p.name || 'Unnamed'),
      el('div', { class: 'sub-meta' }, [p.gk ? 'Goalkeeper' : 'Substitute', p.number ? `#${p.number}` : ''].filter(Boolean).join(' · ')),
    ),
    el('span', { class: 'sub-edit', 'aria-hidden': 'true' }, icon('pencil', 14)),
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

// Delete a group of players after confirming.
function clearPlayers(pids, what) {
  if (!pids.length || !window.confirm(`Remove ${pids.length} ${what}? This can't be undone.`)) return;
  pids.forEach(removePlayer);
  if (editing?.pid && !state.players[editing.pid]) closeEditor();
  commit();
  toast(`Removed ${pids.length} ${what}`);
}

/* ============================================================ opposition */

function renderOpposition() {
  const o = state.opp;
  syncInput('#oppName', o.name);
  syncInput('#oppCoach', o.coach);
  const pids = awayPids();
  $('#oppCount').textContent = pids.length + state.oppBench.length;
  $('#oppTarget').replaceChildren(
    seg([{ value: 'pitch', label: 'Pitch', title: 'Fill their shape first; extras go to their bench' }, { value: 'bench', label: 'Bench' }], o.target, (v) => { o.target = v; save(); }),
  );
  $('#oppBenchCount').textContent = state.oppBench.length;
  $('#oppBenchClearBtn').disabled = !state.oppBench.length;
  $('#oppBenchTitle').textContent = o.name.trim() || 'Opposition';
  $('#oppBenchGrid').replaceChildren(
    ...state.oppBench.map((pid) => subCard(pid, 38)),
    el('button', { type: 'button', class: 'add-card opp', onclick: addOppSub }, icon('plus'), 'Add substitute'),
  );
  $('#oppShow').setAttribute('aria-checked', String(o.show));
  const shape = $('#oppShape');
  if (!shape.options.length) {
    for (const n of [11, 9, 7, 5]) shape.append(el('optgroup', { label: `${n}v${n}` }, ...FORMATIONS[n].map((f) => el('option', { value: f }, f))));
  }
  shape.value = o.shape;
  $('#oppColors').replaceChildren(
    colorPicker(state.oppKit.primary, (v) => {
      state.oppKit.primary = v;
      save();
      renderTokens();
      renderKitButtons();
      renderOppList();
    }),
  );
  $('#oppLayout').replaceChildren(
    seg([{ value: 'half', label: 'Own halves', title: 'Each team in its own half, like a match lineup graphic' }, { value: 'full', label: 'Full pitch', title: 'Both teams across the whole pitch, as they line up against each other' }], o.layout, (v) => {
      o.layout = v;
      relayout();
      commit();
    }, 'full'),
  );
  $('#oppClear').disabled = !pids.length && !state.oppBench.length;
  $('#oppArrange').disabled = !pids.length;
  renderOppList();
}

function renderOppList() {
  const players = awayPids().map((pid) => state.players[pid]).sort((a, b) => Number(b.gk) - Number(a.gk) || (Number(a.number) || 99) - (Number(b.number) || 99));
  $('#oppList').replaceChildren(
    ...players.map((p) =>
      el(
        'button',
        { type: 'button', class: `opp-chip${editing?.pid === p.id ? ' selected' : ''}`, title: 'Edit player', onclick: () => openEditor({ pid: p.id }) },
        kitCanvas(20, kitFor(p, p.gk), { shadow: false }),
        p.number ? el('b', {}, p.number) : null,
        el('span', { class: p.name ? '' : 'muted' }, p.name || 'Unnamed'),
      ),
    ),
  );
}

function addOpposition() {
  const outfield = parseList($('#oppPlayers').value);
  const keepers = parseList($('#oppGks').value);
  if (!outfield.length && !keepers.length) {
    toast('Paste some opposition names first');
    $('#oppPlayers').focus();
    return;
  }
  let placed = 0;
  let benched = 0;
  const add = ({ name, number }, gk) => {
    const pid = newPlayer({ name: name.slice(0, 28), number, gk, team: 'away' });
    if (state.opp.target === 'pitch' && placeOnPitch(pid, null, false)) placed++;
    else {
      state.oppBench.push(pid);
      benched++;
    }
  };
  const wasEmpty = awayPids().length === 0;
  keepers.forEach((e) => add(e, true));
  outfield.forEach((e) => add(e, false));
  if (wasEmpty && state.mode === 'formation') setFormation(state.formation);
  state.opp.show = true;
  $('#oppPlayers').value = '';
  $('#oppGks').value = '';
  commit();
  const total = placed + benched;
  const parts = [placed && `${placed} on the pitch`, benched && `${benched} on their bench`].filter(Boolean).join(', ');
  toast(`Added ${total} opposition player${total === 1 ? '' : 's'} — ${parts}`);
}

function addOppSub() {
  const pid = newPlayer({ number: nextNumber('away'), team: 'away' });
  state.oppBench.push(pid);
  commit();
  openEditor({ pid }, true);
}

function addOneOpponent() {
  const wasEmpty = awayPids().length === 0;
  const pid = newPlayer({ number: nextNumber('away'), team: 'away' });
  if (!placeOnPitch(pid)) {
    delete state.players[pid];
    toast('No open space on the pitch');
    return;
  }
  if (wasEmpty && state.mode === 'formation') setFormation(state.formation);
  state.opp.show = true;
  commit();
  openEditor({ pid }, true);
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
  const oppBenchEl = n.closest('#oppBench');
  if (oppBenchEl) return { kind: 'oppbench', el: drag.kind === 'slot' ? oppBenchEl : null };
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
  if (analysis?.handleTokenDown(e, Number(t.dataset.slot))) return;
  e.preventDefault();
  const i = Number(t.dataset.slot);
  const slot = state.slots[i];
  const r = stage.getBoundingClientRect();
  const c = geo.map(slot.x, slot.y);
  drag = { kind: 'slot', i, el: t, sx: e.clientX, sy: e.clientY, moved: false, ox: slot.x, oy: slot.y, offX: e.clientX - r.left - c.x, offY: e.clientY - r.top - c.y, target: null };
});

function benchPointerDown(e) {
  const card = e.target.closest('.sub-card');
  if (!card || e.button !== 0) return;
  const canDrag = e.pointerType === 'mouse' || !!e.target.closest('.sub-kit');
  if (canDrag) e.preventDefault();
  drag = { kind: 'bench', pid: card.dataset.pid, el: card, sx: e.clientX, sy: e.clientY, moved: false, canDrag, target: null };
}
benchGrid.addEventListener('pointerdown', benchPointerDown);
$('#oppBenchGrid').addEventListener('pointerdown', benchPointerDown);

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
    analysis?.render();
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
    const away = slotIsAway(s);
    const other = tg?.kind === 'slot' ? state.slots[tg.i] : null;
    // Players only swap with their own team; dropped on an opponent they simply stay put.
    const sameTeam = other && (other.pid ? slotIsAway(other) === away : !away);
    if (other && tg.i !== d.i && sameTeam) {
      restore();
      [s.pid, other.pid] = [other.pid, s.pid];
    } else if (tg?.kind === 'card' || tg?.kind === 'bench' || tg?.kind === 'oppbench') {
      restore();
      const toAway = tg.kind === 'oppbench' || (tg.kind === 'card' && isAway(state.players[tg.pid]));
      if (toAway !== away) toast(away ? 'Opposition players go on the opposition bench' : 'Your players go on your bench');
      else if (tg.kind === 'card') substitute(tg.pid, d.i) && toast('Substitution made');
      else if (s.pid) {
        benchOf(s.pid).push(s.pid);
        s.pid = null;
        toast('Moved to the bench');
      }
    }
  } else if (tg?.kind === 'slot' && substitute(d.pid, tg.i)) {
    toast('Substitution made');
  } else if (tg?.kind === 'pitch' || tg?.kind === 'slot') {
    const r = stage.getBoundingClientRect();
    const bench = benchOf(d.pid);
    bench.splice(bench.indexOf(d.pid), 1);
    placeOnPitch(d.pid, geo.unmap(e.clientX - r.left, e.clientY - r.top));
  } else if (tg?.kind === 'card' && tg.pid !== d.pid && benchOf(tg.pid) === benchOf(d.pid)) {
    const bench = benchOf(d.pid);
    bench.splice(bench.indexOf(d.pid), 1);
    bench.splice(bench.indexOf(tg.pid), 0, d.pid);
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
  if (analysis?.consumesDblclick(e) || e.target.closest('.token')) return;
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
  renderOppList();
  if (focusName) $('#playerName')?.focus({ preventScroll: true });
}

function closeEditor() {
  if (!editing) return;
  editing = null;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  renderTokens();
  renderBench();
  renderOppList();
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
    meta.textContent = isAway(p) ? `Opposition${state.opp.name ? ` · ${state.opp.name}` : ''} · ${onPitch ? roleOf(slot, p) : 'Substitute'}` : onPitch ? `On the pitch · ${roleOf(slot, p)}` : `Substitute${p.gk ? ' · Goalkeeper' : ''}`;
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
  const bench = benchOf(p.id);
  if (onPitch) {
    actions.append(
      el('button', { type: 'button', class: 'btn', onclick: () => { slot.pid = null; bench.push(p.id); commit(); toast('Moved to the bench'); } }, icon('bench'), 'Move to bench'),
      el('button', { type: 'button', class: 'btn danger', onclick: () => { removePlayer(p.id); closeEditor(); commit(); } }, icon('trash'), 'Remove player'),
    );
  } else {
    const sel = el(
      'select',
      { class: 'input', 'aria-label': 'Bring on for' },
      el('option', { value: '' }, 'Bring on for…'),
      ...state.slots.map((s, i) => {
        if (s.pid ? slotIsAway(s) !== isAway(p) : isAway(p)) return null;
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
      el('button', { type: 'button', class: 'btn', onclick: () => { bench.splice(bench.indexOf(p.id), 1); if (!placeOnPitch(p.id)) { bench.push(p.id); toast('No open space on the pitch'); } commit(); } }, icon('plus'), 'Put on the pitch'),
      field('Substitution', el('div', { class: 'select' }, sel)),
      el('button', { type: 'button', class: 'btn danger', onclick: () => { removePlayer(p.id); closeEditor(); commit(); } }, icon('trash'), 'Delete player'),
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
          Object.values(state.players).filter((x) => isAway(x) === isAway(p)).forEach((x) => { x.captain = false; });
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
  const isKeeper = key === 'gkKit' || key === 'oppGkKit';
  const title = { kit: 'Outfield kit', gkKit: 'Goalkeeper kit', oppKit: 'Opposition kit', oppGkKit: 'Opposition goalkeeper' }[key];
  const draw = () => preview.replaceChildren(kitCanvas(40, state[key], { number: isKeeper ? '1' : '10' }));
  const refresh = () => {
    draw();
    save();
    renderTokens();
    renderBench();
    renderKitButtons();
    renderOpposition();
    if (editing) renderDrawer();
  };
  pop.replaceChildren(
    el('div', { class: 'pop-head' }, preview, el('div', {}, el('strong', {}, title), el('small', {}, 'Applies to every player without a custom kit'))),
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

function benchEntry(pid) {
  const p = state.players[pid];
  return { name: p.name, number: p.number, captain: p.captain, gk: p.gk, kit: kitFor(p, p.gk) };
}

function buildRenderData() {
  return {
    teamName: state.teamName,
    subtitle: [state.opp.show && awayPids().length && state.opp.name.trim() ? `vs ${state.opp.name.trim()}` : '', state.subtitle.trim()].filter(Boolean).join(' · '),
    coach: state.coach,
    oppCoach: state.opp.show ? state.opp.coach : '',
    formation: [state.mode === 'formation' ? state.formation : '', state.opp.show && awayPids().length ? state.opp.shape : ''].filter(Boolean).join(' v '),
    pitch: state.pitch,
    token: state.token,
    show: state.show,
    factor: tokenFactor(),
    accent: state.kit.primary,
    accent2: state.kit.secondary,
    starters: state.slots
      .filter((s) => s.pid && visibleSlot(s))
      .map((s) => {
        const p = state.players[s.pid];
        return { x: s.x, y: s.y, role: roleOf(s, p), name: p.name, number: p.number, captain: p.captain, kit: kitFor(p, isGKSpot(s, p)) };
      }),
    bench: state.bench.map(benchEntry),
    oppBench: state.opp.show ? state.oppBench.map(benchEntry) : [],
    oppName: state.opp.name,
  };
}

// Analysis markings for an exported image, drawn between the pitch and the players.
function underlay(include) {
  if (!include || !hasMarkings(state.analysis)) return null;
  return (ctx, g, tokenSize, pixelRatio, layer) => drawAnalysis(ctx, g, state.analysis, { pos: posOf, home: posOf, tokenSize, pixelRatio, image: analysis?.image() }, layer);
}

function thumbnail() {
  try {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    renderLineup(c.getContext('2d'), 640, 360, buildRenderData(), { title: false, bench: false, underlay: underlay(true) });
    return c.toDataURL('image/jpeg', 0.8);
  } catch {
    return '';
  }
}

// The saved form of a lineup: everything except per-browser preferences.
function snapshot() {
  const { savedId, export: _export, bulkTarget, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

function loadSnapshot(data, id) {
  state = normalize({ ...data, export: state.export, bulkTarget: state.bulkTarget, savedId: id });
  lastHalf = null;
  editing = null;
  drawer.classList.remove('open');
  closePop();
  analysis.onStateReplaced();
  layoutStage();
  commit();
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
    ...[['title', 'Title & coach'], ['bench', 'Substitutes'], ['analysis', 'Analysis markings']].map(([key, label]) =>
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
  await analysis.ensureImage();
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
  renderLineup(ctx, f.w, f.h, buildRenderData(), { ...state.export, pixelRatio: c.width / f.w, underlay: underlay(state.export.analysis) });
}

function renderFull() {
  const f = currentFormat();
  const s = state.export.scale;
  const c = document.createElement('canvas');
  c.width = f.w * s;
  c.height = f.h * s;
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  renderLineup(ctx, f.w, f.h, buildRenderData(), { ...state.export, pixelRatio: s, underlay: underlay(state.export.analysis) });
  return c;
}

const toBlob = (c) => new Promise((resolve) => c.toBlob(resolve, 'image/png'));
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');

async function downloadImage() {
  await fontsReady;
  await analysis.ensureImage();
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
    const blob = Promise.all([fontsReady, analysis.ensureImage()]).then(() => toBlob(renderFull()));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Image copied to clipboard');
  } catch {
    toast('Copying images is not supported in this browser');
  }
}

/* ================================================================== init */

function init() {
  document.querySelectorAll('[data-icon]').forEach((n) => n.prepend(icon(n.dataset.icon)));

  analysis = createAnalysis({
    state: () => state,
    geo: () => geo,
    stage,
    canvas: $('#analysisLayer'),
    topCanvas: $('#analysisTop'),
    tokensEl,
    bar: $('#analysisBar'),
    tokenSize: onScreenTokenSize,
    posOf,
    slotIndexOf: (pid) => state.slots.findIndex((s) => s.pid === pid),
    renderTokens,
    applyPositions(moves) {
      for (const [pid, p] of moves) {
        const s = state.slots.find((x) => x.pid === pid);
        if (s) Object.assign(s, { x: clamp(p.x, -0.03, 1.03), y: clamp(p.y, -0.02, 1.02) });
      }
      commit();
    },
    save,
    toast,
    el,
  });

  library = createLibrary({
    el,
    icon,
    toast,
    snapshot,
    currentId: () => state.savedId,
    setCurrentId(id) {
      state.savedId = id;
      save();
    },
    load: loadSnapshot,
    thumb: thumbnail,
    hasContent,
    defaultName: () => [state.teamName.trim(), state.subtitle.trim()].filter(Boolean).join(' · ') || `Lineup ${new Date().toLocaleDateString()}`,
    summary: () => {
      const onPitch = state.slots.filter((s) => s.pid && !slotIsAway(s)).length;
      const opp = state.opp.name.trim();
      return {
        team: [state.teamName.trim(), opp && awayPids().length ? `vs ${opp}` : ''].filter(Boolean).join(' '),
        label: state.mode === 'formation' ? state.formation : 'Freeform',
        count: `${onPitch} on pitch${state.bench.length ? ` + ${state.bench.length} subs` : ''}`,
      };
    },
  });

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
    const home = state.slots.filter((s) => s.pid && !slotIsAway(s));
    const pids = home.map((s) => s.pid);
    if (!pids.length) return;
    state.bench.unshift(...pids);
    home.forEach((s) => { s.pid = null; });
    if (editing?.slot != null) closeEditor();
    commit();
    toast(`Moved ${pids.length} player${pids.length === 1 ? '' : 's'} to the bench`);
  });

  $('#clearStartersBtn').addEventListener('click', () => clearPlayers(state.slots.filter((s) => s.pid && !slotIsAway(s)).map((s) => s.pid), 'starting players'));
  $('#benchClearBtn').addEventListener('click', () => clearPlayers([...state.bench], 'substitutes'));
  $('#oppBenchClearBtn').addEventListener('click', () => clearPlayers([...state.oppBench], 'opposition substitutes'));

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

  $('#sizeRange').addEventListener('input', (e) => setTokenScale(Number(e.target.value)));
  $('#sizeDown').addEventListener('click', () => setTokenScale((state.tokenScale || 1) * 100 - 10));
  $('#sizeUp').addEventListener('click', () => setTokenScale((state.tokenScale || 1) * 100 + 10));

  $('#oppName').addEventListener('input', (e) => {
    state.opp.name = e.target.value;
    $('#oppBenchTitle').textContent = e.target.value.trim() || 'Opposition';
    save();
  });
  $('#oppCoach').addEventListener('input', (e) => {
    state.opp.coach = e.target.value;
    save();
  });
  $('#oppShape').addEventListener('change', (e) => {
    state.opp.shape = e.target.value;
    arrangeOpposition();
    commit();
  });
  $('#oppShow').addEventListener('click', () => {
    state.opp.show = !state.opp.show;
    if (!state.opp.show && editing?.pid && isAway(state.players[editing.pid])) closeEditor();
    commit();
  });
  for (const [id, key] of [['#oppKitBtn', 'oppKit'], ['#oppGkBtn', 'oppGkKit'], ['#tbOppKitBtn', 'oppKit'], ['#tbOppGkBtn', 'oppGkKit']]) {
    $(id).addEventListener('click', (e) => openKitPop(e.currentTarget, key));
  }
  $('#oppForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addOpposition();
  });
  for (const sel of ['#oppPlayers', '#oppGks']) {
    $(sel).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        addOpposition();
      }
    });
  }
  $('#oppAddOne').addEventListener('click', addOneOpponent);
  $('#oppArrange').addEventListener('click', () => {
    arrangeOpposition();
    commit();
    toast(`Opposition set out in a ${state.opp.shape}`);
  });
  $('#oppClear').addEventListener('click', () => {
    const pids = [...awayPids(), ...state.oppBench];
    if (!pids.length || !window.confirm(`Remove all ${pids.length} opposition players?`)) return;
    pids.forEach(removePlayer);
    if (state.mode === 'formation') setFormation(state.formation);
    if (editing?.pid && !state.players[editing.pid]) closeEditor();
    commit();
  });

  $('#resetBtn').addEventListener('click', () => {
    if (hasContent() && library.isDirty() && !window.confirm('Start a new lineup? Unsaved changes to the current one will be lost.')) return;
    state = { ...createState(), export: state.export, bulkTarget: state.bulkTarget };
    lastHalf = null;
    editing = null;
    drawer.classList.remove('open');
    closePop();
    analysis.onStateReplaced();
    layoutStage();
    commit();
    toast('New lineup');
  });

  // Theme only changes the interface; it's a per-browser preference, not part of a lineup.
  const themeBtn = $('#themeBtn');
  const syncThemeButton = () => {
    const light = document.documentElement.dataset.theme === 'light';
    const label = light ? 'Switch to dark theme' : 'Switch to light theme';
    themeBtn.title = label;
    themeBtn.setAttribute('aria-label', label);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', light ? '#eef1f5' : '#07090d');
  };
  themeBtn.addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    if (light) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('lineupbuilder.theme', light ? 'light' : 'dark');
    } catch {
      /* ignore */
    }
    syncThemeButton();
  });
  syncThemeButton();

  const analysisBtn = $('#analysisBtn');
  analysisBtn.addEventListener('click', () => {
    analysis.toggle();
    analysisBtn.setAttribute('aria-pressed', String(analysis.isOpen()));
    closeEditor();
    renderTokens();
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
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      library.quickSave();
      return;
    }
    if (e.key !== 'Escape') return;
    if (!pop.hidden) closePop();
    else if (library.isOpen()) library.close();
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

  analysis.ensureImage();
  renderToolbar();
  layoutStage();
  renderBench();
  renderOpposition();
  fontsReady.then(() => {
    layoutStage();
    renderBench();
    renderKitButtons();
    renderOppList();
  });
}

init();
