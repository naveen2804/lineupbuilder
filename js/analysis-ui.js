// Analysis mode: the tool palette and all pointer / keyboard interaction on the pitch.

import { MARK_COLORS, drawAnalysis, hitTest, simplify, pathLength, pointAlong, runPoints } from './analysis.js';

const ICONS = {
  select: '<path d="M4 3l7 17 2.4-7.1L20.5 10.5z"/>',
  pen: '<path d="M3 17c2.5-5 5-6.5 7-3.5s4.5 2.5 6.5-1.5S20 8 21 9"/>',
  line: '<path d="M5 19L19 5"/>',
  arrow: '<path d="M5 19L19 5"/><path d="M9 5h10v10"/>',
  measure: '<path d="M3 16.5L16.5 3l4.5 4.5L7.5 21z"/><path d="M7.5 12l2 2M10.5 9l2 2M13.5 6l2 2"/>',
  rect: '<rect x="3.5" y="6" width="17" height="12" rx="1.5" stroke-dasharray="3 2.4"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6.5" stroke-dasharray="3 2.4"/>',
  poly: '<path d="M12 3l8.5 6-3 11.5h-11L3.5 9z" stroke-dasharray="3 2.4"/>',
  run: '<circle cx="5" cy="18.5" r="2.5"/><path d="M7.5 18.5H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h8" stroke-dasharray="2.6 2.2"/><path d="m15.5 1.5 3 3-3 3"/>',
  link: '<circle cx="4.5" cy="12" r="2.3"/><circle cx="19.5" cy="5.5" r="2.3"/><circle cx="19.5" cy="18.5" r="2.3"/><path d="M6.7 11l10.6-4.6M6.7 13l10.6 4.6"/>',
  spot: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  opp: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l4 2.9-1.5 4.8h-5L8 10.4z"/>',
  text: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  back: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

const TOOLS = [
  [{ id: 'select', key: 'v', name: 'Select & move', hint: '<b>Select</b> — drag players and markings. Click a marking to select it, then restyle it or press Delete.' }],
  [
    { id: 'pen', key: 'p', name: 'Freehand', hint: '<b>Freehand</b> — draw anything. Switch on Arrowhead for curved runs and passes.' },
    { id: 'line', key: 'l', name: 'Line', hint: '<b>Line</b> — drag to draw a straight line, e.g. a defensive line or offside line.' },
    { id: 'arrow', key: 'a', name: 'Arrow', hint: '<b>Arrow</b> — drag to draw a pass, run or pressing direction. Use Dashed for runs.' },
    { id: 'measure', key: 'm', name: 'Measure distance', hint: '<b>Measure</b> — drag between two points to see the distance in metres.' },
  ],
  [
    { id: 'rect', key: 'r', name: 'Box zone', hint: '<b>Box zone</b> — drag to highlight an area of the pitch.' },
    { id: 'ellipse', key: 'e', name: 'Oval zone', hint: '<b>Oval zone</b> — drag to highlight a rounded area.' },
    { id: 'poly', key: 'g', name: 'Custom zone', hint: '<b>Custom zone</b> — click to add corners; click the first corner, double-click or press Enter to close it.' },
  ],
  [
    { id: 'run', key: 'w', name: 'Player run', hint: '<b>Player run</b> — drag from a player (or the ball) along the route they take, then press Play. Click a player to remove their run.' },
    { id: 'link', key: 'k', name: 'Link players', hint: '<b>Link players</b> — click players in turn to join them (a back line, a passing lane). Click the grass or press Enter to finish.' },
    { id: 'spot', key: 's', name: 'Spotlight', hint: '<b>Spotlight</b> — click players to highlight them. Click again to remove.' },
  ],
  [
    { id: 'opp', key: 'o', name: 'Opposition player', hint: '<b>Opposition</b> — click to place numbered opposition markers. Use Select to move them.' },
    { id: 'ball', key: 'b', name: 'Ball', hint: '<b>Ball</b> — click to place the ball. Draw a run from it to animate a pass.' },
    { id: 'text', key: 't', name: 'Text label', hint: '<b>Text</b> — click to add a label and press Enter to place it. Double-click a label in Select to edit it.' },
  ],
];
const ALL_TOOLS = TOOLS.flat();
const DRAW_TOOLS = new Set(['pen', 'line', 'arrow', 'measure', 'rect', 'ellipse', 'poly', 'opp', 'ball', 'text', 'run']);
const PLAYER_TOOLS = new Set(['run', 'link', 'spot']);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => `m${Math.random().toString(36).slice(2, 9)}`;
const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

function svg(name, size = 18) {
  const t = document.createElement('template');
  t.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return t.content.firstChild;
}

/**
 * api: { state(), geo(), stage, canvas, topCanvas, tokensEl, bar, tokenSize(), posOf(pid), slotIndexOf(pid),
 *        renderTokens(), applyPositions([[pid, {x, y}]]), save(), toast(msg), el }
 */
export function createAnalysis(api) {
  const { stage, canvas, topCanvas, tokensEl, bar, el, toast } = api;
  let open = false;
  let tool = 'select';
  let draft = null;
  let drag = null;
  let selected = null;
  let undoStack = [];
  let redoStack = [];
  let anim = null;
  let text = null;
  const ui = {};

  const A = () => api.state().analysis;
  const livePos = (pid) => anim?.pos.get(pid) || api.posOf(pid);
  const env = () => ({ pos: livePos, home: api.posOf, tokenSize: api.tokenSize(), selected, draft, pixelRatio: window.devicePixelRatio || 1 });
  const selectedItem = () => A().items.find((i) => i.id === selected) || null;

  /* ---------------------------------------------------------- render */

  function render() {
    const geo = api.geo();
    if (!geo) return;
    const dpr = window.devicePixelRatio || 1;
    const e = env();
    for (const [c, layer] of [[canvas, 'under'], [topCanvas, 'over']]) {
      const ctx = c.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      if (!A().visible && !(layer === 'over' && draft)) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawAnalysis(ctx, geo, A(), e, layer);
    }
  }

  /* --------------------------------------------------------- history */

  const snap = () => JSON.stringify({ items: A().items, paths: A().paths, spotlight: A().spotlight });

  function pushUndo() {
    undoStack.push(snap());
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }

  function changed() {
    api.save();
    render();
    renderBar();
  }

  function mutate(fn) {
    pushUndo();
    fn(A());
    A().visible = true;
    changed();
  }

  function restore(json) {
    Object.assign(A(), JSON.parse(json));
    selected = null;
    changed();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snap());
    restore(undoStack.pop());
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snap());
    restore(redoStack.pop());
  }

  /* ---------------------------------------------------------- pointer */

  function toPx(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function toPitch(e) {
    const p = toPx(e);
    const q = api.geo().unmap(p.x, p.y);
    return { x: clamp(q.x, -0.04, 1.04), y: clamp(q.y, -0.04, 1.04) };
  }

  const pxLen = (pts) => {
    const g = api.geo();
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = g.map(pts[i - 1].x, pts[i - 1].y);
      const b = g.map(pts[i].x, pts[i].y);
      d += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return d;
  };

  function styled(type, extra = {}) {
    const s = A().style;
    return { id: uid(), type, color: s.color, width: s.width, dashed: s.dashed, ...extra };
  }

  function capture(e) {
    try {
      stage.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  stage.addEventListener('pointerdown', (e) => {
    if (!open || e.button !== 0) return;
    if (e.target.closest('.token') || e.target.closest('.mark-text-input')) return;
    if (anim) stopAnimation();
    if (text) commitText();
    const pt = toPitch(e);
    const px = toPx(e);

    switch (tool) {
      case 'select': {
        const hit = hitTest(A(), api.geo(), px, env());
        selected = hit?.id || null;
        if (hit?.pts) {
          drag = { kind: 'move', item: hit, start: pt, orig: hit.pts.map((p) => ({ ...p })), moved: false };
          capture(e);
        }
        render();
        renderBar();
        return;
      }
      case 'pen':
      case 'line':
      case 'arrow':
      case 'measure':
      case 'rect':
      case 'ellipse':
        e.preventDefault();
        draft = styled(tool, tool === 'pen' ? { pts: [pt], head: A().style.head } : { pts: [pt, pt] });
        drag = { kind: 'draw' };
        capture(e);
        render();
        return;
      case 'poly':
        e.preventDefault();
        polyClick(pt, px, e.detail);
        return;
      case 'text':
        e.preventDefault();
        openText(pt);
        return;
      case 'opp': {
        e.preventDefault();
        const nums = A().items.filter((i) => i.type === 'opp').map((i) => Number(i.num) || 0);
        const it = { id: uid(), type: 'opp', color: A().oppColor, num: String(Math.max(0, ...nums) + 1), pts: [pt] };
        mutate((a) => a.items.push(it));
        drag = { kind: 'move', item: it, start: pt, orig: [{ ...pt }], moved: false, noUndo: true };
        capture(e);
        return;
      }
      case 'ball': {
        e.preventDefault();
        let it = A().items.find((i) => i.type === 'ball');
        mutate((a) => {
          if (it) it.pts = [pt];
          else {
            it = { id: uid(), type: 'ball', pts: [pt] };
            a.items.push(it);
          }
        });
        drag = { kind: 'move', item: it, start: pt, orig: [{ ...pt }], moved: false, noUndo: true };
        capture(e);
        return;
      }
      case 'run': {
        e.preventDefault();
        const ball = A().items.find((i) => i.type === 'ball');
        if (ball && hitTest({ items: [ball] }, api.geo(), px, env())) startRun('ball', e);
        else toast('Drag from a player or the ball to draw a run');
        return;
      }
      case 'link':
        if (draft?.type === 'link') finishLink();
        return;
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!open) return;
    const pt = toPitch(e);
    if (!drag) {
      if (draft && (draft.type === 'poly' || draft.type === 'link')) {
        draft.cursor = pt;
        render();
      }
      return;
    }
    if (drag.kind === 'draw' || drag.kind === 'run') {
      if (draft.type === 'pen') {
        const last = draft.pts[draft.pts.length - 1];
        const a = api.geo().map(last.x, last.y);
        const b = toPx(e);
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 3) draft.pts.push(pt);
      } else draft.pts[1] = pt;
      render();
    } else if (drag.kind === 'move') {
      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 0.003) return;
      if (!drag.moved && !drag.noUndo) pushUndo();
      drag.moved = true;
      drag.item.pts = drag.orig.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      render();
    }
  });

  stage.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'draw') finishDraw();
    else if (d.kind === 'run') finishRun(d);
    else if (d.moved) changed();
  });

  stage.addEventListener('pointercancel', () => {
    if (!drag) return;
    drag = null;
    draft = null;
    render();
  });

  function finishDraw() {
    const it = draft;
    draft = null;
    const minPx = it.type === 'pen' ? 8 : 6;
    if (it.pts.length < 2 || pxLen(it.pts) < minPx) return render();
    if (it.type === 'pen') it.pts = simplify(it.pts, 0.0025);
    mutate((a) => a.items.push(it));
  }

  /* ------------------------------------------------------------ runs */

  function startRun(pid, e) {
    const home = api.posOf(pid);
    if (!home) return;
    draft = { id: 'draft', type: 'pen', pts: [{ ...home }], color: A().style.color, width: 2, dashed: true, head: true };
    drag = { kind: 'run', pid, home };
    capture(e);
    render();
  }

  function finishRun(d) {
    const it = draft;
    draft = null;
    if (it.pts.length < 2 || pxLen(it.pts) < 14) {
      if (A().paths[d.pid]) {
        mutate((a) => delete a.paths[d.pid]);
        toast('Run removed');
      } else render();
      return;
    }
    const pts = simplify(it.pts, 0.0025).map((p) => ({ x: p.x - d.home.x, y: p.y - d.home.y }));
    mutate((a) => {
      a.paths[d.pid] = { pts, color: it.color };
    });
  }

  function play() {
    stopAnimation(false);
    const a = A();
    const entries = Object.entries(a.paths)
      .map(([pid, path]) => {
        const home = api.posOf(pid);
        if (!home) return null;
        const pts = runPoints(path, home);
        return { pid, pts, len: pathLength(pts) };
      })
      .filter((x) => x && x.len > 0.2);
    if (!entries.length) {
      toast('No runs yet — pick Player run and drag from a player');
      return;
    }
    const speed = a.speed || 1;
    const maxLen = Math.max(...entries.map((x) => x.len));
    for (const x of entries) x.dur = Math.max(600, (2800 * x.len) / maxLen) / speed;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
    anim = { pos: new Map(), entries, t0: performance.now(), done: false, raf: 0 };
    const step = (now) => {
      if (!anim) return;
      const elapsed = now - anim.t0;
      let running = false;
      for (const x of entries) {
        const t = Math.min(1, elapsed / x.dur);
        if (t < 1) running = true;
        anim.pos.set(x.pid, pointAlong(x.pts, ease(t) * x.len));
      }
      placeTokens();
      render();
      if (running) anim.raf = requestAnimationFrame(step);
      else {
        anim.done = true;
        renderBar();
      }
    };
    anim.raf = requestAnimationFrame(step);
    renderBar();
  }

  function placeTokens() {
    const g = api.geo();
    for (const [pid, p] of anim.pos) {
      if (pid === 'ball') continue;
      const t = tokensEl.querySelector(`.token[data-slot="${api.slotIndexOf(pid)}"]`);
      if (!t) continue;
      const q = g.map(p.x, p.y);
      t.style.left = `${q.x}px`;
      t.style.top = `${q.y}px`;
    }
  }

  function stopAnimation(refresh = true) {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    anim = null;
    if (refresh) {
      api.renderTokens();
      render();
      renderBar();
    }
  }

  function applyMoves() {
    if (!anim) return;
    const moves = [...anim.pos.entries()];
    stopAnimation(false);
    mutate((a) => {
      for (const [pid, p] of moves) {
        delete a.paths[pid];
        if (pid === 'ball') {
          const ball = a.items.find((i) => i.type === 'ball');
          if (ball) ball.pts = [p];
        }
      }
    });
    api.applyPositions(moves.filter(([pid]) => pid !== 'ball'));
    toast('Players moved to the end of their runs');
  }

  /* ---------------------------------------------------- zones & links */

  function polyClick(pt, px, clicks) {
    if (draft?.type !== 'poly') {
      draft = styled('poly', { pts: [pt], draft: true, cursor: pt });
      render();
      renderBar();
      return;
    }
    const first = api.geo().map(draft.pts[0].x, draft.pts[0].y);
    const nearFirst = Math.hypot(px.x - first.x, px.y - first.y) < 14;
    if (draft.pts.length >= 3 && (nearFirst || clicks >= 2)) return finishPoly();
    if (clicks >= 2) return;
    draft.pts.push(pt);
    render();
  }

  function finishPoly() {
    if (draft?.type !== 'poly') return;
    const it = draft;
    draft = null;
    delete it.draft;
    delete it.cursor;
    it.pts = it.pts.filter((p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 0.004);
    if (it.pts.length < 3) {
      render();
      renderBar();
      return;
    }
    mutate((a) => a.items.push(it));
  }

  function linkClick(pid) {
    if (draft?.type !== 'link') {
      draft = styled('link', { pids: [pid] });
      render();
      renderBar();
      return;
    }
    if (draft.pids[draft.pids.length - 1] === pid) return finishLink();
    draft.pids.push(pid);
    render();
  }

  function finishLink() {
    if (draft?.type !== 'link') return;
    const it = draft;
    draft = null;
    delete it.cursor;
    if (it.pids.length < 2) {
      render();
      renderBar();
      return;
    }
    mutate((a) => a.items.push(it));
  }

  function cancelDraft() {
    if (!draft) return false;
    draft = null;
    drag = null;
    render();
    renderBar();
    return true;
  }

  /* ------------------------------------------------------------ text */

  function openText(pt, item = null) {
    closeText();
    const p = api.geo().map(pt.x, pt.y);
    const input = el('input', { class: 'mark-text-input', value: item?.text || '', placeholder: 'Type a label', maxlength: '40', spellcheck: 'false' });
    input.style.left = `${p.x}px`;
    input.style.top = `${p.y}px`;
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commitText();
      else if (e.key === 'Escape') closeText();
    });
    input.addEventListener('blur', commitText);
    stage.append(input);
    text = { input, pt, item };
    requestAnimationFrame(() => {
      input.focus();
      if (item) input.select();
    });
  }

  function closeText() {
    if (!text) return;
    const t = text;
    text = null;
    t.input.remove();
  }

  function commitText() {
    if (!text) return;
    const { input, pt, item } = text;
    const value = input.value.trim();
    closeText();
    if (item) {
      if (value === item.text) return;
      mutate((a) => {
        if (value) item.text = value;
        else a.items = a.items.filter((i) => i !== item);
      });
    } else if (value) mutate((a) => a.items.push(styled('text', { pts: [pt], text: value })));
  }

  /* ------------------------------------------------------ public hooks */

  function handleTokenDown(e, slotIndex) {
    if (!open) return false;
    if (anim) {
      e.preventDefault();
      stopAnimation();
      return true;
    }
    if (tool === 'select') {
      // Labels are drawn above the players, so they get the click first.
      const labels = { items: A().items.filter((i) => i.type === 'text') };
      const hit = labels.items.length ? hitTest(labels, api.geo(), toPx(e), env()) : null;
      if (!hit) return false;
      e.preventDefault();
      if (text) commitText();
      selected = hit.id;
      drag = { kind: 'move', item: hit, start: toPitch(e), orig: hit.pts.map((p) => ({ ...p })), moved: false };
      capture(e);
      render();
      renderBar();
      return true;
    }
    if (!PLAYER_TOOLS.has(tool)) return false;
    e.preventDefault();
    if (text) commitText();
    const pid = api.state().slots[slotIndex]?.pid;
    if (!pid) return true;
    if (tool === 'run') startRun(pid, e);
    else if (tool === 'link') linkClick(pid);
    else if (tool === 'spot') {
      mutate((a) => {
        const k = a.spotlight.findIndex((s) => s.pid === pid);
        if (k >= 0) a.spotlight.splice(k, 1);
        else a.spotlight.push({ pid, color: a.style.color });
      });
    }
    return true;
  }

  function consumesDblclick(e) {
    if (!open) return false;
    if (tool !== 'select') return true;
    const hit = hitTest(A(), api.geo(), toPx(e), env());
    if (!hit) return false;
    if (hit.type === 'text') openText(hit.pts[0], hit);
    return true;
  }

  function setTool(id) {
    if (draft?.type === 'poly' && id !== 'poly') finishPoly();
    if (draft?.type === 'link' && id !== 'link') finishLink();
    closeText();
    tool = id;
    if (id !== 'select') selected = null;
    stage.dataset.tool = open ? id : '';
    stage.classList.toggle('tool-draw', open && DRAW_TOOLS.has(id) && !PLAYER_TOOLS.has(id));
    stage.classList.toggle('tool-players', open && PLAYER_TOOLS.has(id));
    render();
    renderBar();
  }

  function setOpen(v) {
    open = v;
    bar.hidden = !v;
    document.body.classList.toggle('analysis-mode', v);
    stage.classList.toggle('analysis-on', v);
    if (v) {
      if (!bar.childElementCount) buildBar();
      setTool(tool);
    } else {
      cancelDraft();
      closeText();
      stopAnimation();
      selected = null;
      stage.classList.remove('tool-draw', 'tool-players');
      stage.dataset.tool = '';
      render();
    }
  }

  function onStateReplaced() {
    undoStack = [];
    redoStack = [];
    selected = null;
    draft = null;
    drag = null;
    closeText();
    if (anim) {
      cancelAnimationFrame(anim.raf);
      anim = null;
    }
    renderBar();
    render();
  }

  function deleteSelected() {
    if (!selected) return false;
    const id = selected;
    selected = null;
    mutate((a) => {
      a.items = a.items.filter((i) => i.id !== id);
    });
    return true;
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (!open || isTyping(e.target) || document.body.classList.contains('modal-open')) return;
      const k = e.key.toLowerCase();
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if ((e.metaKey || e.ctrlKey) && (k === 'z' || k === 'y')) {
        stop();
        if (k === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === 'escape') {
        if (cancelDraft()) stop();
        else if (selected) {
          selected = null;
          render();
          renderBar();
          stop();
        } else if (tool !== 'select') {
          setTool('select');
          stop();
        }
        return;
      }
      if (k === 'enter') {
        if (draft?.type === 'poly') finishPoly();
        else if (draft?.type === 'link') finishLink();
        else return;
        stop();
        return;
      }
      if (k === 'delete' || k === 'backspace') {
        if (deleteSelected()) stop();
        return;
      }
      const t = ALL_TOOLS.find((x) => x.key === k);
      if (t) {
        stop();
        setTool(t.id);
      }
    },
    true,
  );

  /* ------------------------------------------------------------- bar */

  function applyStyle(patch) {
    Object.assign(A().style, patch);
    const it = selectedItem();
    if (it && it.type !== 'opp' && it.type !== 'ball') mutate(() => Object.assign(it, patch));
    else {
      api.save();
      renderBar();
    }
  }

  function setColor(c) {
    const it = selectedItem();
    if (tool === 'opp' || it?.type === 'opp') {
      A().oppColor = c;
      if (it?.type === 'opp') mutate(() => { it.color = c; });
      else {
        api.save();
        renderBar();
      }
    } else applyStyle({ color: c });
  }

  function chip(label, onClick) {
    return el('button', { type: 'button', class: 'chip sm', 'aria-pressed': 'false', onclick: onClick }, label);
  }

  function buildBar() {
    ui.tools = new Map();
    const groups = TOOLS.map((group) =>
      el(
        'div',
        { class: 'abar-group' },
        ...group.map((t) => {
          const b = el('button', { type: 'button', class: 'tool', title: `${t.name} (${t.key.toUpperCase()})`, 'aria-label': t.name, onclick: () => setTool(t.id) }, svg(t.id), el('span', { class: 'tool-key' }, t.key.toUpperCase()));
          ui.tools.set(t.id, b);
          return b;
        }),
      ),
    );
    ui.undo = el('button', { type: 'button', class: 'icon-btn', title: 'Undo (Ctrl/⌘ Z)', 'aria-label': 'Undo', onclick: undo }, svg('undo'));
    ui.redo = el('button', { type: 'button', class: 'icon-btn', title: 'Redo (Ctrl/⌘ Shift Z)', 'aria-label': 'Redo', onclick: redo }, svg('redo'));
    ui.eye = el('button', { type: 'button', class: 'icon-btn', onclick: () => { A().visible = !A().visible; api.save(); render(); renderBar(); } });
    ui.clear = el('button', { type: 'button', class: 'btn ghost sm', onclick: () => {
      if (!window.confirm('Clear all markings, runs and highlights?')) return;
      stopAnimation();
      mutate((a) => {
        a.items = [];
        a.paths = {};
        a.spotlight = [];
      });
    } }, svg('trash', 15), 'Clear');

    ui.colorLabel = el('span', { class: 'abar-label' }, 'Colour');
    ui.swatches = el('div', { class: 'swatches' }, ...MARK_COLORS.map((c) => el('button', { type: 'button', class: 'swatch', style: `--c:${c}`, title: c, dataset: { c }, onclick: () => setColor(c) })));
    ui.widths = el('div', { class: 'seg widths', role: 'group', 'aria-label': 'Line weight' }, ...[1, 2, 3].map((w) => el('button', { type: 'button', title: ['Thin', 'Medium', 'Thick'][w - 1], dataset: { w }, onclick: () => applyStyle({ width: w }) }, el('span', { style: `height:${w * 1.6}px` }))));
    ui.dashed = chip('Dashed', () => applyStyle({ dashed: !A().style.dashed }));
    ui.head = chip('Arrowhead', () => {
      A().style.head = !A().style.head;
      const it = selectedItem();
      if (it?.type === 'pen') mutate(() => { it.head = A().style.head; });
      else {
        api.save();
        renderBar();
      }
    });
    ui.overlays = ['thirds', 'lanes', 'zones'].map((key) => {
      const b = chip({ thirds: 'Thirds', lanes: '5 lanes', zones: '18 zones' }[key], () => {
        A().overlays[key] = !A().overlays[key];
        A().visible = true;
        changed();
      });
      b.dataset.key = key;
      return b;
    });
    ui.play = el('button', { type: 'button', class: 'btn primary sm', onclick: play }, svg('play', 14), el('span', {}, 'Play runs'));
    ui.speed = el('div', { class: 'seg', role: 'group', 'aria-label': 'Playback speed' }, ...[0.5, 1, 2].map((v) => el('button', { type: 'button', dataset: { v }, onclick: () => { A().speed = v; api.save(); renderBar(); } }, `${v}×`)));
    ui.reset = el('button', { type: 'button', class: 'btn ghost sm', title: 'Put players back', onclick: () => stopAnimation() }, svg('back', 14), 'Reset');
    ui.apply = el('button', { type: 'button', class: 'btn sm', title: 'Move players to where their runs end', onclick: applyMoves }, svg('check', 14), 'Keep positions');
    ui.hint = el('div', { class: 'abar-hint' });

    bar.replaceChildren(
      el('div', { class: 'abar-row' }, el('div', { class: 'abar-tools', role: 'toolbar', 'aria-label': 'Analysis tools' }, ...groups), el('div', { class: 'abar-actions' }, ui.undo, ui.redo, ui.eye, ui.clear)),
      el(
        'div',
        { class: 'abar-row abar-sub' },
        el('div', { class: 'abar-style' }, ui.colorLabel, ui.swatches, ui.widths, ui.dashed, ui.head),
        el('div', { class: 'abar-overlays' }, el('span', { class: 'abar-label' }, 'Overlays'), ...ui.overlays),
        el('div', { class: 'abar-play' }, ui.play, ui.speed, ui.reset, ui.apply),
      ),
      ui.hint,
    );
  }

  function renderBar() {
    if (!open || !ui.tools) return;
    const a = A();
    for (const [id, b] of ui.tools) b.classList.toggle('on', id === tool);
    ui.undo.disabled = !undoStack.length;
    ui.redo.disabled = !redoStack.length;
    ui.eye.replaceChildren(svg(a.visible ? 'eye' : 'eyeOff'));
    ui.eye.title = a.visible ? 'Hide markings' : 'Show markings';
    ui.eye.setAttribute('aria-label', ui.eye.title);
    const hasAny = a.items.length || Object.keys(a.paths).length || a.spotlight.length;
    ui.clear.disabled = !hasAny;

    const it = selectedItem();
    const oppMode = tool === 'opp' || it?.type === 'opp';
    const color = oppMode ? it?.color || a.oppColor : it?.color || a.style.color;
    ui.colorLabel.textContent = oppMode ? 'Opposition colour' : it ? 'Selected colour' : 'Colour';
    ui.swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.c === color));
    const width = it?.width || a.style.width;
    ui.widths.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.w) === width));
    ui.dashed.setAttribute('aria-pressed', String(it ? !!it.dashed : a.style.dashed));
    ui.head.setAttribute('aria-pressed', String(it?.type === 'pen' ? !!it.head : a.style.head));
    for (const b of ui.overlays) b.setAttribute('aria-pressed', String(!!a.overlays[b.dataset.key]));

    const hasRuns = Object.keys(a.paths).length > 0;
    ui.play.disabled = !hasRuns;
    ui.play.querySelector('span').textContent = anim ? 'Replay' : 'Play runs';
    ui.speed.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === (a.speed || 1)));
    ui.reset.hidden = !anim;
    ui.apply.hidden = !anim?.done;

    const t = ALL_TOOLS.find((x) => x.id === tool);
    let hint = t.hint;
    if (draft?.type === 'poly') hint = '<b>Custom zone</b> — keep clicking to add corners. Click the first corner or press Enter to finish, Esc to cancel.';
    if (draft?.type === 'link') hint = '<b>Link players</b> — click the next player. Click the grass or press Enter to finish, Esc to cancel.';
    if (it && tool === 'select') hint = '<b>Marking selected</b> — drag to move it, pick a colour or weight to restyle it, or press Delete to remove it.';
    ui.hint.innerHTML = hint;
  }

  return {
    render,
    isOpen: () => open,
    setOpen,
    toggle: () => setOpen(!open),
    handleTokenDown,
    consumesDblclick,
    displayPos: (pid) => anim?.pos.get(pid) || null,
    stopAnimation,
    onStateReplaced,
  };
}
