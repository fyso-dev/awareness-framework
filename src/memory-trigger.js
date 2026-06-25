import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { searchDocuments } from './search.js';
import { parseCuratedEntries } from './memory-metrics.js';

const DEFAULT_CONTEXT_BUDGET_TOKENS = 128000;
const DEFAULT_MAX_INJECTED_MEMORIES = 5;
const DEFAULT_MAX_INJECTED_TOKENS = 500;
const DEFAULT_MIN_CONFIDENCE = 0.7;
const DEFAULT_PROVIDER_TIMEOUT_MS = 3000;
const MAX_CONTEXT_CHARS = 12000;
const MAX_WORKLOG_CHARS = 8000;

export function buildMemoryTriggerContext({ home, phase, text = '', action = '', focus = '', currentContext = '' }) {
  return {
    phase,
    text,
    action,
    currentContext,
    focus: truncate(focus, 4000),
    memory: truncate(readIfExists(path.join(home, 'memory', 'long-term.md')), MAX_CONTEXT_CHARS),
    recentWorklog: truncate(recentWorklogText(home, 3), MAX_WORKLOG_CHARS),
  };
}

export function runMemoryTrigger({ home, ctx, phase, text = '', action = '', focus = '', currentContext = '' }) {
  const context = buildMemoryTriggerContext({ home, phase, text, action, focus, currentContext });
  const startedAt = Date.now();
  const decision = decideMemoryTrigger(ctx.env, context);
  const providerRan = decision.provider !== 'none';
  const decisionTokensIn = providerRan ? estimateTokens(JSON.stringify(context)) : 0;
  const decisionTokensOut = providerRan ? estimateTokens(JSON.stringify(decision.raw || decision)) : 0;
  const candidates = decision.shouldRecall
    ? retrieveMemoryCandidates(home, decision.intent || text || action || focus, triggerLimit(ctx.env) * 3)
    : [];
  const selected = selectMemories(ctx.env, decision, candidates);
  const injectedText = renderInjectedMemory(selected);
  const injectedTokens = estimateTokens(injectedText);
  const budgetTokens = contextBudgetTokens(ctx.env);
  const retrievalTokens = providerRan ? estimateTokens(JSON.stringify(candidates)) : 0;
  const totalInternalTokens = decisionTokensIn + decisionTokensOut + retrievalTokens;

  return {
    phase,
    provider: decision.provider,
    model: decision.model || null,
    shouldRecall: Boolean(decision.shouldRecall),
    skipped: !decision.shouldRecall || !selected.length,
    skipReason: triggerSkipReason(decision, selected),
    confidence: Number(decision.confidence) || 0,
    reason: decision.reason || '',
    intent: decision.intent || '',
    risk: decision.risk || 'unknown',
    candidates: candidates.length,
    injectedMemories: selected,
    injectedText,
    tokens: {
      decisionTokensIn,
      decisionTokensOut,
      retrievalTokens,
      injectedTokens,
      totalInternalTokens,
      totalOverheadTokens: totalInternalTokens + injectedTokens,
      contextBudgetTokens: budgetTokens,
      contextOverheadPct: budgetTokens ? injectedTokens / budgetTokens : 0,
    },
    durationMs: Date.now() - startedAt,
  };
}

export function renderInjectedMemory(memories) {
  if (!memories.length) return '';
  return [
    '[awareness memory]',
    ...memories.map((memory) => `- ${formatMemoryLine(memory)}`),
  ].join('\n');
}

export function estimateTokens(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  return Math.ceil(value.length / 4);
}

function decideMemoryTrigger(env, context) {
  const fixture = env.AWARENESS_MEMORY_TRIGGER_DECISION_JSON;
  if (fixture) return normalizeDecision(parseJson(fixture, 'AWARENESS_MEMORY_TRIGGER_DECISION_JSON'), 'fixture');

  const command = env.AWARENESS_MEMORY_TRIGGER_COMMAND;
  if (!command) {
    return normalizeDecision({
      shouldRecall: false,
      confidence: 0,
      reason: 'AI trigger provider not configured',
      intent: '',
      risk: 'unknown',
    }, 'none');
  }

  const args = env.AWARENESS_MEMORY_TRIGGER_ARGS_JSON
    ? parseJson(env.AWARENESS_MEMORY_TRIGGER_ARGS_JSON, 'AWARENESS_MEMORY_TRIGGER_ARGS_JSON')
    : [];
  if (!Array.isArray(args)) throw new Error('AWARENESS_MEMORY_TRIGGER_ARGS_JSON must be a JSON array');

  const result = spawnSync(command, args, {
    input: `${JSON.stringify(context)}\n`,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: providerTimeoutMs(env),
  });
  if (result.error) {
    return normalizeDecision({
      shouldRecall: false,
      confidence: 0,
      reason: `AI trigger provider failed: ${providerFailure(result)}`,
      intent: '',
      risk: 'unknown',
    }, 'command');
  }
  if (result.status !== 0) {
    return normalizeDecision({
      shouldRecall: false,
      confidence: 0,
      reason: `AI trigger provider failed: ${providerFailure(result)}`,
      intent: '',
      risk: 'unknown',
    }, 'command');
  }
  return normalizeDecision(parseJson(result.stdout, 'memory trigger provider output'), 'command');
}

function triggerSkipReason(decision, selected) {
  if (!decision.shouldRecall) return decision.reason || 'low-confidence';
  return selected.length ? null : 'no-relevant-memories';
}

function formatMemoryLine(memory) {
  return memory.why ? `${memory.text} (${memory.why})` : memory.text;
}

function normalizeDecision(raw, provider) {
  const confidence = Number(raw.confidence) || 0;
  return {
    raw,
    provider,
    model: raw.model || null,
    shouldRecall: Boolean(raw.shouldRecall) && confidence >= DEFAULT_MIN_CONFIDENCE,
    confidence,
    reason: String(raw.reason || ''),
    intent: String(raw.intent || ''),
    risk: String(raw.risk || 'unknown'),
  };
}

function retrieveMemoryCandidates(home, query, limit) {
  const documents = collectMemoryDocuments(home);
  return searchDocuments(documents, query || 'memory', limit)
    .sort((left, right) => memoryPriority(left.file, home) - memoryPriority(right.file, home) || right.score - left.score)
    .map((result) => ({
      key: result.id,
      file: result.file,
      line: result.line,
      text: cleanMemoryLine(result.text),
      score: result.score,
    }));
}

function collectMemoryDocuments(home) {
  const longTerm = path.join(home, 'memory', 'long-term.md');
  const files = recentWorklogFiles(home, 7);
  const documents = [];
  if (fs.existsSync(longTerm)) {
    for (const entry of parseCuratedEntries(readIfExists(longTerm))) {
      documents.push({
        id: entry.key,
        file: longTerm,
        line: entry.lineStart,
        text: entry.text,
      });
    }
  }
  for (const file of files.filter((candidate) => fs.existsSync(candidate))) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const text = line.trim();
      if (!text || text.startsWith('#')) return;
      documents.push({
        id: `${file}:${index + 1}`,
        file,
        line: index + 1,
        text,
      });
    });
  }
  return documents;
}

function selectMemories(env, decision, candidates) {
  const maxMemories = triggerLimit(env);
  const maxTokens = maxInjectedTokens(env);
  const selected = [];
  let tokens = 0;
  for (const candidate of candidates) {
    const item = {
      key: candidate.key,
      file: candidate.file,
      line: candidate.line,
      text: candidate.text,
      why: decision.reason,
      score: candidate.score,
    };
    const itemTokens = estimateTokens(item.text) + estimateTokens(item.why);
    if (tokens + itemTokens > maxTokens) continue;
    selected.push(item);
    tokens += itemTokens;
    if (selected.length >= maxMemories) break;
  }
  return selected;
}

function triggerLimit(env) {
  return positiveInt(env.AWARENESS_MEMORY_TRIGGER_MAX_MEMORIES, DEFAULT_MAX_INJECTED_MEMORIES);
}

function maxInjectedTokens(env) {
  return positiveInt(env.AWARENESS_MEMORY_TRIGGER_MAX_TOKENS, DEFAULT_MAX_INJECTED_TOKENS);
}

function contextBudgetTokens(env) {
  return positiveInt(env.AWARENESS_CONTEXT_BUDGET_TOKENS, DEFAULT_CONTEXT_BUDGET_TOKENS);
}

function providerTimeoutMs(env) {
  return positiveInt(env.AWARENESS_MEMORY_TRIGGER_TIMEOUT_MS, DEFAULT_PROVIDER_TIMEOUT_MS);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function recentWorklogText(home, limit) {
  return recentWorklogFiles(home, limit)
    .map((file) => readIfExists(file))
    .filter(Boolean)
    .join('\n\n');
}

function recentWorklogFiles(home, limit) {
  const dir = path.join(home, 'worklog');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .slice(-limit)
    .map((name) => path.join(dir, name));
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function memoryPriority(file, home) {
  return path.resolve(file) === path.resolve(path.join(home, 'memory', 'long-term.md')) ? 0 : 1;
}

function cleanMemoryLine(text) {
  return String(text || '').replace(/^-+\s*/, '').trim();
}

function providerFailure(result) {
  if (result.error?.code === 'ETIMEDOUT') return 'timeout';
  return (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim();
}

function truncate(value, limit) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}\n[truncated]` : text;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message}`);
  }
}
