import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_STATES = new Set(['started', 'in-progress', 'paused', 'blocked', 'waiting', 'done', 'in-review', 'ready']);
const DEFAULT_STATE = 'in-progress';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export function runCli(argv, options = {}) {
  const ctx = {
    env: options.env || process.env,
    stdout: options.stdout || process.stdout,
    stderr: options.stderr || process.stderr,
  };

  try {
    const parsed = parseArgs(argv);
    const [command, subcommand] = parsed.positionals;

    if (!command || command === 'help' || parsed.opts.help) {
      printHelp(ctx);
      return 0;
    }

    switch (command) {
      case 'init':
        return initCommand(ctx, parsed.opts);
      case 'status':
        return statusCommand(ctx, parsed.opts);
      case 'refresh':
        return statusCommand(ctx, parsed.opts);
      case 'check':
        return checkCommand(ctx, parsed.opts);
      case 'focus':
        return focusCommand(ctx, parsed.opts);
      case 'log':
        return logCommand(ctx, parsed.opts);
      case 'handoff':
        return handoffCommand(ctx, parsed.opts);
      case 'evaluate':
        return evaluateCommand(ctx, parsed.opts);
      case 'personality':
        return personalityCommand(ctx, subcommand, parsed.opts);
      default:
        err(ctx, `Unknown command: ${command}`);
        err(ctx, 'Run `awareness help` for usage.');
        return 1;
    }
  } catch (error) {
    err(ctx, error.message);
    return 1;
  }
}

function parseArgs(argv) {
  const opts = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const equalsIndex = token.indexOf('=');
    if (equalsIndex !== -1) {
      opts[toCamel(token.slice(2, equalsIndex))] = token.slice(equalsIndex + 1);
      continue;
    }

    const key = toCamel(token.slice(2));
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      opts[key] = next;
      index += 1;
    } else {
      opts[key] = true;
    }
  }

  return { opts, positionals };
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function printHelp(ctx) {
  out(ctx, `Awareness Framework CLI

Usage:
  awareness init [--home PATH]
  awareness status [--home PATH]
  awareness refresh [--home PATH]
  awareness check [--home PATH] [--strict]
  awareness focus --task ID --summary TEXT --repo TEXT --branch TEXT --next TEXT [--state STATE] [--home PATH]
  awareness log --task ID --summary TEXT --changes TEXT [--context TEXT] [--state STATE] [--evidence TEXT] [--next TEXT] [--home PATH]
  awareness handoff [--home PATH]
  awareness evaluate [--home PATH] [--force] [--print]
  awareness personality show [--home PATH]
  awareness personality note --text TEXT [--evidence TEXT] [--home PATH]
  awareness personality adopt --text TEXT [--evidence TEXT] [--home PATH]

The CLI maintains private files under ~/.agents by default. It does not post to Jira, GitHub, or any external system.`);
}

function initCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const today = todayParts(ctx);
  const created = [];
  const existing = [];

  for (const dir of ['awareness', 'worklog', 'memory', 'evaluations']) {
    ensureDir(path.join(home, dir));
  }

  writeIfMissing(path.join(home, 'AGENTS.md'), readTemplate('agent-instructions.md'), created, existing);
  writeIfMissing(path.join(home, 'awareness', 'current.md'), initialAwareness(today), created, existing);
  writeIfMissing(path.join(home, 'worklog', `${today.date}.md`), dailyWorklog(today.date), created, existing);
  writeIfMissing(path.join(home, 'memory', 'personality.md'), readTemplate('personality.md'), created, existing);
  writeIfMissing(path.join(home, 'memory', 'preferences.md'), privateMemorySeed('Preferences'), created, existing);
  writeIfMissing(path.join(home, 'memory', 'patterns.md'), privateMemorySeed('Patterns'), created, existing);

  out(ctx, `Initialized awareness home: ${home}`);
  out(ctx, `Created: ${created.length ? created.map((file) => path.relative(home, file)).join(', ') : 'none'}`);
  out(ctx, `Existing: ${existing.length ? existing.map((file) => path.relative(home, file)).join(', ') : 'none'}`);
  return 0;
}

function statusCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const currentPath = awarenessPath(home);
  if (!fs.existsSync(currentPath)) {
    err(ctx, `Missing awareness board: ${currentPath}`);
    return 1;
  }

  const content = fs.readFileSync(currentPath, 'utf8');
  const focus = extractSection(content, 'Current Focus');
  out(ctx, `Awareness home: ${home}`);
  out(ctx, '');
  out(ctx, 'Current Focus');
  out(ctx, focus.trim() || '(empty)');

  const warnings = collectWarnings(home, todayParts(ctx));
  out(ctx, '');
  out(ctx, warnings.length ? `Warnings: ${warnings.length}` : 'Warnings: none');
  for (const warning of warnings) {
    out(ctx, `- ${warning}`);
  }
  return warnings.length ? 1 : 0;
}

function checkCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const warnings = collectWarnings(home, todayParts(ctx));

  if (!warnings.length) {
    out(ctx, `OK: awareness state is maintainable (${home})`);
    return 0;
  }

  out(ctx, `Found ${warnings.length} awareness issue(s):`);
  for (const warning of warnings) {
    out(ctx, `- ${warning}`);
  }

  return opts.strict ? 1 : 0;
}

function focusCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const task = required(opts, 'task');
  const summary = required(opts, 'summary');
  const next = required(opts, 'next');
  const state = normalizeState(opts.state || DEFAULT_STATE);
  const repo = opts.repo || 'Unspecified';
  const branch = opts.branch || 'Unspecified';
  const timestamp = formatTimestamp(todayParts(ctx));

  ensurePrivateState(home, ctx);
  const currentPath = awarenessPath(home);
  const original = fs.readFileSync(currentPath, 'utf8');
  const focusBlock = [
    `- Task: ${task}`,
    `- Summary: ${summary}`,
    `- Repository: ${repo}`,
    `- Branch: ${branch}`,
    `- State: ${state}`,
    `- Next: ${next}`,
  ].join('\n');

  let updated = replaceMetadata(original, 'Updated', timestamp);
  updated = replaceSection(updated, 'Current Focus', `${focusBlock}\n`);
  updated = upsertActiveTask(updated, {
    task,
    summary,
    repo,
    branch,
    state,
    next,
    timestamp,
  }, home);
  fs.writeFileSync(currentPath, updated);

  appendWorklog(home, todayParts(ctx), {
    task,
    summary: `Focus switched: ${summary}`,
    context: `${repo} / ${branch}`,
    state,
    changes: `Current focus set to ${task}: ${summary}.`,
    evidence: currentPath,
    next,
  });

  out(ctx, `Current focus updated: ${task} - ${summary}`);
  return 0;
}

function logCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const today = todayParts(ctx);
  const state = normalizeState(opts.state || DEFAULT_STATE);
  const task = opts.task || 'Unassigned';
  const summary = required(opts, 'summary');
  const changes = required(opts, 'changes');

  ensurePrivateState(home, ctx);
  appendWorklog(home, today, {
    task,
    summary,
    context: opts.context || currentContext(home),
    state,
    changes,
    evidence: opts.evidence || 'Not specified',
    next: opts.next || '',
  });

  out(ctx, `Worklog entry appended: ${task} - ${summary}`);
  return 0;
}

function handoffCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const currentPath = awarenessPath(home);
  if (!fs.existsSync(currentPath)) {
    err(ctx, `Missing awareness board: ${currentPath}`);
    return 1;
  }

  const content = fs.readFileSync(currentPath, 'utf8');
  out(ctx, 'Handoff Snapshot');
  out(ctx, '');
  out(ctx, 'Current Focus');
  out(ctx, extractSection(content, 'Current Focus').trim() || '(empty)');
  out(ctx, '');
  out(ctx, 'Blocked Tasks');
  out(ctx, extractSection(content, 'Blocked Tasks').trim() || '- None.');
  out(ctx, '');
  out(ctx, 'End-of-Day Candidates');
  out(ctx, extractSection(content, 'End-of-Day Candidates').trim() || '- None.');

  const warnings = collectWarnings(home, todayParts(ctx));
  if (warnings.length) {
    out(ctx, '');
    out(ctx, 'Warnings');
    for (const warning of warnings) {
      out(ctx, `- ${warning}`);
    }
  }

  return warnings.length ? 1 : 0;
}

function evaluateCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);
  const today = todayParts(ctx);
  const evaluationPath = path.join(home, 'evaluations', `${today.date}.md`);
  const content = buildEvaluation(home, today);

  if (opts.print) {
    out(ctx, content.trimEnd());
    return 0;
  }

  if (fs.existsSync(evaluationPath) && !opts.force) {
    err(ctx, `Evaluation already exists: ${evaluationPath}`);
    err(ctx, 'Use --force to overwrite or --print to preview.');
    return 1;
  }

  ensureDir(path.dirname(evaluationPath));
  fs.writeFileSync(evaluationPath, content);
  out(ctx, `Evaluation written: ${evaluationPath}`);
  return 0;
}

function personalityCommand(ctx, subcommand, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);
  const file = personalityPath(home);

  switch (subcommand) {
    case 'show':
    case undefined:
      out(ctx, fs.readFileSync(file, 'utf8').trimEnd());
      return 0;
    case 'note':
      return personalityAppend(ctx, file, opts, 'Candidate observation');
    case 'adopt':
      return personalityAppend(ctx, file, opts, 'Accepted trait');
    default:
      err(ctx, `Unknown personality command: ${subcommand}`);
      err(ctx, 'Use: show, note, or adopt.');
      return 1;
  }
}

function personalityAppend(ctx, file, opts, kind) {
  const text = required(opts, 'text');
  const evidence = opts.evidence || 'Not specified';
  const today = todayParts(ctx);
  const timestamp = formatTimestamp(today);
  let content = fs.readFileSync(file, 'utf8');
  content = replaceMetadata(content, 'Updated', timestamp);

  if (kind === 'Accepted trait') {
    content = appendToSection(content, 'Accepted Traits', `- ${today.date}: ${text} (evidence: ${evidence})\n`);
  } else {
    const entry = [
      `### ${today.date} ${today.time} - Candidate`,
      '',
      `- Observation: ${text}`,
      `- Evidence: ${evidence}`,
      '- Status: candidate',
      '',
    ].join('\n');
    content = appendToSection(content, 'Candidate Observations', entry);
  }

  fs.writeFileSync(file, content);
  out(ctx, `${kind} recorded in ${file}`);
  return 0;
}

function collectWarnings(home, today) {
  const warnings = [];
  const currentPath = awarenessPath(home);
  const worklogPath = path.join(home, 'worklog', `${today.date}.md`);

  if (!fs.existsSync(path.join(home, 'AGENTS.md'))) warnings.push('Missing AGENTS.md private protocol.');
  if (!fs.existsSync(currentPath)) warnings.push('Missing awareness/current.md.');
  if (!fs.existsSync(worklogPath)) warnings.push(`Missing daily worklog for ${today.date}.`);

  if (fs.existsSync(currentPath)) {
    const current = fs.readFileSync(currentPath, 'utf8');
    const focus = extractSection(current, 'Current Focus');
    if (!focus.trim()) warnings.push('Current Focus is empty.');
    if (!/- Task:\s+\S+/.test(focus)) warnings.push('Current Focus is missing Task.');
    if (!/- Next:\s+(?!The next concrete action)\S+/.test(focus)) warnings.push('Current Focus is missing a concrete Next action.');
    if (/YYYY-MM-DD|branch-name/.test(current)) warnings.push('Awareness board still contains template placeholders.');

    const active = extractSection(current, 'Active Tasks');
    const taskBlocks = active
      .split(/\n(?=### )/)
      .filter((block) => block.trim().startsWith('### '));
    for (const block of taskBlocks) {
      const title = block.split('\n')[0].replace(/^### /, '').trim();
      if (!/- Next:\s*\n\s+-\s+\S+/.test(block) && !/- Next:\s+\S+/.test(block)) warnings.push(`Active task lacks Next: ${title}`);
      if (!/- Evidence:\s*\n\s+-\s+\S+/.test(block) && !/- Evidence:\s+\S+/.test(block)) warnings.push(`Active task lacks Evidence: ${title}`);
    }
  }

  if (fs.existsSync(worklogPath)) {
    const worklog = fs.readFileSync(worklogPath, 'utf8');
    const entries = [...worklog.matchAll(/^### \d{2}:\d{2} - (.+?) - .+$/gm)];
    if (!entries.length) warnings.push('Daily worklog has no entries.');
    if (entries.some((entry) => entry[1] === 'Unassigned')) warnings.push('Daily worklog has Unassigned entries to reconcile.');
    const entryBlocks = worklog
      .split(/\n(?=### \d{2}:\d{2} - )/)
      .filter((block) => block.trim().startsWith('### '));
    if (entryBlocks.some((block) => !/\n- Evidence:\s+\S+/.test(block))) warnings.push('Some worklog entries may be missing Evidence.');
  }

  return warnings;
}

function buildEvaluation(home, today) {
  const currentPath = awarenessPath(home);
  const worklogPath = path.join(home, 'worklog', `${today.date}.md`);
  const current = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf8') : '';
  const worklog = fs.existsSync(worklogPath) ? fs.readFileSync(worklogPath, 'utf8') : '';
  const warnings = collectWarnings(home, today);
  const entries = [...worklog.matchAll(/^### \d{2}:\d{2} - (.+?) - .+$/gm)];
  const assignedEntries = entries.filter((entry) => entry[1] !== 'Unassigned').length;
  const freshness = current.includes(today.date) ? 2 : current ? 1 : 0;
  const traceability = !entries.length ? 0 : assignedEntries / entries.length >= 0.8 ? 2 : 1;
  const handoff = /- Next:\s+(?!The next concrete action)\S+/.test(extractSection(current, 'Current Focus')) ? 2 : current ? 1 : 0;
  const noise = current.split('\n').length <= 180 && !/PROJECT-123|YYYY-MM-DD/.test(current) ? 2 : 1;
  const reporting = extractSection(current, 'End-of-Day Candidates').trim() ? 2 : entries.length ? 1 : 0;

  return `# Awareness Evaluation - ${today.date}

## Score

| Dimension | Score | Evidence |
|-----------|-------|----------|
| Freshness | ${freshness} | ${freshness === 2 ? 'Awareness file references today.' : 'Awareness freshness should be checked.'} |
| Traceability | ${traceability} | ${assignedEntries}/${entries.length} worklog entries have explicit task IDs. |
| Handoff quality | ${handoff} | ${handoff === 2 ? 'Current Focus has a concrete Next action.' : 'Next action needs clarification.'} |
| Noise control | ${noise} | Awareness board has ${current.split('\n').length} lines. |
| Reporting readiness | ${reporting} | End-of-day candidates ${reporting === 2 ? 'are present' : 'need attention'}. |

## Warnings

${warnings.length ? warnings.map((warning) => `- ${warning}`).join('\n') : '- None.'}

## Proposed Changes

- No framework change proposed automatically.
- Review repeated warnings before proposing a methodology PR.
`;
}

function appendWorklog(home, today, entry) {
  const worklogPath = path.join(home, 'worklog', `${today.date}.md`);
  ensureDir(path.dirname(worklogPath));
  if (!fs.existsSync(worklogPath)) {
    fs.writeFileSync(worklogPath, dailyWorklog(today.date));
  }

  const nextLine = entry.next ? `- Next: ${entry.next}\n` : '';
  const markdown = `
### ${today.time} - ${entry.task} - ${entry.summary}

- Context: ${entry.context || 'Not specified'}
- State: ${entry.state}
- Changes: ${entry.changes}
- Evidence: ${entry.evidence || 'Not specified'}
${nextLine}`;

  fs.appendFileSync(worklogPath, markdown);
}

function upsertActiveTask(content, task, home) {
  const active = extractSection(content, 'Active Tasks');
  const heading = `${task.task} - ${task.summary}`;
  const taskPattern = new RegExp(`### ${escapeRegExp(task.task)}(?: - .*?)?\\n[\\s\\S]*?(?=\\n### |\\n## |$)`);
  const block = [
    `### ${heading}`,
    '',
    `- State: ${task.state}`,
    `- Last update: ${task.timestamp}`,
    `- Repository: ${task.repo}`,
    `- Branch: ${task.branch}`,
    '- Done:',
    '  - Focus updated.',
    '- Next:',
    `  - ${task.next}`,
    '- Blockers:',
    '  - None.',
    '- Evidence:',
    `  - ${awarenessPath(home)}`,
    '',
  ].join('\n');

  const newActive = taskPattern.test(active)
    ? active.replace(taskPattern, block.trimEnd())
    : `${active.replace(/^- None\.\s*/m, '').trimEnd()}\n\n${block}`.trimStart();

  return replaceSection(content, 'Active Tasks', `${newActive.trimEnd()}\n`);
}

function ensurePrivateState(home, ctx) {
  const today = todayParts(ctx);
  ensureDir(home);
  ensureDir(path.join(home, 'awareness'));
  ensureDir(path.join(home, 'worklog'));
  ensureDir(path.join(home, 'memory'));
  ensureDir(path.join(home, 'evaluations'));
  if (!fs.existsSync(path.join(home, 'AGENTS.md'))) fs.writeFileSync(path.join(home, 'AGENTS.md'), readTemplate('agent-instructions.md'));
  if (!fs.existsSync(awarenessPath(home))) fs.writeFileSync(awarenessPath(home), initialAwareness(today));
  if (!fs.existsSync(path.join(home, 'worklog', `${today.date}.md`))) fs.writeFileSync(path.join(home, 'worklog', `${today.date}.md`), dailyWorklog(today.date));
  if (!fs.existsSync(personalityPath(home))) fs.writeFileSync(personalityPath(home), readTemplate('personality.md'));
}

function replaceSection(content, section, body) {
  const heading = `## ${section}`;
  const pattern = new RegExp(`(^|\\n)(## ${escapeRegExp(section)}\\n\\n?)([\\s\\S]*?)(?=\\n## |$)`);
  if (pattern.test(content)) {
    return content.replace(pattern, `$1$2${body.trimEnd()}\n`);
  }

  return `${content.trimEnd()}\n\n${heading}\n\n${body.trimEnd()}\n`;
}

function appendToSection(content, section, addition) {
  const current = extractSection(content, section);
  const cleaned = current.replace(/^- None yet\.\n?/m, '').trimEnd();
  return replaceSection(content, section, `${cleaned ? `${cleaned}\n\n` : ''}${addition.trimEnd()}\n`);
}

function extractSection(content, section) {
  const pattern = new RegExp(`(?:^|\\n)## ${escapeRegExp(section)}\\n\\n?([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(pattern);
  return match ? match[1] : '';
}

function replaceMetadata(content, key, value) {
  const pattern = new RegExp(`^- ${escapeRegExp(key)}:.*$`, 'm');
  if (pattern.test(content)) {
    return content.replace(pattern, `- ${key}: ${value}`);
  }
  return content.replace(/^# .+$/m, (heading) => `${heading}\n\n- ${key}: ${value}`);
}

function currentContext(home) {
  const file = awarenessPath(home);
  if (!fs.existsSync(file)) return 'Not specified';
  const focus = extractSection(fs.readFileSync(file, 'utf8'), 'Current Focus');
  const repo = focus.match(/^- Repository:\s+(.+)$/m)?.[1] || 'Not specified';
  const branch = focus.match(/^- Branch:\s+(.+)$/m)?.[1] || 'Not specified';
  return `${repo} / ${branch}`;
}

function readTemplate(name) {
  const file = path.join(repoRoot, 'templates', name);
  return fs.readFileSync(file, 'utf8');
}

function writeIfMissing(file, content, created, existing) {
  ensureDir(path.dirname(file));
  if (fs.existsSync(file)) {
    existing.push(file);
    return;
  }
  fs.writeFileSync(file, content);
  created.push(file);
}

function dailyWorklog(date) {
  return `# Daily Worklog - ${date}

## Entries
`;
}

function initialAwareness(today) {
  return `# Agent Awareness

- Updated: ${formatTimestamp(today)}
- Operator: Unassigned
- Scope: Local private state; do not commit

## Current Focus

- Task: Unassigned
- Summary: No current focus set
- Repository: Unspecified
- Branch: Unspecified
- State: waiting
- Next: Run awareness focus to set the current task

## Active Tasks

- None.

## Blocked Tasks

- None.

## Waiting On User

- None.

## Parking Lot

- None.

## End-of-Day Candidates

- None.
`;
}

function privateMemorySeed(title) {
  return `# ${title}

- Updated: never
- Scope: Local private state; do not commit

## Entries

- None yet.
`;
}

function normalizeState(state) {
  if (!VALID_STATES.has(state)) {
    throw new Error(`Invalid state: ${state}. Valid states: ${[...VALID_STATES].join(', ')}`);
  }
  return state;
}

function required(opts, key) {
  if (!opts[key] || opts[key] === true) {
    throw new Error(`Missing required option: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  return opts[key];
}

function agentsHome(ctx, opts) {
  const raw = opts.home || ctx.env.AGENTS_HOME || path.join(os.homedir(), '.agents');
  return path.resolve(expandHome(raw));
}

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function awarenessPath(home) {
  return path.join(home, 'awareness', 'current.md');
}

function personalityPath(home) {
  return path.join(home, 'memory', 'personality.md');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function todayParts(ctx) {
  const now = ctx.env.AWARENESS_NOW ? new Date(ctx.env.AWARENESS_NOW) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid AWARENESS_NOW value: ${ctx.env.AWARENESS_NOW}`);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const offsetHour = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
  const offsetMinute = String(Math.abs(offset) % 60).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    timezone: `${sign}${offsetHour}:${offsetMinute}`,
  };
}

function formatTimestamp(parts) {
  return `${parts.date} ${parts.time} ${parts.timezone}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function out(ctx, message) {
  ctx.stdout.write(`${message}\n`);
}

function err(ctx, message) {
  ctx.stderr.write(`${message}\n`);
}
