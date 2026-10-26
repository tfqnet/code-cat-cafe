#!/usr/bin/env node
// Code Cat Office command line.
//   code-cat-office                 start the office and open it in your browser
//   code-cat-office setup [path]    connect a project (default: the current folder)
//   code-cat-office setup --global  connect every project
//   code-cat-office doctor [path]   check that everything is working
//   code-cat-office sample          play a sample session (no Claude Code needed)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'start';
const rest = cmd === argv[0] ? argv.slice(1) : argv;

const HELP = `
Code Cat Office: your Claude Code agents, as cats.

Usage:
  code-cat-office [start] [--no-open] [--port 4777]   start the office
  code-cat-office setup [path] [--global] [--remove] [--team]
                                                      connect a project (default: current folder)
  code-cat-office doctor [path]                       check that everything works
  code-cat-office sample [--fast]                     play a sample session
  code-cat-office --version
`;

function version() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

if (rest.includes('--help') || rest.includes('-h') || argv.includes('--help') || cmd === 'help') {
  console.log(HELP);
} else if (argv.includes('--version') || argv.includes('-v') || cmd === 'version') {
  console.log(version());
} else if (cmd === 'setup') {
  const { main } = await import('../bridge/setup-hooks.js');
  const hasTarget = rest.some((a) => !a.startsWith('--'));
  const args = rest.includes('--global') || hasTarget ? rest : [process.cwd(), ...rest];
  main(args);
} else if (cmd === 'doctor') {
  const { main } = await import('../bridge/doctor.js');
  process.exit(await main(rest));
} else if (cmd === 'sample') {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bridge/send-sample.js'), ...rest], { stdio: 'inherit' });
  process.exit(r.status ?? 0);
} else if (cmd === 'start') {
  const portAt = rest.indexOf('--port');
  if (portAt !== -1 && rest[portAt + 1]) process.env.CAFE_PORT = rest[portAt + 1];
  if (!rest.includes('--no-open')) process.argv.push('--open');
  await import('../bridge/server.js');
} else {
  console.error(`Unknown command "${cmd}".`);
  console.log(HELP);
  process.exit(1);
}
