'use strict';
// GitHub Discussions por GraphQL (search type DISCUSSION). Requiere GITHUB_TOKEN de solo lectura.
const { fetchJson, sleep } = require('../http');

const API = 'https://api.github.com/graphql';

const QUERY = `
query($q: String!) {
  search(type: DISCUSSION, query: $q, first: 30) {
    nodes {
      ... on Discussion {
        id
        url
        title
        bodyText
        createdAt
        locked
        isAnswered
        repository { nameWithOwner }
        category { name }
      }
    }
  }
}`;

function normalize(node) {
  return {
    source: 'github',
    external_id: node.id,
    url: node.url,
    community: node.repository?.nameWithOwner || 'github',
    title: node.title || '',
    body: node.bodyText || '',
    created_at: node.createdAt ? new Date(node.createdAt) : null,
    meta: { locked: Boolean(node.locked), answered: Boolean(node.isAnswered), category: node.category?.name || null },
  };
}

function buildSearchStrings(cfg, since) {
  const date = (since || new Date(Date.now() - 36 * 3600e3)).toISOString().slice(0, 10);
  const repoFilter = (cfg.repos || []).map((r) => `repo:${r}`).join(' ');
  return (cfg.queries || []).map((q) => `${q} created:>=${date}${repoFilter ? ' ' + repoFilter : ''}`);
}

async function fetchGitHub(cfg, { since, env = process.env, log = () => {} } = {}) {
  if (!env.GITHUB_TOKEN) {
    log('github: sin GITHUB_TOKEN; se omite');
    return [];
  }
  const out = new Map();
  for (const q of buildSearchStrings(cfg, since)) {
    try {
      const data = await fetchJson(API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'think4ever-listening',
        },
        body: JSON.stringify({ query: QUERY, variables: { q } }),
      });
      if (data.errors) throw new Error(data.errors.map((e) => e.message).join('; '));
      for (const node of data.data?.search?.nodes || []) {
        if (!node || !node.id) continue;
        const item = normalize(node);
        if (item.meta.locked || item.meta.answered) continue; // respondida o cerrada: no aporta
        out.set(item.external_id, item);
      }
    } catch (e) {
      log(`github "${q}": ${e.message}`);
    }
    await sleep(500);
  }
  return [...out.values()];
}

module.exports = { fetchGitHub, normalize, buildSearchStrings };
