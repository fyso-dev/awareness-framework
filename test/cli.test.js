import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli.js';

function run(argv, home) {
  let stdout = '';
  let stderr = '';
  const code = runCli([...argv, '--home', home], {
    env: {
      ...process.env,
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

test('init creates private awareness files', () => {
  const home = tempHome();
  const result = run(['init'], home);

  assert.equal(result.code, 0);
  assert.equal(fs.existsSync(path.join(home, 'AGENTS.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'awareness', 'current.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'worklog', '2099-01-02.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'memory', 'personality.md')), true);
  assert.equal(fs.existsSync(path.join(home, 'memory', 'long-term.md')), true);
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
