'use strict';
// Reporte en Markdown para las tasks de comunidades (#229) y contenido (#231): qué se pregunta,
// dónde, quién, qué se publicó y qué ideas de contenido salen. Sin datos personales.

function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(r[key] || 'sin dato', (m.get(r[key] || 'sin dato') || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function table(header, entries) {
  return [`| ${header} | Hilos |`, '|---|---|', ...entries.map(([k, n]) => `| ${k} | ${n} |`)].join('\n');
}

function buildReport(rows, { days, today }) {
  const published = rows.filter((r) => r.status === 'publicado');
  const lines = [
    `# Escucha de comunidades: últimos ${days} días`,
    '',
    `- **Corte:** ${today}`,
    `- **Hilos útiles encontrados:** ${rows.length} (en cola, aprobados, publicados o descartados por una persona)`,
    `- **Publicados:** ${published.length}`,
    '',
    '## Por fuente y comunidad',
    '',
    table('Comunidad', countBy(rows.map((r) => ({ ...r, c: `${r.source} · ${r.community}` })), 'c')),
    '',
    '## Por tema',
    '',
    table('Tema', countBy(rows, 'theme')),
    '',
    '## Por persona',
    '',
    table('Persona', countBy(rows, 'persona')),
    '',
    '## Preguntas más relevantes',
    '',
  ];
  const top = [...rows].sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0)).slice(0, 15);
  for (const r of top) {
    lines.push(`- (${r.relevance_score}) ${r.question_summary || r.title} — ${r.source} · ${r.community} · [hilo](${r.url})`);
  }
  const ideas = [...new Set(rows.map((r) => (r.content_idea || '').trim()).filter(Boolean))];
  lines.push('', '## Ideas de contenido', '');
  if (ideas.length) ideas.slice(0, 20).forEach((i) => lines.push(`- ${i}`));
  else lines.push('- Sin ideas en el periodo.');
  lines.push('', '## Publicado', '');
  if (published.length) {
    for (const r of published) lines.push(`- ${String(r.posted_at).slice(0, 10)} · ${r.source} · ${r.community} · [respuesta](${r.posted_url})`);
  } else {
    lines.push('- Nada publicado en el periodo.');
  }
  lines.push('', 'Clics e inscritos por UTM (`utm_medium=community`) se leen en el tablero del Developer Network.');
  return lines.join('\n');
}

module.exports = { buildReport };
