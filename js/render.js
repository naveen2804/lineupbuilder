// Canvas rendering shared by the on-screen pitch and the image export.

export const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const UI = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

const M = 4; // run-off margin around the pitch, in metres
const LEN = 105; // pitch length, in metres

export const TOKEN_FACTOR = { 11: 0.088, 9: 0.098, 7: 0.11, 5: 0.125 };

export const PITCH_THEMES = {
  classic: { name: 'Classic', a: '#3d9b4a', b: '#358b41', line: 'rgba(255,255,255,0.82)', net: 'rgba(255,255,255,0.16)', glow: 'rgba(255,255,255,0.07)', vignette: 0.32 },
  floodlit: { name: 'Floodlit', a: '#1f5c37', b: '#1a5030', line: 'rgba(236,253,245,0.62)', net: 'rgba(236,253,245,0.1)', glow: 'rgba(190,255,210,0.12)', vignette: 0.5 },
  tactical: { name: 'Tactical', a: '#1c2432', b: '#19212d', line: 'rgba(148,163,184,0.45)', net: 'rgba(148,163,184,0.1)', glow: 'rgba(120,160,255,0.07)', vignette: 0.35 },
  chalk: { name: 'Chalk', a: '#e9eee5', b: '#e1e7dc', line: 'rgba(30,41,59,0.4)', net: 'rgba(30,41,59,0.08)', glow: 'rgba(255,255,255,0.4)', vignette: 0.12 },
};

export const PATTERNS = ['solid', 'stripes', 'hoops', 'halves', 'sash'];

export const EXPORT_FORMATS = [
  { id: 'ultrawide', name: 'Ultrawide', ratio: '21:9', w: 2520, h: 1080 },
  { id: 'wide', name: 'Widescreen', ratio: '16:9', w: 1920, h: 1080 },
  { id: 'standard', name: 'Standard', ratio: '4:3', w: 1600, h: 1200 },
  { id: 'square', name: 'Square', ratio: '1:1', w: 1080, h: 1080 },
  { id: 'portrait', name: 'Portrait post', ratio: '4:5', w: 1080, h: 1350 },
  { id: 'story', name: 'Story / Reel', ratio: '9:16', w: 1080, h: 1920 },
  { id: 'iphone', name: 'iPhone', ratio: '19.5:9', w: 1179, h: 2556 },
  { id: 'android', name: 'Android', ratio: '20:9', w: 1080, h: 2400 },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function parseHex(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexA(hex, a) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function setSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function fitFont(ctx, text, weight, family, max, min, maxW) {
  let s = max;
  for (;;) {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW || s <= min) return s;
    s = Math.max(min, s - 2);
  }
}

/* ---------------------------------------------------------------- pitch */

export function pitchGeometry(rect, orient) {
  const long = orient === 'h' ? rect.w : rect.h;
  const short = orient === 'h' ? rect.h : rect.w;
  const scale = long / (LEN + 2 * M);
  const width = short / scale - 2 * M;
  const map = (x, y) => {
    const hx = (M + x * LEN) * scale;
    const hy = (M + y * width) * scale;
    return orient === 'h' ? { x: rect.x + hx, y: rect.y + hy } : { x: rect.x + hy, y: rect.y + rect.h - hx };
  };
  const unmap = (px, py) => {
    const hx = orient === 'h' ? px - rect.x : rect.y + rect.h - py;
    const hy = orient === 'h' ? py - rect.y : px - rect.x;
    return { x: (hx / scale - M) / LEN, y: (hy / scale - M) / width };
  };
  return { rect, orient, scale, width, long, short, map, unmap };
}

export function drawPitch(ctx, geo, themeKey, radius = 0) {
  const t = PITCH_THEMES[themeKey] || PITCH_THEMES.classic;
  const { rect, orient, scale, width } = geo;

  ctx.save();
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.clip();
  ctx.fillStyle = t.a;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  // Work in metres, with the pitch lying horizontally.
  ctx.save();
  if (orient === 'h') ctx.translate(rect.x, rect.y);
  else {
    ctx.translate(rect.x, rect.y + rect.h);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.scale(scale, scale);

  const TL = LEN + 2 * M;
  const TW = width + 2 * M;
  const bands = 17;
  const bw = TL / bands;
  ctx.fillStyle = t.b;
  for (let i = 1; i < bands; i += 2) ctx.fillRect(i * bw, 0, bw, TW);

  const cx = M + LEN / 2;
  const cy = M + width / 2;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, TL * 0.55);
  glow.addColorStop(0, t.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TL, TW);

  const lw = Math.max(0.12, 1.5 / scale);
  ctx.lineWidth = lw;
  ctx.strokeStyle = t.line;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (fn) => {
    ctx.beginPath();
    fn();
    ctx.stroke();
  };
  const dot = (x, y) => {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.35, lw * 1.3), 0, Math.PI * 2);
    ctx.fillStyle = t.line;
    ctx.fill();
  };

  ctx.strokeRect(M, M, LEN, width);
  stroke(() => {
    ctx.moveTo(cx, M);
    ctx.lineTo(cx, M + width);
  });
  stroke(() => ctx.arc(cx, cy, 9.15, 0, Math.PI * 2));
  dot(cx, cy);

  const th = Math.acos(5.5 / 9.15);
  for (const right of [false, true]) {
    const x0 = right ? M + LEN : M;
    const d = right ? -1 : 1;
    const box = (depth, half) => ctx.strokeRect(right ? x0 - depth : x0, cy - half, depth, half * 2);
    box(16.5, 20.16);
    box(5.5, 9.16);
    dot(x0 + d * 11, cy);
    stroke(() => (right ? ctx.arc(x0 - 11, cy, 9.15, Math.PI - th, Math.PI + th) : ctx.arc(x0 + 11, cy, 9.15, -th, th)));
    const gx = right ? x0 : x0 - 2;
    ctx.fillStyle = t.net;
    ctx.fillRect(gx, cy - 3.66, 2, 7.32);
    ctx.strokeRect(gx, cy - 3.66, 2, 7.32);
  }
  stroke(() => ctx.arc(M, M, 1, 0, Math.PI / 2));
  stroke(() => ctx.arc(M + LEN, M, 1, Math.PI / 2, Math.PI));
  stroke(() => ctx.arc(M, M + width, 1, -Math.PI / 2, 0));
  stroke(() => ctx.arc(M + LEN, M + width, 1, Math.PI, Math.PI * 1.5));
  ctx.restore();

  const mx = rect.x + rect.w / 2;
  const my = rect.y + rect.h / 2;
  const v = ctx.createRadialGradient(mx, my, Math.min(rect.w, rect.h) * 0.3, mx, my, Math.hypot(rect.w, rect.h) * 0.58);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${t.vignette})`);
  ctx.fillStyle = v;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

/* ----------------------------------------------------------------- kits */

const SHIRT = new Path2D('M31 9 L41 4 Q50 13 59 4 L69 9 L95 24 L85 44 L74 38 L74 93 Q50 98 26 93 L26 38 L15 44 L5 24 Z');
const NECK = new Path2D('M41 4 Q50 13 59 4');
const DISC = new Path2D();
DISC.arc(50, 50, 46, 0, Math.PI * 2);

export function drawKit(ctx, cx, cy, size, kit, opts = {}) {
  const { style = 'shirt', number = '', captain = false, pixelRatio = 1, shadow = true } = opts;
  const disc = style === 'disc';
  const shape = disc ? DISC : SHIRT;
  const s = size / 100;

  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);

  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = size * 0.1 * pixelRatio;
    ctx.shadowOffsetY = size * 0.045 * pixelRatio;
  }
  ctx.fillStyle = kit.primary;
  ctx.fill(shape);
  ctx.restore();

  ctx.save();
  ctx.clip(shape);
  ctx.fillStyle = kit.secondary;
  switch (kit.pattern) {
    case 'stripes':
      for (let k = -3; k <= 3; k++) ctx.fillRect(46 + k * 16, 0, 8, 100);
      break;
    case 'hoops':
      for (let y = 20; y < 100; y += 18) ctx.fillRect(0, y, 100, 9);
      break;
    case 'halves':
      ctx.fillRect(50, 0, 50, 100);
      break;
    case 'sash':
      ctx.save();
      ctx.translate(50, 50);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-80, -8, 160, 16);
      ctx.restore();
      break;
  }
  const shade = ctx.createLinearGradient(0, 0, 0, 100);
  shade.addColorStop(0, 'rgba(255,255,255,0.2)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 100, 100);

  ctx.strokeStyle = kit.secondary;
  ctx.lineCap = 'round';
  if (disc) {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(50, 50, 43, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.lineWidth = 6;
    ctx.stroke(NECK);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(95, 24);
    ctx.lineTo(85, 44);
    ctx.moveTo(5, 24);
    ctx.lineTo(15, 44);
    ctx.stroke();
  }
  ctx.restore();

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.stroke(shape);

  if (number !== '' && number != null) {
    ctx.font = `700 ${disc ? 46 : 40}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const y = disc ? 53 : 58;
    if (kit.pattern !== 'solid') {
      ctx.lineWidth = 5;
      ctx.strokeStyle = luminance(kit.number) > 0.4 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)';
      ctx.strokeText(String(number), 50, y);
    }
    ctx.fillStyle = kit.number;
    ctx.fillText(String(number), 50, y);
  }

  if (captain) {
    const bx = disc ? 84 : 86;
    const by = disc ? 16 : 12;
    ctx.beginPath();
    ctx.arc(bx, by, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    ctx.font = `800 19px ${DISPLAY}`;
    ctx.fillStyle = '#1f1300';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C', bx, by + 1);
  }
  ctx.restore();
}

/* --------------------------------------------------------------- labels */

export function labelFor(name, role, show) {
  return { main: show.names ? (name || '').trim() : '', sub: show.roles ? role || '' : '' };
}

function drawPill(ctx, cx, y, text, size) {
  ctx.save();
  ctx.font = `600 ${size}px ${DISPLAY}`;
  setSpacing(ctx, size * 0.02);
  const label = text.toUpperCase();
  const tw = ctx.measureText(label).width;
  const padX = size * 0.6;
  const h = size * 1.56;
  roundRectPath(ctx, cx - tw / 2 - padX, y, tw + padX * 2, h, h / 2);
  ctx.fillStyle = 'rgba(8,11,16,0.8)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y + h / 2 + size * 0.04);
  ctx.restore();
  return h;
}

function drawRoleTag(ctx, cx, y, text, size) {
  ctx.save();
  ctx.font = `700 ${size}px ${UI}`;
  setSpacing(ctx, size * 0.06);
  const tw = ctx.measureText(text).width;
  const padX = size * 0.55;
  const h = size * 1.6;
  roundRectPath(ctx, cx - tw / 2 - padX, y, tw + padX * 2, h, h / 2);
  ctx.fillStyle = 'rgba(8,11,16,0.55)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + h / 2 + size * 0.05);
  ctx.restore();
}

export function drawPlayers(ctx, geo, d, pixelRatio = 1) {
  const size = geo.short * d.factor;
  const fs = size * 0.27;
  const placed = d.starters.map((p) => ({ p, pt: geo.map(p.x, p.y) }));
  for (const { p, pt } of placed) {
    drawKit(ctx, pt.x, pt.y, size, p.kit, { style: d.token, number: d.show.numbers ? p.number : '', captain: p.captain, pixelRatio });
  }
  for (const { p, pt } of placed) {
    const lab = labelFor(p.name, p.role, d.show);
    let y = pt.y + size * 0.47;
    if (lab.main) y += drawPill(ctx, pt.x, y, lab.main, fs) + fs * 0.2;
    if (lab.sub) drawRoleTag(ctx, pt.x, y, lab.sub, fs * 0.7);
  }
}

/* --------------------------------------------------------------- export */

function accentOf(d) {
  if (luminance(d.accent) > 0.03) return d.accent;
  if (luminance(d.accent2) > 0.03) return d.accent2;
  return '#e2e8f0';
}

function paintBackground(ctx, W, H, u, accent, accent2) {
  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, W, H);
  const R = Math.max(W, H);
  const radial = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  radial(0, 0, R * 0.75, hexA(accent, 0.24));
  radial(W, H, R * 0.6, hexA(accent2, 0.08));
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.022)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  for (let x = -H; x < W; x += 26 * u) {
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
  }
  ctx.stroke();
  ctx.restore();
}

function drawFormationPill(ctx, x, cy, w, u, text, accent) {
  const h = 68 * u;
  roundRectPath(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.lineWidth = 2 * u;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 32 * u, cy, 7 * u, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.font = `700 ${38 * u}px ${DISPLAY}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 52 * u, cy + 2 * u);
}

function drawCoach(ctx, x, y, u, coach, align, dry) {
  const { label, name } = coach;
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${15 * u}px ${UI}`;
  setSpacing(ctx, 3 * u);
  const lw = ctx.measureText(label).width;
  setSpacing(ctx, 0);
  ctx.font = `700 ${40 * u}px ${DISPLAY}`;
  const text = ellipsize(ctx, name, 460 * u);
  const nw = ctx.measureText(text).width;
  if (!dry) {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y + 16 * u);
    ctx.font = `700 ${15 * u}px ${UI}`;
    setSpacing(ctx, 3 * u);
    ctx.fillStyle = 'rgba(203,213,225,0.6)';
    ctx.fillText(label, x, y - 20 * u);
  }
  ctx.restore();
  return Math.max(lw, nw);
}

function drawHeader(ctx, box, u, d, accent, stacked, dry) {
  const title = (d.teamName || '').trim().toUpperCase() || 'LINEUP';
  const sub = (d.subtitle || '').trim();
  // One coach block per team that has a coach named.
  const home = (d.coach || '').trim().toUpperCase();
  const away = (d.oppCoach || '').trim().toUpperCase();
  const coaches = [];
  if (home) coaches.push({ label: away ? `${(d.teamName || '').trim().toUpperCase() || 'HOME'} COACH` : 'HEAD COACH', name: home });
  if (away) coaches.push({ label: `${(d.oppName || '').trim().toUpperCase() || 'OPPOSITION'} COACH`, name: away });
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 ${38 * u}px ${DISPLAY}`;
  const pw = d.formation ? ctx.measureText(d.formation).width + 84 * u : 0;
  let h;

  if (!stacked) {
    const base = sub ? 124 * u : 88 * u;
    const narrow = box.w < 1300 * u;
    const tx = box.x + 34 * u;
    // On narrow canvases the coaches sit in rows under the title instead of beside it.
    const placed = [];
    let rows = 0;
    if (narrow && coaches.length) {
      let x = tx;
      for (const c of coaches) {
        const w = drawCoach(ctx, 0, 0, u, c, 'left', true);
        if (x > tx && x + w > box.x + box.w) {
          rows += 1;
          x = tx;
        }
        placed.push({ c, x, row: rows });
        x += w + 64 * u;
      }
      rows += 1;
    }
    h = base + rows * 84 * u;
    let right = box.x + box.w;
    if (pw) {
      if (!dry) drawFormationPill(ctx, right - pw, box.y + base / 2, pw, u, d.formation, accent);
      right -= pw + 44 * u;
    }
    if (narrow) for (const p of placed) drawCoach(ctx, p.x, box.y + base + 50 * u + p.row * 84 * u, u, p.c, 'left', dry);
    else for (const c of [...coaches].reverse()) right -= drawCoach(ctx, right, box.y + base / 2, u, c, 'right', dry) + 56 * u;
    if (!dry) {
      ctx.fillStyle = accent;
      roundRectPath(ctx, box.x, box.y + 4 * u, 8 * u, h - 8 * u, 4 * u);
      ctx.fill();
      const maxW = right - tx;
      const fs = fitFont(ctx, title, 800, DISPLAY, 84 * u, 30 * u, maxW);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ellipsize(ctx, title, maxW), tx, box.y + (sub ? 40 * u : base / 2) + fs * 0.04);
      if (sub) {
        ctx.font = `500 ${30 * u}px ${UI}`;
        ctx.fillStyle = 'rgba(203,213,225,0.72)';
        ctx.fillText(ellipsize(ctx, sub, (narrow ? box.x + box.w : right) - tx), tx, box.y + 100 * u);
      }
    }
  } else {
    let y = box.y;
    if (!dry) {
      ctx.fillStyle = accent;
      roundRectPath(ctx, box.x, y, 64 * u, 8 * u, 4 * u);
      ctx.fill();
    }
    y += 40 * u;
    let fs = 92 * u;
    let lines;
    for (;;) {
      ctx.font = `800 ${fs}px ${DISPLAY}`;
      lines = wrap(ctx, title, box.w);
      const fits = lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= box.w);
      if (fits || fs <= 40 * u) break;
      fs -= 4 * u;
    }
    const lh = fs * 0.98;
    if (!dry) {
      ctx.fillStyle = '#ffffff';
      lines.forEach((l, i) => ctx.fillText(ellipsize(ctx, l, box.w), box.x, y + lh * i + lh / 2));
    }
    y += lh * lines.length + 18 * u;
    if (sub) {
      ctx.font = `500 ${28 * u}px ${UI}`;
      const sl = wrap(ctx, sub, box.w).slice(0, 3);
      if (!dry) {
        ctx.fillStyle = 'rgba(203,213,225,0.72)';
        sl.forEach((l, i) => ctx.fillText(l, box.x, y + 19 * u + i * 38 * u));
      }
      y += sl.length * 38 * u + 26 * u;
    }
    if (pw) {
      if (!dry) drawFormationPill(ctx, box.x, y + 34 * u, pw, u, d.formation, accent);
      y += 68 * u;
    }
    for (const c of coaches) {
      y += 34 * u;
      drawCoach(ctx, box.x, y + 20 * u, u, c, 'left', dry);
      y += 56 * u;
    }
    h = y - box.y;
  }
  ctx.restore();
  return h;
}

// Substitute lists to show: yours, plus the opposition's when they have any.
function benchGroups(d) {
  const opp = d.oppBench || [];
  const groups = [];
  if (d.bench.length) groups.push({ title: opp.length ? `${(d.teamName || 'Home').trim().toUpperCase()} SUBS` : 'SUBSTITUTES', list: d.bench });
  if (opp.length) groups.push({ title: `${(d.oppName || 'Opposition').trim().toUpperCase()} SUBS`, list: opp });
  return groups;
}

function drawBenchGroup(ctx, x, y, w, group, cols, rows, rowH, u, d, pixelRatio) {
  const list = group.list;
  const head = 44 * u;
  const g = 10 * u;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const hy = y + 14 * u;
  ctx.font = `700 ${19 * u}px ${UI}`;
  setSpacing(ctx, 3 * u);
  ctx.fillStyle = 'rgba(203,213,225,0.72)';
  const label = ellipsize(ctx, group.title, w * 0.8);
  ctx.fillText(label, x, hy);
  const lw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  const count = String(list.length);
  ctx.fillText(count, x + lw + 12 * u, hy);
  const cw = ctx.measureText(count).width;
  setSpacing(ctx, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.moveTo(x + lw + cw + 34 * u, hy);
  ctx.lineTo(x + w, hy);
  ctx.stroke();

  const cap = Math.max(1, rows * cols);
  const overflow = list.length > cap;
  const shown = overflow ? list.slice(0, cap - 1) : list;
  const cellW = (w - g * (cols - 1)) / cols;
  const cell = (i) => ({ x: x + (i % cols) * (cellW + g), y: y + head + Math.floor(i / cols) * (rowH + g) });
  const r = Math.min(14 * u, rowH / 3);

  shown.forEach((p, i) => {
    const c = cell(i);
    const cy = c.y + rowH / 2;
    roundRectPath(ctx, c.x, c.y, cellW, rowH, r);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.lineWidth = 1.5 * u;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.stroke();

    const ks = rowH * 0.72;
    drawKit(ctx, c.x + 10 * u + ks / 2, cy, ks, p.kit, { style: d.token, number: d.show.numbers ? p.number : '', captain: p.captain, pixelRatio, shadow: false });
    const tx = c.x + 22 * u + ks;
    let right = c.x + cellW - 16 * u;
    if (p.gk) {
      ctx.font = `700 ${Math.max(12 * u, rowH * 0.22)}px ${UI}`;
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'right';
      ctx.fillText('GK', right, cy);
      right -= ctx.measureText('GK').width + 12 * u;
      ctx.textAlign = 'left';
    }
    ctx.font = `600 ${rowH * 0.4}px ${DISPLAY}`;
    ctx.fillStyle = p.name ? '#ffffff' : 'rgba(255,255,255,0.45)';
    const name = (p.name || 'Substitute').toUpperCase();
    ctx.fillText(ellipsize(ctx, name, right - tx), tx, cy + rowH * 0.02);
  });

  if (overflow) {
    const c = cell(cap - 1);
    roundRectPath(ctx, c.x, c.y, cellW, rowH, r);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fill();
    ctx.font = `600 ${rowH * 0.3}px ${UI}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText(`+${list.length - cap + 1} more`, c.x + cellW / 2, c.y + rowH / 2);
  }
  ctx.restore();
  return head + rows * rowH + Math.max(0, rows - 1) * g;
}

const GROUP_GAP = 28;

// Column mode: groups stacked down a side panel, sharing its height.
function drawBenchColumn(ctx, box, groups, u, d, pixelRatio) {
  const head = 44 * u;
  const g = 10 * u;
  const gg = GROUP_GAP * u;
  const total = groups.reduce((n, x) => n + x.list.length, 0);
  const rowH = clamp((box.h - groups.length * head - (groups.length - 1) * gg - g * (total - groups.length)) / total, 46 * u, 76 * u);
  let y = box.y;
  for (const group of groups) {
    const room = box.y + box.h - y;
    const rows = Math.min(group.list.length, Math.floor((room - head + g) / (rowH + g)));
    if (rows < 1) break;
    y += drawBenchGroup(ctx, box.x, y, box.w, group, 1, rows, rowH, u, d, pixelRatio) + gg;
  }
}

/**
 * Render a complete lineup graphic into a W×H logical canvas area.
 * d: render data prepared by the app (see buildRenderData in app.js).
 */
export function renderLineup(ctx, W, H, d, opts = {}) {
  const showTitle = opts.title !== false;
  const groups = opts.bench !== false ? benchGroups(d) : [];
  const showBench = groups.length > 0;
  const pr = opts.pixelRatio || 1;
  const u = Math.min(W, H) / 1080;
  const ratio = W / H;
  const pad = 64 * u;
  const accent = accentOf(d);

  paintBackground(ctx, W, H, u, accent, d.accent2);

  let area = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
  if (showTitle) {
    if (ratio >= 2) {
      const colW = Math.min(520 * u, W * 0.22);
      const hh = drawHeader(ctx, { x: pad, y: 0, w: colW }, u, d, accent, true, true);
      drawHeader(ctx, { x: pad, y: (H - hh) / 2, w: colW }, u, d, accent, true, false);
      const off = colW + 56 * u;
      area = { x: pad + off, y: pad, w: W - pad * 2 - off, h: H - pad * 2 };
    } else {
      const hh = drawHeader(ctx, { x: pad, y: pad, w: W - pad * 2 }, u, d, accent, false, false);
      const gap = 44 * u;
      area = { x: pad, y: pad + hh + gap, w: W - pad * 2, h: H - pad * 2 - hh - gap };
    }
  }

  const gap = 40 * u;
  const side = showBench && ratio >= 1.6;
  let pitchArea = area;
  let benchW = 0;
  let benchH = 0;
  if (side) {
    benchW = clamp(area.w * 0.22, 300 * u, 440 * u);
    pitchArea = { ...area, w: area.w - benchW - gap };
  } else if (showBench) {
    // Share a row budget between the groups: at least one row each, then fill as needed.
    const cols = clamp(Math.floor((area.w + 10 * u) / (290 * u)), 2, 5);
    const rowH = 60 * u;
    const rg = 10 * u;
    const head = 44 * u;
    const gg = GROUP_GAP * u;
    const maxH = area.h * (ratio < 1 ? 0.3 : 0.32);
    let budget = Math.max(groups.length, Math.floor((maxH - groups.length * head - (groups.length - 1) * gg + groups.length * rg) / (rowH + rg)));
    for (const g of groups) {
      g.need = Math.ceil(g.list.length / cols);
      g.rows = 1;
      budget -= 1;
    }
    while (budget > 0 && groups.some((g) => g.rows < g.need)) {
      for (const g of groups) {
        if (budget > 0 && g.rows < g.need) {
          g.rows += 1;
          budget -= 1;
        }
      }
    }
    for (const g of groups) g.cols = cols;
    benchH = groups.reduce((h, g) => h + head + g.rows * rowH + (g.rows - 1) * rg, 0) + (groups.length - 1) * gg;
    pitchArea = { ...area, h: area.h - benchH - gap };
  }

  const orient = pitchArea.w >= pitchArea.h ? 'h' : 'v';
  const long = orient === 'h' ? pitchArea.w : pitchArea.h;
  const short = orient === 'h' ? pitchArea.h : pitchArea.w;
  const aspect = clamp(long / short, 1.4, 1.72);
  let L = long;
  let S = L / aspect;
  if (S > short) {
    S = short;
    L = S * aspect;
  }
  const pw = orient === 'h' ? L : S;
  const ph = orient === 'h' ? S : L;

  let rect;
  let benchBox = null;
  if (side) {
    const total = pw + gap + benchW;
    const x0 = area.x + (area.w - total) / 2;
    rect = { x: x0, y: area.y + (area.h - ph) / 2, w: pw, h: ph };
    benchBox = { x: x0 + pw + gap, y: rect.y, w: benchW, h: ph };
  } else {
    const total = ph + (showBench ? gap + benchH : 0);
    const y0 = area.y + (area.h - total) / 2;
    rect = { x: area.x + (area.w - pw) / 2, y: y0, w: pw, h: ph };
    if (showBench) benchBox = { x: rect.x, y: y0 + ph + gap, w: pw, h: benchH };
  }

  const radius = 28 * u;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 60 * u * pr;
  ctx.shadowOffsetY = 24 * u * pr;
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  const geo = pitchGeometry(rect, orient);
  drawPitch(ctx, geo, d.pitch, radius);
  if (opts.underlay) opts.underlay(ctx, geo, geo.short * d.factor, pr, 'under');
  drawPlayers(ctx, geo, d, pr);
  if (opts.underlay) opts.underlay(ctx, geo, geo.short * d.factor, pr, 'over');
  if (benchBox && side) drawBenchColumn(ctx, benchBox, groups, u, d, pr);
  else if (benchBox) {
    let y = benchBox.y;
    for (const g of groups) y += drawBenchGroup(ctx, benchBox.x, y, benchBox.w, g, g.cols, g.rows, 60 * u, u, d, pr) + GROUP_GAP * u;
  }
}
