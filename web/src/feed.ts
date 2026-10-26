// Where office events come from: the live bridge, or a built-in demo.

import type { CafeEvent } from './director';
import type { Role } from './world';

export type FeedMode = 'connecting' | 'live' | 'demo';

/**
 * Connects to the bridge. If it can't be reached (or ?demo is in the URL),
 * plays the demo story instead, and switches to live once the bridge appears.
 */
export function startFeed(onEvent: (e: CafeEvent) => void, onMode: (m: FeedMode) => void) {
  const forceDemo = new URLSearchParams(location.search).has('demo');
  let demoStop: (() => void) | null = null;
  let everLive = false;

  const startDemo = () => {
    if (demoStop) return;
    onMode('demo');
    demoStop = playDemo(onEvent);
  };

  if (forceDemo) { startDemo(); return; }

  onMode('connecting');
  const fallback = setTimeout(startDemo, 2500);
  const es = new EventSource('/events');
  es.onopen = () => {
    clearTimeout(fallback);
    if (demoStop) { location.reload(); return; } // start the live office from a clean slate
    everLive = true;
    onMode('live');
  };
  es.onmessage = (m) => {
    try { onEvent(JSON.parse(m.data)); } catch { /* ignore bad lines */ }
  };
  es.onerror = () => { if (everLive) onMode('connecting'); };
}

type Step = [number, CafeEvent];
const tool = (role: Role, t: string, detail: string): CafeEvent => ({ type: 'tool', role, tool: t, detail });

const ORDERS = [
  { text: 'Add a dark mode toggle', bug: true },
  { text: 'Build the login page', bug: false },
  { text: 'Fix the navbar on mobile', bug: true },
];

function storyFor(o: { text: string; bug: boolean }): Step[] {
  const s: Step[] = [
    [1500, { type: 'order', text: o.text }],
    [1200, { type: 'todos', todos: [
      { text: 'Plan it', status: 'in_progress' }, { text: 'Design it', status: 'pending' },
      { text: 'Build it', status: 'pending' }, { text: 'Test it', status: 'pending' },
    ] }],
    [300, { type: 'agent_start', role: 'planner', agent: 'planner' }],
    [4500, tool('planner', 'Read', 'Settings.tsx')],
    [1800, tool('planner', 'Grep', 'theme')],
    [1800, tool('planner', 'Write', 'plan.md')],
    [1500, { type: 'agent_end', role: 'planner' }],
    [2500, { type: 'needs_you', reason: 'permission', message: 'Approve the plan for “' + o.text + '”?' }],
    [6000, { type: 'todos', todos: [
      { text: 'Plan it', status: 'completed' }, { text: 'Design it', status: 'in_progress' },
      { text: 'Build it', status: 'pending' }, { text: 'Test it', status: 'pending' },
    ] }],
    [200, { type: 'agent_start', role: 'designer', agent: 'designer' }],
    [5000, tool('designer', 'Read', 'theme.css')],
    [1800, tool('designer', 'Write', 'design.md')],
    [1500, { type: 'agent_end', role: 'designer' }],
    [500, { type: 'todos', todos: [
      { text: 'Plan it', status: 'completed' }, { text: 'Design it', status: 'completed' },
      { text: 'Build it', status: 'in_progress' }, { text: 'Test it', status: 'pending' },
    ] }],
    [200, { type: 'agent_start', role: 'developer', agent: 'developer' }],
    [5000, tool('developer', 'Edit', 'Settings.tsx')],
    [1800, tool('developer', 'Write', 'useTheme.ts')],
    [1800, tool('developer', 'Bash', 'npm run build')],
    [1500, { type: 'agent_end', role: 'developer' }],
    [500, { type: 'todos', todos: [
      { text: 'Plan it', status: 'completed' }, { text: 'Design it', status: 'completed' },
      { text: 'Build it', status: 'completed' }, { text: 'Test it', status: 'in_progress' },
    ] }],
    [200, { type: 'agent_start', role: 'tester', agent: 'tester' }],
    [5000, tool('tester', 'Bash', 'npm test')],
    [1800, { type: 'agent_end', role: 'tester', result: o.bug ? 'fail' : 'pass' }],
  ];
  if (o.bug) s.push(
    [2500, { type: 'agent_start', role: 'developer', agent: 'developer' }],
    [5000, tool('developer', 'Edit', 'useTheme.ts')],
    [1500, { type: 'agent_end', role: 'developer' }],
    [500, { type: 'agent_start', role: 'tester', agent: 'tester' }],
    [5000, tool('tester', 'Bash', 'npm test')],
    [1500, { type: 'agent_end', role: 'tester', result: 'pass' }],
  );
  s.push(
    [500, { type: 'todos', todos: [
      { text: 'Plan it', status: 'completed' }, { text: 'Design it', status: 'completed' },
      { text: 'Build it', status: 'completed' }, { text: 'Test it', status: 'completed' },
    ] }],
    [1500, { type: 'turn_done' }],
    [9000, { type: 'hello' }], // free time before the next order
  );
  return s;
}

function playDemo(onEvent: (e: CafeEvent) => void): () => void {
  let stopped = false, timer = 0, orderIdx = 0, steps: Step[] = [], i = 0;
  const next = () => {
    if (stopped) return;
    if (i >= steps.length) { steps = storyFor(ORDERS[orderIdx++ % ORDERS.length]); i = 0; }
    const [delay, ev] = steps[i++];
    timer = window.setTimeout(() => { onEvent(ev); next(); }, delay);
  };
  next();
  return () => { stopped = true; clearTimeout(timer); };
}
