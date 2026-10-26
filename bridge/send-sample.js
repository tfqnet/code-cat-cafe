#!/usr/bin/env node
// Plays a recorded-style Claude Code session into the bridge, so you can see
// the office react without running Claude Code.  Usage: npm run sample

const PORT = Number(process.env.CAFE_PORT || 4777);
const URL_ = `http://localhost:${PORT}/hook`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fast = process.argv.includes('--fast');

const base = { session_id: 'sample-session-0001', cwd: '/Users/you/code/my-app', transcript_path: '/tmp/x.jsonl', permission_mode: 'default' };
const pre = (tool_name, tool_input, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name, tool_input, ...extra });
const post = (tool_name, tool_input, tool_response, extra = {}) => ({ hook_event_name: 'PostToolUse', tool_name, tool_input, tool_response, ...extra });
const sub = (agent_type, id) => ({ agent_type, agent_id: id });

const STEPS = [
  { hook_event_name: 'SessionStart', source: 'startup' },
  { wait: 1500 },
  { hook_event_name: 'UserPromptSubmit', prompt: 'Add a dark mode toggle to the settings page' },
  { wait: 1200 },
  pre('TodoWrite', { todos: [
    { content: 'Plan the dark mode toggle', status: 'in_progress' },
    { content: 'Design the toggle', status: 'pending' },
    { content: 'Build it', status: 'pending' },
    { content: 'Test it', status: 'pending' },
  ] }),
  pre('Agent', { subagent_type: 'planner', description: 'Plan dark mode toggle', prompt: '...' }),
  { hook_event_name: 'SubagentStart', ...sub('planner', 'a1') },
  { wait: 2500 },
  pre('Read', { file_path: '/Users/you/code/my-app/src/pages/Settings.tsx' }, sub('planner', 'a1')),
  { wait: 1500 },
  pre('Grep', { pattern: 'theme' }, sub('planner', 'a1')),
  { wait: 1500 },
  pre('Write', { file_path: '/Users/you/code/my-app/docs/plan.md', content: '# Plan' }, sub('planner', 'a1')),
  { wait: 1500 },
  { hook_event_name: 'SubagentStop', ...sub('planner', 'a1'), last_assistant_message: 'Plan written to docs/plan.md' },
  post('Agent', { subagent_type: 'planner' }, 'Plan written'),
  { wait: 1500 },
  { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to continue' },
  { wait: 6000 },
  pre('TodoWrite', { todos: [
    { content: 'Plan the dark mode toggle', status: 'completed' },
    { content: 'Design the toggle', status: 'in_progress' },
    { content: 'Build it', status: 'pending' },
    { content: 'Test it', status: 'pending' },
  ] }),
  pre('Agent', { subagent_type: 'designer', description: 'Design the toggle', prompt: '...' }),
  { hook_event_name: 'SubagentStart', ...sub('designer', 'a2') },
  { wait: 2500 },
  pre('Read', { file_path: '/Users/you/code/my-app/src/styles/theme.css' }, sub('designer', 'a2')),
  { wait: 1500 },
  pre('Write', { file_path: '/Users/you/code/my-app/docs/design.md', content: '# Design' }, sub('designer', 'a2')),
  { wait: 1500 },
  { hook_event_name: 'SubagentStop', ...sub('designer', 'a2') },
  post('Agent', { subagent_type: 'designer' }, 'Design written'),
  { wait: 1000 },
  pre('TodoWrite', { todos: [
    { content: 'Plan the dark mode toggle', status: 'completed' },
    { content: 'Design the toggle', status: 'completed' },
    { content: 'Build it', status: 'in_progress' },
    { content: 'Test it', status: 'pending' },
  ] }),
  pre('Agent', { subagent_type: 'developer', description: 'Build the toggle', prompt: '...' }),
  { hook_event_name: 'SubagentStart', ...sub('developer', 'a3') },
  { wait: 2500 },
  pre('Edit', { file_path: '/Users/you/code/my-app/src/pages/Settings.tsx' }, sub('developer', 'a3')),
  { wait: 1500 },
  pre('Write', { file_path: '/Users/you/code/my-app/src/hooks/useTheme.ts' }, sub('developer', 'a3')),
  { wait: 1500 },
  pre('Bash', { command: 'npm run build' }, sub('developer', 'a3')),
  { wait: 1500 },
  { hook_event_name: 'SubagentStop', ...sub('developer', 'a3') },
  post('Agent', { subagent_type: 'developer' }, 'Built'),
  { wait: 1000 },
  pre('TodoWrite', { todos: [
    { content: 'Plan the dark mode toggle', status: 'completed' },
    { content: 'Design the toggle', status: 'completed' },
    { content: 'Build it', status: 'completed' },
    { content: 'Test it', status: 'in_progress' },
  ] }),
  pre('Agent', { subagent_type: 'tester', description: 'Test the toggle', prompt: '...' }),
  { hook_event_name: 'SubagentStart', ...sub('tester', 'a4') },
  { wait: 2500 },
  pre('Bash', { command: 'npm test' }, sub('tester', 'a4')),
  { wait: 1500 },
  { hook_event_name: 'SubagentStop', ...sub('tester', 'a4'), last_assistant_message: '**Result**: FAIL — toggle does not persist after reload' },
  post('Agent', { subagent_type: 'tester' }, '**Result**: FAIL'),
  { wait: 1500 },
  pre('Agent', { subagent_type: 'developer', description: 'Fix failing test', prompt: '...' }),
  { hook_event_name: 'SubagentStart', ...sub('developer', 'a5') },
  { wait: 2000 },
  pre('Edit', { file_path: '/Users/you/code/my-app/src/hooks/useTheme.ts' }, sub('developer', 'a5')),
  { wait: 1500 },
  { hook_event_name: 'SubagentStop', ...sub('developer', 'a5') },
  post('Agent', { subagent_type: 'developer' }, 'Fixed'),
  { wait: 1000 },
  pre('Agent', { subagent_type: 'tester', description: 'Retest', prompt: '...' }),
  { hook_event_name: 'SubagentStart', ...sub('tester', 'a6') },
  { wait: 2000 },
  pre('Bash', { command: 'npm test' }, sub('tester', 'a6')),
  { wait: 1500 },
  { hook_event_name: 'SubagentStop', ...sub('tester', 'a6'), last_assistant_message: '**Result**: PASS' },
  post('Agent', { subagent_type: 'tester' }, '**Result**: PASS'),
  { wait: 1000 },
  pre('TodoWrite', { todos: [
    { content: 'Plan the dark mode toggle', status: 'completed' },
    { content: 'Design the toggle', status: 'completed' },
    { content: 'Build it', status: 'completed' },
    { content: 'Test it', status: 'completed' },
  ] }),
  { hook_event_name: 'Stop', stop_hook_active: false },
];

async function main() {
  console.log(`Sending a sample session to ${URL_} ...`);
  for (const step of STEPS) {
    if (step.wait) { await sleep(fast ? 20 : step.wait); continue; }
    try {
      await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, ...step }) });
    } catch {
      console.error(`\nCould not reach the office at ${URL_}. Start it first with: npm start\n`);
      process.exit(1);
    }
    process.stdout.write('.');
    await sleep(fast ? 10 : 250);
  }
  console.log('\nDone. That was one order from start to finish.');
}

main();
