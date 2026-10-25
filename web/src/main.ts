import './style.css';
import { Director } from './director';
import { startFeed, type FeedMode } from './feed';
import { Renderer, STAGE_COLOR } from './render';
import { cats, updateCats, type Role } from './world';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $('status'), boardEl = $('board'), boardTitle = $('board-title'), activityEl = $('activity');
const bellEl = $('bell'), bellTitle = $('bell-title'), bellText = $('bell-text');
const modeEl = $('mode'), soundBtn = $<HTMLButtonElement>('sound'), demoHint = $('demo-hint');

// ---- sound ------------------------------------------------------------------------
let soundOn = false;
let audio: AudioContext | null = null;
try { soundOn = localStorage.getItem('cafe-sound') === 'on'; } catch { /* storage blocked */ }

function ding(reason: 'permission' | 'idle' = 'permission') {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  const notes: [number, number][] = reason === 'idle' ? [[988, 0]] : [[1318, 0], [1760, 0.18]];
  for (const [f, d] of notes) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
    o.connect(g).connect(audio.destination);
    o.start(t + d); o.stop(t + d + 1);
  }
}
function renderSoundBtn() {
  soundBtn.textContent = soundOn ? '🔔 Sound on' : '🔕 Sound';
  soundBtn.setAttribute('aria-pressed', String(soundOn));
}
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  try { localStorage.setItem('cafe-sound', soundOn ? 'on' : 'off'); } catch { /* ignore */ }
  if (soundOn && !audio) { try { audio = new AudioContext(); } catch { /* no audio */ } }
  audio?.resume();
  renderSoundBtn();
  if (soundOn) ding();
});
// Browsers only allow sound after a click, so unlock audio on the first one.
window.addEventListener('pointerdown', () => { if (soundOn && !audio) { try { audio = new AudioContext(); } catch { /* */ } } audio?.resume(); }, { once: true });
renderSoundBtn();

// ---- director + UI --------------------------------------------------------------
const ROLE_COLOR: Record<Role, string> = { lead: '#E08A3A', planner: '#7E8C99', designer: '#C98A4B', developer: '#5A5350', tester: '#B97A3F' };
const PHASE_COLOR: Record<string, string> = {
  'new order': STAGE_COLOR.order, planning: STAGE_COLOR.plan, designing: STAGE_COLOR.design, coding: STAGE_COLOR.code,
  testing: '#C98A4B', fixing: STAGE_COLOR.bug, 'waiting for you': '#E0A030', 'lead is on it': STAGE_COLOR.order,
};
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

let dirty = true;
const director = new Director({
  status: (t) => { statusEl.textContent = t; },
  changed: () => { dirty = true; },
  ding,
});

function renderBoard() {
  const col = (title: string, items: string[]) =>
    `<div><div class="col-title">${title} (${items.length})</div>${items.join('') || '<div class="empty">–</div>'}</div>`;
  const card = (text: string, extra = '') => `<div class="ticket">${esc(text)}${extra}</div>`;
  const phase = director.waiting ? 'waiting for you' : director.phase;
  const phaseTag = phase ? `<small><span class="dot" style="background:${PHASE_COLOR[phase] || '#999'}"></span>${esc(phase)}</small>` : '';

  if (director.todos.length) {
    boardTitle.textContent = "Claude's to-do list";
    const by = (s: string) => director.todos.filter((t) => t.status === s);
    boardEl.innerHTML =
      col('To do', by('pending').map((t) => card(t.text))) +
      col('Doing', by('in_progress').map((t) => card(t.text, phaseTag))) +
      col('Done', by('completed').map((t) => card(t.text, '<small class="ok">✓ done</small>')));
  } else {
    boardTitle.textContent = 'Order board';
    boardEl.innerHTML =
      col('To do', []) +
      col('Doing', director.orders.filter((o) => o.state === 'doing').map((o) => card(o.text, phaseTag))) +
      col('Done', director.orders.filter((o) => o.state === 'done').map((o) => card(o.text, '<small class="ok">✓ served</small>')));
  }
}

function ago(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  return s < 5 ? 'now' : s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
}
function renderActivity() {
  activityEl.innerHTML = director.feed.length
    ? director.feed.map((f) => `<li><span class="who" style="color:${ROLE_COLOR[f.role]}">${f.role}</span><span class="what">${esc(f.text)}</span><span class="when">${ago(f.at)}</span></li>`).join('')
    : '<li><span class="what" style="color:var(--muted)">Nothing yet. The cats are chilling.</span></li>';
}

let titleFlash = 0;
function renderBell() {
  const w = director.waiting;
  bellEl.hidden = !w;
  if (w) {
    bellTitle.textContent = w.reason === 'idle' ? 'Claude is waiting for your reply' : 'Claude needs you';
    const msg = /[.?!]$/.test(w.message) ? w.message : `${w.message}.`;
    bellText.textContent = `${msg} Answer in your terminal.`;
  }
}
$('bell-dismiss').addEventListener('click', () => director.clearWaiting());

function setMode(m: FeedMode) {
  modeEl.className = `badge ${m === 'live' ? 'live' : m === 'demo' ? 'demo' : ''}`;
  modeEl.textContent = m === 'live' ? '● Live' : m === 'demo' ? 'Demo' : 'Connecting…';
  demoHint.hidden = m !== 'demo';
  if (m === 'live') statusEl.textContent = 'Connected. Start Claude Code in a connected project and send a request.';
}

// Tap a cat to see what it last did.
const canvas = $<HTMLCanvasElement>('cafe');
const renderer = new Renderer(canvas, director);
canvas.addEventListener('click', (e) => {
  const role = renderer.catAt(e.clientX, e.clientY);
  if (!role) return;
  const last = director.feed.find((f) => f.role === role);
  const c = cats[role];
  const doing = c.working ? 'working' : c.act ? `playing (${c.act.spot.n})` : c.walking ? 'walking' : 'chilling';
  statusEl.textContent = `The ${role} is ${doing}.${last ? ` Last action: ${last.text}` : ''}`;
});

startFeed((e) => director.handle(e), setMode);

// ---- main loop ------------------------------------------------------------------------
let last = performance.now(), activityTick = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  renderer.T += dt;
  director.update(dt);
  updateCats(dt);
  renderer.draw();
  activityTick += dt;
  if (dirty || activityTick > 5) { renderBoard(); renderActivity(); renderBell(); dirty = false; activityTick = 0; }
  // Flash the tab title while Claude is waiting, so you notice from another tab.
  if (director.waiting) {
    titleFlash += dt;
    document.title = Math.floor(titleFlash * 1.5) % 2 ? '🔔 Claude needs you' : 'Code Cat Café';
  } else if (titleFlash) { titleFlash = 0; document.title = 'Code Cat Café'; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
