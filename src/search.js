import MiniSearch from 'minisearch';
import { expandSearchQuery, normalizeSearchText } from './text.js';

const SEARCH_OPTIONS = {
  combineWith: 'OR',
  prefix: (term) => term.length >= 4,
  fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
  boost: { text: 2 },
};

export function searchDocuments(documents, query, limit = 10) {
  const rows = documents
    .map((document, index) => ({
      id: String(document.id ?? index),
      ...document,
      text: String(document.text || ''),
    }))
    .filter((document) => document.text.trim());

  if (!rows.length) return [];

  const index = new MiniSearch({
    fields: ['text'],
    storeFields: Object.keys(rows[0]).filter((key) => key !== 'id'),
    tokenize: (value) => normalizeSearchText(value).split(/\s+/).filter(Boolean),
    processTerm: normalizeSearchText,
    searchOptions: SEARCH_OPTIONS,
  });
  index.addAll(rows);

  const ranked = new Map();
  for (const expandedQuery of expandSearchQuery(query)) {
    for (const result of index.search(expandedQuery)) {
      const previous = ranked.get(result.id);
      const score = result.score + exactPhraseBoost(result.text, query);
      if (!previous || score > previous.score) {
        ranked.set(result.id, {
          ...result,
          score,
        });
      }
    }
  }

  return [...ranked.values()]
    .sort((left, right) => (
      right.score - left.score
      || String(left.file || '').localeCompare(String(right.file || ''))
      || Number(left.line || 0) - Number(right.line || 0)
    ))
    .slice(0, limit);
}

function exactPhraseBoost(text, query) {
  const haystack = normalizeSearchText(text);
  const needle = normalizeSearchText(query);
  if (!needle || !haystack.includes(needle)) return 0;
  return needle.split(/\s+/).filter(Boolean).length;
}
