import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, roleFor, readResult } from './normalize.js';
import { addHooks, removeHooks, EVENTS } from './setup-hooks.js';

test('roleFor maps agent names to office roles', () => {
  assert.equal(roleFor('planner'), 'planner');
  assert.equal(roleFor('ui-designer'), 'designer');
  assert.equal(roleFor('qa-tester'), 'tester');
  assert.equal(roleFor('developer'), 'developer');
  assert.equal(roleFor('general-purpose'), 'developer');
  assert.equal(roleFor('Explore'), 'planner');
  assert.equal(roleFor(undefined), 'lead');
});

test('readResult finds PASS and FAIL', () => {
  assert.equal(readResult('**Result**: FAIL'), 'fail');
  assert.equal(readResult('- **Result**: PASS'), 'pass');
  assert.equal(readResult('3 tests failed'), 'fail');
  assert.equal(readResult('Tests: 12 passed, 0 failed'), 'pass');
  assert.equal(readResult('all good ✅'), 'pass');
  assert.equal(readResult('nothing here'), null);
});

test('prompt becomes an order', () => {
  const [e] = normalize({ hook_event_name: 'UserPromptSubmit', prompt: 'Add login', session_id: 'abc', cwd: '/x/app' });
  assert.equal(e.type, 'order');
  assert.equal(e.text, 'Add login');
  assert.equal(e.project, 'app');
});

test('Agent tool and SubagentStart both start an agent', () => {
  const a = normalize({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { subagent_type: 'planner' } });
  const b = normalize({ hook_event_name: 'SubagentStart', agent_type: 'planner', agent_id: '1' });
  const c = normalize({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_input: { subagent_type: 'tester' } });
  assert.equal(a[0].type, 'agent_start'); assert.equal(a[0].role, 'planner');
  assert.equal(b[0].type, 'agent_start'); assert.equal(b[0].role, 'planner');
  assert.equal(c[0].role, 'tester');
});

test('tester stop carries the result, reading the report file if needed', () => {
  const [e] = normalize({ hook_event_name: 'SubagentStop', agent_type: 'tester', last_assistant_message: 'Result: FAIL' });
  assert.equal(e.result, 'fail');
  const [f] = normalize({ hook_event_name: 'SubagentStop', agent_type: 'tester', cwd: '/p' }, { readFile: () => '**Result**: PASS' });
  assert.equal(f.result, 'pass');
});

test('tool calls inside a subagent are attributed to that role', () => {
  const [e] = normalize({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, agent_type: 'tester' });
  assert.deepEqual([e.type, e.role, e.tool, e.detail], ['tool', 'tester', 'Bash', 'npm test']);
  const [g] = normalize({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/a/b/c.ts' } });
  assert.deepEqual([g.role, g.detail], ['lead', 'c.ts']);
});

test('permission prompts and idle prompts ring the bell', () => {
  const [p] = normalize({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' });
  const [i] = normalize({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input' });
  const [r] = normalize({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf build' } });
  assert.equal(p.type, 'needs_you'); assert.equal(p.reason, 'permission');
  assert.equal(i.reason, 'idle');
  assert.match(r.message, /Bash: rm -rf build/);
});

test('todo lists become board items', () => {
  const [e] = normalize({ hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_input: { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'pending' }] } });
  assert.equal(e.type, 'todos');
  assert.deepEqual(e.todos.map((t) => t.status), ['completed', 'pending']);
});

test('unknown or broken payloads are ignored', () => {
  assert.deepEqual(normalize(null), []);
  assert.deepEqual(normalize({ hook_event_name: 'SomethingNew' }), []);
});

test('setup adds hooks once and removes them cleanly', () => {
  const mine = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }] }, model: 'x' };
  const once = addHooks(structuredClone(mine));
  const twice = addHooks(structuredClone(once));
  assert.deepEqual(once, twice);
  assert.equal(Object.keys(once.hooks).length, Object.keys(EVENTS).length);
  assert.equal(once.hooks.PreToolUse.length, 2);
  const back = removeHooks(structuredClone(once));
  assert.deepEqual(back, mine);
});
