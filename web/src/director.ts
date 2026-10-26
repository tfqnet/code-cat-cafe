// The director turns office events (from the bridge or the demo) into a queue
// of things the cats act out: walk here, pick up the ticket, work, hand over.
// Actions run one after another, so the story always reads in order even when
// Claude Code is faster than the cats.

import { callToDuty, cats, deskKey, interrupt, PICKUP, route, say, SEAT, type Pt, type Role, type Stage } from './world';

type CafeEventBody =
  | { type: 'hello' | 'session' | 'turn_done'; at?: number }
  | { type: 'order'; text: string; project?: string }
  | { type: 'agent_start'; role: Role; agent?: string; detail?: string }
  | { type: 'agent_end'; role: Role; agent?: string; result?: 'pass' | 'fail' | null }
  | { type: 'test_result'; result: 'pass' | 'fail' }
  | { type: 'tool'; role: Role; tool: string; detail?: string }
  | { type: 'needs_you'; reason: 'permission' | 'idle'; message?: string }
  | { type: 'todos'; todos: { id?: string; text: string; status: string }[] }
  | { type: 'task'; id?: string; text?: string; status?: string };

/** Events from the bridge also say which project and session they came from. */
export type CafeEvent = CafeEventBody & { project?: string; session?: string };

/** holder is a desk key ('counter', 'planner', ...) or a cat carrying it ('cat:planner'). */
export interface Ticket { holder: string; stage: Stage }
export interface Order { id: number; text: string; state: 'doing' | 'done'; project?: string }
export interface Todo { id?: string; text: string; status: string }
export interface Waiting { reason: 'permission' | 'idle'; message: string; project?: string }
export interface FeedItem { role: Role; text: string; at: number; project?: string }

type Action =
  | { kind: 'do'; run: () => void }
  | { kind: 'walk'; role: Role; to: () => Pt }
  | { kind: 'wait'; ms: number; t?: number }
  | { kind: 'until'; ready: () => boolean };

const STAGE_AFTER: Record<Role, Stage> = { lead: 'order', planner: 'plan', designer: 'design', developer: 'code', tester: 'done' };
const PHASE: Record<Role, string> = { lead: 'lead is on it', planner: 'planning', designer: 'designing', developer: 'coding', tester: 'testing' };

export interface UiHooks {
  status(text: string): void;
  changed(): void; // board / feed / bell need re-rendering
  ding(reason: 'permission' | 'idle'): void;
}

/** The lead stays at the counter this long after the last sign of work, in case no Stop event arrives (e.g. Esc). */
const TURN_DUTY_S = 90;

export class Director {
  ticket: Ticket | null = null;
  orders: Order[] = [];
  todos: Todo[] = [];
  waiting: Waiting | null = null;
  feed: FeedItem[] = [];
  /** Projects seen so far, with the time of their last event. */
  projects = new Map<string, number>();
  /** Project of the event being handled right now. */
  private cur: string | undefined;
  phase = '';
  private active = new Set<Role>();
  private ended = new Set<Role>();
  private results: Partial<Record<Role, 'pass' | 'fail' | null>> = {};
  private queue: Action[] = [];
  private current: Action | null = null;
  private nextOrderId = 1;
  private ringT = 0;

  constructor(private ui: UiHooks) {}

  // ---- event handling -------------------------------------------------------

  handle(e: CafeEvent) {
    this.cur = e.project || undefined;
    if (this.cur) { this.projects.set(this.cur, Date.now()); this.ui.changed(); }
    switch (e.type) {
      case 'order': return this.onOrder(e.text);
      case 'agent_start': return this.onAgentStart(e.role, e.detail || e.agent);
      case 'agent_end': return this.onAgentEnd(e.role, e.result ?? null);
      case 'test_result': this.results.tester = e.result; this.lastTest = { result: e.result, at: Date.now() }; this.ui.changed(); return;
      case 'tool': return this.onTool(e.role, e.tool, e.detail);
      case 'needs_you': return this.onNeedsYou(e.reason, e.message);
      case 'todos': this.todos = e.todos.map((t) => ({ ...t })); this.ui.changed(); return;
      case 'task': return this.onTask(e);
      case 'turn_done': return this.onTurnDone();
      default: return;
    }
  }

  private onOrder(text: string) {
    this.clearWaiting();
    const project = this.cur;
    this.push(
      { kind: 'do', run: () => {
        for (const o of this.orders) if (o.state === 'doing') o.state = 'done';
        this.orders.unshift({ id: this.nextOrderId++, text, state: 'doing', project });
        this.orders = this.orders.slice(0, 8);
        this.todos = [];
        this.ticket = { holder: 'counter', stage: 'order' };
        this.phase = 'new order';
        say(cats.lead, 'new order!', 1.6);
        this.turnActive = true;
        this.turnStartAt = Date.now();
        callToDuty(cats.lead, TURN_DUTY_S);
        this.ui.status(`New order${project ? ` [${project}]` : ''}: ${text}`);
        this.ui.changed();
      } },
      { kind: 'wait', ms: 1200 },
    );
  }

  private onAgentStart(role: Role, detail?: string) {
    if (role === 'lead' || this.active.has(role)) return;
    this.clearWaiting();
    this.active.add(role);
    this.ended.delete(role);
    delete this.results[role];
    const c = cats[role];
    this.push(
      { kind: 'do', run: () => {
        interrupt(c); c.busy = true; say(c, '!', 0.8);
        if (!this.ticket) this.ticket = { holder: 'counter', stage: 'order' };
        this.ui.status(`The ${role} is called over${detail ? `: ${detail}` : ''}`);
      } },
      { kind: 'walk', role, to: () => this.pickupFor(role) },
      { kind: 'do', run: () => { if (this.ticket) this.ticket.holder = `cat:${role}`; } },
      { kind: 'walk', role, to: () => SEAT[role] },
      { kind: 'do', run: () => {
        c.working = true; c.workStartAt = Date.now();
        if (this.ticket) this.ticket.holder = deskKey(role);
        this.phase = this.ticket?.stage === 'bug' && role === 'developer' ? 'fixing' : PHASE[role];
        this.ui.status(`The ${role} is ${this.phase}`);
        this.ui.changed();
      } },
      { kind: 'until', ready: () => this.ended.has(role) },
    );
  }

  private onAgentEnd(role: Role, result: 'pass' | 'fail' | null) {
    if (!this.active.has(role)) return;
    this.active.delete(role);
    if (result) this.results[role] = result;
    this.ended.add(role);
    const c = cats[role];
    const failed = () => role === 'tester' && this.results.tester === 'fail';
    this.push({ kind: 'do', run: () => {
      c.working = false; c.workStartAt = 0;
      if (this.ticket) this.ticket.stage = failed() ? 'bug' : STAGE_AFTER[role];
      if (role === 'tester') { say(c, failed() ? 'bug!' : 'pass!', 1.4); this.lastTest = { result: this.results.tester ?? null, at: Date.now() }; }
      this.ui.status(failed() ? 'Tests failed. The tester takes it back to the developer' : `The ${role} is done. It's on their table`);
      this.ui.changed();
    } });
    if (role === 'tester') {
      this.push(
        { kind: 'wait', ms: 900 },
        { kind: 'do', run: () => { if (!failed()) return; this.queue.unshift(
          { kind: 'walk', role: 'tester', to: () => PICKUP.developer },
          { kind: 'do', run: () => { if (this.ticket) this.ticket.holder = 'developer'; } },
        ); } },
      );
    }
    this.push({ kind: 'do', run: () => { c.busy = false; c.idleT = 0.5 + Math.random(); } });
  }

  private onTool(role: Role, tool: string, detail?: string) {
    this.clearWaiting();
    const c = cats[role] ?? cats.lead;
    c.thought = tool; c.thoughtT = 3;
    if (role === 'lead' && this.active.size === 0) c.pulseT = 2.5;
    if (role === 'lead') callToDuty(c, this.turnActive ? TURN_DUTY_S : 8);
    this.feed.unshift({ role, text: detail ? `${tool} · ${detail}` : tool, at: Date.now(), project: this.cur });
    this.feed = this.feed.slice(0, 8);
    this.ui.changed();
  }

  private onNeedsYou(reason: 'permission' | 'idle', message?: string) {
    this.waiting = { reason, message: message || (reason === 'idle' ? 'Claude is waiting for your reply' : 'Claude needs your OK'), project: this.cur };
    say(cats.lead, reason === 'idle' ? 'your turn!' : 'need you!', 9999);
    this.ringT = 0;
    callToDuty(cats.lead, 9999);
    this.ui.status('The lead rings the bell. Check your terminal');
    this.ui.changed();
  }

  clearWaiting() {
    if (!this.waiting) return;
    this.waiting = null;
    cats.lead.dutyT = 5;
    if (cats.lead.bubble === 'need you!' || cats.lead.bubble === 'your turn!') say(cats.lead, 'thanks!', 1.2);
    this.ui.changed();
  }

  private onTask(e: { id?: string; text?: string; status?: string }) {
    const found = this.todos.find((t) => (e.id && t.id === e.id) || (e.text && t.text === e.text));
    if (found) { if (e.status) found.status = e.status; if (e.text) found.text = e.text; }
    else if (e.text) this.todos.push({ id: e.id || undefined, text: e.text, status: e.status || 'pending' });
    this.ui.changed();
  }

  private onTurnDone() {
    this.push({ kind: 'do', run: () => {
      this.turnActive = false;
      cats.lead.dutyT = Math.min(cats.lead.dutyT, 3);
      const t = this.ticket;
      if (!t) return;
      const steps: Action[] = [];
      const holderRole = (['planner', 'designer', 'developer', 'tester'] as Role[]).find((r) => t.holder === r);
      if (holderRole && !this.active.has(holderRole)) {
        const c = cats[holderRole];
        steps.push(
          { kind: 'do', run: () => { interrupt(c); c.busy = true; this.ui.status(`The ${holderRole} brings the finished order to the counter`); } },
          { kind: 'walk', role: holderRole, to: () => this.pickupFor(holderRole) },
          { kind: 'do', run: () => { t.holder = `cat:${holderRole}`; } },
          { kind: 'walk', role: holderRole, to: () => PICKUP.counter },
          { kind: 'do', run: () => { t.holder = 'cat:lead'; c.busy = false; c.idleT = 0.5; } },
        );
      }
      steps.push(
        { kind: 'do', run: () => {
          say(cats.lead, 'order served!', 1.8);
          this.ticket = null;
          this.phase = '';
          for (const o of this.orders) if (o.state === 'doing') o.state = 'done';
          this.ui.status('Order served. Free time in the lounge');
          this.ui.changed();
        } },
        { kind: 'wait', ms: 800 },
      );
      this.queue.unshift(...steps);
    } });
  }

  /** Where a role should walk to collect the ticket right now. */
  private pickupFor(role: Role): Pt {
    const h = this.ticket?.holder;
    if (!h || h === 'counter' || h === 'cat:lead') return PICKUP.counter;
    if (h === deskKey(role)) return SEAT[role];
    if (PICKUP[h]) return PICKUP[h];
    const holder = h.startsWith('cat:') ? cats[h.slice(4) as Role] : undefined;
    return holder ? [holder.x + 0.6, holder.y + 0.3] : PICKUP.counter;
  }

  // ---- queue ------------------------------------------------------------------

  /** True from a new prompt until Claude finishes its turn: the lead stays at the counter. */
  turnActive = false;
  /** When the current turn began (ms since epoch). Only meaningful while turnActive. */
  turnStartAt = 0;
  /** The last tester verdict, kept after the run so the desk can keep showing it. */
  lastTest: { result: 'pass' | 'fail' | null; at: number } | null = null;

  private push(...a: Action[]) { this.queue.push(...a); }

  /** True while the cats still have story to act out. */
  get busy() { return !!this.current || this.queue.length > 0; }

  update(dt: number) {
    if (this.waiting?.reason === 'permission') {
      this.ringT -= dt;
      if (this.ringT <= 0) { this.ui.ding('permission'); this.ringT = 3; }
    } else if (this.waiting && this.ringT === 0) {
      this.ui.ding('idle'); this.ringT = -1;
    }

    // Run instant actions straight through; stop at the first one that takes time.
    for (let guard = 0; guard < 50; guard++) {
      if (!this.current) {
        const next = this.queue.shift();
        if (!next) return;
        this.current = next;
        if (next.kind === 'walk') cats[next.role].path = route(cats[next.role], next.to());
        if (next.kind === 'wait') next.t = 0;
      }
      const a = this.current;
      let done = false;
      if (a.kind === 'do') { a.run(); done = true; }
      else if (a.kind === 'walk') done = cats[a.role].path.length === 0;
      else if (a.kind === 'wait') { a.t = (a.t ?? 0) + dt * 1000; done = a.t >= a.ms; }
      else if (a.kind === 'until') done = a.ready();
      if (!done) return;
      this.current = null;
    }
  }
}
