#!/usr/bin/env node
// Adds (or removes) the Code Cat Café hooks in a Claude Code settings file.
//
//   npm run setup -- ~/code/my-app            hooks for one project (.claude/settings.local.json)
//   npm run setup -- ~/code/my-app --team     also copy the planner/designer/developer/tester team
//   npm run setup -- --global                 hooks for every project (~/.claude/settings.json)
//   npm run setup -- ~/code/my-app --remove   take the hooks out again

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = '# code-cat-cafe';
export const HOOK_COMMAND =
  `curl -s -m 2 -X POST -H 'Content-Type: application/json' --data-binary @- "http://localhost:\${CAFE_PORT:-4777}/hook" >/dev/null 2>&1 || true ${MARK}`;

// Events that accept a tool/agent matcher get "*"; the rest have no matcher.
export const EVENTS = {
  SessionStart: false,
  UserPromptSubmit: false,
  PreToolUse: true,
  PostToolUse: true,
  SubagentStart: true,
  SubagentStop: true,
  PermissionRequest: true,
  Notification: true,
  TaskCreated: false,
  TaskCompleted: false,
  Stop: false,
};

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(MARK);

export function addHooks(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  s.hooks = s.hooks && typeof s.hooks === 'object' ? s.hooks : {};
  for (const [event, hasMatcher] of Object.entries(EVENTS)) {
    const groups = Array.isArray(s.hooks[event]) ? s.hooks[event] : [];
    if (groups.some((g) => (g.hooks || []).some(isOurs))) { s.hooks[event] = groups; continue; }
    const group = { hooks: [{ type: 'command', command: HOOK_COMMAND, async: true, timeout: 5 }] };
    if (hasMatcher) group.matcher = '*';
    s.hooks[event] = [...groups, group];
  }
  return s;
}

export function removeHooks(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  if (!s.hooks) return s;
  for (const event of Object.keys(s.hooks)) {
    const groups = (s.hooks[event] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (groups.length) s.hooks[event] = groups; else delete s.hooks[event];
  }
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
}

function copyTeam(projectDir) {
  const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../team-kit');
  const agentsSrc = path.join(kit, '.claude/agents');
  const agentsDst = path.join(projectDir, '.claude/agents');
  fs.mkdirSync(agentsDst, { recursive: true });
  for (const f of fs.readdirSync(agentsSrc)) {
    const dst = path.join(agentsDst, f);
    if (fs.existsSync(dst)) console.log(`  skipped .claude/agents/${f} (already exists)`);
    else { fs.copyFileSync(path.join(agentsSrc, f), dst); console.log(`  added   .claude/agents/${f}`); }
  }
  const claudeMd = path.join(projectDir, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    const alt = path.join(projectDir, 'CLAUDE.team.md');
    fs.copyFileSync(path.join(kit, 'CLAUDE.md'), alt);
    console.log('  CLAUDE.md already exists, so the team workflow was saved as CLAUDE.team.md.');
    console.log('  Copy its contents into your CLAUDE.md when you are ready.');
  } else {
    fs.copyFileSync(path.join(kit, 'CLAUDE.md'), claudeMd);
    console.log('  added   CLAUDE.md (fill in "Project notes" at the bottom)');
  }
}

function main() {
  const args = process.argv.slice(2);
  const global = args.includes('--global');
  const remove = args.includes('--remove');
  const team = args.includes('--team');
  const target = args.find((a) => !a.startsWith('--'));

  let file;
  let projectDir = null;
  if (global) {
    file = path.join(os.homedir(), '.claude', 'settings.json');
  } else {
    if (!target) {
      console.error('\nTell me which project to connect, for example:\n  npm run setup -- ~/code/my-app\n\nOr connect every project with:\n  npm run setup -- --global\n');
      process.exit(1);
    }
    projectDir = path.resolve(target.replace(/^~(?=$|\/)/, os.homedir()));
    if (!fs.existsSync(projectDir)) { console.error(`\nFolder not found: ${projectDir}\n`); process.exit(1); }
    file = path.join(projectDir, '.claude', 'settings.local.json');
  }

  let settings = {};
  if (fs.existsSync(file)) {
    try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { console.error(`\nCould not read ${file} (it is not valid JSON). Fix or remove it, then try again.\n`); process.exit(1); }
    fs.copyFileSync(file, file + '.bak');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = remove ? removeHooks(settings) : addHooks(settings);
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');

  console.log(`\n${remove ? 'Removed' : 'Added'} café hooks ${remove ? 'from' : 'in'} ${file}`);
  if (team && projectDir && !remove) { console.log('\nTeam:'); copyTeam(projectDir); }
  if (!remove) {
    console.log('\nNext:');
    console.log('  1. Keep the café running (npm start in the code-cat-cafe folder)');
    console.log(`  2. Start a new Claude Code session${projectDir ? ` in ${projectDir}` : ''}`);
    console.log('  3. Ask for a feature and watch the cats\n');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
