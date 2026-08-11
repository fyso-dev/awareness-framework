import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCli } from '../src/cli.js';

function run(argv, home, env = {}) {
  let stdout = '';
  let stderr = '';
  const inherited = { ...process.env };
  delete inherited.AWARENESS_MEMORY_DEBUG;
  delete inherited.AWARENESS_MEMORY_TRIGGER_COMMAND;
  const code = runCli([...argv, '--home', home], {
    env: {
      ...inherited,
      AWARENESS_NOW: '2099-01-02T12:34:00.000Z',
      ...env,
    },
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
  });
  return { code, stdout, stderr };
}

function tempHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'awareness-trigcfg-'));
  run(['init'], home);
  return home;
}

// A real executable decisor, so the trigger path is exercised end to end.
function stubDecisor(home, { intent = 'stubbed intent' } = {}) {
  const file = path.join(home, 'stub-decisor.js');
  fs.writeFileSync(file, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  shouldRecall: true,
  confidence: 0.95,
  intent: ${JSON.stringify(intent)},
  reason: 'stub decisor',
  risk: 'low',
  model: 'stub-model',
}));
`, { mode: 0o755 });
  return file;
}

function seedMemory(home) {
  run([
    'memory', 'promote',
    '--kind', 'project',
    '--text', 'Use release guardrails before publishing.',
    '--evidence', 'release convention',
  ], home);
}

test('memory setup persists the trigger command so it survives a new shell', () => {
  const home = tempHome();

  run(['memory', 'setup', '--provider', 'claude'], home);

  const config = JSON.parse(fs.readFileSync(path.join(home, 'config.json'), 'utf8'));
  assert.match(config.memoryTriggerCommand, /awareness-trigger$/);
});

test('memory trigger uses the persisted command when the env var is unset', () => {
  const home = tempHome();
  seedMemory(home);
  const decisor = stubDecisor(home);
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ memoryTriggerCommand: decisor }));

  const { stdout } = run(['memory', 'trigger', '--phase', 'pre-action', '--action', 'publish release'], home);

  assert.doesNotMatch(stdout, /not configured/);
  assert.match(stdout, /stub-model|command/);
});

test('the trigger env var still overrides the persisted command', () => {
  const home = tempHome();
  seedMemory(home);
  const configured = stubDecisor(home, { intent: 'from config' });
  const override = stubDecisor(home, { intent: 'from env' });
  fs.renameSync(override, path.join(home, 'override.js'));
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ memoryTriggerCommand: configured }));

  const { stdout } = run(
    ['memory', 'trigger', '--phase', 'pre-action', '--action', 'publish release', '--json'],
    home,
    { AWARENESS_MEMORY_TRIGGER_COMMAND: path.join(home, 'override.js') },
  );

  assert.match(stdout, /from env/);
});

test('check warns when no memory trigger provider is configured', () => {
  const home = tempHome();

  const { stdout } = run(['check'], home);

  assert.match(stdout, /awareness memory setup/);
});

test('check stops warning once a trigger provider is configured', () => {
  const home = tempHome();
  const decisor = stubDecisor(home);
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ memoryTriggerCommand: decisor }));

  const { stdout } = run(['check'], home);

  assert.doesNotMatch(stdout, /awareness memory setup/);
});

test('stats separates unconfigured trigger calls from real evaluations', () => {
  const home = tempHome();
  run(['memory', 'trigger', '--phase', 'session-start'], home);
  run(['memory', 'trigger', '--phase', 'session-start'], home);

  const { stdout } = run(['stats', '--json'], home);
  const stats = JSON.parse(stdout);

  assert.equal(stats.memoryTrigger.unconfigured, 2);
  assert.equal(stats.memoryTrigger.evaluated, 0);
});

test('stats text output does not report unconfigured calls as evaluations', () => {
  const home = tempHome();
  run(['memory', 'trigger', '--phase', 'session-start'], home);

  const { stdout } = run(['stats'], home);

  assert.match(stdout, /not configured/i);
});
