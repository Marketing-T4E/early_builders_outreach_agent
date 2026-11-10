'use strict';
// Corrida: traer hilos de las tres fuentes, filtrar sin costo, guardar lo nuevo, redactar con Claude.
const { fetchReddit } = require('./sources/reddit');
const { fetchHN } = require('./sources/hn');
const { fetchGitHub } = require('./sources/github');
const { prefilter } = require('./prefilter');
const { buildLink } = require('./utm');
const { lintReply } = require('./lint');
const { settings, loadSources } = require('./settings');

let running = false;

async function fetchAll(sources, { since, log }) {
  const errors = [];
  const capture = (m) => { errors.push(m); log(m); };
  const results = await Promise.allSettled([
    fetchReddit(sources.reddit, { since, log: capture }),
    fetchHN(sources.hn, { since, log: capture }),
    fetchGitHub(sources.github, { since, log: capture }),
  ]);
  const items = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else capture(`${['reddit', 'hn', 'github'][i]}: ${r.reason.message}`);
  });
  return { items, errors };
}

// dryRun: no usa la base ni Claude; devuelve los candidatos que pasarían el filtro.
async function runScan({ triggerBy = 'programado', dryRun = false, log = console.log } = {}) {
  if (running) throw new Error('Ya hay una corrida en curso');
  running = true;
  const stats = { fetched: 0, candidates: 0, newThreads: 0, drafted: 0, queued: 0, purged: 0, errors: [] };
  let runId = null;
  try {
    const cfg = settings();
    const sources = loadSources();
    const since = new Date(Date.now() - cfg.lookbackHours * 3600e3);
    const store = dryRun ? null : require('./store');
    if (!dryRun) {
      runId = await store.startRun(triggerBy);
      stats.purged = await store.purgeOlderThan(90);
    }

    const { items, errors } = await fetchAll(sources, { since, log });
    stats.errors.push(...errors);
    stats.fetched = items.length;
    const candidates = prefilter(items, sources.prefilter);
    stats.candidates = candidates.length;
    log(`traídos ${items.length}, pasan el filtro ${candidates.length}`);
    if (dryRun) return { stats, candidates };

    const known = await store.knownKeys(candidates);
    for (const c of candidates) {
      if (known.has(`${c.source}:${c.external_id}`)) continue;
      if (await store.insertCandidate(c)) stats.newThreads++;
    }

    if (!String(process.env.ANTHROPIC_API_KEY || '').trim()) {
      const msg = 'sin ANTHROPIC_API_KEY: los hilos quedan pendientes hasta que esté configurada';
      stats.errors.push(msg);
      log(msg);
      return { stats };
    }
    const { draftReply, isSystemicError } = require('./drafter');
    const noPromo = new Set((sources.reddit.no_self_promo || []).map((s) => s.toLowerCase()));
    const pending = await store.pendingForDrafting(cfg.maxLlmPerRun);
    for (const t of pending) {
      const linkUrl = cfg.linksEnabled
        ? buildLink({ destination: cfg.linkDestination, channel: t.source, campaign: cfg.utmCampaign, community: t.community })
        : null;
      const item = { source: t.source, community: t.community, title: t.title, body: t.excerpt };
      try {
        const { result, model } = await draftReply(item, {
          linksEnabled: cfg.linksEnabled,
          linkUrl,
          noSelfPromo: t.source === 'reddit' && noPromo.has(String(t.community).toLowerCase()),
        });
        const lint = lintReply(result.reply, { linksEnabled: cfg.linksEnabled, linkUrl, mentionsBrand: result.mentions_brand });
        const status = await store.saveDraft(t.id, { result, model, linkUrl, lint, minScore: cfg.minRelevance });
        stats.drafted++;
        if (status === 'en_cola') stats.queued++;
      } catch (e) {
        if (isSystemicError(e)) {
          // Clave inválida, límite de uso o caída de la API: no es culpa del hilo.
          // Se detiene la corrida y los hilos siguen pendientes para la próxima.
          stats.errors.push(`Claude no disponible (${e.status || e.name}): se reintenta en la próxima corrida`);
          log(stats.errors[stats.errors.length - 1]);
          break;
        }
        stats.errors.push(`hilo ${t.id}: ${e.message}`);
        await store.markError(t.id, e.message);
      }
    }
    log(`nuevos ${stats.newThreads}, redactados ${stats.drafted}, a la cola ${stats.queued}`);
    return { stats };
  } finally {
    if (runId) await require('./store').finishRun(runId, stats).catch((e) => log(`finishRun: ${e.message}`));
    running = false;
  }
}

function isRunning() { return running; }

module.exports = { runScan, isRunning, fetchAll };
