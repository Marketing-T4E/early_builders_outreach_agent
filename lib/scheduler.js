'use strict';
// Corrida diaria dentro del servicio, a SCAN_HOUR hora de Bogotá (UTC-5). Revisa cada 10 minutos
// y consulta scan_runs para no correr dos veces el mismo día si el servicio se reinicia.
const { getPool } = require('../db/pool');
const { runScan, isRunning } = require('./scan');
const { settings } = require('./settings');

function bogotaNow(d = new Date()) {
  const b = new Date(d.getTime() - 5 * 3600e3);
  return { date: b.toISOString().slice(0, 10), hour: b.getUTCHours() };
}

async function alreadyRanToday(date) {
  const [rows] = await getPool().query(
    `SELECT 1 FROM scan_runs WHERE trigger_by = 'programado'
       AND DATE(DATE_SUB(started_at, INTERVAL 5 HOUR)) = ? LIMIT 1`, [date]);
  return rows.length > 0;
}

function startScheduler(log = console.log) {
  const cfg = settings();
  if (!cfg.scanEnabled) {
    log('[scheduler] SCAN_ENABLED=0: sin corrida automática');
    return null;
  }
  const tick = async () => {
    const { date, hour } = bogotaNow();
    if (hour < cfg.scanHour || isRunning()) return;
    try {
      if (await alreadyRanToday(date)) return;
      log(`[scheduler] corrida diaria ${date}`);
      await runScan({ triggerBy: 'programado', log: (m) => log(`[scan] ${m}`) });
    } catch (e) {
      log(`[scheduler] ${e.message}`);
    }
  };
  setTimeout(tick, 30e3);
  return setInterval(tick, 10 * 60e3);
}

module.exports = { startScheduler, bogotaNow };
