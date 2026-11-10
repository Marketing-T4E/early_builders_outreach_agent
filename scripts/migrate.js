'use strict';
// Crea las tablas si no existen. El servicio también lo hace al arrancar.
const { migrate } = require('../db/migrate');
const { getPool } = require('../db/pool');

migrate(console.log)
  .then(() => getPool().end())
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
