// `code-cat-office doctor`: checks that everything needed for the office to work is in place.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EVENTS, countHookEvents } from './setup-hooks.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TOTAL = Object.keys(EVENTS).length;

const readJson = (file) => {
  try { return { settings: JSON.parse(fs.readFileSync(file, 'utf8')), file }; }
  catch (err) { return { settings: null, file, missing: err.code === 'ENOENT' }; }
};

/** Pure helper: turns "how many hook events are in each settings file" into one check result. */
export function hooksCheck({ global, project, projectFile }) {
  const good = (n) => n === TOTAL;
  if (good(global) || good(project)) {
    const where = [good(global) && 'every project (global)', good(project) && `this project (${projectFile})`].filter(Boolean).join(' and ');
    return { ok: true, name: 'Hooks installed', detail: where };
  }
  if (global > 0 || project > 0) {
    return { ok: false, name: 'Hooks installed', detail: `only ${Math.max(global, project)} of ${TOTAL} events are connected`, fix: 'Run: code-cat-office setup (it adds the missing ones)' };
  }
  return { ok: false, name: 'Hooks installed', detail: 'no hooks found for this project', fix: 'Run: code-cat-office setup   (or: code-cat-office setup --global)' };
}

/** Pure helper: describes whether events are reaching the server. */
export function eventsCheck(health, now = Date.now()) {
  if (!health) return { ok: false, name: 'Events arriving', detail: 'the server is not running', fix: 'Start it with: code-cat-office' };
  if (!health.events) return { ok: false, name: 'Events arriving', detail: 'none received yet', fix: 'Restart Claude Code in a connected project (hooks load when a session starts), then send a message' };
  const s = Math.round((now - health.lastEventAt) / 1000);
  const ago = s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
  return { ok: true, name: 'Events arriving', detail: `${health.events} received, last ${ago}` };
}

async function fetchHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function runChecks({ cwd = process.cwd(), port = Number(process.env.CAFE_PORT || 4777) } = {}) {
  const checks = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push(major >= 20
    ? { ok: true, name: 'Node.js', detail: `v${process.versions.node}` }
    : { ok: false, name: 'Node.js', detail: `v${process.versions.node}`, fix: 'Install Node.js 20 or newer' });

  const curl = spawnSync('curl', ['--version'], { stdio: 'ignore' });
  checks.push(curl.status === 0
    ? { ok: true, name: 'curl', detail: 'found (the hooks use it to reach the office)' }
    : { ok: false, name: 'curl', detail: 'not found', fix: 'Install curl. On Windows, run Claude Code from Git Bash or WSL' });

  checks.push(fs.existsSync(path.resolve(ROOT, '../web/dist/index.html'))
    ? { ok: true, name: 'Office page built', detail: 'web/dist is present' }
    : { ok: false, name: 'Office page built', detail: 'web/dist is missing', fix: 'Run: npm run build (inside the code-cat-office folder)' });

  const health = await fetchHealth(port);
  checks.push(health
    ? { ok: true, name: 'Server running', detail: `http://localhost:${port} (v${health.version || '?'}, ${health.clients} page${health.clients === 1 ? '' : 's'} open)` }
    : { ok: false, name: 'Server running', detail: `nothing answered on port ${port}`, fix: 'Start it with: code-cat-office' });

  const globalFile = path.join(os.homedir(), '.claude', 'settings.json');
  const projectFile = path.join(cwd, '.claude', 'settings.local.json');
  const g = readJson(globalFile), p = readJson(projectFile);
  checks.push(hooksCheck({ global: countHookEvents(g.settings), project: countHookEvents(p.settings), projectFile: path.relative(cwd, projectFile) || projectFile }));
  checks.push(eventsCheck(health));

  if (process.platform === 'win32') {
    checks.push({ ok: true, warn: true, name: 'Windows', detail: 'hooks need Git Bash or WSL (curl and POSIX shell). This setup is untested on Windows' });
  }
  return checks;
}

export async function main(args = process.argv.slice(2)) {
  const target = args.find((a) => !a.startsWith('--'));
  const cwd = target ? path.resolve(target.replace(/^~(?=$|[\\/])/, os.homedir())) : process.cwd();
  console.log(`\nChecking Code Cat Office for ${cwd}\n`);
  const checks = await runChecks({ cwd });
  for (const c of checks) {
    console.log(`  ${c.ok ? (c.warn ? '!' : '✓') : '✗'} ${c.name}: ${c.detail}`);
    if (!c.ok && c.fix) console.log(`      → ${c.fix}`);
  }
  const bad = checks.filter((c) => !c.ok).length;
  console.log(bad ? `\n${bad} problem${bad === 1 ? '' : 's'} found.\n` : '\nAll good.\n');
  return bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code));
}
