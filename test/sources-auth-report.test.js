'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const reddit = require('../lib/sources/reddit');
const hn = require('../lib/sources/hn');
const github = require('../lib/sources/github');
const { publicPrefix, toRoot, checkClaims } = require('../lib/auth');
const { statements } = require('../db/migrate');
const { buildReport } = require('../lib/report');
const { clampResult } = require('../lib/drafter');
const { OUTPUT_SCHEMA } = require('../lib/brief');

test('normaliza un post de Reddit sin autor', () => {
  const n = reddit.normalize({ data: { name: 't3_abc', id: 'abc', permalink: '/r/ClaudeAI/comments/abc/x/', subreddit: 'ClaudeAI',
    title: 'T', selftext: 'B', created_utc: 1762700000, author: 'someone' } });
  assert.equal(n.url, 'https://www.reddit.com/r/ClaudeAI/comments/abc/x/');
  assert.equal(n.community, 'ClaudeAI');
  assert.equal('author' in n, false);
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

test('acceso: prefijo público desde AUTH_REDIRECT_URI o BASE_PATH', () => {
  const prev = { r: process.env.AUTH_REDIRECT_URI, b: process.env.BASE_PATH };
  process.env.AUTH_REDIRECT_URI = 'https://host.example/project-abc/312/auth/microsoft/callback';
  assert.equal(publicPrefix(), '/project-abc/312');
  process.env.AUTH_REDIRECT_URI = '';
  process.env.BASE_PATH = '/run/312/';
  assert.equal(publicPrefix(), '/run/312');
  process.env.AUTH_REDIRECT_URI = prev.r ?? '';
  process.env.BASE_PATH = prev.b ?? '';
});

test('acceso: redirecciones relativas según la profundidad', () => {
  assert.equal(toRoot('/'), '');
  assert.equal(toRoot('/auth/callback'), '../');
  assert.equal(toRoot('/auth/microsoft/callback'), '../../');
});

test('acceso: reglas del token (tenant, invitado, dominio)', () => {
  const T = '11111111-2222-3333-4444-555555555555';
  const base = { tid: T, oid: 'o1', email: 'Ana@Think4Ever.com', name: 'Ana' };
  assert.equal(checkClaims(base, T, 'think4ever.com').email, 'ana@think4ever.com');
  assert.equal(checkClaims({ ...base, tid: 'otro' }, T, 'think4ever.com').reason, 'tenant');
  assert.equal(checkClaims({ ...base, idp: 'https://sts.windows.net/otro-tenant/' }, T, 'think4ever.com').reason, 'guest');
  assert.equal(checkClaims({ ...base, idp: `https://sts.windows.net/${T}/` }, T, 'think4ever.com').email, 'ana@think4ever.com');
  assert.equal(checkClaims({ ...base, email: 'ana@gmail.com' }, T, 'think4ever.com').reason, 'domain');
  assert.equal(checkClaims({ ...base, oid: '' }, T, 'think4ever.com').reason, 'token');
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
    { source: 'reddit', community: 'ClaudeAI', url: 'https://r', title: 'T', status: 'publicado', relevance_score: 90,
      theme: 'hardening', persona: 'p01-desarrolladores', question_summary: 'Cómo endurecer', content_idea: 'Tutorial X',
      posted_url: 'https://www.reddit.com/r/x/1', posted_at: '2026-11-09 12:00:00' },
  ], { days: 7, today: '2026-11-09' });
  assert.match(md, /Publicados:\*\* 1/);
  assert.match(md, /Tutorial X/);
  assert.match(md, /reddit · ClaudeAI/);
});
