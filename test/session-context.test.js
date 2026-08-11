import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { runCli } from '../src/cli.js';
import { detectGitContext } from '../src/git-context.js';

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-ctx-'));
}

function tempGitRepo(name, { branch = 'main', origin = null } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-git-'));
  const dir = path.join(parent, name);
  fs.mkdirSync(dir);
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  if (origin) execFileSync('git', ['remote', 'add', 'origin', origin], { cwd: dir });
  return dir;
}

function tempNonRepo() {
  // /tmp itself may sit inside no repo; create an isolated dir and confirm.
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-bare-'));
}

test('detectGitContext reads repo name and branch from a git worktree', () => {
  const dir = tempGitRepo('widget-service', { branch: 'feat/telemetry' });

  const ctx = detectGitContext(dir);

  assert.equal(ctx.isRepo, true);
  assert.equal(ctx.repo, 'widget-service');
  assert.equal(ctx.branch, 'feat/telemetry');
});

test('detectGitContext prefers owner/name from the origin remote', () => {
  const dir = tempGitRepo('local-dirname', { origin: 'git@github.com:fyso-dev/opensource-ingest.git' });

  const ctx = detectGitContext(dir);

  assert.equal(ctx.repo, 'fyso-dev/opensource-ingest');
});

test('detectGitContext reports isRepo false outside a git worktree', () => {
  const ctx = detectGitContext(tempNonRepo());

  assert.equal(ctx.isRepo, false);
  assert.equal(ctx.repo, null);
  assert.equal(ctx.branch, null);
});

test('focus defaults repo and branch to the detected git context', () => {
  const home = tempHome();
  const dir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);

  run(['focus', '--task', 'AW-1', '--summary', 'Fix drift', '--next', 'Ship it'], home, { cwd: dir });

  const board = fs.readFileSync(path.join(home, 'awareness', 'current.md'), 'utf8');
  assert.match(board, /- Repository: awareness-framework/);
  assert.match(board, /- Branch: main/);
  assert.doesNotMatch(board, /- Repository: Unspecified/);
});

test('focus keeps explicit repo and branch flags over the detected context', () => {
  const home = tempHome();
  const dir = tempGitRepo('detected-repo', { branch: 'detected-branch' });
  run(['init'], home);

  run([
    'focus', '--task', 'AW-2', '--summary', 'Explicit wins', '--next', 'Ship it',
    '--repo', 'chosen-repo', '--branch', 'chosen-branch',
  ], home, { cwd: dir });

  const board = fs.readFileSync(path.join(home, 'awareness', 'current.md'), 'utf8');
  assert.match(board, /- Repository: chosen-repo/);
  assert.match(board, /- Branch: chosen-branch/);
});

test('status flags divergence when the session repo differs from the stored focus', () => {
  const home = tempHome();
  const focusDir = tempGitRepo('opensource-ingest', { branch: 'agent/multi-account' });
  const otherDir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);
  run(['focus', '--task', 'AW-3', '--summary', 'Runner work', '--next', 'Ship it'], home, { cwd: focusDir });

  const { stdout } = run(['status'], home, { cwd: otherDir });

  assert.match(stdout, /Session Context/);
  assert.match(stdout, /awareness-framework/);
  assert.match(stdout, /diverges/i);
});

test('status states the divergence once, not in both the note and the warnings', () => {
  const home = tempHome();
  const focusDir = tempGitRepo('opensource-ingest', { branch: 'agent/multi-account' });
  const otherDir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);
  run(['focus', '--task', 'AW-7', '--summary', 'Runner work', '--next', 'Ship it'], home, { cwd: focusDir });

  const { stdout } = run(['status'], home, { cwd: otherDir });

  assert.equal(stdout.match(/diverges/gi)?.length, 1);
});

test('status does not flag divergence when the session matches the stored focus', () => {
  const home = tempHome();
  const dir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);
  run(['focus', '--task', 'AW-4', '--summary', 'Same repo', '--next', 'Ship it'], home, { cwd: dir });

  const { stdout } = run(['status'], home, { cwd: dir });

  assert.doesNotMatch(stdout, /diverges/i);
});

test('status outside any git repo does not claim divergence', () => {
  const home = tempHome();
  const dir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);
  run(['focus', '--task', 'AW-5', '--summary', 'Some work', '--next', 'Ship it'], home, { cwd: dir });

  const { stdout } = run(['status'], home, { cwd: tempNonRepo() });

  assert.doesNotMatch(stdout, /diverges/i);
});

test('handoff flags that the focus it replays belongs to another repo', () => {
  const home = tempHome();
  const focusDir = tempGitRepo('opensource-ingest', { branch: 'agent/runner' });
  const otherDir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);
  run(['focus', '--task', 'AW-8', '--summary', 'Runner work', '--next', 'Ship it'], home, { cwd: focusDir });

  const { stdout } = run(['handoff'], home, { cwd: otherDir });

  assert.match(stdout, /diverges/i);
});

test('handoff stays clean when the focus matches the session', () => {
  const home = tempHome();
  const dir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);
  run(['focus', '--task', 'AW-9', '--summary', 'Board work', '--next', 'Ship it'], home, { cwd: dir });

  const { stdout } = run(['handoff'], home, { cwd: dir });

  assert.doesNotMatch(stdout, /diverges/i);
});

test('check reports focus divergence as an actionable warning', () => {
  const home = tempHome();
  const focusDir = tempGitRepo('opensource-ingest', { branch: 'agent/multi-account' });
  const otherDir = tempGitRepo('awareness-framework', { branch: 'main' });
  run(['init'], home);
  run(['focus', '--task', 'AW-6', '--summary', 'Runner work', '--next', 'Ship it'], home, { cwd: focusDir });

  const { stdout } = run(['check'], home, { cwd: otherDir });

  assert.match(stdout, /awareness focus/);
});
