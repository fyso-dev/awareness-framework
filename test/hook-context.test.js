import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { runCli } from '../src/cli.js';

function run(argv, home, { env = {}, cwd } = {}) {
  let stdout = '';
  let stderr = '';
  const inherited = { ...process.env };
  delete inherited.AWARENESS_MEMORY_DEBUG;
  const code = runCli([...argv, '--home', home], {
    env: {
      ...inherited,
      AWARENESS_NOW: '2099-01-02T12:34:00.000Z',
      ...env,
    },
    cwd,
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  return { code, stdout, stderr };
}

function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-hook-'));
  run(['init'], home);
  return home;
}

function tempGitRepo(name, { branch = 'main' } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-git-'));
  const dir = path.join(parent, name);
  fs.mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  return dir;
}

test('session-start injection reports the session repo alongside the stored focus', () => {
  const home = tempHome();
  const dir = tempGitRepo('awareness-framework');
  run(['focus', '--task', 'AW-30', '--summary', 'Board work', '--next', 'Ship it'], home, { cwd: dir });

  const { stdout } = run(['hook', 'run', '--event', 'session-start', '--quiet'], home, { cwd: dir });

  assert.match(stdout, /awareness-framework/);
});

test('session-start injection warns the agent when the focus is from another repo', () => {
  const home = tempHome();
  const focusDir = tempGitRepo('opensource-ingest', { branch: 'agent/runner' });
  const otherDir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['focus', '--task', 'AW-31', '--summary', 'Runner work', '--next', 'Ship it'], home, { cwd: focusDir });

  const { stdout } = run(['hook', 'run', '--event', 'session-start', '--quiet'], home, { cwd: otherDir });

  assert.match(stdout, /may not apply|diverges/i);
});

test('session-start injection stays clean when focus and session agree', () => {
  const home = tempHome();
  const dir = tempGitRepo('awareness-framework');
  run(['focus', '--task', 'AW-32', '--summary', 'Board work', '--next', 'Ship it'], home, { cwd: dir });

  const { stdout } = run(['hook', 'run', '--event', 'session-start', '--quiet'], home, { cwd: dir });

  assert.doesNotMatch(stdout, /may not apply|diverges/i);
});

test('user-prompt additionalContext flags a focus from another repo', () => {
  const home = tempHome();
  const focusDir = tempGitRepo('opensource-ingest', { branch: 'agent/runner' });
  const otherDir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['focus', '--task', 'AW-33', '--summary', 'Runner work', '--next', 'Ship it'], home, { cwd: focusDir });

  const { stdout } = run(['hook', 'run', '--event', 'user-prompt', '--quiet'], home, { cwd: otherDir });
  const payload = JSON.parse(stdout);

  assert.match(payload.hookSpecificOutput.additionalContext, /awareness-framework/);
});

test('user-prompt additionalContext stays terse when focus and session agree', () => {
  const home = tempHome();
  const dir = tempGitRepo('awareness-framework');
  run(['focus', '--task', 'AW-34', '--summary', 'Board work', '--next', 'Ship it'], home, { cwd: dir });

  const { stdout } = run(['hook', 'run', '--event', 'user-prompt', '--quiet'], home, { cwd: dir });
  const payload = JSON.parse(stdout);

  assert.doesNotMatch(payload.hookSpecificOutput.additionalContext, /may not apply/i);
});

test('user-prompt additionalContext remains valid JSON when divergence text is added', () => {
  const home = tempHome();
  const focusDir = tempGitRepo('opensource-ingest', { branch: 'agent/runner' });
  const otherDir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['focus', '--task', 'AW-35', '--summary', 'Work with "quotes" and \\ backslash', '--next', 'Ship it'], home, { cwd: focusDir });

  const { stdout } = run(['hook', 'run', '--event', 'user-prompt', '--quiet'], home, { cwd: otherDir });

  assert.doesNotThrow(() => JSON.parse(stdout));
});
