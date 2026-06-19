import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli.js';

function run(argv, home, env = {}) {
  let stdout = '';
  let stderr = '';
  const code = runCli([...argv, '--home', home], {
    env: {
      ...process.env,
      ...env,
      AWARENESS_NOW: '2099-01-02T12:34:00.000Z',
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

test('channel scope stores private files under a channel-specific folder', () => {
  const home = tempHome();

  const result = run(['init', '--channel', '#Support Desk'], home);

  assert.equal(result.code, 0);
  const scopedHome = path.join(home, 'channels', 'support-desk');
  assert.equal(fs.existsSync(path.join(scopedHome, 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(scopedHome, 'awareness', 'current.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'awareness', 'current.md')), false);

  const status = run(['status', '--channel', '#Support Desk'], home);
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

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'memory.pruned');
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
  assert.match(result.stdout, /Pattern suggestions: 1/);
  assert.match(result.stdout, /Improve traceability before handoff/);
  assert.equal(fs.existsSync(path.join(home, 'evaluations', '2099-01-02.md')), true);

  const events = fs.readFileSync(path.join(home, 'memory', 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events.at(-1).type, 'pattern.suggested');
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
  assert.match(result.stdout, /evaluations\/2099-01-02\.md/);
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
  assert.match(stdout, /awareness recall QUERY/);
  assert.match(stdout, /awareness forget --text TEXT --reason TEXT --evidence TEXT/);
  assert.match(stdout, /awareness improve/);
});

test('documentation mentions local memory operations', () => {
  const cliDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'cli.md'), 'utf8');
  const memoryDocs = fs.readFileSync(path.join(repoRootForTests(), 'docs', 'memory.md'), 'utf8');
  const agentTemplate = fs.readFileSync(path.join(repoRootForTests(), 'templates', 'agent-instructions.md'), 'utf8');

  assert.match(cliDocs, /awareness remember/);
  assert.match(cliDocs, /awareness recall/);
  assert.match(cliDocs, /awareness forget/);
  assert.match(cliDocs, /awareness improve/);
  assert.match(memoryDocs, /memory\/events\.jsonl/);
  assert.match(agentTemplate, /awareness recall/);
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
