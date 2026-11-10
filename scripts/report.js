'use strict';
// Imprime el reporte en Markdown. Uso: npm run report -- 7
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const store = require('../lib/store');
const { buildReport } = require('../lib/report');
const { bogotaNow } = require('../lib/scheduler');

(async () => {
  const days = Number(process.argv[2]) || 7;
  console.log(buildReport(await store.reportRows(days), { days, today: bogotaNow().date }));
  await require('../db/pool').getPool().end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
