'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Anthropic = require('@anthropic-ai/sdk');
const { validatePostedUrl, versionOf, RuleError } = require('../lib/store');
const { isSystemicError } = require('../lib/drafter');

test('URL publicada: solo https del sitio del hilo', () => {
  assert.equal(validatePostedUrl('reddit', 'https://www.reddit.com/r/ClaudeAI/comments/abc/x/def/'),
    'https://www.reddit.com/r/ClaudeAI/comments/abc/x/def/');
  assert.equal(validatePostedUrl('hn', ' https://news.ycombinator.com/item?id=1 '), 'https://news.ycombinator.com/item?id=1');
  const bad = [
    ['reddit', 'javascript://www.reddit.com/%0aalert(1)'],
    ['reddit', 'http://www.reddit.com/r/x'],
    ['reddit', 'https://evilreddit.com/r/x'],
    ['reddit', 'https://user:pw@www.reddit.com/r/x'],
    ['github', 'https://gist.github.com/x'],
    ['hn', 'https://news.ycombinator.com.evil.io/item?id=1'],
    ['hn', 'no es una url'],
    ['otra', 'https://www.reddit.com/r/x'],
  ];
  for (const [src, url] of bad) {
    assert.throws(() => validatePostedUrl(src, url), RuleError, `${src} ${url}`);
  }
});

test('versión del borrador: sin editar es cadena vacía', () => {
  assert.equal(versionOf({ edited_at: null }), '');
  assert.equal(versionOf({ edited_at: '2026-11-10 12:00:00.123456' }), '2026-11-10 12:00:00.123456');
});

test('errores de Claude: los de configuración o servicio detienen la corrida', () => {
  const mk = (status) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers());
  for (const s of [400, 401, 403, 404, 429, 500, 529]) assert.equal(isSystemicError(mk(s)), true, String(s));
  assert.equal(isSystemicError(new Anthropic.APIConnectionError({ message: 'down' })), true);
  assert.equal(isSystemicError(new Error('La salida de Claude no es JSON válido')), false);
  assert.equal(isSystemicError(new Error('Claude declinó el hilo (cyber)')), false);
});

test('solo Anthropic: dirección fija, clave explícita y solo modelos Claude', () => {
  const keys = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const drafterPath = require.resolve('../lib/drafter');
  try {
    process.env.ANTHROPIC_BASE_URL = 'https://otro-proveedor.example/v1';
    process.env.ANTHROPIC_AUTH_TOKEN = 'token-de-otro';
    process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
    delete require.cache[drafterPath];
    const d = require('../lib/drafter');
    const c = d.getClient();
    assert.equal(c.baseURL, 'https://api.anthropic.com');
    assert.equal(c.apiKey, 'clave-de-prueba');
    assert.equal(c.authToken ?? null, null);

    delete process.env.ANTHROPIC_MODEL;
    assert.equal(d.model(), 'claude-opus-5-5');
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-5-5';
    assert.equal(d.model(), 'claude-sonnet-5-5');
    for (const bad of ['gpt-5', 'gemini-3-pro', 'llama-4', 'openai/claude-x', 'claude-x;rm']) {
      process.env.ANTHROPIC_MODEL = bad;
      assert.throws(() => d.model(), d.ConfigError, bad);
    }
    assert.equal(d.isSystemicError(new d.ConfigError('x')), true);
  } finally {
    for (const k of keys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    delete require.cache[drafterPath];
  }
});
