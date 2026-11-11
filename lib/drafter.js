'use strict';
// Una llamada a Claude por hilo: clasifica y redacta con salida estructurada (JSON Schema).
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT, OUTPUT_SCHEMA, PERSONAS, THEMES, buildUserMessage } = require('./brief');

// Solo Anthropic: la dirección de la API va fija y la clave se pasa explícita. Así el SDK no toma
// ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN ni perfiles/config en disco que pudieran mandar las llamadas
// a otro servidor (un proxy u otro proveedor con API compatible).
const ANTHROPIC_API_URL = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-opus-5-5';

class ConfigError extends Error {}

let client;
function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: String(process.env.ANTHROPIC_API_KEY || '').trim() || null,
      baseURL: ANTHROPIC_API_URL,
    });
  }
  return client;
}

// Solo modelos Claude. Un nombre de otro proveedor en ANTHROPIC_MODEL detiene la corrida.
function model() {
  const m = String(process.env.ANTHROPIC_MODEL || '').trim() || DEFAULT_MODEL;
  if (!/^claude-[a-z0-9.-]+$/i.test(m)) throw new ConfigError(`ANTHROPIC_MODEL no es un modelo Claude: ${m}`);
  return m;
}

function clampResult(r) {
  return {
    ...r,
    relevance_score: Math.max(0, Math.min(100, Math.round(Number(r.relevance_score) || 0))),
    theme: THEMES.includes(r.theme) ? r.theme : 'otro',
    persona: PERSONAS.includes(r.persona) ? r.persona : 'p01-desarrolladores',
    risks: Array.isArray(r.risks) ? r.risks.slice(0, 8) : [],
    reply: r.relevant ? String(r.reply || '').trim() : '',
  };
}

async function draftReply(item, opts) {
  const response = await getClient().beta.messages.create({
    model: model(),
    // El reintento lo hace la API de Anthropic con otro modelo Claude; nunca sale de Anthropic.
    max_tokens: 16000,
    // Si el clasificador de seguridad declina, el servidor reintenta con el modelo recomendado.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: {
      effort: process.env.LLM_EFFORT || 'medium',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(item, opts) }],
  });

  if (!/^claude-/i.test(String(response.model || ''))) {
    throw new ConfigError(`La respuesta no vino de un modelo Claude (${response.model})`);
  }
  if (response.stop_reason === 'refusal') {
    const cat = response.stop_details?.category || 'sin categoría';
    throw new Error(`El agente declinó el hilo (${cat})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Respuesta cortada por max_tokens');

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('La respuesta del agente no es JSON válido');
  }
  return { result: clampResult(parsed), model: response.model, usage: response.usage };
}

// Errores que no dependen del hilo: configuración (modelo o parámetros inválidos), credenciales,
// permisos, límite de uso, sobrecarga o red. Repetirlos con cada hilo solo los marcaría todos como error.
function isSystemicError(e) {
  if (e instanceof ConfigError) return true;
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError
    || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError
    || e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError
    || e instanceof Anthropic.InternalServerError) return true;
  return e instanceof Anthropic.APIError && (e.status === 529 || e.status >= 500);
}

module.exports = { draftReply, clampResult, isSystemicError, getClient, model, ConfigError, ANTHROPIC_API_URL };
