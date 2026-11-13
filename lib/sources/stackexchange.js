'use strict';
// Stack Exchange (Stack Overflow, es.stackoverflow y otros sitios) por la API pública 2.3. Solo lectura.
// Sin clave: 300 consultas al día por IP. Con STACKEXCHANGE_KEY (registro inmediato en
// stackapps.com, sin revisión): 10.000 al día. La clave no es secreta, pero va en variable de entorno.
const { fetchJson, sleep } = require('../http');
const { stripHtml } = require('./hn');

const API = 'https://api.stackexchange.com/2.3';

function decode(s) {
  return stripHtml(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ');
}

function normalize(q, site) {
  return {
    source: 'stackexchange',
    external_id: `${site}:${q.question_id}`,
    url: q.link,
    community: site,
    title: decode(q.title || ''),
    body: decode(q.body || ''),
    created_at: q.creation_date ? new Date(q.creation_date * 1000) : null,
    meta: {
      closed: Boolean(q.closed_date),
      locked: Boolean(q.locked_date),
      answered: Boolean(q.is_answered),
      answer_count: q.answer_count || 0,
      tags: q.tags || [],
    },
  };
}

// Una consulta por etiqueta (tagged con varias etiquetas es un Y lógico) y una por frase.
function buildRequests(cfg, sinceSec, key) {
  const base = `pagesize=50&order=desc&sort=creation&fromdate=${sinceSec}&filter=withbody${key ? `&key=${encodeURIComponent(key)}` : ''}`;
  const reqs = [];
  for (const [site, s] of Object.entries(cfg.sites || {})) {
    const siteParam = `site=${encodeURIComponent(site)}`;
    for (const tag of s.tags || []) {
      reqs.push({ site, label: `[${tag}]`, url: `${API}/questions?${siteParam}&tagged=${encodeURIComponent(tag)}&${base}` });
    }
    for (const q of s.search_phrases || []) {
      reqs.push({ site, label: `"${q}"`, url: `${API}/search/advanced?${siteParam}&q=${encodeURIComponent(q)}&${base}` });
    }
  }
  return reqs;
}

async function fetchStackExchange(cfg = {}, { since, env = process.env, log = () => {} } = {}) {
  const sinceSec = Math.floor((since ? since.getTime() : Date.now() - 36 * 3600e3) / 1000);
  const key = String(env.STACKEXCHANGE_KEY || '').trim();
  const out = new Map();
  for (const r of buildRequests(cfg, sinceSec, key)) {
    try {
      const data = await fetchJson(r.url);
      for (const q of data.items || []) {
        const item = normalize(q, r.site);
        if (item.meta.closed || item.meta.locked) continue;
        out.set(item.external_id, item);
      }
      if (typeof data.quota_remaining === 'number' && data.quota_remaining < 10) {
        log(`stackexchange: quedan ${data.quota_remaining} consultas de la cuota diaria; se detiene`);
        break;
      }
      // La API pide esperar `backoff` segundos antes de repetir el mismo método.
      await sleep(data.backoff ? data.backoff * 1000 : 300);
    } catch (e) {
      log(`stackexchange ${r.site} ${r.label}: ${e.message}`);
      await sleep(300);
    }
  }
  return [...out.values()];
}

module.exports = { fetchStackExchange, normalize, buildRequests };
