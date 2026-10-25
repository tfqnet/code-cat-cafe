// Turns raw Claude Code hook payloads into small café events.
// Field names differ a little between Claude Code versions, so every
// lookup here is defensive and falls back to sensible defaults.

const AGENT_TOOLS = new Set(['Agent', 'Task']);

/** Map a subagent name (e.g. "planner", "ui-designer", "qa") to a café role. */
export function roleFor(agentType) {
  if (!agentType) return 'lead';
  const t = String(agentType).toLowerCase();
  if (/plan|explore|research|architect/.test(t)) return 'planner';
  if (/design|ui|ux/.test(t)) return 'designer';
  if (/test|qa|review|verif/.test(t)) return 'tester';
  return 'developer';
}

/** Read PASS / FAIL out of a tester's report text. Returns 'pass', 'fail' or null. */
export function readResult(text) {
  if (!text) return null;
  const explicit = String(text).match(/result\W{0,6}(pass|fail)/i);
  if (explicit) return explicit[1].toLowerCase();
  // "12 passed, 0 failed" is a pass, so drop zero-failure counts first.
  const s = String(text).replace(/\b0\s+(tests?\s+)?(fail(ed|ures?|ing)?)\b/gi, '');
  if (/\bfail(ed|s|ure)?\b|❌/i.test(s)) return 'fail';
  if (/\bpass(ed|es)?\b|✅/i.test(s)) return 'pass';
  return null;
}

const short = (s, n = 80) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
};
const base = (p) => String(p ?? '').split(/[\\/]/).pop();

/** One-line description of what a tool call is doing. */
export function describeTool(name, input = {}) {
  switch (name) {
    case 'Bash': return short(input.command, 60);
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit': case 'NotebookEdit':
      return base(input.file_path || input.notebook_path);
    case 'Grep': return short(input.pattern, 40);
    case 'Glob': return short(input.pattern, 40);
    case 'WebFetch': return short(input.url, 50);
    case 'WebSearch': return short(input.query, 50);
    default: return short(input.description || input.subject || '', 50);
  }
}

function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(textOf).join('\n');
  if (typeof v === 'object') return textOf(v.text ?? v.content ?? v.result ?? v.output ?? JSON.stringify(v));
  return String(v);
}

/**
 * @param {object} p raw hook payload
 * @param {{readFile?: (path:string)=>string|null}} [io]
 * @returns {object[]} café events
 */
export function normalize(p, io = {}) {
  if (!p || typeof p !== 'object') return [];
  const ev = p.hook_event_name || p.hookEventName || '';
  const meta = { session: String(p.session_id || '').slice(0, 8), project: base(p.cwd) };
  const out = [];
  const push = (e) => out.push({ ...meta, ...e, at: Date.now() });
  const tool = p.tool_name;
  const input = p.tool_input || {};
  const who = roleFor(p.agent_type);

  switch (ev) {
    case 'SessionStart':
      push({ type: 'session', source: p.source || 'startup' });
      break;

    case 'UserPromptSubmit': {
      const text = p.prompt ?? p.user_prompt ?? p.message ?? '';
      push({ type: 'order', text: short(text, 60) || 'New request' });
      break;
    }

    case 'SubagentStart':
      push({ type: 'agent_start', role: roleFor(p.agent_type), agent: p.agent_type || 'agent', id: p.agent_id });
      break;

    case 'SubagentStop': {
      const role = roleFor(p.agent_type);
      let result = null;
      if (role === 'tester') {
        result = readResult(textOf(p.last_assistant_message ?? p.result ?? p.output));
        if (!result && io.readFile && p.cwd) result = readResult(io.readFile(`${p.cwd}/docs/test-report.md`));
      }
      push({ type: 'agent_end', role, agent: p.agent_type || 'agent', id: p.agent_id, result });
      break;
    }

    case 'PreToolUse':
      if (AGENT_TOOLS.has(tool)) {
        const role = roleFor(input.subagent_type || input.agent_type || input.description);
        push({ type: 'agent_start', role, agent: input.subagent_type || 'agent', detail: short(input.description, 60) });
      } else if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
        push({ type: 'todos', todos: input.todos.map((t, i) => ({ id: t.id || String(i), text: short(t.content || t.activeForm, 60), status: t.status || 'pending' })) });
      } else if (tool === 'TaskCreate') {
        push({ type: 'task', text: short(input.subject || input.description, 60), status: 'pending' });
      } else if (tool === 'TaskUpdate') {
        push({ type: 'task', id: String(input.taskId ?? ''), text: input.subject ? short(input.subject, 60) : undefined, status: input.status });
      } else if (tool) {
        push({ type: 'tool', role: who, tool, detail: describeTool(tool, input) });
      }
      break;

    case 'PostToolUse':
      if (AGENT_TOOLS.has(tool)) {
        const role = roleFor(input.subagent_type || input.agent_type || input.description);
        const result = role === 'tester' ? readResult(textOf(p.tool_response)) : null;
        push({ type: 'agent_end', role, agent: input.subagent_type || 'agent', result });
      } else if ((tool === 'Write' || tool === 'Edit') && /test-report\.md$/.test(input.file_path || '')) {
        const r = readResult(input.content ?? input.new_string);
        if (r) push({ type: 'test_result', result: r });
      }
      break;

    case 'PermissionRequest':
      push({ type: 'needs_you', reason: 'permission', message: `Allow ${tool || 'a tool'}${input.command ? `: ${short(input.command, 50)}` : ''}?` });
      break;

    case 'Notification': {
      const kind = p.notification_type || p.type || '';
      const msg = short(p.message || p.title || '', 90);
      if (kind === 'idle_prompt' || /waiting for your input/i.test(msg)) {
        push({ type: 'needs_you', reason: 'idle', message: msg || 'Claude is waiting for your reply' });
      } else if (!kind || /permission|elicitation|dialog/.test(kind) || /permission|approve|needs your/i.test(msg)) {
        push({ type: 'needs_you', reason: 'permission', message: msg || 'Claude needs your OK' });
      }
      break;
    }

    case 'TaskCreated':
      push({ type: 'task', id: String(p.task_id ?? ''), text: short(p.task_subject || p.subject || p.description || 'Task', 60), status: 'pending' });
      break;
    case 'TaskCompleted':
      push({ type: 'task', id: String(p.task_id ?? ''), text: p.task_subject ? short(p.task_subject, 60) : undefined, status: 'completed' });
      break;

    case 'Stop':
      push({ type: 'turn_done' });
      break;

    default:
      break;
  }
  return out;
}
