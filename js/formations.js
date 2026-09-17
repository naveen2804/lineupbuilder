// Formation catalogue and slot layout.
// Coordinates are normalised to the playing area: x runs from own goal (0) to
// the opponent's goal (1), y runs across the pitch from the team's left (0) to right (1).

export const SIZES = [11, 9, 7, 5];

export const FORMATIONS = {
  11: ['4-3-3', '4-4-2', '4-2-3-1', '4-1-4-1', '4-4-1-1', '4-1-2-1-2', '4-3-2-1', '3-5-2', '3-4-3', '3-4-2-1', '5-3-2', '5-4-1'],
  9: ['3-3-2', '3-2-3', '2-4-2', '3-4-1'],
  7: ['2-3-1', '3-2-1', '3-1-2', '2-1-2-1'],
  5: ['2-2', '1-2-1', '2-1-1'],
};

const DEF = { 1: ['CB'], 2: ['LCB', 'RCB'], 3: ['LCB', 'CB', 'RCB'], 4: ['LB', 'LCB', 'RCB', 'RB'], 5: ['LWB', 'LCB', 'CB', 'RCB', 'RWB'] };
const MID = { 1: ['CM'], 2: ['LCM', 'RCM'], 3: ['LCM', 'CM', 'RCM'], 4: ['LM', 'LCM', 'RCM', 'RM'], 5: ['LM', 'LCM', 'CM', 'RCM', 'RM'] };
const DM = { 1: ['CDM'], 2: ['LDM', 'RDM'] };
const AM = { 1: ['CAM'], 2: ['LAM', 'RAM'], 3: ['LAM', 'CAM', 'RAM'] };
const FWD = { 1: ['ST'], 2: ['LS', 'RS'], 3: ['LW', 'ST', 'RW'] };
const GAP = { 2: 0.3, 3: 0.27, 4: 0.24, 5: 0.195 };

function rolesFor(lines, li) {
  const n = lines[li];
  const last = lines.length - 1;
  if (li === 0) return DEF[n];
  if (li === last) return FWD[n] || MID[n];
  const middles = lines.length - 2;
  if (middles >= 2 && li === 1 && DM[n]) return DM[n];
  if (middles >= 2 && li === last - 1 && AM[n]) return AM[n];
  if (lines[0] === 3 && li === 1 && (n === 4 || n === 5)) {
    const r = [...MID[n]];
    r[0] = 'LWB';
    r[n - 1] = 'RWB';
    return r;
  }
  return MID[n];
}

export function buildFormation(name) {
  const lines = name.split('-').map(Number);
  const slots = [{ x: 0.05, y: 0.5, role: 'GK' }];
  const L = lines.length;
  const x0 = L === 2 ? 0.3 : 0.23;
  const x1 = L === 2 ? 0.72 : 0.8;
  lines.forEach((n, li) => {
    const x = L === 1 ? 0.5 : x0 + (li * (x1 - x0)) / (L - 1);
    const roles = rolesFor(lines, li) || [];
    const gap = GAP[n] || 0.78 / Math.max(1, n - 1);
    for (let i = 0; i < n; i++) {
      slots.push({ x, y: 0.5 + (i - (n - 1) / 2) * gap, role: roles[i] || '' });
    }
  });
  return slots;
}
