'use strict';
// Revisión automática del borrador contra las reglas de marca y de mensaje de la KB.
// "error" bloquea la aprobación; "aviso" se muestra al revisor.

const BANNED = [
  // Guía de mensajes desde los white papers y kit de creadores
  { re: /100\s?%\s*(secure|safe|seguro|segura)/i, why: 'Frase absoluta ("100 % seguro")' },
  { re: /\bcertif(y|ies|ied|ica|icado|icada|ication|icación)\b/i, why: 'El informe de hardening es evidencia, no certificación' },
  { re: /(replaces?|reemplaza)\s+(a\s+|el\s+|the\s+|your\s+)?(pentest|pen\s?test|audit|auditor[ií]a)/i, why: 'Complementa pentests y auditorías; no los reemplaza' },
  { re: /(infinite scale|escala infinita|absolute visibility|visibilidad absoluta)/i, why: 'Frase absoluta de white papers anteriores' },
  // Decisión 2026-10-23
  { re: /(tip of the iceberg|punta del iceberg|iceberg)/i, why: 'No se usa "punta del iceberg"' },
  // Revisión creativa 2026-10-15
  { re: /1[.,]?000\+?\s*(developers|desarrolladores)/i, why: '"1,000+ developers" es una cifra de la etapa alfa' },
];

const DISCLOSURE = /(I work (at|on|for) Think4Ever|I'm (on|part of) the Think4Ever team|I am (on|part of) the Think4Ever team|disclosure:?\s*I work|trabajo en Think4Ever|soy (parte )?del equipo de Think4Ever|hago parte del equipo de Think4Ever)/i;

function lintReply(reply, { linksEnabled = false, linkUrl = null, mentionsBrand = null } = {}) {
  const issues = [];
  const text = String(reply || '');
  const add = (level, msg) => issues.push({ level, msg });

  if (!text.trim()) add('error', 'Borrador vacío');

  for (const b of BANNED) if (b.re.test(text)) add('error', b.why);

  // Marca: siempre "Think4Ever"
  // (se ignora el dominio: go.think4ever.com, think4ever.com/docs)
  const brandVariants = text.match(/(?<![./\w])think\s*-?\s*(4|for)\s*-?\s*ever(?!\.com)/gi) || [];
  if (brandVariants.some((v) => v !== 'Think4Ever')) add('error', 'La marca se escribe "Think4Ever"');
  if (/Think4Ever[^.\n]{0,40}\b(an? AI tool|una herramienta de (IA|inteligencia artificial))/i.test(text)) {
    add('error', 'Think4Ever es una "AI platform" / "plataforma de IA", no una herramienta');
  }

  // Divulgación: si se nombra la marca, quien publica dice que trabaja ahí
  const brandNamed = mentionsBrand ?? /Think4Ever/i.test(text);
  if (brandNamed && !DISCLOSURE.test(text)) {
    add('error', 'Nombra Think4Ever sin decir que quien publica trabaja ahí');
  }

  // Enlaces
  const urls = text.match(/\bhttps?:\/\/\S+|\bwww\.\S+|\bthink4ever\.com\S*/gi) || [];
  if (!linksEnabled && urls.length) {
    add('error', 'Fase sin enlaces: el borrador no debe llevar URL');
  } else if (linksEnabled) {
    const ownWithoutUtm = urls.filter((u) => /think4ever\.com/i.test(u) && !/utm_medium=community/.test(u));
    if (ownWithoutUtm.length) add('error', 'Enlace a Think4Ever sin el UTM de la cola');
    if (linkUrl && urls.some((u) => /think4ever\.com/i.test(u)) && !text.includes(linkUrl)) {
      add('aviso', 'El enlace a Think4Ever no es el que generó la cola');
    }
  }

  // Comparaciones y cifras
  if (/(better than|mejor que|unlike|a diferencia de)\s+(cursor|claude|copilot|codex|windsurf|lovable|bolt|replit|chatgpt)/i.test(text)) {
    add('error', 'Comparación directa con otra herramienta');
  }
  if (/\d+(\s?%|x\b|\s?veces)/i.test(text)) add('aviso', 'Lleva una cifra: confirmar fuente y fecha');
  if (/(where (is|are) (my|the|your) (code|data) (stored|hosted|kept)|dónde (quedan|se guardan|vive[n]?) (el código|los datos))/i.test(text)) {
    add('error', 'Toca dónde quedan el código y los datos: respuesta oficial de Dirección pendiente');
  }
  if (text.length > 1800) add('aviso', `Respuesta larga (${text.length} caracteres)`);

  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

module.exports = { lintReply, DISCLOSURE };
