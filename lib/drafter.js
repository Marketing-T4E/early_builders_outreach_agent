'use strict';
// Una llamada a Claude por hilo: clasifica y redacta con salida estructurada (JSON Schema).
const Anthropic = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT, OUTPUT_SCHEMA, PERSONAS, THEMES, buildUserMessage } = require('./brief');

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

function model() {
  return process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
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

  if (response.stop_reason === 'refusal') {
    const cat = response.stop_details?.category || 'sin categoría';
    throw new Error(`Claude declinó el hilo (${cat})`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('Respuesta cortada por max_tokens');

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('La salida de Claude no es JSON válido');
  }
  return { result: clampResult(parsed), model: response.model, usage: response.usage };
}

// Errores que no dependen del hilo: configuración (modelo o parámetros inválidos), credenciales,
// permisos, límite de uso, sobrecarga o red. Repetirlos con cada hilo solo los marcaría todos como error.
function isSystemicError(e) {
  if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError
    || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError
    || e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError
    || e instanceof Anthropic.InternalServerError) return true;
  return e instanceof Anthropic.APIError && (e.status === 529 || e.status >= 500);
}

module.exports = { draftReply, clampResult, isSystemicError };
