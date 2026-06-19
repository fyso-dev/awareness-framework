import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
      case 'memory':
        return memoryCommand(ctx, subcommand, parsed.opts);
      case 'hook':
        return hookCommand(ctx, subcommand, parsed.opts);
      case 'schedule':
        return scheduleCommand(ctx, subcommand, parsed.opts);
      case 'personality':
        return personalityCommand(ctx, subcommand, parsed.opts);
      case 'user':
        return userCommand(ctx, subcommand, parsed.opts);
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
  awareness init --wrappers [--home PATH] [--user-home PATH] [--config-home PATH] [--overwrite-wrappers]
  awareness status [--home PATH]
  awareness refresh [--home PATH]
  awareness check [--home PATH] [--strict]
  awareness focus --task ID --summary TEXT --repo TEXT --branch TEXT --next TEXT [--state STATE] [--home PATH]
  awareness log --task ID --summary TEXT --changes TEXT [--context TEXT] [--state STATE] [--evidence TEXT] [--next TEXT] [--home PATH]
  awareness handoff [--home PATH]
  awareness evaluate [--home PATH] [--force] [--print]
  awareness memory candidates [--home PATH]
  awareness memory review [--min-count N] [--home PATH]
  awareness memory note --text TEXT [--evidence TEXT] [--home PATH]
  awareness memory promote --kind preference|pattern|project|review --text TEXT --evidence TEXT [--home PATH]
  awareness hook run --event EVENT [--tool TOOL] [--quiet] [--home PATH]
  awareness hook install --tool codex|claude|opencode|all [--command CMD] [--home PATH] [--user-home PATH] [--config-home PATH] [--overwrite]
  awareness schedule run --cadence hourly|daily [--home PATH]
  awareness schedule install --cadence hourly|daily|all [--command CMD] [--load] [--home PATH] [--user-home PATH]
  awareness personality show [--home PATH]
  awareness personality note --text TEXT [--evidence TEXT] [--home PATH]
  awareness personality adopt --text TEXT [--evidence TEXT] [--home PATH]
  awareness user show --user ID [--channel NAME] [--home PATH]
  awareness user note --user ID --kind nickname|question|topic|preference|fact|note --text TEXT [--evidence TEXT] [--channel NAME] [--home PATH]

Scope options:
  --home PATH                 Exact/base private state folder. Default: ~/.agents
  --agent-folder PATH         Alias for the base private state folder.
  --channel NAME              Store state under <folder>/channels/<safe-name>.
  --user ID                   Select a user memory file for user commands.

The CLI maintains private files under ~/.agents by default. It does not post to Jira, GitHub, or any external system.`);
}

function initCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const userHome = userHomePath(ctx, opts);
  const configHome = configHomePath(ctx, opts, userHome);
  const today = todayParts(ctx);
  const created = [];
  const existing = [];
  const overwritten = [];

  for (const dir of ['awareness', 'worklog', 'memory', 'memory/users', 'evaluations', 'runtime']) {
    ensureDir(path.join(home, dir));
  }

  writeIfMissing(path.join(home, 'AGENTS.md'), readTemplate('agent-instructions.md'), created, existing);
  writeIfMissing(path.join(home, 'awareness', 'current.md'), initialAwareness(today), created, existing);
  writeIfMissing(path.join(home, 'worklog', `${today.date}.md`), dailyWorklog(today.date), created, existing);
  writeIfMissing(path.join(home, 'memory', 'personality.md'), readTemplate('personality.md'), created, existing);
  writeIfMissing(path.join(home, 'memory', 'preferences.md'), privateMemorySeed('Preferences'), created, existing);
  writeIfMissing(path.join(home, 'memory', 'patterns.md'), privateMemorySeed('Patterns'), created, existing);
  writeIfMissing(longTermMemoryPath(home), readTemplate('memory-long-term.md'), created, existing);

  if (opts.wrappers) {
    writeWrappers({
      canonicalPath: path.join(home, 'AGENTS.md'),
      userHome,
      configHome,
      overwrite: Boolean(opts.overwriteWrappers),
      created,
      existing,
      overwritten,
    });
  }

  out(ctx, `Initialized awareness home: ${home}`);
  out(ctx, `Created: ${created.length ? created.map((file) => displayPath(home, file)).join(', ') : 'none'}`);
  out(ctx, `Existing: ${existing.length ? existing.map((file) => displayPath(home, file)).join(', ') : 'none'}`);
  if (opts.wrappers) {
    out(ctx, `Wrappers: ${wrapperSummary({ userHome, configHome })}`);
    out(ctx, `Overwritten: ${overwritten.length ? overwritten.join(', ') : 'none'}`);
  }
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
  const candidates = recordEvaluationMemoryCandidates(home, today);
  out(ctx, `Evaluation written: ${evaluationPath}`);
  out(ctx, `Memory candidates: ${candidates.length ? `${candidates.length} recorded` : 'none'}`);
  return 0;
}

function memoryCommand(ctx, subcommand, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);

  switch (subcommand) {
    case 'candidates':
    case undefined:
      return memoryCandidatesCommand(ctx, home);
    case 'review':
      return memoryReviewCommand(ctx, home, opts);
    case 'note':
      return memoryNoteCommand(ctx, home, opts);
    case 'promote':
      return memoryPromoteCommand(ctx, home, opts);
    default:
      err(ctx, `Unknown memory command: ${subcommand}`);
      err(ctx, 'Use: candidates, review, note, or promote.');
      return 1;
  }
}

function memoryCandidatesCommand(ctx, home) {
  const content = fs.readFileSync(longTermMemoryPath(home), 'utf8');
  out(ctx, 'Promotion Candidates');
  out(ctx, extractSection(content, 'Promotion Candidates').trim() || '- None yet.');
  return 0;
}

function memoryReviewCommand(ctx, home, opts) {
  const minCount = Number.parseInt(opts.minCount || '2', 10);
  if (!Number.isInteger(minCount) || minCount < 2) {
    throw new Error('Invalid --min-count. Use an integer >= 2.');
  }

  const content = fs.readFileSync(longTermMemoryPath(home), 'utf8');
  const suggestions = repeatedMemoryCandidateSuggestions(content, minCount);
  out(ctx, 'Memory Review');

  if (!suggestions.length) {
    out(ctx, `- No repeated candidates found with min-count ${minCount}.`);
    return 0;
  }

  for (const suggestion of suggestions) {
    out(ctx, `- Suggested pattern (${suggestion.count} observations): ${suggestion.text}`);
    out(ctx, `  Evidence: ${suggestion.evidence}`);
    out(ctx, `  Promote: awareness memory promote --kind pattern --text "${shellQuoteText(suggestion.text)}" --evidence "${shellQuoteText(suggestion.evidence)}"`);
  }
  return 0;
}

function memoryNoteCommand(ctx, home, opts) {
  const text = required(opts, 'text');
  const evidence = opts.evidence || 'Manual observation';
  const today = todayParts(ctx);
  const added = appendMemoryCandidate(home, today, text, evidence);
  out(ctx, added ? `Memory candidate recorded: ${text}` : `Memory candidate already exists: ${text}`);
  return 0;
}

function memoryPromoteCommand(ctx, home, opts) {
  const kind = required(opts, 'kind');
  const text = required(opts, 'text');
  const evidence = required(opts, 'evidence');
  const section = memoryPromotionSection(kind);
  const today = todayParts(ctx);
  const file = longTermMemoryPath(home);
  let content = fs.readFileSync(file, 'utf8');
  content = replaceMetadata(content, 'Updated', formatTimestamp(today));
  content = appendToSection(content, section, `- ${today.date}: ${text} (evidence: ${evidence})\n`);
  fs.writeFileSync(file, content);
  out(ctx, `Memory promoted to ${section}: ${text}`);
  return 0;
}

function memoryPromotionSection(kind) {
  const sections = {
    preference: 'Preferences',
    pattern: 'Patterns',
    project: 'Project Conventions',
    review: 'Review Guidance',
  };
  if (!sections[kind]) {
    throw new Error(`Invalid memory kind: ${kind}. Valid kinds: ${Object.keys(sections).join(', ')}`);
  }
  return sections[kind];
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

function userCommand(ctx, subcommand, opts) {
  const home = agentsHome(ctx, opts);
  ensurePrivateState(home, ctx);
  const user = selectedUser(ctx, opts);
  const userSlug = safeScopeSlug(user, 'user');
  const file = userMemoryPath(home, userSlug);

  switch (subcommand) {
    case 'show':
    case undefined:
      if (!fs.existsSync(file)) {
        err(ctx, `Missing user memory: ${file}`);
        return 1;
      }
      out(ctx, fs.readFileSync(file, 'utf8').trimEnd());
      return 0;
    case 'note':
      return userMemoryAppend(ctx, file, user, opts);
    default:
      err(ctx, `Unknown user command: ${subcommand}`);
      err(ctx, 'Use: show or note.');
      return 1;
  }
}

function userMemoryAppend(ctx, file, user, opts) {
  const text = required(opts, 'text');
  const kind = opts.kind || 'note';
  const evidence = opts.evidence || 'Not specified';
  const section = userMemorySection(kind);
  const today = todayParts(ctx);
  const timestamp = formatTimestamp(today);

  ensureDir(path.dirname(file));
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, initialUserMemory(user, timestamp));
  }

  let content = fs.readFileSync(file, 'utf8');
  content = replaceMetadata(content, 'Updated', timestamp);
  content = appendToSection(content, section, `- ${today.date} ${today.time}: ${text} (evidence: ${evidence})\n`);
  fs.writeFileSync(file, content);
  out(ctx, `User memory updated: ${file}`);
  return 0;
}

function userMemorySection(kind) {
  const sections = {
    nickname: 'Nicknames',
    question: 'Questions',
    topic: 'Topics',
    preference: 'Preferences',
    fact: 'Facts',
    note: 'Notes',
  };
  if (!sections[kind]) {
    throw new Error(`Invalid user memory kind: ${kind}. Valid kinds: ${Object.keys(sections).join(', ')}`);
  }
  return sections[kind];
}

function hookCommand(ctx, subcommand, opts) {
  switch (subcommand) {
    case 'run':
      return hookRunCommand(ctx, opts);
    case 'install':
      return hookInstallCommand(ctx, opts);
    default:
      err(ctx, `Unknown hook command: ${subcommand || '(missing)'}`);
      err(ctx, 'Use: awareness hook run or awareness hook install.');
      return 1;
  }
}

// Events whose stdout the host agent injects into its context. For these we
// always emit the Current Focus so the agent actually loads the protocol state,
// even under --quiet (which only suppresses diagnostic noise, not the payload).
const CONTEXT_INJECTION_EVENTS = new Set(['session-start', 'post-compact']);

function hookRunCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const today = todayParts(ctx);
  const event = required(opts, 'event');
  const tool = opts.tool || 'unknown';

  ensurePrivateState(home, ctx);
  const warnings = collectWarnings(home, today);
  const file = appendRuntimeEvent(home, today, 'hooks', {
    source: 'hook',
    tool,
    event,
    warnings: warnings.length,
  });

  if (!opts.quiet) {
    out(ctx, `Hook recorded: ${tool} ${event}`);
    out(ctx, `Runtime log: ${file}`);
    out(ctx, warnings.length ? `Warnings: ${warnings.length}` : 'Warnings: none');
  }

  if (CONTEXT_INJECTION_EVENTS.has(event)) {
    emitFocusContext(ctx, home);
  }

  return 0;
}

// Print the Current Focus as injectable context for the host agent. Framed as
// an instruction so the agent treats it as actionable, not background noise.
function emitFocusContext(ctx, home) {
  const currentPath = awarenessPath(home);
  if (!fs.existsSync(currentPath)) return;
  const focus = extractSection(fs.readFileSync(currentPath, 'utf8'), 'Current Focus').trim();
  if (!focus) return;
  out(ctx, '[awareness] Load this before doing work — current focus:');
  out(ctx, '');
  out(ctx, focus);
  out(ctx, '');
  out(ctx, 'Follow the awareness protocol; run `awareness handoff` before yielding control.');
}

function hookInstallCommand(ctx, opts) {
  const tool = opts.tool || 'all';
  const userHome = userHomePath(ctx, opts);
  const configHome = configHomePath(ctx, opts, userHome);
  const command = opts.command || ctx.env.AWARENESS_COMMAND || 'awareness';
  const home = shouldPinAwarenessHome(ctx, opts) ? agentsHome(ctx, opts) : null;
  const installed = [];
  const existing = [];

  for (const target of expandTargets(tool, ['codex', 'claude', 'opencode'])) {
    if (target === 'codex') installed.push(installCodexHooks(userHome, command, home));
    if (target === 'claude') installed.push(installClaudeHooks(userHome, command, home));
    if (target === 'opencode') {
      const result = installOpenCodePlugin(configHome, command, home, Boolean(opts.overwrite));
      if (result.status === 'existing') existing.push(result.file);
      else installed.push(result.file);
    }
  }

  out(ctx, `Hook install target: ${tool}`);
  out(ctx, `Installed or updated: ${installed.length ? installed.join(', ') : 'none'}`);
  if (existing.length) out(ctx, `Existing custom files left untouched: ${existing.join(', ')}`);
  if (!path.isAbsolute(command)) {
    out(ctx, `Warning: command is not absolute (${command}). Use --command "$(command -v awareness)" for launchd or restricted PATH environments.`);
  }
  return 0;
}

function scheduleCommand(ctx, subcommand, opts) {
  switch (subcommand) {
    case 'run':
      return scheduleRunCommand(ctx, opts);
    case 'install':
      return scheduleInstallCommand(ctx, opts);
    default:
      err(ctx, `Unknown schedule command: ${subcommand || '(missing)'}`);
      err(ctx, 'Use: awareness schedule run or awareness schedule install.');
      return 1;
  }
}

function scheduleRunCommand(ctx, opts) {
  const home = agentsHome(ctx, opts);
  const today = todayParts(ctx);
  const cadence = required(opts, 'cadence');
  if (!['hourly', 'daily'].includes(cadence)) throw new Error(`Invalid cadence: ${cadence}. Valid cadences: hourly, daily`);

  ensurePrivateState(home, ctx);
  const warnings = collectWarnings(home, today);
  const eventFile = appendRuntimeEvent(home, today, 'schedule', {
    source: 'schedule',
    cadence,
    warnings: warnings.length,
  });

  let evaluation = null;
  if (cadence === 'daily') {
    evaluation = writeEvaluationIfMissing(home, today);
  }

  out(ctx, `Schedule run complete: ${cadence}`);
  out(ctx, `Runtime log: ${eventFile}`);
  if (evaluation) out(ctx, `Evaluation: ${evaluation.status} (${evaluation.file})`);
  if (evaluation?.candidates) out(ctx, `Memory candidates: ${evaluation.candidates.length ? `${evaluation.candidates.length} recorded` : 'none'}`);
  out(ctx, warnings.length ? `Warnings: ${warnings.length}` : 'Warnings: none');
  return 0;
}

function scheduleInstallCommand(ctx, opts) {
  const cadence = required(opts, 'cadence');
  const cadences = expandTargets(cadence, ['hourly', 'daily']);
  const userHome = userHomePath(ctx, opts);
  const command = opts.command || ctx.env.AWARENESS_COMMAND || 'awareness';
  const home = shouldPinAwarenessHome(ctx, opts) ? agentsHome(ctx, opts) : path.join(userHome, '.agents');
  const labelScope = scopeLabel(ctx, opts);
  const launchAgentDir = path.join(userHome, 'Library', 'LaunchAgents');
  const launchdLogDir = path.join(home, 'runtime', 'launchd');
  const written = [];
  const loaded = [];

  ensureDir(launchAgentDir);
  ensureDir(launchdLogDir);

  for (const target of cadences) {
    const label = labelScope ? `dev.fyso.awareness.${labelScope}.${target}` : `dev.fyso.awareness.${target}`;
    const file = path.join(launchAgentDir, `${label}.plist`);
    const args = [command, 'schedule', 'run', '--cadence', target];
    if (home) args.push('--home', home);
    const interval = target === 'hourly' ? 3600 : 86400;
    fs.writeFileSync(file, launchAgentPlist({
      label,
      args,
      interval,
      environmentPath: launchAgentPath(command),
      stdoutPath: path.join(launchdLogDir, `${target}.out.log`),
      stderrPath: path.join(launchdLogDir, `${target}.err.log`),
    }));
    written.push(file);

    if (opts.load) {
      const result = loadLaunchAgent(file, label);
      if (result.status !== 0) {
        throw new Error(`launchctl failed for ${file}: ${result.stderr || result.stdout || `exit ${result.status}`}`);
      }
      loaded.push(file);
    }
  }

  out(ctx, `Schedule install target: ${cadence}`);
  out(ctx, `LaunchAgents written: ${written.join(', ')}`);
  out(ctx, `Loaded: ${loaded.length ? loaded.join(', ') : 'not requested'}`);
  if (!path.isAbsolute(command)) {
    out(ctx, `Warning: command is not absolute (${command}). launchd may not resolve shell PATH; prefer --command "$(command -v awareness)".`);
  }
  return 0;
}

function appendRuntimeEvent(home, today, category, record) {
  const dir = path.join(home, 'runtime', category);
  ensureDir(dir);
  const file = path.join(dir, `${today.date}.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify({
    timestamp: formatTimestamp(today),
    ...record,
  })}\n`);
  return file;
}

function writeEvaluationIfMissing(home, today) {
  const evaluationPath = path.join(home, 'evaluations', `${today.date}.md`);
  if (fs.existsSync(evaluationPath)) {
    return { file: evaluationPath, status: 'already exists' };
  }

  ensureDir(path.dirname(evaluationPath));
  fs.writeFileSync(evaluationPath, buildEvaluation(home, today));
  const candidates = recordEvaluationMemoryCandidates(home, today);
  return { file: evaluationPath, status: 'written', candidates };
}

function installCodexHooks(userHome, command, home) {
  const file = path.join(userHome, '.codex', 'hooks.json');
  const data = readJsonObject(file);
  data.hooks ||= {};
  addCommandHook(data, 'SessionStart', hookShellCommand(command, 'codex', 'session-start', home), 'startup|resume|clear|compact', 'Refreshing awareness');
  addCommandHook(data, 'Stop', hookShellCommand(command, 'codex', 'stop', home), null, 'Recording awareness stop');
  addCommandHook(data, 'PreCompact', hookShellCommand(command, 'codex', 'pre-compact', home), 'manual|auto', 'Recording pre-compact state');
  addCommandHook(data, 'PostCompact', hookShellCommand(command, 'codex', 'post-compact', home), 'manual|auto', 'Recording post-compact state');
  writeJsonObject(file, data);
  return file;
}

function installClaudeHooks(userHome, command, home) {
  const file = path.join(userHome, '.claude', 'settings.json');
  const data = readJsonObject(file);
  data.hooks ||= {};
  addCommandHook(data, 'SessionStart', hookShellCommand(command, 'claude', 'session-start', home), 'startup|resume|clear|compact', 'Refreshing awareness');
  addCommandHook(data, 'Stop', hookShellCommand(command, 'claude', 'stop', home), null, 'Recording awareness stop');
  addCommandHook(data, 'SessionEnd', hookShellCommand(command, 'claude', 'session-end', home), 'clear|resume|logout|prompt_input_exit|bypass_permissions_disabled|other', 'Recording session end');
  addCommandHook(data, 'PreCompact', hookShellCommand(command, 'claude', 'pre-compact', home), 'manual|auto', 'Recording pre-compact state');
  addCommandHook(data, 'PostCompact', hookShellCommand(command, 'claude', 'post-compact', home), 'manual|auto', 'Recording post-compact state');
  writeJsonObject(file, data);
  return file;
}

function installOpenCodePlugin(configHome, command, home, overwrite) {
  const file = path.join(configHome, 'opencode', 'plugins', 'awareness-framework.js');
  const marker = 'Awareness Framework generated plugin';
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, 'utf8');
    if (!existing.includes(marker) && !overwrite) {
      return { file, status: 'existing' };
    }
  }

  ensureDir(path.dirname(file));
  fs.writeFileSync(file, openCodePluginContent({ command, home, marker }));
  return { file, status: 'written' };
}

function addCommandHook(data, event, command, matcher, statusMessage) {
  data.hooks[event] ||= [];
  const alreadyExists = data.hooks[event].some((group) => Array.isArray(group.hooks)
    && group.hooks.some((hook) => hook.type === 'command' && hook.command === command));
  if (alreadyExists) return;

  const group = {
    hooks: [
      {
        type: 'command',
        command,
        timeout: 30,
      },
    ],
  };
  if (matcher) group.matcher = matcher;
  if (statusMessage) group.hooks[0].statusMessage = statusMessage;
  data.hooks[event].push(group);
}

function hookShellCommand(command, tool, event, home) {
  const parts = [command, 'hook', 'run', '--tool', tool, '--event', event, '--quiet'];
  if (home) parts.push('--home', home);
  return parts.map(shellQuote).join(' ');
}

function openCodePluginContent({ command, home, marker }) {
  const homeArgs = home ? ['--home', home] : [];
  return `// ${marker}
// Local private state is under ~/.agents by default. Do not commit runtime output.

const awarenessCommand = ${JSON.stringify(command)};
const homeArgs = ${JSON.stringify(homeArgs)};

async function record(event) {
  try {
    const proc = Bun.spawn([
      awarenessCommand,
      "hook",
      "run",
      "--tool",
      "opencode",
      "--event",
      event,
      "--quiet",
      ...homeArgs,
    ], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  } catch {
    // Hook failures must not block OpenCode sessions.
  }
}

export const AwarenessFramework = async () => ({
  event: async ({ event }) => {
    const type = event?.type;
    if (type === "session.created" || type === "session.idle" || type === "session.compacted" || type === "session.error") {
      await record(type);
    }
  },
  "experimental.session.compacting": async (_input, output) => {
    await record("experimental.session.compacting");
    if (Array.isArray(output.context)) {
      output.context.push("Awareness Framework: after compaction, refresh private state with awareness refresh when task state may have changed.");
    }
  },
});
`;
}

function launchAgentPath(command) {
  const defaultPath = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  if (path.isAbsolute(command)) {
    const commandDir = path.dirname(command);
    return [commandDir, ...defaultPath.filter((dir) => dir !== commandDir)].join(':');
  }
  return defaultPath.join(':');
}

function launchAgentPlist({ label, args, interval, environmentPath, stdoutPath, stderrPath }) {
  const argItems = args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(environmentPath)}</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
${argItems}
  </array>
  <key>StartInterval</key>
  <integer>${interval}</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
}

function loadLaunchAgent(file, label) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const target = uid === null ? 'gui/0' : `gui/${uid}`;
  spawnSync('launchctl', ['bootout', target, file], { encoding: 'utf8' });
  const bootstrap = spawnSync('launchctl', ['bootstrap', target, file], { encoding: 'utf8' });
  if (bootstrap.status === 0) return bootstrap;
  const output = `${bootstrap.stderr || ''}${bootstrap.stdout || ''}`;
  if (/already loaded/i.test(output)) {
    return spawnSync('launchctl', ['kickstart', '-k', `${target}/${label}`], { encoding: 'utf8' });
  }
  return bootstrap;
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
    const entries = parseWorklogEntries(worklog);
    if (!entries.length) warnings.push('Daily worklog has no entries.');
    if (entries.some((entry) => entry.task === 'Unassigned')) warnings.push('Daily worklog has Unassigned entries to reconcile.');
    if (entries.some((entry) => !entry.hasEvidence)) warnings.push('Some worklog entries may be missing Evidence.');
  }

  return warnings;
}

function buildEvaluation(home, today) {
  const currentPath = awarenessPath(home);
  const worklogPath = path.join(home, 'worklog', `${today.date}.md`);
  const current = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf8') : '';
  const worklog = fs.existsSync(worklogPath) ? fs.readFileSync(worklogPath, 'utf8') : '';
  const warnings = collectWarnings(home, today);
  const entries = parseWorklogEntries(worklog);
  const assignedEntries = entries.filter((entry) => entry.task && entry.task !== 'Unassigned').length;
  const freshness = current.includes(today.date) ? 2 : current ? 1 : 0;
  const traceability = !entries.length ? 0 : assignedEntries / entries.length >= 0.8 ? 2 : 1;
  const handoff = /- Next:\s+(?!The next concrete action)\S+/.test(extractSection(current, 'Current Focus')) ? 2 : current ? 1 : 0;
  const noise = current.split('\n').length <= 180 && !/YYYY-MM-DD|branch-name/.test(current) ? 2 : 1;
  const reporting = sectionHasMeaningfulContent(extractSection(current, 'End-of-Day Candidates')) ? 2 : entries.length ? 1 : 0;

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

function recordEvaluationMemoryCandidates(home, today) {
  const candidates = buildEvaluationMemoryCandidates(home, today);
  return candidates.filter((candidate) => appendMemoryCandidate(home, today, candidate.text, candidate.evidence));
}

function buildEvaluationMemoryCandidates(home, today) {
  const currentPath = awarenessPath(home);
  const worklogPath = path.join(home, 'worklog', `${today.date}.md`);
  const current = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf8') : '';
  const worklog = fs.existsSync(worklogPath) ? fs.readFileSync(worklogPath, 'utf8') : '';
  const warnings = collectWarnings(home, today);
  const entries = parseWorklogEntries(worklog);
  const assignedEntries = entries.filter((entry) => entry.task && entry.task !== 'Unassigned').length;
  const candidates = warnings.map((warning) => ({
    text: `Review recurring awareness warning: ${warning}`,
    evidence: `daily evaluation ${today.date}`,
  }));

  if (entries.length && assignedEntries / entries.length < 0.8) {
    candidates.push({
      text: `Improve task traceability: ${assignedEntries}/${entries.length} worklog entries had explicit task IDs.`,
      evidence: `worklog/${today.date}.md`,
    });
  }

  if (current && !/- Next:\s+(?!The next concrete action)\S+/.test(extractSection(current, 'Current Focus'))) {
    candidates.push({
      text: 'Tighten handoff habit: Current Focus should keep a concrete Next action before yielding control.',
      evidence: awarenessPath(home),
    });
  }

  if (current && (current.split('\n').length > 180 || /YYYY-MM-DD|branch-name/.test(current))) {
    candidates.push({
      text: 'Review awareness noise: current board is too long or still contains template placeholders.',
      evidence: awarenessPath(home),
    });
  }

  if (!sectionHasMeaningfulContent(extractSection(current, 'End-of-Day Candidates')) && entries.length) {
    candidates.push({
      text: 'Improve reporting readiness: capture end-of-day candidates while work is fresh.',
      evidence: awarenessPath(home),
    });
  }

  return candidates;
}

function appendMemoryCandidate(home, today, text, evidence) {
  const file = longTermMemoryPath(home);
  let content = fs.readFileSync(file, 'utf8');
  if (memoryCandidateExists(content, text, evidence)) return false;

  content = replaceMetadata(content, 'Updated', formatTimestamp(today));
  content = appendToSection(content, 'Promotion Candidates', `- ${today.date}: ${text} (evidence: ${evidence})\n`);
  fs.writeFileSync(file, content);
  return true;
}

function memoryCandidateExists(content, text, evidence) {
  const candidates = extractSection(content, 'Promotion Candidates');
  return candidates.split('\n').some((line) => line.includes(`: ${text} (evidence: ${evidence})`));
}

function repeatedMemoryCandidateSuggestions(content, minCount) {
  const grouped = new Map();
  for (const candidate of parseMemoryCandidates(content)) {
    const key = normalizeMemoryCandidateText(candidate.text);
    const group = grouped.get(key) || { text: candidate.text, count: 0, evidence: [] };
    group.count += 1;
    group.evidence.push(candidate.evidence);
    grouped.set(key, group);
  }

  return [...grouped.values()]
    .filter((group) => group.count >= minCount)
    .map((group) => ({
      text: group.text,
      count: group.count,
      evidence: [...new Set(group.evidence)].join('; '),
    }))
    .sort((left, right) => right.count - left.count || left.text.localeCompare(right.text));
}

function parseMemoryCandidates(content) {
  return extractSection(content, 'Promotion Candidates')
    .split('\n')
    .map((line) => line.trim())
    .map((line) => line.match(/^- \d{4}-\d{2}-\d{2}: (.+) \(evidence: (.+)\)$/))
    .filter(Boolean)
    .map((match) => ({
      text: match[1],
      evidence: match[2],
    }));
}

function normalizeMemoryCandidateText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function shellQuoteText(text) {
  return text.replace(/["\\$`]/g, '\\$&');
}

function sectionHasMeaningfulContent(section) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line && line !== '- None.' && line !== '- None yet.');
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

function parseWorklogEntries(worklog) {
  const headingRegex = /^#{2,3} \d{2}:\d{2} - .+$/gm;
  const headings = [...worklog.matchAll(headingRegex)];
  return headings.map((heading, index) => {
    const start = heading.index;
    const end = index + 1 < headings.length ? headings[index + 1].index : worklog.length;
    const block = worklog.slice(start, end);
    const headingText = heading[0];
    const headingParts = headingText.replace(/^#{2,3} \d{2}:\d{2} - /, '').split(' - ');
    const headingTask = headingParts.length > 1 && isTaskId(headingParts[0]) ? headingParts[0] : null;
    const jiraTask = block.match(/^- Jira:\s+(.+)$/m)?.[1]?.trim();
    return {
      block,
      task: headingTask || jiraTask || null,
      hasEvidence: /- Evidence:\s+\S/.test(block) || /- Evidence:\s*\n\s+-\s+\S/.test(block),
    };
  });
}

function isTaskId(value) {
  return value === 'Unassigned' || /^[A-Z][A-Z0-9]+-\d+$/.test(value);
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
  ensureDir(path.join(home, 'memory', 'users'));
  ensureDir(path.join(home, 'evaluations'));
  ensureDir(path.join(home, 'runtime'));
  if (!fs.existsSync(path.join(home, 'AGENTS.md'))) fs.writeFileSync(path.join(home, 'AGENTS.md'), readTemplate('agent-instructions.md'));
  if (!fs.existsSync(awarenessPath(home))) fs.writeFileSync(awarenessPath(home), initialAwareness(today));
  if (!fs.existsSync(path.join(home, 'worklog', `${today.date}.md`))) fs.writeFileSync(path.join(home, 'worklog', `${today.date}.md`), dailyWorklog(today.date));
  if (!fs.existsSync(personalityPath(home))) fs.writeFileSync(personalityPath(home), readTemplate('personality.md'));
  if (!fs.existsSync(longTermMemoryPath(home))) fs.writeFileSync(longTermMemoryPath(home), readTemplate('memory-long-term.md'));
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

function writeWrappers({ canonicalPath, userHome, configHome, overwrite, created, existing, overwritten }) {
  const wrappers = [
    {
      file: path.join(userHome, '.codex', 'AGENTS.md'),
      tool: 'Codex',
    },
    {
      file: path.join(userHome, '.claude', 'CLAUDE.md'),
      tool: 'Claude Code',
    },
    {
      file: path.join(configHome, 'opencode', 'AGENTS.md'),
      tool: 'OpenCode',
    },
    {
      file: path.join(userHome, '.pi', 'agent', 'AGENTS.md'),
      tool: 'Pi',
    },
  ];

  for (const wrapper of wrappers) {
    writeWrapper(wrapper.file, wrapperContent(wrapper.tool, canonicalPath), overwrite, created, existing, overwritten);
  }
}

function writeWrapper(file, content, overwrite, created, existing, overwritten) {
  ensureDir(path.dirname(file));
  if (fs.existsSync(file)) {
    if (!overwrite) {
      existing.push(file);
      return;
    }
    fs.writeFileSync(file, content);
    overwritten.push(file);
    return;
  }

  fs.writeFileSync(file, content);
  created.push(file);
}

function wrapperContent(tool, canonicalPath) {
  return `# ${tool} Agent Instructions

Read and follow the canonical private protocol at:

@${canonicalPath}

If this CLI does not expand @ imports automatically, open that file explicitly before starting work.

At session start, prefer \`awareness status\` or \`awareness check\` when the Awareness CLI is available. Use \`awareness refresh\` when parallel work may have changed state, and \`awareness handoff\` before returning control.
`;
}

function wrapperSummary({ userHome, configHome }) {
  return [
    path.join(userHome, '.codex', 'AGENTS.md'),
    path.join(userHome, '.claude', 'CLAUDE.md'),
    path.join(configHome, 'opencode', 'AGENTS.md'),
    path.join(userHome, '.pi', 'agent', 'AGENTS.md'),
  ].join(', ');
}

function displayPath(base, file) {
  const relative = path.relative(base, file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
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

function initialUserMemory(user, timestamp) {
  return `# User Memory - ${user}

- Updated: ${timestamp}
- Scope: Local private user memory; do not commit
- User: ${user}

## Nicknames

- None yet.

## Questions

- None yet.

## Topics

- None yet.

## Preferences

- None yet.

## Facts

- None yet.

## Notes

- None yet.
`;
}

function normalizeState(state) {
  if (!VALID_STATES.has(state)) {
    throw new Error(`Invalid state: ${state}. Valid states: ${[...VALID_STATES].join(', ')}`);
  }
  return state;
}

function expandTargets(value, allowed) {
  if (value === 'all') return allowed;
  const targets = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (!targets.length) throw new Error(`Missing target. Valid targets: ${allowed.join(', ')}, all`);
  for (const target of targets) {
    if (!allowed.includes(target)) {
      throw new Error(`Invalid target: ${target}. Valid targets: ${allowed.join(', ')}, all`);
    }
  }
  return targets;
}

function required(opts, key) {
  if (!opts[key] || opts[key] === true) {
    throw new Error(`Missing required option: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  return opts[key];
}

function agentsHome(ctx, opts) {
  const raw = opts.home
    || opts.agentFolder
    || ctx.env.AGENTS_HOME
    || ctx.env.AWARENESS_AGENT_FOLDER
    || path.join(os.homedir(), '.agents');
  return scopedHome(path.resolve(expandHome(raw)), awarenessScope(ctx, opts));
}

function userHomePath(ctx, opts) {
  const raw = opts.userHome || ctx.env.AWARENESS_USER_HOME || os.homedir();
  return path.resolve(expandHome(raw));
}

function configHomePath(ctx, opts, userHome) {
  const raw = opts.configHome || ctx.env.XDG_CONFIG_HOME || path.join(userHome, '.config');
  return path.resolve(expandHome(raw));
}

function shouldPinAwarenessHome(ctx, opts) {
  return Boolean(
    opts.home
    || opts.agentFolder
    || ctx.env.AGENTS_HOME
    || ctx.env.AWARENESS_AGENT_FOLDER
    || awarenessScope(ctx, opts).channel,
  );
}

function awarenessScope(ctx, opts) {
  const channel = opts.channel || ctx.env.AWARENESS_CHANNEL || '';
  return {
    channel: channel ? safeScopeSlug(channel, 'channel') : '',
  };
}

function selectedUser(ctx, opts) {
  const user = opts.user || ctx.env.AWARENESS_USER || '';
  if (!user || user === true) {
    throw new Error('Missing required option: --user');
  }
  return user;
}

function scopedHome(base, scope) {
  let home = base;
  if (scope.channel) home = path.join(home, 'channels', scope.channel);
  return home;
}

function scopeLabel(ctx, opts) {
  const scope = awarenessScope(ctx, opts);
  return scope.channel;
}

function safeScopeSlug(value, kind) {
  const slug = String(value)
    .trim()
    .replace(/^#|^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  if (!slug) throw new Error(`Invalid ${kind} scope: ${value}`);
  return slug;
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

function longTermMemoryPath(home) {
  return path.join(home, 'memory', 'long-term.md');
}

function userMemoryPath(home, userSlug) {
  return path.join(home, 'memory', 'users', `${userSlug}.md`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonObject(file) {
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root value must be an object');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Could not parse JSON file ${file}: ${error.message}`);
  }
}

function writeJsonObject(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
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

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function out(ctx, message) {
  ctx.stdout.write(`${message}\n`);
}

function err(ctx, message) {
  ctx.stderr.write(`${message}\n`);
}
