// The office world: layout, cats, movement and idle behaviour.
// Grid units: the floor is 12 wide x FLOOR_D deep. x < 7 is the work area, x > 7 the lounge.

/** How many tiles deep the floor is (it is 12 wide; x < 7 is the work area). */
export const FLOOR_D = 10;

export type Role = 'lead' | 'planner' | 'designer' | 'developer' | 'tester';
export const WORKERS: Role[] = ['planner', 'designer', 'developer', 'tester'];
export type Pt = [number, number];
export type Stage = 'order' | 'plan' | 'design' | 'code' | 'bug' | 'done';

export interface Desk { key: string; role: Role; label: string; cx: number; cy: number; w: number; d: number; h: number; top?: string; l?: string; r?: string }
export const DESKS: Desk[] = [
  { key: 'counter', role: 'lead', label: 'lead', cx: 2.0, cy: 1.05, w: 2.4, d: 0.7, h: 12, top: '#B88758', l: '#7A5038', r: '#8E5E40' },
  { key: 'planner', role: 'planner', label: 'planner', cx: 1.0, cy: 3.3, w: 1.0, d: 1.4, h: 16 },
  { key: 'designer', role: 'designer', label: 'designer', cx: 1.0, cy: 5.2, w: 1.0, d: 1.4, h: 16 },
  { key: 'developer', role: 'developer', label: 'developer', cx: 1.0, cy: 7.1, w: 1.0, d: 1.4, h: 16 },
  { key: 'tester', role: 'tester', label: 'tester', cx: 1.0, cy: 9.0, w: 1.0, d: 1.4, h: 16 },
];
export const deskKey = (r: Role) => (r === 'lead' ? 'counter' : r);

/** Where each cat sits to work. */
export const SEAT: Record<Role, Pt> = {
  lead: [2.0, 0.35], planner: [1.95, 3.3], designer: [1.95, 5.2], developer: [1.95, 7.1], tester: [1.95, 9.0],
};
/** Where another cat stands to collect something from a desk. */
export const PICKUP: Record<string, Pt> = {
  counter: [2.3, 1.95], planner: [2.3, 2.65], designer: [2.3, 4.55], developer: [2.3, 6.45], tester: [2.3, 8.35],
};

export const TREE = { x: 10.2, y: 1.6 };
export interface PlaySpot { n: 'tree' | 'bed' | 'bowl' | 'ball'; at: Pt; dur: [number, number]; occ: Role | null }
export const PLAY: PlaySpot[] = [
  { n: 'tree', at: [9.4, 2.5], dur: [1.4, 2.4], occ: null },
  { n: 'bed', at: [11.0, 6.3], dur: [2.2, 3.4], occ: null },
  { n: 'bowl', at: [8.8, 6.5], dur: [1.0, 2.0], occ: null },
  { n: 'ball', at: [9.3, 4.7], dur: [1.0, 2.0], occ: null },
];
const OBSTACLES: [number, number, number, number][] = [
  ...DESKS.map((d) => [d.cx, d.cy, d.w, d.d] as [number, number, number, number]),
  [TREE.x, TREE.y, 1.2, 1.2], [11, 6.3, 1, 1],
];

export interface Cat {
  role: Role; x: number; y: number;
  fur: string; belly: string; tail: string; eye: string; marks: [number, number, number, number, string][];
  flip: boolean; walking: boolean; working: boolean; busy: boolean;
  bubble: string | null; bubbleT: number; thought: string; thoughtT: number; pulseT: number;
  path: Pt[]; goal: PlaySpot | null; act: { spot: PlaySpot; t: number } | null; idleT: number; blinkOffset: number;
  /** When the cat sat down to work (ms since epoch), or 0 when it is not working. */
  workStartAt: number;
  /** Seconds the cat must stay at its post (the lead while Claude works). */
  dutyT: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function makeCat(role: Role, fur: string, belly: string, tail: string, eye: string, marks: Cat['marks'] = []): Cat {
  return {
    role, x: SEAT[role][0], y: SEAT[role][1], fur, belly, tail, eye, marks,
    flip: false, walking: false, working: false, busy: false,
    bubble: null, bubbleT: 0, thought: '', thoughtT: 0, pulseT: 0,
    path: [], goal: null, act: null, idleT: rnd(0.5, 2.5), blinkOffset: Math.random() * 4, dutyT: 0, workStartAt: 0,
  };
}

/** Cat looks. To use your own cat, change the colours here. */
export const cats: Record<Role, Cat> = {
  lead: makeCat('lead', '#F0A055', '#FBE3C6', '#F0A055', '#3A2A20'),
  planner: makeCat('planner', '#A9AFB6', '#E4E7EA', '#A9AFB6', '#3A2A20'),
  designer: makeCat('designer', '#FBF7F0', '#FFFFFF', '#C98A4B', '#3A2A20', [[13, 3, 5, 3, '#C98A4B'], [14, 2, 4, 1, '#C98A4B'], [3, 15, 3, 3, '#3A3330']]),
  developer: makeCat('developer', '#35302F', '#4A4442', '#35302F', '#F5D467'),
  tester: makeCat('tester', '#D99A5B', '#F6DDBE', '#A86A35', '#3A2A20', [[8, 4, 1, 2, '#A86A35'], [10, 4, 1, 3, '#A86A35'], [12, 4, 1, 2, '#A86A35'], [3, 15, 3, 1, '#A86A35'], [14, 15, 3, 1, '#A86A35'], [3, 17, 3, 1, '#A86A35'], [14, 17, 3, 1, '#A86A35']]),
};
export const allCats = () => Object.values(cats);

/** "45s", "2m 10s", "1h 5m". */
export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ---- movement ---------------------------------------------------------------

const roomOf = (x: number) => (x < 7 ? 'work' : 'lounge');
const DOOR_WORK: Pt = [6.3, 4];
const DOOR_LOUNGE: Pt = [7.7, 4];

/** Path from a cat to a point, going through the doorway when changing rooms. */
export function route(c: Cat, to: Pt): Pt[] {
  const pts: Pt[] = [];
  const from = roomOf(c.x), dest = roomOf(to[0]);
  if (from !== dest) pts.push(...(from === 'work' ? [DOOR_WORK, DOOR_LOUNGE] : [DOOR_LOUNGE, DOOR_WORK]));
  pts.push(to);
  return pts;
}

function randomFloorPoint(): Pt {
  for (let i = 0; i < 40; i++) {
    const x = rnd(0.6, 11.4), y = rnd(0.7, FLOOR_D - 0.6);
    if (Math.abs(x - 7) < 0.55) continue;
    if (x < 3.6 && y < 1.8) continue;
    if (OBSTACLES.some(([ox, oy, w, d]) => Math.abs(x - ox) < w / 2 + 0.45 && Math.abs(y - oy) < d / 2 + 0.45)) continue;
    return [x, y];
  }
  return [4, 4];
}

/** Moves a cat along its path. Returns true when the path is finished. */
export function moveCat(c: Cat, dt: number, speed: number): boolean {
  if (!c.path.length) { c.walking = false; return true; }
  const to = c.path[0], dx = to[0] - c.x, dy = to[1] - c.y, d = Math.hypot(dx, dy), step = speed * dt;
  if (d <= step) { c.x = to[0]; c.y = to[1]; c.path.shift(); }
  else {
    c.x += (dx / d) * step; c.y += (dy / d) * step;
    const screenDx = dx - dy;
    if (Math.abs(screenDx) > 0.01) c.flip = screenDx < 0;
  }
  c.walking = c.path.length > 0;
  return !c.path.length;
}

/** Stops whatever a free cat was doing (playing, wandering) so it can take a task. */
export function interrupt(c: Cat) {
  if (c.act) { c.act.spot.occ = null; c.x = c.act.spot.at[0]; c.y = c.act.spot.at[1]; c.act = null; }
  if (c.goal && c.goal.occ === c.role) c.goal.occ = null;
  c.goal = null;
  c.path = [];
}

/** Sends a cat back to its seat and keeps it there for a while (the lead, while Claude is working). */
export function callToDuty(c: Cat, seconds: number) {
  c.dutyT = Math.max(c.dutyT, seconds);
  const [sx, sy] = SEAT[c.role];
  if (c.act || c.goal || (c.path.length === 0 && Math.hypot(c.x - sx, c.y - sy) > 0.05)) {
    interrupt(c);
    c.path = route(c, [sx, sy]);
  }
}

/** What a cat with no task does: wander, play in the lounge, or sit for a bit. */
function idle(c: Cat, dt: number) {
  if (c.act) {
    c.act.t -= dt;
    if (c.act.t <= 0) { interrupt(c); c.idleT = rnd(0.3, 1.2); }
    return;
  }
  if (c.path.length) {
    const done = moveCat(c, dt, 1.3);
    if (done && c.goal) { c.act = { spot: c.goal, t: rnd(c.goal.dur[0], c.goal.dur[1]) }; c.goal = null; }
    return;
  }
  c.idleT -= dt;
  if (c.idleT > 0) return;
  const r = Math.random();
  if (r < 0.45) {
    const free = PLAY.filter((s) => !s.occ);
    if (free.length) {
      const s = free[Math.floor(Math.random() * free.length)];
      s.occ = c.role; c.goal = s; c.path = route(c, s.at);
      return;
    }
  }
  if (r < 0.85) { c.path = route(c, randomFloorPoint()); return; }
  c.idleT = rnd(1, 2.5);
}

export function updateCats(dt: number) {
  for (const c of allCats()) {
    if (c.bubbleT > 0) { c.bubbleT -= dt; if (c.bubbleT <= 0) c.bubble = null; }
    if (c.thoughtT > 0) c.thoughtT -= dt;
    if (c.pulseT > 0) c.pulseT -= dt;
    if (c.busy) moveCat(c, dt, 1.9);
    else if (c.dutyT > 0) { c.dutyT -= dt; moveCat(c, dt, 1.9); if (c.dutyT <= 0) c.idleT = rnd(1, 3); }
    else idle(c, dt);
  }
}

export function say(c: Cat, text: string, seconds: number) { c.bubble = text; c.bubbleT = seconds; }
