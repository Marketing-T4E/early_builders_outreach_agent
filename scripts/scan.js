'use strict';
// Corrida manual desde la consola.
//   npm run scan       -> trae, filtra, guarda y redacta (necesita base y ANTHROPIC_API_KEY)
//   npm run scan:dry   -> solo trae y filtra; imprime los candidatos. No usa base ni Claude.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { runScan } = require('../lib/scan');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  const out = await runScan({ triggerBy: 'consola', dryRun });
  if (dryRun) {
    for (const c of out.candidates.slice(0, 50)) {
      console.log(`[${c.prefilter.score}] ${c.source} · ${c.community} · ${c.title.slice(0, 90)}`);
      console.log(`      ${c.url}`);
      console.log(`      temas: ${c.prefilter.topics.join(', ')} | términos: ${c.prefilter.terms.slice(0, 6).join(', ')}`);
    }
  }
  console.log(JSON.stringify(out.stats));
  if (!dryRun) await require('../db/pool').getPool().end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
