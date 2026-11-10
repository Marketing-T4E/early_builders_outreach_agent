'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { lintReply } = require('../lib/lint');

const errors = (r) => r.issues.filter((i) => i.level === 'error').map((i) => i.msg);

test('respuesta útil sin marca ni enlaces pasa', () => {
  const r = lintReply('Keep a short spec file in the repo and point the agent to it at the start of each session.');
  assert.equal(r.ok, true);
});

test('nombrar la marca exige divulgación', () => {
  assert.equal(lintReply('Think4Ever does this with a living blueprint.').ok, false);
  assert.equal(lintReply('Think4Ever does this with a living blueprint (I work at Think4Ever).').ok, true);
  assert.equal(lintReply('Think4Ever lo resuelve con un blueprint vivo (trabajo en Think4Ever).').ok, true);
});

test('marca mal escrita', () => {
  const r = lintReply('Think4ever helps here (I work at Think4Ever).');
  assert.ok(errors(r).some((m) => m.includes('se escribe')));
});

test('frases prohibidas', () => {
  for (const s of ['It makes your app 100% secure.', 'This is the tip of the iceberg.', 'It certifies your code.',
    'It replaces your pentest.', 'Join 1,000+ developers.']) {
    assert.equal(lintReply(s).ok, false, s);
  }
});

test('no se presenta como herramienta', () => {
  const r = lintReply('Think4Ever is an AI tool for specs (I work at Think4Ever).');
  assert.ok(errors(r).some((m) => m.includes('AI platform')));
});

test('fase sin enlaces bloquea URL', () => {
  assert.equal(lintReply('See https://example.com/docs').ok, false);
  assert.equal(lintReply('See think4ever.com/docs').ok, false);
});

test('con enlaces activos, el enlace propio necesita UTM; el dominio no cuenta como marca mal escrita', () => {
  const link = 'https://go.think4ever.com/developer-network-co?utm_source=reddit&utm_medium=community&utm_campaign=developer_network_co_202611&utm_content=claudeai';
  const ok = lintReply(`Docs here: ${link} (I work at Think4Ever).`, { linksEnabled: true, linkUrl: link });
  assert.equal(ok.ok, true, JSON.stringify(ok.issues));
  const bad = lintReply('Docs: https://think4ever.com/docs (I work at Think4Ever).', { linksEnabled: true, linkUrl: link });
  assert.equal(bad.ok, false);
});

test('comparación directa y pregunta de datos pendientes', () => {
  assert.equal(lintReply('Honestly better than Cursor for this.').ok, false);
  assert.equal(lintReply('Sobre dónde quedan los datos: en la nube.').ok, false);
});

test('cifra genera aviso, no error', () => {
  const r = lintReply('It cut review time by 40%.');
  assert.equal(r.ok, true);
  assert.ok(r.issues.some((i) => i.level === 'aviso'));
});
