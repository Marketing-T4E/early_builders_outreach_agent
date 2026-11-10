'use strict';
// Reddit, solo lectura, con OAuth de aplicación (client credentials).
// Lee lo nuevo de cada subreddit y algunas búsquedas globales. No publica nada.
const { fetchJson, sleep } = require('../http');

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API = 'https://oauth.reddit.com';

function isConfigured(env = process.env) {
  return Boolean(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET && env.REDDIT_USER_AGENT);
}

async function getToken(env) {
  const basic = Buffer.from(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`).toString('base64');
  const data = await fetchJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'User-Agent': env.REDDIT_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!data.access_token) throw new Error('Reddit no devolvió access_token');
  return data.access_token;
}

function normalize(post) {
  const d = post.data || post;
  return {
    source: 'reddit',
    external_id: d.name || `t3_${d.id}`,
    url: `https://www.reddit.com${d.permalink}`,
    community: d.subreddit,
    title: d.title || '',
    body: d.selftext || '',
    created_at: d.created_utc ? new Date(d.created_utc * 1000) : null,
    meta: { locked: Boolean(d.locked), archived: Boolean(d.archived), over_18: Boolean(d.over_18), num_comments: d.num_comments || 0 },
  };
}

async function fetchReddit(cfg, { since, env = process.env, log = () => {} } = {}) {
  if (!isConfigured(env)) {
    log('reddit: sin credenciales (REDDIT_CLIENT_ID/SECRET/USER_AGENT); se omite');
    return [];
  }
  const token = await getToken(env);
  const headers = { Authorization: `Bearer ${token}`, 'User-Agent': env.REDDIT_USER_AGENT };
  const out = new Map();
  const add = (children) => {
    for (const c of children || []) {
      const item = normalize(c);
      if (item.meta.locked || item.meta.archived || item.meta.over_18) continue;
      if (since && item.created_at && item.created_at < since) continue;
      out.set(item.external_id, item);
    }
  };

  for (const sub of cfg.subreddits || []) {
    try {
      const data = await fetchJson(`${API}/r/${encodeURIComponent(sub)}/new?limit=100&raw_json=1`, { headers });
      add(data?.data?.children);
    } catch (e) {
      log(`reddit r/${sub}: ${e.message}`);
    }
    await sleep(700); // por debajo del límite de 100 consultas por minuto
  }
  for (const q of cfg.search_phrases || []) {
    try {
      const url = `${API}/search?q=${encodeURIComponent(q)}&sort=new&t=week&limit=50&type=link&raw_json=1`;
      const data = await fetchJson(url, { headers });
      add(data?.data?.children);
    } catch (e) {
      log(`reddit búsqueda "${q}": ${e.message}`);
    }
    await sleep(700);
  }
  return [...out.values()];
}

module.exports = { fetchReddit, normalize, isConfigured };
