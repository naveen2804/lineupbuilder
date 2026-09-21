// Analysis layer: markings drawn over the pitch. Everything is stored in normalised pitch
// coordinates (x along the length, y across), so it survives resizing, the vertical phone
// layout and image export. Shared by the on-screen overlay and the exporter.

import { DISPLAY, UI, roundRectPath, hexA, luminance } from './render.js';

export const MARK_COLORS = ['#ffffff', '#facc15', '#f43f5e', '#fb923c', '#38bdf8', '#c6f432', '#a78bfa', '#0f172a'];
const WIDTH = { 1: 0.0035, 2: 0.006, 3: 0.0095 };
const FIELD_L = 105;
const FIELD_W = 68;

export function emptyAnalysis() {
  return {
    visible: true,
    items: [],
    paths: {}, // pid (or 'ball') -> { pts: offsets from the start position, color }
    spotlight: [], // [{ pid, color }]
    overlays: { thirds: false, lanes: false, zones: false },
    style: { color: '#ffffff', width: 2, dashed: false, head: false },
    oppColor: '#ef4444',
    speed: 1,
  };
}

export const hasMarkings = (a) => !!a && (a.items.length > 0 || Object.keys(a.paths).length > 0 || a.spotlight.length > 0 || Object.values(a.overlays).some(Boolean));

/* ------------------------------------------------------------ geometry */

export const metres = (a, b) => Math.hypot((b.x - a.x) * FIELD_L, (b.y - a.y) * FIELD_W);

export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += metres(pts[i - 1], pts[i]);
  return d;
}

export function pointAlong(pts, dist) {
  if (pts.length < 2) return { ...pts[0] };
  for (let i = 1; i < pts.length; i++) {
    const seg = metres(pts[i - 1], pts[i]);
    if (dist <= seg || i === pts.length - 1) {
      const t = seg ? Math.min(1, dist / seg) : 1;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    dist -= seg;
  }
  return { ...pts[pts.length - 1] };
}

// Ramer–Douglas–Peucker, tolerance in normalised units.
export function simplify(pts, eps = 0.003) {
  if (pts.length < 3) return pts;
  const perp = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1e-9;
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  };
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > max) {
      max = d;
      idx = i;
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPolyline(p, pts, closed = false) {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i - 1], pts[i]));
  if (closed && pts.length > 2) d = Math.min(d, distToSegment(p, pts[pts.length - 1], pts[0]));
  return d;
}

function insidePolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const lineWidth = (geo, w) => Math.max(1.4, geo.short * (WIDTH[w] || WIDTH[2]));
const textSize = (geo, w) => geo.short * ({ 1: 0.028, 2: 0.036, 3: 0.048 }[w] || 0.036);

/* ------------------------------------------------------------- drawing */

function setStroke(ctx, color, lw, dashed) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dashed ? [lw * 2.6, lw * 2.3] : []);
}

// Stroke a pixel polyline, optionally finishing with an arrowhead.
function strokePath(ctx, pts, color, lw, dashed, head) {
  if (pts.length < 2) return;
  const size = Math.max(lw * 4.2, 10);
  let end = pts[pts.length - 1];
  let from = pts[0];
  if (head) {
    // Aim the head along the last `size` pixels of the path.
    let acc = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      from = pts[i - 1];
      if (acc >= size) break;
    }
  }
  const ang = Math.atan2(end.y - from.y, end.x - from.x);
  const draw = head ? [...pts.slice(0, -1), { x: end.x - Math.cos(ang) * size * 0.6, y: end.y - Math.sin(ang) * size * 0.6 }] : pts;
  setStroke(ctx, color, lw, dashed);
  ctx.beginPath();
  draw.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  if (head) {
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - Math.cos(ang - 0.42) * size, end.y - Math.sin(ang - 0.42) * size);
    ctx.lineTo(end.x - Math.cos(ang + 0.42) * size, end.y - Math.sin(ang + 0.42) * size);
    ctx.closePath();
    ctx.fill();
  }
}

function label(ctx, x, y, text, size, color, bg) {
  ctx.save();
  ctx.font = `700 ${size}px ${DISPLAY}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.03}px`;
  const tw = ctx.measureText(text).width;
  const h = size * 1.5;
  const w = tw + size * 1.1;
  roundRectPath(ctx, x - w / 2, y - h / 2, w, h, h * 0.32);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.05);
  ctx.restore();
  return { x: x - w / 2, y: y - h / 2, w, h };
}

const textBoxes = new Map();

function drawOverlays(ctx, geo, o) {
  const P = (x, y) => geo.map(x, y);
  const lw = Math.max(1, geo.short * 0.0022);
  const seg = (x1, y1, x2, y2) => {
    const a = P(x1, y1);
    const b = P(x2, y2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  const band = (x1, y1, x2, y2, fill) => {
    const a = P(x1, y1);
    const b = P(x2, y2);
    ctx.fillStyle = fill;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  };
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = lw;
  ctx.setLineDash([lw * 5, lw * 4]);

  if (o.zones) {
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 3; r++) {
        const m = P((c + 0.5) / 6, (r + 0.5) / 3);
        ctx.save();
        ctx.font = `800 ${geo.short * 0.075}px ${DISPLAY}`;
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(c * 3 + r + 1), m.x, m.y);
        ctx.restore();
      }
    }
    for (let c = 1; c < 6; c++) seg(c / 6, 0, c / 6, 1);
    for (const r of [1 / 3, 2 / 3]) seg(0, r, 1, r);
  }
  if (o.lanes) {
    const box = 20.16 / geo.width;
    const goal = 9.16 / geo.width;
    const ys = [0.5 - box, 0.5 - goal, 0.5 + goal, 0.5 + box];
    band(0, ys[0], 1, ys[1], 'rgba(255,255,255,0.06)');
    band(0, ys[2], 1, ys[3], 'rgba(255,255,255,0.06)');
    for (const y of ys) seg(0, y, 1, y);
  }
  if (o.thirds) {
    band(2 / 3, 0, 1, 1, 'rgba(255,255,255,0.04)');
    seg(1 / 3, 0, 1 / 3, 1);
    seg(2 / 3, 0, 2 / 3, 1);
    ctx.setLineDash([]);
    ['DEFENSIVE THIRD', 'MIDDLE THIRD', 'FINAL THIRD'].forEach((t, i) => {
      const m = P((i + 0.5) / 3, 0.035);
      ctx.save();
      ctx.font = `700 ${Math.max(10, geo.short * 0.02)}px ${UI}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${geo.short * 0.003}px`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, m.x, m.y);
      ctx.restore();
    });
  }
  ctx.restore();
}

function drawBall(ctx, c, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.8;
  ctx.shadowOffsetY = r * 0.25;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#111827';
  const pent = (cx, cy, s, rot) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + (i * Math.PI * 2) / 5;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * s, cy + Math.sin(a) * s);
    }
    ctx.closePath();
    ctx.fill();
  };
  pent(c.x, c.y, r * 0.38, -Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    pent(c.x + Math.cos(a) * r * 0.95, c.y + Math.sin(a) * r * 0.95, r * 0.3, a + Math.PI / 5);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
}

function drawItem(ctx, geo, it, env) {
  const P = (p) => geo.map(p.x, p.y);
  const lw = lineWidth(geo, it.width);
  ctx.save();
  switch (it.type) {
    case 'pen':
    case 'line':
    case 'arrow':
      strokePath(ctx, it.pts.map(P), it.color, lw, it.dashed, it.type === 'arrow' || it.head);
      break;
    case 'measure': {
      const [a, b] = it.pts.map(P);
      strokePath(ctx, [a, b], it.color, lw * 0.8, it.dashed, false);
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const t = lw * 3.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const p of [a, b]) {
        ctx.moveTo(p.x - Math.cos(ang) * t, p.y - Math.sin(ang) * t);
        ctx.lineTo(p.x + Math.cos(ang) * t, p.y + Math.sin(ang) * t);
      }
      ctx.stroke();
      const size = Math.max(11, geo.short * 0.024);
      label(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, `${metres(it.pts[0], it.pts[1]).toFixed(1)} m`, size, '#ffffff', 'rgba(8,11,16,0.82)');
      break;
    }
    case 'rect':
    case 'ellipse': {
      const [a, b] = it.pts.map(P);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      ctx.beginPath();
      if (it.type === 'rect') ctx.rect(x, y, w, h);
      else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = hexA(it.color, 0.22);
      ctx.fill();
      setStroke(ctx, hexA(it.color, 0.9), lw * 0.8, it.dashed);
      ctx.stroke();
      break;
    }
    case 'poly': {
      const pts = it.pts.map(P);
      if (it.cursor) pts.push(P(it.cursor));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (!it.draft) ctx.closePath();
      ctx.fillStyle = hexA(it.color, 0.22);
      if (pts.length > 2) ctx.fill();
      setStroke(ctx, hexA(it.color, 0.9), lw * 0.8, it.dashed);
      ctx.stroke();
      if (it.draft) {
        ctx.setLineDash([]);
        ctx.fillStyle = it.color;
        it.pts.map(P).forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, i === 0 ? lw * 2.2 : lw * 1.3, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      break;
    }
    case 'link': {
      const pts = it.pids.map((pid) => env.pos(pid)).filter(Boolean);
      if (it.cursor) pts.push(it.cursor);
      strokePath(ctx, pts.map(P), it.color, lw, it.dashed, false);
      break;
    }
    case 'text': {
      const c = P(it.pts[0]);
      const dark = luminance(it.color) < 0.12;
      const box = label(ctx, c.x, c.y, (it.text || '').toUpperCase(), textSize(geo, it.width), it.color, dark ? 'rgba(255,255,255,0.9)' : 'rgba(8,11,16,0.78)');
      textBoxes.set(it.id, box);
      break;
    }
    case 'opp': {
      const c = P(it.pts[0]);
      const r = env.tokenSize * 0.36;
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = r * 0.5 * (env.pixelRatio || 1);
      ctx.shadowOffsetY = r * 0.15 * (env.pixelRatio || 1);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = it.color;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      if (it.num) {
        ctx.font = `700 ${r * 1.1}px ${DISPLAY}`;
        ctx.fillStyle = luminance(it.color) > 0.45 ? '#0b0f14' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(it.num), c.x, c.y + r * 0.06);
      }
      break;
    }
    case 'ball':
      drawBall(ctx, P(env.pos('ball') || it.pts[0]), Math.max(5, env.tokenSize * 0.17));
      break;
  }
  ctx.restore();
}

function drawSpotlights(ctx, geo, a, env) {
  for (const s of a.spotlight) {
    const p = env.pos(s.pid);
    if (!p) continue;
    const c = geo.map(p.x, p.y);
    const r = env.tokenSize;
    ctx.save();
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 1.5);
    g.addColorStop(0, hexA(s.color, 0.55));
    g.addColorStop(1, hexA(s.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// Absolute points of a movement path, anchored at its owner's home position.
export function runPoints(path, home) {
  return path.pts.map((p) => ({ x: home.x + p.x, y: home.y + p.y }));
}

function drawRuns(ctx, geo, a, env) {
  const lw = lineWidth(geo, 2);
  for (const [pid, path] of Object.entries(a.paths)) {
    const home = env.home(pid);
    if (!home) continue;
    const pts = runPoints(path, home).map((p) => geo.map(p.x, p.y));
    ctx.save();
    strokePath(ctx, pts, path.color, lw, true, true);
    const end = pts[pts.length - 1];
    const r = pid === 'ball' ? Math.max(5, env.tokenSize * 0.17) : env.tokenSize * 0.32;
    ctx.setLineDash([lw * 1.5, lw * 1.5]);
    ctx.lineWidth = Math.max(1.2, lw * 0.6);
    ctx.fillStyle = hexA(path.color, 0.16);
    ctx.beginPath();
    ctx.arc(end.x, end.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draw markings. env: { pos(pid) live position, home(pid) start position,
 * tokenSize, selected?: id, draft?: item, pixelRatio? }.
 * layer 'under' sits beneath the players, 'over' (labels, the stroke being drawn and the
 * selection outline) sits above them; 'all' draws both.
 */
export function drawAnalysis(ctx, geo, a, env, layer = 'all') {
  if (!a) return;
  if (layer !== 'over') drawUnder(ctx, geo, a, env);
  if (layer !== 'under') drawOver(ctx, geo, a, env);
}

function drawUnder(ctx, geo, a, env) {
  const zones = ['rect', 'ellipse', 'poly'];
  drawOverlays(ctx, geo, a.overlays);
  for (const it of a.items) if (zones.includes(it.type)) drawItem(ctx, geo, it, env);
  drawSpotlights(ctx, geo, a, env);
  for (const it of a.items) if (!zones.includes(it.type) && !['opp', 'ball', 'text'].includes(it.type)) drawItem(ctx, geo, it, env);
  drawRuns(ctx, geo, a, env);
  for (const it of a.items) if (it.type === 'opp' || it.type === 'ball') drawItem(ctx, geo, it, env);
}

function drawOver(ctx, geo, a, env) {
  for (const it of a.items) if (it.type === 'text') drawItem(ctx, geo, it, env);
  if (env.draft) drawItem(ctx, geo, env.draft, env);
  if (env.selected) {
    const it = a.items.find((x) => x.id === env.selected);
    const b = it && itemBounds(it, geo, env);
    if (b) {
      ctx.save();
      ctx.strokeStyle = '#c6f432';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
      ctx.restore();
    }
  }
}

/* ------------------------------------------------------------ hit test */

export function itemBounds(it, geo, env) {
  if (it.type === 'text') return textBoxes.get(it.id) || null;
  const pts = it.type === 'link' ? it.pids.map((pid) => env.pos(pid)).filter(Boolean) : it.pts;
  if (!pts.length) return null;
  const px = pts.map((p) => geo.map(p.x, p.y));
  const pad = it.type === 'opp' ? env.tokenSize * 0.36 : it.type === 'ball' ? env.tokenSize * 0.17 : 0;
  const xs = px.map((p) => p.x);
  const ys = px.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

// Topmost marking under a pixel point.
export function hitTest(a, geo, pt, env) {
  const tol = Math.max(8, lineWidth(geo, 2) * 2);
  const order = [...a.items].reverse().sort((x, y) => rank(x) - rank(y));
  for (const it of order) {
    const px = (it.type === 'link' ? it.pids.map((pid) => env.pos(pid)).filter(Boolean) : it.pts).map((p) => geo.map(p.x, p.y));
    switch (it.type) {
      case 'text': {
        const b = textBoxes.get(it.id);
        if (b && pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return it;
        break;
      }
      case 'opp':
        if (Math.hypot(pt.x - px[0].x, pt.y - px[0].y) <= env.tokenSize * 0.36 + 4) return it;
        break;
      case 'ball':
        if (Math.hypot(pt.x - px[0].x, pt.y - px[0].y) <= Math.max(5, env.tokenSize * 0.17) + 6) return it;
        break;
      case 'rect': {
        const b = itemBounds(it, geo, env);
        if (pt.x >= b.x - tol && pt.x <= b.x + b.w + tol && pt.y >= b.y - tol && pt.y <= b.y + b.h + tol) return it;
        break;
      }
      case 'ellipse': {
        const b = itemBounds(it, geo, env);
        const rx = b.w / 2 + tol;
        const ry = b.h / 2 + tol;
        if (((pt.x - b.x - b.w / 2) / rx) ** 2 + ((pt.y - b.y - b.h / 2) / ry) ** 2 <= 1) return it;
        break;
      }
      case 'poly':
        if (insidePolygon(pt, px) || distToPolyline(pt, px, true) <= tol) return it;
        break;
      default:
        if (px.length > 1 && distToPolyline(pt, px) <= tol) return it;
    }
  }
  return null;
}

// Small objects win over lines, and lines win over zones they sit inside.
function rank(it) {
  if (['text', 'opp', 'ball'].includes(it.type)) return 0;
  if (['rect', 'ellipse', 'poly'].includes(it.type)) return 2;
  return 1;
}
