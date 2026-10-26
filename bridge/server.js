// Code Cat Office bridge.
// Claude Code hooks POST their payloads to /hook. The bridge turns them into
// small office events and streams them to the browser over Server-Sent Events.
// It also serves the built office page from web/dist.
//
// No dependencies: plain Node 20+.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalize } from './normalize.js';

const PORT = Number(process.env.CAFE_PORT || 4777);
const HOST = process.env.CAFE_HOST || '127.0.0.1';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(ROOT, '../web/dist');
const LOG_DIR = path.join(os.homedir(), '.code-cat-cafe');
const RAW_LOG = path.join(LOG_DIR, 'hook-events.jsonl');
const MAX_LOG_BYTES = 2 * 1024 * 1024;

const clients = new Set();
const recent = []; // last office events, replayed to a newly opened page
const MAX_RECENT = 200;

function logRaw(payload) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    if (fs.existsSync(RAW_LOG) && fs.statSync(RAW_LOG).size > MAX_LOG_BYTES) {
      fs.renameSync(RAW_LOG, RAW_LOG + '.old');
    }
    fs.appendFileSync(RAW_LOG, JSON.stringify(payload) + '\n');
  } catch { /* logging is best-effort */ }
}

const readFile = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

function broadcast(event) {
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
}

function handleHook(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 5e6) req.destroy(); });
  req.on('end', () => {
    // Answer straight away with no body, so Claude Code never waits on us
    // and never reads a decision from our reply.
    res.writeHead(204).end();
    let payload;
    try { payload = JSON.parse(body); } catch { return; }
    logRaw(payload);
    for (const e of normalize(payload, { readFile })) {
      if (process.env.CAFE_DEBUG) console.log('→', JSON.stringify(e));
      broadcast(e);
    }
  });
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(`data: ${JSON.stringify({ type: 'hello', at: Date.now() })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('The office page is not built yet. Run "npm start" (or "npm run build") in the code-cat-cafe folder.');
    return;
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(DIST, urlPath);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
  } else if (req.method === 'POST' && pathname === '/hook') {
    handleHook(req, res);
  } else if (pathname === '/events') {
    handleEvents(req, res);
  } else if (pathname === '/recent') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(recent));
  } else if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clients.size }));
  } else {
    serveStatic(req, res);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Is the office already running in another terminal?`);
    console.error(`Close it, or run with another port: CAFE_PORT=4778 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n  🐱 Code Cat Office is open at ${url}`);
  console.log(`  Listening for Claude Code hooks at ${url}/hook`);
  console.log(`  Raw hook payloads are logged to ${RAW_LOG}\n`);
  if (process.argv.includes('--open')) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    try { spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref(); } catch { /* ignore */ }
  }
});
