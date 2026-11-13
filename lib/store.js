'use strict';
// Acceso a MySQL: hilos, transiciones de estado con reglas, registro de eventos y corridas.
const { getPool } = require('../db/pool');

const QUEUE_STATUSES = ['pendiente', 'no_relevante', 'en_cola', 'aprobado', 'publicado', 'descartado', 'error'];

function toSqlDate(d) {
  return d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : null;
}

function parseJsonCol(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function rowOut(r) {
  return { ...r, risks: parseJsonCol(r.risks) || [], lint: parseJsonCol(r.lint) || { ok: true, issues: [] } };
}

async function logEvent(threadId, actor, action, detail = null, conn = getPool()) {
  await conn.query('INSERT INTO thread_events (thread_id, actor, action, detail, at) VALUES (?,?,?,?,UTC_TIMESTAMP())',
    [threadId, actor, action, detail ? JSON.stringify(detail) : null]);
}

async function knownKeys(items) {
  if (!items.length) return new Set();
  const [rows] = await getPool().query(
    'SELECT source, external_id FROM threads WHERE (source, external_id) IN (?)',
    [items.map((i) => [i.source, i.external_id])]);
  return new Set(rows.map((r) => `${r.source}:${r.external_id}`));
}

async function insertCandidate(item) {
  const [res] = await getPool().query(
    `INSERT IGNORE INTO threads (source, external_id, url, community, title, excerpt, thread_created_at, prefilter_score, matched_terms, found_at)
     VALUES (?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())`,
    [item.source, item.external_id, item.url.slice(0, 512), String(item.community).slice(0, 128), item.title.slice(0, 512),
      String(item.body || '').slice(0, 4000), toSqlDate(item.created_at), item.prefilter.score,
      item.prefilter.terms.join(', ').slice(0, 512)]);
  return res.insertId || null;
}

async function pendingForDrafting(limit) {
  const [rows] = await getPool().query(
    `SELECT * FROM threads WHERE status = 'pendiente' ORDER BY prefilter_score DESC, found_at DESC LIMIT ?`, [limit]);
  return rows;
}

async function saveDraft(id, { result, model, linkUrl, lint, minScore }) {
  const status = result.relevant && result.relevance_score >= minScore && result.reply ? 'en_cola' : 'no_relevante';
  await getPool().query(
    `UPDATE threads SET status=?, relevance_score=?, theme=?, persona=?, language=?, question_summary=?, reply=?,
       mentions_brand=?, risks=?, lint=?, content_idea=?, link_url=?, model=? WHERE id=?`,
    [status, result.relevance_score, result.theme, result.persona, result.language, result.question_summary,
      result.reply, result.mentions_brand ? 1 : 0, JSON.stringify(result.risks), JSON.stringify(lint),
      result.content_idea, linkUrl, model, id]);
  await logEvent(id, 'agente', 'redactado', { status, relevance_score: result.relevance_score });
  return status;
}

async function markError(id, message) {
  await getPool().query(`UPDATE threads SET status='error', discard_reason=? WHERE id=?`, [message.slice(0, 255), id]);
  await logEvent(id, 'agente', 'error', { message });
}

async function listQueue({ status = 'en_cola', source = null, limit = 100 } = {}) {
  const where = ['status = ?'];
  const args = [status];
  if (source) { where.push('source = ?'); args.push(source); }
  args.push(Math.max(1, Math.min(Math.floor(Number(limit)) || 100, 500)));
  const [rows] = await getPool().query(
    `SELECT * FROM threads WHERE ${where.join(' AND ')} ORDER BY relevance_score DESC, found_at DESC LIMIT ?`, args);
  return rows.map(rowOut);
}

async function getThread(id) {
  const [rows] = await getPool().query('SELECT * FROM threads WHERE id = ?', [id]);
  if (!rows.length) return null;
  const [events] = await getPool().query(
    'SELECT actor, action, detail, at FROM thread_events WHERE thread_id = ? ORDER BY at, id', [id]);
  return { ...rowOut(rows[0]), events: events.map((e) => ({ ...e, detail: parseJsonCol(e.detail) })) };
}

class RuleError extends Error {
  constructor(msg, status = 409) { super(msg); this.status = status; }
}

// Versión del borrador que vio quien actúa: si alguien lo editó después, la acción se rechaza.
const versionOf = (t) => String(t.edited_at || '');

// Cambio de estado atómico: solo aplica si el hilo sigue en el estado (y la versión) esperados.
async function guardedUpdate(sql, args, what) {
  const [res] = await getPool().query(sql, args);
  if (res.affectedRows !== 1) throw new RuleError(`${what}: el hilo cambió mientras lo revisabas. Recarga y vuelve a intentar.`);
}

// Editar borra la aprobación (igual que el cargador de pauta).
async function editReply(id, reply, actor, lint) {
  const t = await getThread(id);
  if (!t) throw new RuleError('No existe', 404);
  if (!['en_cola', 'aprobado'].includes(t.status)) throw new RuleError(`No se edita en estado ${t.status}`);
  await guardedUpdate(
    `UPDATE threads SET reply=?, lint=?, edited_by=?, edited_at=UTC_TIMESTAMP(6), status='en_cola', approved_by=NULL, approved_at=NULL
      WHERE id=? AND status IN ('en_cola','aprobado')`,
    [reply, JSON.stringify(lint), actor, id], 'No se guardó');
  await logEvent(id, actor, 'editado', { aprobacion_borrada: t.status === 'aprobado' });
}

async function approve(id, actor, { requireDistinct, seenVersion }) {
  const t = await getThread(id);
  if (!t) throw new RuleError('No existe', 404);
  if (t.status !== 'en_cola') throw new RuleError(`Solo se aprueba lo que está en cola (estado: ${t.status})`);
  if (seenVersion == null || String(seenVersion) !== versionOf(t)) {
    throw new RuleError('El borrador cambió desde que lo abriste. Recarga y revísalo antes de aprobar.');
  }
  if (!t.lint.ok) throw new RuleError('El borrador tiene errores de revisión automática; corrígelos antes de aprobar');
  if (requireDistinct && t.edited_by && t.edited_by.toLowerCase() === actor.toLowerCase()) {
    throw new RuleError('Quien editó el borrador no puede aprobarlo');
  }
  await guardedUpdate(
    `UPDATE threads SET status='aprobado', approved_by=?, approved_at=UTC_TIMESTAMP()
      WHERE id=? AND status='en_cola' AND (edited_at <=> ?)`,
    [actor, id, t.edited_at || null], 'No se aprobó');
  await logEvent(id, actor, 'aprobado');
}

// Solo URL https del sitio del hilo (evita enlaces javascript: u otros esquemas en la cola).
const POSTED_HOSTS = { stackexchange: /(^|\.)(stackoverflow|stackexchange)\.com$/, hn: /^news\.ycombinator\.com$/, github: /^github\.com$/ };
function validatePostedUrl(source, postedUrl) {
  let u;
  try { u = new URL(String(postedUrl).trim()); } catch { throw new RuleError('URL de la publicación no válida', 400); }
  if (u.protocol !== 'https:') throw new RuleError('La URL debe empezar por https://', 400);
  if (u.username || u.password) throw new RuleError('URL de la publicación no válida', 400);
  const hostOk = POSTED_HOSTS[source];
  if (!hostOk || !hostOk.test(u.hostname)) throw new RuleError(`La URL no es de ${source}`, 400);
  const s = u.toString();
  if (s.length > 512) throw new RuleError('URL demasiado larga', 400);
  return s;
}

async function postsToday(actor) {
  // Día calendario de Bogotá (UTC-5, sin horario de verano)
  const [rows] = await getPool().query(
    `SELECT COUNT(*) AS n FROM threads WHERE posted_by = ?
       AND DATE(DATE_SUB(posted_at, INTERVAL 5 HOUR)) = DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`, [actor]);
  return rows[0].n;
}

async function markPosted(id, actor, postedUrl, { maxPerDay }) {
  const t = await getThread(id);
  if (!t) throw new RuleError('No existe', 404);
  if (t.status !== 'aprobado') throw new RuleError('Solo se marca como publicado lo aprobado');
  const url = validatePostedUrl(t.source, postedUrl);
  const n = await postsToday(actor);
  if (n >= maxPerDay) throw new RuleError(`Tope diario alcanzado (${maxPerDay} por persona)`);
  await guardedUpdate(
    `UPDATE threads SET status='publicado', posted_by=?, posted_at=UTC_TIMESTAMP(), posted_url=? WHERE id=? AND status='aprobado'`,
    [actor, url, id], 'No se registró');
  await logEvent(id, actor, 'publicado', { url });
}

// Retención: los hilos (URL, título, extracto) y su registro se borran a los 90 días,
// como se definió al inicio del proyecto.
async function purgeOlderThan(days = 90) {
  const [old] = await getPool().query(
    'SELECT id FROM threads WHERE found_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [days]);
  if (!old.length) return 0;
  const ids = old.map((r) => r.id);
  await getPool().query('DELETE FROM thread_events WHERE thread_id IN (?)', [ids]);
  const [res] = await getPool().query('DELETE FROM threads WHERE id IN (?)', [ids]);
  await getPool().query('DELETE FROM scan_runs WHERE started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [days]);
  return res.affectedRows;
}

async function discard(id, actor, reason) {
  const t = await getThread(id);
  if (!t) throw new RuleError('No existe', 404);
  if (t.status === 'publicado') throw new RuleError('Ya está publicado');
  await guardedUpdate(`UPDATE threads SET status='descartado', discard_reason=? WHERE id=? AND status <> 'publicado'`,
    [String(reason || 'sin motivo').slice(0, 255), id], 'No se descartó');
  await logEvent(id, actor, 'descartado', { reason });
}

async function counts() {
  const [rows] = await getPool().query('SELECT status, COUNT(*) AS n FROM threads GROUP BY status');
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

async function startRun(triggerBy) {
  const [res] = await getPool().query('INSERT INTO scan_runs (trigger_by, started_at) VALUES (?, UTC_TIMESTAMP())', [triggerBy]);
  return res.insertId;
}

async function finishRun(id, stats) {
  await getPool().query(
    `UPDATE scan_runs SET finished_at=UTC_TIMESTAMP(), fetched=?, candidates=?, new_threads=?, drafted=?, errors=? WHERE id=?`,
    [stats.fetched, stats.candidates, stats.newThreads, stats.drafted, JSON.stringify(stats.errors), id]);
}

async function lastRuns(limit = 10) {
  const [rows] = await getPool().query('SELECT * FROM scan_runs ORDER BY id DESC LIMIT ?', [limit]);
  return rows.map((r) => ({ ...r, errors: parseJsonCol(r.errors) || [] }));
}

async function reportRows(days) {
  const [rows] = await getPool().query(
    `SELECT id, source, community, url, title, status, relevance_score, theme, persona, language, question_summary,
            content_idea, posted_url, posted_at, found_at
       FROM threads WHERE found_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        AND status IN ('en_cola','aprobado','publicado','descartado')`, [days]);
  return rows;
}

module.exports = {
  QUEUE_STATUSES, RuleError, validatePostedUrl, purgeOlderThan, versionOf, knownKeys, insertCandidate, pendingForDrafting, saveDraft, markError,
  listQueue, getThread, editReply, approve, markPosted, discard, postsToday, counts, startRun, finishRun,
  lastRuns, reportRows, logEvent,
};
