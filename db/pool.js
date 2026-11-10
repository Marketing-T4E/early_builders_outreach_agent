'use strict';
// mysql2/promise pool. Misma convención que los demás repos de T4E:
// DATABASE_URL (inyectada por el runtime) o DB_* / MYSQL_*. Sin fallback a localhost.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const hasDb = () => Boolean(process.env.DATABASE_URL || process.env.DB_HOST || process.env.MYSQL_HOST);

function missingDbSettings() {
  if (process.env.DATABASE_URL) return [];
  const missing = [];
  if (!(process.env.DB_HOST || process.env.MYSQL_HOST)) missing.push('DB_HOST');
  if (!(process.env.DB_USER || process.env.MYSQL_USER)) missing.push('DB_USER');
  if (!(process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE)) missing.push('DB_NAME');
  return missing;
}

// Datos de conexión como objeto (también los usa el almacén de sesiones).
function dbOptions() {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    };
  }
  const missing = missingDbSettings();
  if (missing.length) {
    throw new Error('Faltan datos de la base: DATABASE_URL o DB_HOST/DB_USER/DB_NAME '
      + `(faltan: ${missing.join(', ')}).`);
  }
  return {
    host: process.env.DB_HOST || process.env.MYSQL_HOST,
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.MYSQL_DATABASE,
  };
}

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...dbOptions(),
      waitForConnections: true,
      connectionLimit: 10,
      multipleStatements: false,
      charset: 'utf8mb4',
      dateStrings: true,
      timezone: 'Z',
    });
  }
  return pool;
}

module.exports = { getPool, dbOptions, hasDb, missingDbSettings };
