'use strict';
// Filtro previo, sin costo: decide qué hilos merecen pasar a Claude.
// Puntaje = suma de pesos de los temas tocados (cada tema cuenta una vez) + 2 si hay señal de pregunta.

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Coincidencia por palabra completa para términos con letras (evita que "mcp" coincida dentro de otra palabra);
// los símbolos sueltos como "?" se buscan tal cual.
function makeMatcher(term) {
  const t = term.toLowerCase();
  if (!/[\p{L}\d]/u.test(t)) return (text) => text.includes(t);
  const re = new RegExp(`(?<![\\p{L}\\d])${escapeRe(t)}(?![\\p{L}\\d])`, 'u');
  return (text) => re.test(text);
}

function compile(cfg) {
  const topics = Object.entries(cfg.topics || {}).map(([name, t]) => ({
    name,
    weight: t.weight || 1,
    terms: t.terms.map((term) => ({ term, match: makeMatcher(term) })),
  }));
  return {
    minScore: cfg.min_score ?? 4,
    topics,
    questions: (cfg.question_signals || []).map(makeMatcher),
    excludes: (cfg.exclude_terms || []).map((term) => ({ term, match: makeMatcher(term) })),
  };
}

function scoreItem(item, compiled) {
  const text = `${item.title}\n${item.body || ''}`.toLowerCase();
  if (compiled.excludes.some((e) => e.match(text))) {
    return { score: 0, pass: false, topics: [], terms: [], excluded: true };
  }
  let score = 0;
  const topics = [];
  const terms = [];
  for (const topic of compiled.topics) {
    const hits = topic.terms.filter((t) => t.match(text)).map((t) => t.term);
    if (hits.length) {
      score += topic.weight;
      topics.push(topic.name);
      terms.push(...hits);
    }
  }
  const isQuestion = compiled.questions.some((m) => m(text));
  if (isQuestion && topics.length) score += 2;
  return { score, pass: score >= compiled.minScore, topics, terms, isQuestion, excluded: false };
}

function prefilter(items, cfg) {
  const compiled = compile(cfg);
  const passed = [];
  for (const item of items) {
    const r = scoreItem(item, compiled);
    if (r.pass) passed.push({ ...item, prefilter: r });
  }
  return passed.sort((a, b) => b.prefilter.score - a.prefilter.score);
}

module.exports = { prefilter, scoreItem, compile, makeMatcher };
