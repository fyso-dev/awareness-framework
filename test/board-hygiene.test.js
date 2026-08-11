import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-board-'));
  run(['init'], home);
  return home;
}

function board(home) {
  return fs.readFileSync(path.join(home, 'awareness', 'current.md'), 'utf8');
}

function seedTask(home, task, summary, state) {
  run(['focus', '--task', task, '--summary', summary, '--next', 'Keep going', '--state', state], home);
}

test('archive moves done tasks off the active board', () => {
  const home = tempHome();
  seedTask(home, 'AW-10', 'Finished work', 'done');
  seedTask(home, 'AW-11', 'Ongoing work', 'in-progress');

  run(['archive'], home);

  const active = board(home);
  assert.doesNotMatch(active, /### AW-10/);
  assert.match(active, /### AW-11/);
});

test('archive writes retired tasks to a dated archive file', () => {
  const home = tempHome();
  seedTask(home, 'AW-12', 'Finished work', 'done');
  seedTask(home, 'AW-CURRENT', 'Still going', 'in-progress');

  run(['archive'], home);

  const archive = fs.readFileSync(path.join(home, 'awareness', 'archive', '2099-01.md'), 'utf8');
  assert.match(archive, /### AW-12 - Finished work/);
  assert.match(archive, /- State: done/);
});

test('archive reports how many tasks it retired', () => {
  const home = tempHome();
  seedTask(home, 'AW-13', 'One', 'done');
  seedTask(home, 'AW-14', 'Two', 'done');
  seedTask(home, 'AW-CURRENT', 'Still going', 'in-progress');

  const { stdout } = run(['archive'], home);

  assert.match(stdout, /Archived 2 done task\(s\)/);
});

test('archive is a no-op when nothing is done', () => {
  const home = tempHome();
  seedTask(home, 'AW-15', 'Ongoing', 'in-progress');

  const { stdout } = run(['archive'], home);

  assert.match(stdout, /no tasks to archive/i);
  assert.match(board(home), /### AW-15/);
});

test('archive --dry-run leaves the board untouched', () => {
  const home = tempHome();
  seedTask(home, 'AW-16', 'Finished', 'done');
  const before = board(home);

  run(['archive', '--dry-run'], home);

  assert.equal(board(home), before);
  assert.equal(fs.existsSync(path.join(home, 'awareness', 'archive')), false);
});

test('archive does not retire the task that is the current focus', () => {
  const home = tempHome();
  seedTask(home, 'AW-17', 'Done but still focused', 'done');

  run(['archive'], home);

  // The board's Current Focus still points at AW-17; retiring its task block
  // would leave the focus dangling with no detail anywhere on the board.
  assert.match(board(home), /### AW-17/);
});

test('focus does not fabricate a Done entry for a fresh task', () => {
  const home = tempHome();

  seedTask(home, 'AW-18', 'Brand new work', 'in-progress');

  assert.doesNotMatch(board(home), /Focus updated\./);
});

test('log records its changes as a Done entry on the task block', () => {
  const home = tempHome();
  seedTask(home, 'AW-19', 'Some work', 'in-progress');

  run([
    'log', '--task', 'AW-19',
    '--summary', 'Wired the adapter',
    '--changes', 'Added retry to the HTTP client',
  ], home);

  assert.match(board(home), /Added retry to the HTTP client/);
});

test('focus preserves Done entries already recorded for the task', () => {
  const home = tempHome();
  seedTask(home, 'AW-20', 'Some work', 'in-progress');
  run([
    'log', '--task', 'AW-20',
    '--summary', 'First step',
    '--changes', 'Added the parser',
  ], home);

  seedTask(home, 'AW-20', 'Some work, refined', 'in-review');

  assert.match(board(home), /Added the parser/);
});

test('log for an unknown task does not invent a board entry', () => {
  const home = tempHome();
  seedTask(home, 'AW-21', 'Some work', 'in-progress');

  run([
    'log', '--task', 'AW-999',
    '--summary', 'Unrelated',
    '--changes', 'Touched another repo',
  ], home);

  assert.doesNotMatch(board(home), /### AW-999/);
});
