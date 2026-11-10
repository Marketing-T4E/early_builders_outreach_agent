'use strict';
// Hacker News por la API pública de Algolia. Historias y comentarios recientes.
const { fetchJson, sleep } = require('../http');

const API = 'https://hn.algolia.com/api/v1/search_by_date';

function stripHtml(s) {
  return String(s || '')
    .replace(/<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .trim();
}

function normalize(hit) {
  const isComment = Array.isArray(hit._tags) && hit._tags.includes('comment');
  return {
    source: 'hn',
    external_id: String(hit.objectID),
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    community: 'hn',
    title: isComment ? `Comentario en: ${hit.story_title || '(sin título)'}` : (hit.title || ''),
    body: stripHtml(isComment ? hit.comment_text : (hit.story_text || '')),
    created_at: hit.created_at_i ? new Date(hit.created_at_i * 1000) : null,
    meta: { kind: isComment ? 'comment' : 'story', points: hit.points || 0 },
  };
}

async function fetchHN(cfg, { since, log = () => {} } = {}) {
  const sinceSec = Math.floor((since ? since.getTime() : Date.now() - 36 * 3600e3) / 1000);
  const out = new Map();
  for (const q of cfg.queries || []) {
    try {
      const url = `${API}?query=${encodeURIComponent(q)}&tags=(story,comment)`
        + `&numericFilters=created_at_i>${sinceSec}&hitsPerPage=50`;
      const data = await fetchJson(url);
      for (const hit of data.hits || []) {
        const item = normalize(hit);
        out.set(item.external_id, item);
      }
    } catch (e) {
      log(`hn "${q}": ${e.message}`);
    }
    await sleep(300);
  }
  return [...out.values()];
}

module.exports = { fetchHN, normalize, stripHtml };
