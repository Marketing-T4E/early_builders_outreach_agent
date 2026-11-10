'use strict';
// Crea las tablas si no existen (CREATE TABLE IF NOT EXISTS). Lo usan el arranque del servicio
// y `npm run migrate`. Ejecuta cada sentencia de db/schema.sql por separado.
const fs = require('fs');
const path = require('path');
const { getPool } = require('./pool');

function statements() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  return sql.split(';').map((s) => s.trim()).filter(Boolean);
}

async function migrate(log = () => {}) {
  const pool = getPool();
  for (const s of statements()) {
    await pool.query(s);
    log(`ok: ${s.split('\n')[0]}`);
  }
}

module.exports = { migrate, statements };
