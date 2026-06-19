import { normalizeSearchText } from './text.js';

export function activeMemoryCandidates(content) {
  const prunedTexts = prunedMemoryCandidateTexts(content);
  return parseMemoryCandidates(content).filter((candidate) => !prunedTexts.has(normalizeMemoryCandidateText(candidate.text)));
}

export function isPrunedMemoryText(content, text) {
  return prunedMemoryCandidateTexts(content).has(normalizeMemoryCandidateText(text));
}

export function memoryCandidateExists(content, text, evidence) {
  const candidates = extractMarkdownSection(content, 'Promotion Candidates');
  return candidates.split('\n').some((line) => line.includes(`: ${text} (evidence: ${evidence})`));
}

export function memoryCandidateTextExists(content, text) {
  const key = normalizeMemoryCandidateText(text);
  return parseMemoryCandidates(content).some((candidate) => normalizeMemoryCandidateText(candidate.text) === key);
}

export function repeatedMemoryCandidateSuggestions(content, minCount) {
  const grouped = new Map();
  for (const candidate of activeMemoryCandidates(content)) {
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
  const candidates = [];
  const candidatePattern = /^- \d{4}-\d{2}-\d{2}: (.+) \(evidence: (.+)\)$/;
  for (const rawLine of extractMarkdownSection(content, 'Promotion Candidates').split('\n')) {
    const match = candidatePattern.exec(rawLine.trim());
    if (!match) continue;
    candidates.push({
      line: match[0],
      text: match[1],
      evidence: match[2],
    });
  }
  return candidates;
}

function prunedMemoryCandidateTexts(content) {
  const pruned = new Set();
  const prunedPattern = /^- \d{4}-\d{2}-\d{2}: (.+) \(reason: .+; evidence: .+\)$/;
  for (const rawLine of extractMarkdownSection(content, 'Pruned Or Revised').split('\n')) {
    const match = prunedPattern.exec(rawLine.trim());
    if (match) pruned.add(normalizeMemoryCandidateText(match[1]));
  }
  return pruned;
}

function normalizeMemoryCandidateText(text) {
  return normalizeSearchText(text);
}

function extractMarkdownSection(content, section) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === `## ${section}`);
  if (start === -1) return '';

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    body.push(line);
  }
  return body.join('\n').replace(/^\n/, '');
}
