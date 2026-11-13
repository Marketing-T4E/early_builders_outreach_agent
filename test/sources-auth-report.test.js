'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const stackexchange = require('../lib/sources/stackexchange');
const hn = require('../lib/sources/hn');
const github = require('../lib/sources/github');
const { requireAuth, authMode, QA_USER } = require('../lib/auth');
const { statements } = require('../db/migrate');
const { buildReport } = require('../lib/report');
const { clampResult } = require('../lib/drafter');
const { OUTPUT_SCHEMA } = require('../lib/brief');

test('normaliza una pregunta de Stack Exchange sin autor', () => {
  const n = stackexchange.normalize({ question_id: 42, link: 'https://es.stackoverflow.com/questions/42/x',
    title: '¿C&#243;mo evito que &quot;Claude&quot; pierda el contexto?', body: '<p>Uso Claude Code &amp; MCP</p>',
    creation_date: 1762700000, tags: ['claude-code'], owner: { display_name: 'someone' } }, 'es.stackoverflow');
  assert.equal(n.source, 'stackexchange');
  assert.equal(n.external_id, 'es.stackoverflow:42');
  assert.equal(n.community, 'es.stackoverflow');
  assert.equal(n.title, '¿Cómo evito que "Claude" pierda el contexto?');
  assert.equal(n.body, 'Uso Claude Code & MCP');
  assert.equal(n.meta.closed, false);
  assert.equal('author' in n || 'owner' in n, false);
});

test('Stack Exchange: una consulta por etiqueta y por frase, con la clave solo si existe', () => {
  const cfg = { sites: { stackoverflow: { tags: ['claude-code', 'cursor-ide'], search_phrases: ['ai code'] }, 'es.stackoverflow': { search_phrases: ['código IA'] } } };
  const reqs = stackexchange.buildRequests(cfg, 1762700000, '');
  assert.equal(reqs.length, 4);
  assert.match(reqs[0].url, /\/questions\?site=stackoverflow&tagged=claude-code&.*fromdate=1762700000/);
  assert.match(reqs[3].url, /\/search\/advanced\?site=es.stackoverflow&q=c%C3%B3digo%20IA/);
  assert.ok(reqs.every((r) => !r.url.includes('key=')));
  assert.ok(stackexchange.buildRequests(cfg, 1, 'abc').every((r) => r.url.includes('&key=abc')));
});

test('normaliza un comentario de HN', () => {
  const n = hn.normalize({ objectID: '42', _tags: ['comment'], story_title: 'Ask HN', comment_text: '<p>Hi &amp; bye</p>', created_at_i: 1762700000 });
  assert.equal(n.url, 'https://news.ycombinator.com/item?id=42');
  assert.equal(n.body, 'Hi & bye');
  assert.ok(n.title.startsWith('Comentario en'));
});

test('búsqueda de GitHub con fecha y repos', () => {
  const s = github.buildSearchStrings({ queries: ['mcp context'], repos: ['a/b'] }, new Date('2026-11-08T00:00:00Z'));
  assert.deepEqual(s, ['mcp context created:>=2026-11-08 repo:a/b']);
});

test('acceso: sin login (QA) cada petición queda a nombre del usuario de QA', () => {
  assert.equal(authMode(), 'open');
  const req = { path: '/api/queue' };
  let passed = false;
  requireAuth(req, {}, () => { passed = true; });
  assert.equal(passed, true);
  assert.deepEqual(req.user, { email: 'qa@think4ever.com', name: 'QA (sin login)' });
  req.user.email = 'otro';
  assert.equal(QA_USER.email, 'qa@think4ever.com');
});

test('esquema: incluye users y sessions como el tablero', () => {
  const s = statements().join('\n');
  assert.match(s, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(s, /CREATE TABLE IF NOT EXISTS sessions/);
  assert.equal(statements().length, 5);
});

test('salida de Claude se acota', () => {
  const r = clampResult({ relevant: false, relevance_score: 140, theme: 'x', persona: 'p99', risks: null, reply: 'algo' });
  assert.equal(r.relevance_score, 100);
  assert.equal(r.theme, 'otro');
  assert.equal(r.persona, 'p01-desarrolladores');
  assert.equal(r.reply, '');
});

test('esquema estricto: todas las propiedades requeridas', () => {
  assert.equal(OUTPUT_SCHEMA.additionalProperties, false);
  assert.deepEqual([...OUTPUT_SCHEMA.required].sort(), Object.keys(OUTPUT_SCHEMA.properties).sort());
});

test('reporte en Markdown', () => {
  const md = buildReport([
    { source: 'stackexchange', community: 'stackoverflow', url: 'https://r', title: 'T', status: 'publicado', relevance_score: 90,
      theme: 'hardening', persona: 'p01-desarrolladores', question_summary: 'Cómo endurecer', content_idea: 'Tutorial X',
      posted_url: 'https://stackoverflow.com/a/1', posted_at: '2026-11-09 12:00:00' },
  ], { days: 7, today: '2026-11-09' });
  assert.match(md, /Publicados:\*\* 1/);
  assert.match(md, /Tutorial X/);
  assert.match(md, /stackexchange · stackoverflow/);
});
