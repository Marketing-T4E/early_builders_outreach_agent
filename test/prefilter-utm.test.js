'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prefilter, makeMatcher } = require('../lib/prefilter');
const { buildLink, slug } = require('../lib/utm');
const sources = require('../config/sources.json');

const item = (title, body = '') => ({ source: 'stackexchange', external_id: title, url: 'u', community: 'x', title, body });

test('pregunta sobre pérdida de contexto pasa el filtro', () => {
  const out = prefilter([item('Claude Code loses context every session, how do you handle it?')], sources.prefilter);
  assert.equal(out.length, 1);
  assert.ok(out[0].prefilter.topics.includes('contexto_entre_sesiones'));
});

test('pregunta en español pasa el filtro', () => {
  const out = prefilter([item('¿Cómo llevo a producción una app hecha con vibe coding?', 'Me preocupa la seguridad del código')], sources.prefilter);
  assert.equal(out.length, 1);
});

test('hilo real de HN sobre manejo de contexto pasa; comentario en "Who is hiring" no', () => {
  const ok = item("Comentario en: Ask HN: How do you manage your AI agents' context across clients and projects?",
    'I keep a markdown file per client and an MCP server that serves it.');
  const hiring = item('Comentario en: Ask HN: Who is hiring? (November 2026)', 'We need observability and hardening experience. Remote?');
  const out = prefilter([ok, hiring], sources.prefilter);
  assert.equal(out.length, 1);
  assert.ok(out[0].title.includes('manage your AI'));
});

test('oferta de empleo se excluye y un tema suelto sin pregunta no pasa', () => {
  assert.equal(prefilter([item('[Hiring] MCP server engineer, production ready?')], sources.prefilter).length, 0);
  assert.equal(prefilter([item('I released an MCP server')], sources.prefilter).length, 0);
});

test('coincidencia por palabra completa', () => {
  const m = makeMatcher('mcp');
  assert.equal(m('using mcp today'), true);
  assert.equal(m('mcpx tool'), false);
});

test('UTM según la convención', () => {
  const link = buildLink({
    destination: 'https://go.think4ever.com/developer-network-co', channel: 'stackexchange',
    campaign: 'developer_network_co_202611', community: 'es.stackoverflow',
  });
  const u = new URL(link);
  assert.equal(u.searchParams.get('utm_source'), 'stackexchange');
  assert.equal(u.searchParams.get('utm_medium'), 'community');
  assert.equal(u.searchParams.get('utm_campaign'), 'developer_network_co_202611');
  assert.equal(u.searchParams.get('utm_content'), 'es_stackoverflow');
  assert.equal(slug('anthropics/claude-code Ñandú'), 'anthropics_claude_code_nandu');
});
