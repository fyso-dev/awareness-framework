import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli.js';
import { collectMemoryMetrics, entryKey, parseCuratedEntries } from '../src/memory-metrics.js';
import { searchDocuments } from '../src/search.js';

function run(argv, home, env = {}) {
  let stdout = '';
  let stderr = '';
  const code = runCli([...argv, '--home', home], {
    env: {
      ...process.env,
      AWARENESS_NOW: '2099-01-02T12:34:00.000Z',
      ...env,
    },
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  return { code, stdout, stderr };
}

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-cli-'));
}

function repoRootForTests() {
  return path.resolve(new URL('..', import.meta.url).pathname);
}

test('init creates private awareness files', () => {
  const home = tempHome();
  const result = run(['init'], home);

  assert.equal(result.code, 0);
  assert.equal(fs.existsSync(path.join(home, 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'awareness', 'current.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'worklog', '2099-01-02.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'memory', 'personality.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'memory', 'long-term.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'memory', 'users')), true);
});

test('init can create regular wrapper files without overwriting existing files', () => {
  const home = tempHome();
  const userHome = tempHome();
  const configHome = tempHome();
  const codexWrapper = path.join(userHome, '.codex', 'AGENTS.md');
  fs.mkdirSync(path.dirname(codexWrapper), { recursive: true });
  fs.writeFileSync(codexWrapper, 'custom codex wrapper');

  const result = run(['init', '--wrappers', '--user-home', userHome, '--config-home', configHome], home);

  assert.equal(result.code, 0);
  assert.equal(fs.readFileSync(codexWrapper, 'utf8'), 'custom codex wrapper');
  assert.equal(fs.existsSync(path.join(userHome, '.claude', 'CLAUDE.md')), true);
  assert.equal(fs.existsSync(path.join(configHome, 'opencode', 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(userHome, '.pi', 'agent', 'AGENTS.md')), true);

  const overwrite = run(['init', '--wrappers', '--overwrite-wrappers', '--user-home', userHome, '--config-home', configHome], home);

  assert.equal(overwrite.code, 0);
  assert.match(fs.readFileSync(codexWrapper, 'utf8'), /@.+AGENTS\.md/);
});

test('update previews and applies private state template additions without overwriting memory', () => {
  const home = tempHome();
  run(['init'], home);
  const protocol = path.join(home, 'AGENTS.md');
  const longTerm = path.join(home, 'memory', 'long-term.md');
  fs.writeFileSync(protocol, '# Custom Protocol\n\nKeep my local instruction.\n');
  fs.writeFileSync(longTerm, `# Long-Term Memory

- Updated: never
- Scope: Local private state; do not commit

## Preferences

- 2099-01-01: Keep existing durable memory (evidence: test)
`);

  const preview = run(['update', '--dry-run'], home);
  assert.equal(preview.code, 0);
  assert.match(preview.stdout, /Would update/);
  assert.doesNotMatch(fs.readFileSync(protocol, 'utf8'), /awareness memory stats/);

  const applied = run(['update'], home);
  assert.equal(applied.code, 0);
  assert.match(applied.stdout, /Updated:/);

  const updatedProtocol = fs.readFileSync(protocol, 'utf8');
  const updatedLongTerm = fs.readFileSync(longTerm, 'utf8');
  assert.match(updatedProtocol, /Keep my local instruction/);
  assert.match(updatedProtocol, /awareness memory stats/);
  assert.match(updatedProtocol, /awareness memory trigger/);
  assert.match(updatedLongTerm, /Keep existing durable memory/);
  assert.match(updatedLongTerm, /## Review Notes/);
  assert.match(updatedLongTerm, /awareness memory used/);

  const again = run(['update'], home);
  assert.equal(again.code, 0);
  assert.match(again.stdout, /Updated: none/);
});

test('update dry-run does not create missing private state files', () => {
  const home = tempHome();

  const preview = run(['update', '--dry-run'], home);

  assert.equal(preview.code, 0);
  assert.match(preview.stdout, /Would update/);
  assert.match(preview.stdout, /would create missing private file/);
  assert.equal(fs.existsSync(path.join(home, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(home, 'awareness', 'current.md')), false);
  assert.equal(fs.existsSync(path.join(home, 'memory', 'long-term.md')), false);
});

test('update adds protocol block even when command names already exist elsewhere', () => {
  const home = tempHome();
  run(['init'], home);
  const protocol = path.join(home, 'AGENTS.md');
  fs.writeFileSync(protocol, [
    '# Agent Instructions',
    '',
    'Existing rules mention `awareness memory used` and `awareness memory stats` inline.',
    '',
  ].join('\n'));

  const result = run(['update'], home);

  assert.equal(result.code, 0);
  assert.match(fs.readFileSync(protocol, 'utf8'), /## Memory Effectiveness Commands/);
});

test('update adds memory trigger guidance to existing protocol block', () => {
  const home = tempHome();
  run(['init'], home);
  const protocol = path.join(home, 'AGENTS.md');
  fs.writeFileSync(protocol, [
    '# Agent Instructions',
    '',
    '## Memory Effectiveness Commands',
    '',
    '- After a recall meaningfully informs your work, credit it with `awareness memory used --text "<entry substring>" --note "<why>"`.',
    '',
  ].join('\n'));

  const result = run(['update'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /added memory trigger guidance/);
  assert.match(fs.readFileSync(protocol, 'utf8'), /awareness memory trigger/);
});

test('update appends guidance into blank consecutive sections', () => {
  const home = tempHome();
  run(['init'], home);
  const longTerm = path.join(home, 'memory', 'long-term.md');
  fs.writeFileSync(longTerm, `# Long-Term Memory

## Review Notes

## Event Log

## Guardrails
`);

  const result = run(['update'], home);

  assert.equal(result.code, 0);
  const updated = fs.readFileSync(longTerm, 'utf8');
  const reviewNotesIndex = updated.indexOf('Use `awareness memory candidates`');
  const eventHeadingIndex = updated.indexOf('## Event Log');
  const eventLogIndex = updated.indexOf('Append-only audit history');
  const guardrailsHeadingIndex = updated.indexOf('## Guardrails');
  const guardrailIndex = updated.indexOf('Do not store secrets');
  assert.equal(reviewNotesIndex > updated.indexOf('## Review Notes'), true);
  assert.equal(reviewNotesIndex < eventHeadingIndex, true);
  assert.equal(eventLogIndex > eventHeadingIndex, true);
  assert.equal(eventLogIndex < guardrailsHeadingIndex, true);
  assert.equal(guardrailIndex > guardrailsHeadingIndex, true);
});

test('init auto-updates existing private state templates without overwriting memory', () => {
  const home = tempHome();
  run(['init'], home);
  const protocol = path.join(home, 'AGENTS.md');
  const longTerm = path.join(home, 'memory', 'long-term.md');
  fs.writeFileSync(protocol, '# Existing Protocol\n\nKeep local protocol.\n');
  fs.writeFileSync(longTerm, `# Long-Term Memory

## Preferences

- 2099-01-01: Keep existing durable memory (evidence: test)
`);

  const result = run(['init'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Template updates:/);
  assert.match(fs.readFileSync(protocol, 'utf8'), /awareness memory stats/);
  assert.match(fs.readFileSync(longTerm, 'utf8'), /Keep existing durable memory/);
  assert.match(fs.readFileSync(longTerm, 'utf8'), /## Review Notes/);
});

test('channel scope stores private files under a channel-specific folder', () => {
  const home = tempHome();

  const result = run(['init', '--channel', '#Support Desk'], home);

  assert.equal(result.code, 0);
  const scopedHome = path.join(home, 'channels', 'support-desk');
  assert.equal(fs.existsSync(path.join(scopedHome, 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(scopedHome, 'awareness', 'current.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'awareness', 'current.md')), false);

  const status = run(['status', '--channel', '#Support Desk'], home);
  assert.equal(status.code, 0);
  assert.match(status.stdout, /channels\/support-desk/);
});

test('user memory stores small user facts without changing the context home', () => {
  const home = tempHome();

  const result = run([
    'user',
    'note',
    '--user', '@User One',
    '--kind', 'nickname',
    '--text', 'Ace',
    '--evidence', 'User interaction',
  ], home);

  assert.equal(result.code, 0);
  const userMemory = path.join(home, 'memory', 'users', 'user-one.md');
  assert.equal(fs.existsSync(userMemory), true);
  assert.match(fs.readFileSync(userMemory, 'utf8'), /## Nicknames/);
  assert.match(fs.readFileSync(userMemory, 'utf8'), /Ace/);
  assert.equal(fs.existsSync(path.join(home, 'users', 'user-one', 'awareness', 'current.md')), false);
});

test('user memory can live inside a channel-scoped context', () => {
  const home = tempHome();

  const result = run([
    'user',
    'note',
    '--channel', 'Help Desk',
    '--user', '1234567890',
    '--kind', 'question',
    '--text', 'Asked how to connect the bot to Jira',
    '--evidence', 'Message link',
  ], home);

  assert.equal(result.code, 0);
  const scopedMemory = path.join(home, 'channels', 'help-desk', 'memory', 'users', '1234567890.md');
  assert.equal(fs.existsSync(scopedMemory), true);
  assert.match(fs.readFileSync(scopedMemory, 'utf8'), /## Questions/);
  assert.match(fs.readFileSync(scopedMemory, 'utf8'), /bot to Jira/);
  assert.equal(fs.existsSync(path.join(home, 'channels', 'help-desk', 'users', '1234567890')), false);
});

test('focus updates awareness and appends worklog', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run([
    'focus',
    '--task', 'PROJECT-123',
    '--summary', 'Build awareness CLI',
    '--repo', 'fyso-dev/awareness-framework',
    '--branch', 'codex/cli-and-personality',
    '--next', 'Run tests',
  ], home);

  assert.equal(result.code, 0);
  const current = fs.readFileSync(path.join(home, 'awareness', 'current.md'), 'utf8');
  assert.match(current, /- Task: PROJECT-123/);
  assert.match(current, /- Next: Run tests/);

  const worklog = fs.readFileSync(path.join(home, 'worklog', '2099-01-02.md'), 'utf8');
  assert.match(worklog, /Focus switched: Build awareness CLI/);
});

test('focus accepts underscore state aliases and help lists state values', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run([
    'focus',
    '--task', 'PROJECT-123',
    '--summary', 'Build awareness CLI',
    '--repo', 'fyso-dev/awareness-framework',
    '--branch', 'codex/cli-and-personality',
    '--state', 'in_progress',
    '--next', 'Run tests',
  ], home);

  assert.equal(result.code, 0);
  const current = fs.readFileSync(path.join(home, 'awareness', 'current.md'), 'utf8');
  assert.match(current, /- State: in-progress/);

  let stdout = '';
  const helpCode = runCli(['help'], {
    env: {
      ...process.env,
      AWARENESS_NOW: '2099-01-02T12:34:00.000Z',
    },
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: () => {} },
  });
  assert.equal(helpCode, 0);
  assert.match(stdout, /State values:/);
  assert.match(stdout, /started, in-progress, paused, blocked, waiting, done, in-review, ready/);
});

test('log appends a concrete entry', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run([
    'log',
    '--task', 'PROJECT-123',
    '--summary', 'Added tests',
    '--changes', 'Added CLI coverage.',
    '--evidence', 'test/cli.test.js',
  ], home);

  assert.equal(result.code, 0);
  const worklog = fs.readFileSync(path.join(home, 'worklog', '2099-01-02.md'), 'utf8');
  assert.match(worklog, /PROJECT-123 - Added tests/);
  assert.match(worklog, /- Evidence: test\/cli.test.js/);
});

test('refresh aliases status and reloads current focus', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'focus',
    '--task', 'PROJECT-123',
    '--summary', 'Build awareness CLI',
    '--repo', 'fyso-dev/awareness-framework',
    '--branch', 'codex/cli-and-personality',
    '--next', 'Run tests',
  ], home);

  const result = run(['refresh'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Current Focus/);
  assert.match(result.stdout, /PROJECT-123/);
});

test('status and handoff return success when only warnings are present', () => {
  const home = tempHome();
  run(['init'], home);

  const status = run(['status'], home);
  const handoff = run(['handoff'], home);

  assert.equal(status.code, 0);
  assert.match(status.stdout, /Warnings: 1/);
  assert.equal(handoff.code, 0);
  assert.match(handoff.stdout, /Warnings/);
});

test('check recognizes legacy worklog entries with Jira metadata', () => {
  const home = tempHome();
  run(['init'], home);
  const worklog = path.join(home, 'worklog', '2099-01-02.md');
  fs.writeFileSync(worklog, `# Daily Worklog - 2099-01-02

## 12:34 - Legacy entry

- Jira: PROJECT-123
- Repo: fyso-dev/awareness-framework
- Branch: main
- Status: done
- Worked on:
  - Kept a legacy entry format.
- Evidence:
  - test/cli.test.js
- Next:
`);

  const result = run(['check'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /OK: awareness state is maintainable/);
});

test('personality note and adopt update private profile', () => {
  const home = tempHome();
  run(['init'], home);

  const note = run(['personality', 'note', '--text', 'Prefers concise updates', '--evidence', 'User feedback'], home);
  const adopt = run(['personality', 'adopt', '--text', 'Use concise status updates', '--evidence', 'Confirmed'], home);

  assert.equal(note.code, 0);
  assert.equal(adopt.code, 0);

  const personality = fs.readFileSync(path.join(home, 'memory', 'personality.md'), 'utf8');
  assert.match(personality, /Prefers concise updates/);
  assert.match(personality, /Use concise status updates/);
});

test('evaluate can print without writing', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['evaluate', '--print'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /# Awareness Evaluation - 2099-01-02/);
  assert.equal(fs.existsSync(path.join(home, 'evaluations', '2099-01-02.md')), false);
});

test('evaluate writes promotion candidates for memory review', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['evaluate'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Memory candidates: 1 recorded/);
  const memory = fs.readFileSync(path.join(home, 'memory', 'long-term.md'), 'utf8');
  assert.match(memory, /## Promotion Candidates/);
  assert.match(memory, /Review recurring awareness warning: Daily worklog has no entries/);
});

test('memory note and promote update long-term memory', () => {
  const home = tempHome();
  run(['init'], home);

  const note = run([
    'memory',
    'note',
    '--text', 'User wants active memory review',
    '--evidence', 'Direct request',
  ], home);
  const promote = run([
    'memory',
    'promote',
    '--kind', 'preference',
    '--text', 'Surface memory candidates proactively',
    '--evidence', 'User requested more active memory',
  ], home);
  const candidates = run(['memory', 'candidates'], home);

  assert.equal(note.code, 0);
  assert.equal(promote.code, 0);
  assert.equal(candidates.code, 0);
  const memory = fs.readFileSync(path.join(home, 'memory', 'long-term.md'), 'utf8');
  assert.match(candidates.stdout, /User wants active memory review/);
  assert.match(memory, /## Preferences/);
  assert.match(memory, /Surface memory candidates proactively/);
});

test('memory note and promote append auditable memory events', () => {
  const home = tempHome();
  run(['init'], home);

  run([
    'memory',
    'note',
    '--text', 'User wants local recall',
    '--evidence', 'Planning discussion',
  ], home);
  run([
    'memory',
    'promote',
    '--kind', 'preference',
    '--text', 'Prefer local-first memory operations',
    '--evidence', 'User approved local event log design',
  ], home);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

  assert.equal(events[0].type, 'memory.candidate.created');
  assert.equal(events[0].text, 'User wants local recall');
  assert.equal(events[0].source, 'memory.note');
  assert.equal(events[1].type, 'memory.promoted');
  assert.equal(events[1].kind, 'preference');
  assert.equal(events[1].text, 'Prefer local-first memory operations');
});

test('remember records a promotion candidate and event', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run([
    'remember',
    '--text', 'Prefer recall before repeating implementation work',
    '--evidence', 'User asked for active memory operations',
  ], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Remembered candidate/);

  const memory = fs.readFileSync(path.join(home, 'memory', 'long-term.md'), 'utf8');
  assert.match(memory, /Prefer recall before repeating implementation work/);

  const [event] = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(event.type, 'memory.candidate.created');
  assert.equal(event.source, 'remember');
});

test('recall searches memory, events, worklogs, and evaluations', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'Always run recall-source memory coverage',
    '--evidence', 'recall-source plan',
  ], home);
  fs.writeFileSync(path.join(home, 'memory', 'personality.md'), '- recall-source personality coverage\n');
  fs.writeFileSync(path.join(home, 'memory', 'preferences.md'), '- recall-source preferences coverage\n');
  fs.writeFileSync(path.join(home, 'memory', 'patterns.md'), '- recall-source patterns coverage\n');
  fs.writeFileSync(path.join(home, 'memory', 'users', 'alice.md'), '- recall-source user coverage\n');
  run([
    'log',
    '--task', 'PROJECT-123',
    '--summary', 'Validated recall-source behavior',
    '--changes', 'Recall should search worklog recall-source text.',
    '--evidence', 'recall-source worklog evidence',
  ], home);
  fs.writeFileSync(path.join(home, 'evaluations', '2099-01-02.md'), `# Awareness Evaluation - 2099-01-02

## Warnings

- recall-source evaluation coverage
`);

  const result = run(['recall', 'recall-source coverage', '--limit', '20'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Recall Results/);
  assert.match(result.stdout, /memory\/long-term\.md/);
  assert.match(result.stdout, /memory\/personality\.md/);
  assert.match(result.stdout, /memory\/preferences\.md/);
  assert.match(result.stdout, /memory\/patterns\.md/);
  assert.match(result.stdout, /memory\/users\/alice\.md/);
  assert.match(result.stdout, /memory\/events\.jsonl/);
  assert.match(result.stdout, /worklog\/2099-01-02\.md/);
  assert.match(result.stdout, /evaluations\/2099-01-02\.md/);
});

test('recall uses normalized aliases for English and Spanish memory terms', () => {
  const home = tempHome();
  run(['init'], home);
  fs.writeFileSync(path.join(home, 'memory', 'users', 'alice.md'), '- memoria por usuario: proyecto activo\n');

  const result = run(['recall', 'user memory'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /memory\/users\/alice\.md/);
  assert.match(result.stdout, /memoria por usuario/);
});

test('forget records a pruned memory without deleting history', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'Temporary memory to revise',
    '--evidence', 'Initial observation',
  ], home);

  const result = run([
    'forget',
    '--text', 'Temporary memory to revise',
    '--reason', 'Superseded by explicit user correction',
    '--evidence', 'User correction',
  ], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Memory pruned or revised/);

  const memory = fs.readFileSync(path.join(home, 'memory', 'long-term.md'), 'utf8');
  const candidates = memory.split('## Pruned Or Revised')[0];
  assert.match(memory, /## Pruned Or Revised/);
  assert.match(memory, /Temporary memory to revise/);
  assert.match(memory, /Superseded by explicit user correction/);
  assert.match(candidates, /Temporary memory to revise/);
  assert.match(candidates, /Initial observation/);

  const visibleCandidates = run(['memory', 'candidates'], home);
  assert.equal(visibleCandidates.code, 0);
  assert.doesNotMatch(visibleCandidates.stdout, /Temporary memory to revise/);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'memory.pruned');
});

test('memory promote rejects pruned memory text', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'Temporary memory to revise',
    '--evidence', 'Initial observation',
  ], home);
  run([
    'forget',
    '--text', 'Temporary memory to revise',
    '--reason', 'Superseded by explicit user correction',
    '--evidence', 'User correction',
  ], home);

  const promote = run([
    'memory',
    'promote',
    '--kind', 'preference',
    '--text', 'Temporary memory to revise',
    '--evidence', 'Should be blocked',
  ], home);

  assert.equal(promote.code, 1);
  assert.match(promote.stderr, /Cannot promote pruned or revised memory/);
});

test('improve writes evaluation and surfaces repeated pattern suggestions', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'Improve traceability before handoff',
    '--evidence', 'worklog/2099-01-01.md',
  ], home, { AWARENESS_NOW: '2099-01-01T12:34:00.000Z' });
  run([
    'remember',
    '--text', 'Improve traceability before handoff',
    '--evidence', 'worklog/2099-01-02.md',
  ], home);

  const result = run(['improve'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Evaluation:/);
  assert.match(result.stdout, /Auto-generated candidates: \d+ \(from evaluation diagnostics\)/);
  assert.match(result.stdout, /Pattern suggestions: 1/);
  assert.match(result.stdout, /Improve traceability before handoff/);
  assert.equal(fs.existsSync(path.join(home, 'evaluations', '2099-01-02.md')), true);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'pattern.suggested');
});

test('improve dedupes auto-generated candidates by text across days', () => {
  const home = tempHome();
  run(['init'], home);

  const first = run(['improve'], home, { AWARENESS_NOW: '2099-01-01T12:34:00.000Z' });
  const second = run(['improve'], home, { AWARENESS_NOW: '2099-01-02T12:34:00.000Z' });

  assert.equal(first.code, 0);
  assert.equal(second.code, 0);
  assert.match(first.stdout, /Auto-generated candidates: 1 \(from evaluation diagnostics\)/);
  assert.match(second.stdout, /Auto-generated candidates: 0 \(from evaluation diagnostics\)/);

  const memory = fs.readFileSync(path.join(home, 'memory', 'long-term.md'), 'utf8');
  const occurrences = memory.match(/Review recurring awareness warning: Daily worklog has no entries/g) || [];
  assert.equal(occurrences.length, 1);
});

test('improve does not log evaluation created for existing evaluation', () => {
  const home = tempHome();
  run(['init'], home);

  const first = run(['improve'], home);
  const second = run(['improve'], home);

  assert.equal(first.code, 0);
  assert.equal(second.code, 0);
  assert.match(second.stdout, /Evaluation: already exists/);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.filter((event) => event.type === 'evaluation.created').length, 1);
});

test('improve rejects invalid min-count without writing evaluation or events', () => {
  const home = tempHome();
  run(['init'], home);
  const evaluationPath = path.join(home, 'evaluations', '2099-01-02.md');
  const eventsPath = path.join(home, 'memory', 'events.jsonl');

  const result = run(['improve', '--min-count', '1'], home);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --min-count/);
  assert.equal(fs.existsSync(evaluationPath), false);
  assert.equal(fs.existsSync(eventsPath), false);
});

test('recall dedupes repeated query terms when scoring', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'remember',
    '--text', 'dedupe-anchor memory-only',
    '--evidence', 'dedupe test',
  ], home);
  fs.writeFileSync(path.join(home, 'evaluations', '2099-01-02.md'), `# Awareness Evaluation - 2099-01-02

- dedupe-eval
`);

  const result = run(['recall', 'memory-only memory-only dedupe-eval', '--limit', '1'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Recall Results \(1\)/);
  const event = JSON.parse(
    fs.readFileSync(path.join(home, 'runtime', 'recall', '2099-01-02.jsonl'), 'utf8').trim().split('\n').pop(),
  );
  assert.equal(event.terms, 2);
});

test('memory review suggests repeated candidates as patterns', () => {
  const home = tempHome();
  run(['init'], home);

  run([
    'memory',
    'note',
    '--text', 'Improve task traceability',
    '--evidence', 'worklog/2099-01-01.md',
  ], home, { AWARENESS_NOW: '2099-01-01T12:34:00.000Z' });
  run([
    'memory',
    'note',
    '--text', 'Improve task traceability',
    '--evidence', 'worklog/2099-01-02.md',
  ], home);

  const review = run(['memory', 'review'], home);

  assert.equal(review.code, 0);
  assert.match(review.stdout, /Suggested pattern \(2 observations\): Improve task traceability/);
  assert.match(review.stdout, /awareness memory promote --kind pattern/);
});

test('memory review ignores pruned repeated candidates', () => {
  const home = tempHome();
  run(['init'], home);

  run([
    'memory',
    'note',
    '--text', 'Remove stale deployment shortcut',
    '--evidence', 'worklog/2099-01-01.md',
  ], home, { AWARENESS_NOW: '2099-01-01T12:34:00.000Z' });
  run([
    'memory',
    'note',
    '--text', 'Remove stale deployment shortcut',
    '--evidence', 'worklog/2099-01-02.md',
  ], home);
  run([
    'forget',
    '--text', 'Remove stale deployment shortcut',
    '--reason', 'Corrected by user',
    '--evidence', 'PR review',
  ], home);

  const review = run(['memory', 'review'], home);

  assert.equal(review.code, 0);
  assert.match(review.stdout, /No repeated candidates/);
  assert.doesNotMatch(review.stdout, /Remove stale deployment shortcut/);
});

test('memory show displays curated long-term memory grouped by section', () => {
  const home = tempHome();
  run(['init'], home);

  run([
    'memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer unified worklog blocks',
    '--evidence', 'worklog/2099-01-02.md',
  ], home);
  run([
    'memory', 'promote',
    '--kind', 'pattern',
    '--text', 'Promote only repeated candidates',
    '--evidence', 'PR review',
  ], home);

  const show = run(['memory', 'show'], home);

  assert.equal(show.code, 0);
  assert.match(show.stdout, /## Preferences/);
  assert.match(show.stdout, /Prefer unified worklog blocks/);
  assert.match(show.stdout, /## Patterns/);
  assert.match(show.stdout, /Promote only repeated candidates/);
});

test('memory show omits empty sections and candidates and pruned entries', () => {
  const home = tempHome();
  run(['init'], home);

  run([
    'memory', 'note',
    '--text', 'Pending candidate not yet promoted',
    '--evidence', 'worklog/2099-01-02.md',
  ], home);
  run([
    'memory', 'promote',
    '--kind', 'preference',
    '--text', 'A real durable preference',
    '--evidence', 'worklog/2099-01-02.md',
  ], home);
  run([
    'forget',
    '--text', 'A stale rule',
    '--reason', 'Corrected by user',
    '--evidence', 'PR review',
  ], home);

  const show = run(['memory', 'show'], home);

  assert.equal(show.code, 0);
  assert.match(show.stdout, /A real durable preference/);
  assert.doesNotMatch(show.stdout, /Pending candidate not yet promoted/);
  assert.doesNotMatch(show.stdout, /A stale rule/);
  assert.doesNotMatch(show.stdout, /## Patterns/);
  assert.doesNotMatch(show.stdout, /None yet/);
});

test('memory show reports when no curated memory exists yet', () => {
  const home = tempHome();
  run(['init'], home);

  const show = run(['memory', 'show'], home);

  assert.equal(show.code, 0);
  assert.match(show.stdout, /No curated memory yet/);
});

test('help lists local memory operation commands', () => {
  let stdout = '';
  const code = runCli(['help'], {
    env: {
      ...process.env,
      AWARENESS_NOW: '2099-01-02T12:34:00.000Z',
    },
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: () => {} },
  });

  assert.equal(code, 0);
  assert.match(stdout, /awareness remember --text TEXT --evidence TEXT/);
  assert.match(stdout, /awareness update \[--dry-run\]/);
  assert.match(stdout, /awareness memory trigger --phase PHASE/);
  assert.match(stdout, /awareness recall QUERY/);
  assert.match(stdout, /awareness forget --text TEXT --reason TEXT --evidence TEXT/);
  assert.match(stdout, /awareness improve/);
  assert.match(stdout, /State values:/);
});

test('documentation mentions local memory operations', () => {
  const cliDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'cli.md'), 'utf8');
  const memoryDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'memory.md'), 'utf8');
  const agentTemplate = fs.readFileSync(path.join(repoRootForTests(), 'templates', 'agent-instructions.md'), 'utf8');

  assert.match(cliDocs, /awareness remember/);
  assert.match(cliDocs, /awareness update/);
  assert.match(cliDocs, /awareness recall/);
  assert.match(cliDocs, /awareness forget/);
  assert.match(cliDocs, /awareness improve/);
  assert.match(memoryDocs, /memory\/events\.jsonl/);
  assert.match(agentTemplate, /awareness recall/);
});

test('parseCuratedEntries extracts curated entries with stable keys', () => {
  const content = [
    '# Long-Term Memory', '',
    '## Preferences', '',
    '- 2026-06-19: Prefer ripgrep over grep (evidence: repeated use)',
    '',
    '## Patterns', '',
    '- None yet.',
    '',
    '## Project Conventions', '',
    '- 2026-06-20: Keep src/cli.js thin (evidence: PR #11)',
    '',
  ].join('\n');

  const entries = parseCuratedEntries(content);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].section, 'Preferences');
  assert.match(entries[0].text, /Prefer ripgrep over grep/);
  assert.equal(entries[0].key, entryKey('Prefer ripgrep over grep'));
  assert.ok(!entries.some((entry) => entry.text.includes('None yet')));
  assert.equal(entryKey('Keep   SRC/cli.js  thin'), entryKey('keep src/cli.js thin'));
});

test('searchDocuments uses MiniSearch with aliases, fuzzy matching, and phrase boost', () => {
  assert.ok(searchDocuments([{ id: 'repo', text: 'sync the repo nightly' }], 'repository', 10).length > 0);
  assert.ok(searchDocuments([{ id: 'test', text: 'run the test suite' }], 'testing flow', 10).length > 0);
  assert.ok(searchDocuments([{ id: 'typo', text: 'Prefer ripgrep over grep' }], 'ripgre', 10).length > 0);

  const results = searchDocuments([
    { id: 'adjacent', text: 'document the release process here' },
    { id: 'scattered', text: 'release notes mention the build process' },
  ], 'release process', 2);
  assert.equal(results[0].id, 'adjacent');
});

test('recall finds entries via synonym expansion', () => {
  const home = tempHome();
  run(['init'], home);
  run(['remember', '--text', 'Sync the repo nightly', '--evidence', 'e'], home);

  const result = run(['recall', 'repository'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Sync the repo nightly/);
});

test('recall attributes hits to curated long-term entries', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep for searches',
    '--evidence', 'User request',
  ], home);

  const result = run(['recall', 'ripgrep'], home);
  assert.equal(result.code, 0);

  const event = JSON.parse(
    fs.readFileSync(path.join(home, 'runtime', 'recall', '2099-01-02.jsonl'), 'utf8').trim().split('\n').pop(),
  );
  assert.ok(Array.isArray(event.curatedHits));
  assert.ok(event.curatedHits.length >= 1);
});

test('memory used credits a curated entry with a memory.used event', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep for searches',
    '--evidence', 'User request',
  ], home);

  const result = run([
    'memory', 'used',
    '--text', 'ripgrep over grep',
    '--note', 'Used it to pick the search tool',
  ], home);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Credited memory as used/);

  const event = JSON.parse(
    fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8').trim().split('\n').pop(),
  );
  assert.equal(event.type, 'memory.used');
  assert.match(event.text, /Prefer ripgrep over grep/);
  assert.ok(event.key);
});

test('memory used accepts an exact --key override', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep for searches',
    '--evidence', 'e',
  ], home);
  const key = entryKey('Prefer ripgrep over grep for searches');

  const result = run(['memory', 'used', '--key', key], home);
  assert.equal(result.code, 0);
  const event = JSON.parse(
    fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8').trim().split('\n').pop(),
  );
  assert.equal(event.key, key);
});

test('memory used reports when no curated entry matches', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['memory', 'used', '--text', 'nonexistent-topic-zzz'], home);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /No curated memory matches/);
});

test('collectMemoryMetrics computes funnel, activation, and scorecard', () => {
  const home = tempHome();
  run(['init'], home);
  run(['remember', '--text', 'Prefer ripgrep over grep', '--evidence', 'e'], home);
  run([
    'memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep',
    '--evidence', 'User request',
  ], home);
  run(['recall', 'ripgrep'], home);
  run(['recall', 'kubernetes-thing'], home);
  run(['recall', 'kubernetes-thing'], home);
  run(['memory', 'used', '--text', 'ripgrep', '--note', 'helped'], home);

  const metrics = collectMemoryMetrics(home, new Date('2099-01-02T12:34:00.000Z'), 'all');

  assert.equal(metrics.store.candidatesCreated >= 1, true);
  assert.equal(metrics.store.promoted >= 1, true);
  assert.equal(metrics.utilization.curatedTotal >= 1, true);
  assert.ok(metrics.utilization.activationRate > 0);
  assert.equal(metrics.coverage.repeatedZeroResultQueries.length >= 1, true);
  assert.ok(metrics.outcome.usefulRecallRate > 0);
  assert.equal(typeof metrics.scorecard.total, 'number');
  assert.equal(metrics.scorecard.dimensions.length, 5);
});

test('memory stats renders a scorecard and supports json + snapshot', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'memory', 'promote',
    '--kind', 'preference',
    '--text', 'Prefer ripgrep over grep',
    '--evidence', 'e',
  ], home);
  run(['recall', 'ripgrep'], home);

  const text = run(['memory', 'stats', '--since', 'all'], home);
  assert.equal(text.code, 0);
  assert.match(text.stdout, /Memory Efficiency/);
  assert.match(text.stdout, /Activation/);
  assert.match(text.stdout, /Scorecard/);
  assert.match(text.stdout, /0 contradiction\(s\)/);

  const json = run(['memory', 'stats', '--since', '7d', '--json', '--snapshot'], home);
  const parsed = JSON.parse(json.stdout);
  assert.equal(typeof parsed.scorecard.total, 'number');
  const snapshot = path.join(home, 'runtime', 'metrics', '2099-01-02.jsonl');
  assert.equal(fs.existsSync(snapshot), true);
  assert.match(fs.readFileSync(snapshot, 'utf8'), /memory\.stats\.snapshot/);
});

test('memory stats rejects an invalid window', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['memory', 'stats', '--since', 'eternity'], home);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --since/);
});

test('documentation mentions memory effectiveness metrics', () => {
  const cliDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'cli.md'), 'utf8');
  const memoryDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'memory.md'), 'utf8');
  const agentTemplate = fs.readFileSync(path.join(repoRootForTests(), 'templates', 'agent-instructions.md'), 'utf8');

  assert.match(cliDocs, /awareness memory stats/);
  assert.match(cliDocs, /awareness memory used/);
  assert.match(cliDocs, /awareness memory trigger/);
  assert.match(memoryDocs, /Memory Efficiency|activation rate/i);
  assert.match(agentTemplate, /awareness memory used/);
  assert.match(agentTemplate, /awareness memory trigger/);
});

test('memory trigger injects AI-selected memories and records token overhead', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'memory', 'promote',
    '--kind', 'project',
    '--text', 'Before publishing, verify main is aligned with origin/main and update the global CLI after npm publish.',
    '--evidence', 'release convention',
  ], home);

  const result = run([
    'memory', 'trigger',
    '--phase', 'pre-action',
    '--action', 'publish release',
  ], home, {
    AWARENESS_MEMORY_TRIGGER_DECISION_JSON: JSON.stringify({
      shouldRecall: true,
      confidence: 0.91,
      intent: 'publishing release main origin global CLI',
      reason: 'Release actions have project conventions that can affect the next step.',
      risk: 'high',
      model: 'test-ai',
    }),
    AWARENESS_CONTEXT_BUDGET_TOKENS: '1000',
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Memory trigger: injected/);
  assert.match(result.stdout, /Before publishing/);
  assert.match(result.stdout, /Context overhead:/);

  const events = fs.readFileSync(path.join(home, 'runtime', 'memory-trigger', '2099-01-02.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const event = events.at(-1);
  assert.equal(event.source, 'memory.trigger');
  assert.equal(event.phase, 'pre-action');
  assert.equal(event.provider, 'fixture');
  assert.equal(event.injected, 1);
  assert.ok(event.tokens.injectedTokens > 0);
  assert.ok(event.tokens.contextOverheadPct > 0);

  const stats = run(['memory', 'stats', '--since', 'all'], home);
  assert.equal(stats.code, 0);
  assert.match(stats.stdout, /Trigger Funnel/);
  assert.match(stats.stdout, /Trigger Token Overhead/);
  assert.match(stats.stdout, /Injected: 1/);
});

test('memory trigger only retrieves active curated long-term memory sections', () => {
  const home = tempHome();
  run(['init'], home);
  fs.writeFileSync(path.join(home, 'memory', 'long-term.md'), `# Long-Term Memory

## Preferences

- 2099-01-01: Safe release requires verifying main against origin/main. (evidence: test)

## Promotion Candidates

- 2099-01-01: Stale release shortcut says publish from feature branches. (evidence: old)

## Pruned Or Revised

- 2099-01-01: Removed release shortcut says skip main verification. (reason: unsafe; evidence: test)
`);

  const result = run(['memory', 'trigger', '--phase', 'pre-action', '--action', 'release publish'], home, {
    AWARENESS_MEMORY_TRIGGER_DECISION_JSON: JSON.stringify({
      shouldRecall: true,
      confidence: 0.94,
      intent: 'release publish main verification',
      reason: 'Release action can benefit from project memory.',
      risk: 'high',
      model: 'test-ai',
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Safe release requires verifying main/);
  assert.doesNotMatch(result.stdout, /Stale release shortcut/);
  assert.doesNotMatch(result.stdout, /Removed release shortcut/);
});

test('memory trigger continues past oversized candidates', () => {
  const home = tempHome();
  run(['init'], home);
  const longReleaseMemory = `release guardrails ${'extra context '.repeat(200)}`;
  fs.writeFileSync(path.join(home, 'memory', 'long-term.md'), `# Long-Term Memory

## Project Conventions

- 2099-01-01: ${longReleaseMemory} (evidence: test)
- 2099-01-01: Release guardrails require main alignment. (evidence: test)
`);

  const result = run(['memory', 'trigger', '--phase', 'pre-action', '--action', 'release guardrails'], home, {
    AWARENESS_MEMORY_TRIGGER_DECISION_JSON: JSON.stringify({
      shouldRecall: true,
      confidence: 0.9,
      intent: 'release guardrails',
      reason: 'Needs release memory.',
      risk: 'high',
      model: 'test-ai',
    }),
    AWARENESS_MEMORY_TRIGGER_MAX_TOKENS: '20',
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Release guardrails require main alignment/);
});

test('memory trigger skips without an AI provider instead of using keyword rules', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['memory', 'trigger', '--phase', 'message', '--text', 'publish release'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Memory trigger: skipped/);
  assert.match(result.stdout, /AI trigger provider not configured/);
  assert.doesNotMatch(result.stdout, /\[awareness memory\]/);

  const events = fs.readFileSync(path.join(home, 'runtime', 'memory-trigger', '2099-01-02.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const event = events.at(-1);
  assert.equal(event.provider, 'none');
  assert.equal(event.tokens.decisionTokensIn, 0);
  assert.equal(event.tokens.totalInternalTokens, 0);
});

test('memory trigger provider timeout fails closed', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['memory', 'trigger', '--phase', 'message', '--text', 'release'], home, {
    AWARENESS_MEMORY_TRIGGER_COMMAND: process.execPath,
    AWARENESS_MEMORY_TRIGGER_ARGS_JSON: JSON.stringify(['-e', 'setTimeout(() => {}, 2000)']),
    AWARENESS_MEMORY_TRIGGER_TIMEOUT_MS: '50',
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Memory trigger: skipped/);
  assert.match(result.stdout, /timeout/);
});

test('hook session-start injects triggered memories when AI trigger fires', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'memory', 'promote',
    '--kind', 'project',
    '--text', 'Use subagents with model choice according to task complexity.',
    '--evidence', 'user preference',
  ], home);

  const result = run(['hook', 'run', '--tool', 'codex', '--event', 'session-start', '--quiet'], home, {
    AWARENESS_MEMORY_TRIGGER_DECISION_JSON: JSON.stringify({
      shouldRecall: true,
      confidence: 0.86,
      intent: 'subagents model task complexity',
      reason: 'Session start should restore relevant operating preferences.',
      risk: 'medium',
      model: 'test-ai',
    }),
  });

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Load this before doing work/);
  assert.match(result.stdout, /\[awareness memory\]/);
  assert.match(result.stdout, /Use subagents with model choice/);
});

test('hook run records a low-noise runtime event', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['hook', 'run', '--tool', 'codex', '--event', 'session-start'], home);

  assert.equal(result.code, 0);
  const hookLog = path.join(home, 'runtime', 'hooks', '2099-01-02.jsonl');
  assert.equal(fs.existsSync(hookLog), true);
  const [entry] = fs.readFileSync(hookLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(entry.source, 'hook');
  assert.equal(entry.tool, 'codex');
  assert.equal(entry.event, 'session-start');
});

test('hook run emits current focus as injectable context on session-start even when quiet', () => {
  const home = tempHome();
  run(['init'], home);
  run(['focus',
    '--task', 'ETP-1',
    '--summary', 'Wire the regen pipeline',
    '--repo', 'schema-forge',
    '--branch', 'feature/ETP-1',
    '--next', 'Run make regen and verify contract',
  ], home);

  const result = run(['hook', 'run', '--tool', 'claude', '--event', 'session-start', '--quiet'], home);

  assert.equal(result.code, 0);
  // --quiet suppresses diagnostic noise but NOT the context payload.
  assert.doesNotMatch(result.stdout, /Hook recorded/);
  assert.match(result.stdout, /\[awareness\] Load this before doing work/);
  assert.match(result.stdout, /ETP-1/);
  assert.match(result.stdout, /Run make regen and verify contract/);
  assert.match(result.stdout, /awareness handoff/);
});

test('hook run does not emit focus context on non-injection events', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['hook', 'run', '--tool', 'claude', '--event', 'stop', '--quiet'], home);

  assert.equal(result.code, 0);
  assert.doesNotMatch(result.stdout, /\[awareness\] Load this before doing work/);
});

test('hook install writes Codex, Claude, and OpenCode integration files', () => {
  const home = tempHome();
  const userHome = tempHome();
  const configHome = tempHome();
  run(['init'], home);

  const result = run([
    'hook',
    'install',
    '--tool', 'all',
    '--user-home', userHome,
    '--config-home', configHome,
    '--command', '/usr/local/bin/awareness',
  ], home);

  assert.equal(result.code, 0);

  const codexHooks = JSON.parse(fs.readFileSync(path.join(userHome, '.codex', 'hooks.json'), 'utf8'));
  assert.equal(codexHooks.hooks.SessionStart[0].hooks[0].type, 'command');
  assert.match(codexHooks.hooks.SessionStart[0].hooks[0].command, /--tool codex/);

  const claudeSettings = JSON.parse(fs.readFileSync(path.join(userHome, '.claude', 'settings.json'), 'utf8'));
  assert.match(claudeSettings.hooks.SessionEnd[0].hooks[0].command, /--tool claude/);

  const plugin = fs.readFileSync(path.join(configHome, 'opencode', 'plugins', 'awareness-framework.js'), 'utf8');
  assert.match(plugin, /Awareness Framework generated plugin/);
  assert.match(plugin, /session\.created/);
});

test('hook install pins scoped homes into generated commands', () => {
  const home = tempHome();
  const userHome = tempHome();

  const result = run([
    'hook',
    'install',
    '--tool', 'codex',
    '--user-home', userHome,
    '--command', '/usr/local/bin/awareness',
    '--channel', 'Support',
    '--user', 'alice',
  ], home);

  assert.equal(result.code, 0);
  const codexHooks = JSON.parse(fs.readFileSync(path.join(userHome, '.codex', 'hooks.json'), 'utf8'));
  assert.match(codexHooks.hooks.SessionStart[0].hooks[0].command, /--home/);
  assert.match(codexHooks.hooks.SessionStart[0].hooks[0].command, /channels\/support/);
  assert.doesNotMatch(codexHooks.hooks.SessionStart[0].hooks[0].command, /users\/alice/);
});

test('schedule run daily writes runtime event and daily evaluation', () => {
  const home = tempHome();
  run(['init'], home);

  const result = run(['schedule', 'run', '--cadence', 'daily'], home);

  assert.equal(result.code, 0);
  assert.equal(fs.existsSync(path.join(home, 'runtime', 'schedule', '2099-01-02.jsonl')), true);
  assert.equal(fs.existsSync(path.join(home, 'evaluations', '2099-01-02.md')), true);
});

test('schedule install writes macOS LaunchAgents for hourly and daily maintenance', () => {
  const home = tempHome();
  const userHome = tempHome();
  run(['init'], home);

  const result = run([
    'schedule',
    'install',
    '--cadence', 'all',
    '--user-home', userHome,
    '--command', '/usr/local/bin/awareness',
  ], home);

  assert.equal(result.code, 0);
  const hourly = fs.readFileSync(path.join(userHome, 'Library', 'LaunchAgents', 'dev.fyso.awareness.hourly.plist'), 'utf8');
  const daily = fs.readFileSync(path.join(userHome, 'Library', 'LaunchAgents', 'dev.fyso.awareness.daily.plist'), 'utf8');
  assert.match(hourly, /<integer>3600<\/integer>/);
  assert.match(daily, /<integer>86400<\/integer>/);
  assert.match(hourly, /--cadence/);
  assert.match(hourly, /hourly/);
  assert.match(hourly, /<key>EnvironmentVariables<\/key>/);
  assert.match(hourly, /<key>PATH<\/key>/);
  assert.match(hourly, /\/usr\/local\/bin:\/opt\/homebrew\/bin/);
});

test('schedule install uses scoped LaunchAgent labels when channel is set', () => {
  const home = tempHome();
  const userHome = tempHome();
  run(['init'], home);

  const result = run([
    'schedule',
    'install',
    '--cadence', 'hourly',
    '--user-home', userHome,
    '--command', '/usr/local/bin/awareness',
    '--channel', 'Support',
  ], home);

  assert.equal(result.code, 0);
  const plist = fs.readFileSync(path.join(userHome, 'Library', 'LaunchAgents', 'dev.fyso.awareness.support.hourly.plist'), 'utf8');
  assert.match(plist, /dev\.fyso\.awareness\.support\.hourly/);
  assert.match(plist, /channels\/support/);
});

test('recall records a hit event with result count and top files', () => {
  const home = tempHome();
  run(['init'], home);
  run(['remember', '--text', 'Use the staging database for smoke tests', '--evidence', 'Team call'], home);

  const result = run(['recall', 'staging database'], home);
  assert.equal(result.code, 0);

  const recallLog = path.join(home, 'runtime', 'recall', '2099-01-02.jsonl');
  assert.equal(fs.existsSync(recallLog), true);
  const event = JSON.parse(fs.readFileSync(recallLog, 'utf8').trim().split('\n').pop());
  assert.equal(event.source, 'recall');
  assert.equal(event.query, 'staging database');
  assert.ok(event.resultCount >= 1);
  assert.ok(Array.isArray(event.topFiles));
});

test('stats aggregates hooks, memory, recall, and storage', () => {
  const home = tempHome();
  run(['init'], home);
  run(['hook', 'run', '--tool', 'claude', '--event', 'session-start'], home);
  run(['remember', '--text', 'Prefer ripgrep over grep', '--evidence', 'Repeated use'], home);
  run(['recall', 'ripgrep'], home);
  run(['recall', 'nonexistent-term-xyz'], home);

  const result = run(['stats', '--since', 'all'], home);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Awareness Stats/);
  assert.match(result.stdout, /Sessions started: 1/);
  assert.match(result.stdout, /Calls: 2/);
  assert.match(result.stdout, /Zero-result queries: 1/);
  assert.match(result.stdout, /Private Templates/);
  assert.match(result.stdout, /Status: up-to-date/);
  assert.match(result.stdout, /Storage/);
});

test('stats surfaces pending private template updates', () => {
  const home = tempHome();
  run(['init'], home);
  fs.writeFileSync(path.join(home, 'AGENTS.md'), '# Existing Protocol\n');
  fs.writeFileSync(path.join(home, 'memory', 'long-term.md'), `# Long-Term Memory

## Review Notes

## Event Log
`);

  const result = run(['stats', '--since', 'all'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Private Templates/);
  assert.match(result.stdout, /Status: updates available/);
  assert.match(result.stdout, /AGENTS\.md: added memory effectiveness guidance/);
  assert.match(result.stdout, /memory\/long-term\.md:/);

  const json = run(['stats', '--since', 'all', '--json'], home);
  assert.equal(json.code, 0);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.privateTemplates.status, 'updates-available');
  assert.equal(parsed.privateTemplates.pendingFiles.length, 2);
});

test('stats aggregates memory trigger token overhead', () => {
  const home = tempHome();
  run(['init'], home);
  run([
    'memory', 'promote',
    '--kind', 'project',
    '--text', 'Use release guardrails before publishing.',
    '--evidence', 'release convention',
  ], home);
  run(['memory', 'trigger', '--phase', 'pre-action', '--action', 'publish'], home, {
    AWARENESS_MEMORY_TRIGGER_DECISION_JSON: JSON.stringify({
      shouldRecall: true,
      confidence: 0.9,
      intent: 'release guardrails publishing',
      reason: 'Release action can benefit from project memory.',
      risk: 'high',
      model: 'test-ai',
    }),
    AWARENESS_CONTEXT_BUDGET_TOKENS: '1000',
  });

  const result = run(['stats', '--since', 'all'], home);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Memory Trigger/);
  assert.match(result.stdout, /Calls: 1/);
  assert.match(result.stdout, /Injected\/skipped: 1\/0/);
  assert.match(result.stdout, /Avg context overhead:/);

  const json = run(['stats', '--since', 'all', '--json'], home);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.memoryTrigger.calls, 1);
  assert.equal(parsed.memoryTrigger.injected, 1);
  assert.ok(parsed.memoryTrigger.totalInjectedTokens > 0);
});

test('stats supports JSON output and snapshot persistence', () => {
  const home = tempHome();
  run(['init'], home);
  run(['recall', 'anything'], home);

  const json = run(['stats', '--since', '7d', '--json', '--snapshot'], home);
  assert.equal(json.code, 0);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.window.since, '7d');
  assert.equal(parsed.recall.calls, 1);
  assert.equal(parsed.privateTemplates.status, 'up-to-date');

  const snapshotLog = path.join(home, 'runtime', 'metrics', '2099-01-02.jsonl');
  assert.equal(fs.existsSync(snapshotLog), true);
  const snapshot = JSON.parse(fs.readFileSync(snapshotLog, 'utf8').trim().split('\n').pop());
  assert.equal(snapshot.source, 'stats.snapshot');
  assert.equal(snapshot.stats.recall.calls, 1);
});

test('stats rejects an invalid window', () => {
  const home = tempHome();
  run(['init'], home);
  const result = run(['stats', '--since', 'yesterday'], home);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --since/);
});
