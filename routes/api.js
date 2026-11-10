'use strict';
const express = require('express');
const store = require('../lib/store');
const { lintReply } = require('../lib/lint');
const { settings } = require('../lib/settings');
const { runScan, isRunning } = require('../lib/scan');
const { buildReport } = require('../lib/report');
const { bogotaNow } = require('../lib/scheduler');
const { authMode } = require('../lib/auth');

const router = express.Router();

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const status = e instanceof store.RuleError ? e.status : 500;
  if (status === 500) console.error(e);
  res.status(status).json({ error: status === 500 ? 'Error interno' : e.message });
});

// Toda petición que cambia datos debe venir como JSON. Un formulario de otro sitio no puede enviar
// application/json sin una consulta previa (CORS) que este servicio no autoriza: defensa extra contra CSRF.
router.use('/api', (req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Se espera JSON' });
  }
  return next();
});

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new store.RuleError('id no válido', 400);
  return id;
};

router.get('/api/me', wrap(async (req, res) => {
  const cfg = settings();
  res.json({
    user: req.user,
    postsToday: await store.postsToday(req.user.email),
    maxPostsPerDay: cfg.maxPostsPerPersonPerDay,
    linksEnabled: cfg.linksEnabled,
    requireDistinctApprover: cfg.requireDistinctApprover,
    authMode: authMode(),
  });
}));

router.get('/api/queue', wrap(async (req, res) => {
  const status = store.QUEUE_STATUSES.includes(req.query.status) ? req.query.status : 'en_cola';
  const source = ['reddit', 'hn', 'github'].includes(req.query.source) ? req.query.source : null;
  res.json({ items: await store.listQueue({ status, source, limit: req.query.limit }), counts: await store.counts() });
}));

router.get('/api/threads/:id', wrap(async (req, res) => {
  const t = await store.getThread(idParam(req));
  if (!t) return res.status(404).json({ error: 'No existe' });
  res.json(t);
}));

router.patch('/api/threads/:id', wrap(async (req, res) => {
  const id = idParam(req);
  const reply = String(req.body?.reply ?? '').slice(0, 10000);
  const t = await store.getThread(id);
  if (!t) return res.status(404).json({ error: 'No existe' });
  const cfg = settings();
  const lint = lintReply(reply, { linksEnabled: cfg.linksEnabled, linkUrl: t.link_url });
  await store.editReply(id, reply, req.user.email, lint);
  res.json(await store.getThread(id));
}));

router.post('/api/threads/:id/approve', wrap(async (req, res) => {
  const id = idParam(req);
  await store.approve(id, req.user.email, {
    requireDistinct: settings().requireDistinctApprover,
    seenVersion: req.body?.seen,
  });
  res.json(await store.getThread(id));
}));

router.post('/api/threads/:id/posted', wrap(async (req, res) => {
  const id = idParam(req);
  await store.markPosted(id, req.user.email, String(req.body?.url || ''), { maxPerDay: settings().maxPostsPerPersonPerDay });
  res.json(await store.getThread(id));
}));

router.post('/api/threads/:id/discard', wrap(async (req, res) => {
  const id = idParam(req);
  await store.discard(id, req.user.email, req.body?.reason);
  res.json(await store.getThread(id));
}));

router.get('/api/runs', wrap(async (req, res) => {
  res.json({ running: isRunning(), runs: await store.lastRuns(10) });
}));

router.post('/api/scan', wrap(async (req, res) => {
  if (isRunning()) return res.status(409).json({ error: 'Ya hay una corrida en curso' });
  runScan({ triggerBy: req.user.email, log: (m) => console.log(`[scan manual] ${m}`) })
    .catch((e) => console.error(`[scan manual] ${e.message}`));
  res.status(202).json({ started: true });
}));

router.get('/api/report', wrap(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
  const md = buildReport(await store.reportRows(days), { days, today: bogotaNow().date });
  res.type('text/markdown; charset=utf-8').send(md);
}));

module.exports = router;
