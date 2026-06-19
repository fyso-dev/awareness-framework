const RECALL_ALIASES = {
  memoria: ['memory'],
  memorias: ['memory'],
  memory: ['memoria', 'memorias'],
  user: ['usuario', 'usuarios'],
  users: ['usuario', 'usuarios'],
  usuario: ['user', 'users'],
  usuarios: ['user', 'users'],
};

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
