const RECALL_ALIASES = {
  memoria: ['memory'],
  memorias: ['memory'],
  memory: ['memoria', 'memorias'],
  user: ['usuario', 'usuarios'],
  users: ['usuario', 'usuarios'],
  usuario: ['user', 'users'],
  usuarios: ['user', 'users'],
};

// Strip a leading/trailing run of `char` without an anchored regex quantifier
// (avoids regex backtracking warnings). Pure and linear.
export function trimEdgeChar(value, char) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === char) start += 1;
  while (end > start && value[end - 1] === char) end -= 1;
  return value.slice(start, end);
}

export function normalizeSearchText(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function recallTermGroups(query) {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => new Set([term, ...recallTokenVariants(term), ...(RECALL_ALIASES[term] || [])]))
    .map((terms) => [...terms].filter(Boolean))
    .filter((terms, index, groups) => groups.findIndex((group) => group[0] === terms[0]) === index);
}

function recallTokenVariants(term) {
  const variants = [];
  if (term.endsWith('es') && term.length > 4) variants.push(term.slice(0, -2));
  if (term.endsWith('s') && term.length > 3) variants.push(term.slice(0, -1));
  return variants;
}
