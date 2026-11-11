'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const auth = require('./lib/auth');
const { hasDb } = require('./db/pool');
const { startScheduler } = require('./lib/scheduler');

const PORT = process.env.PORT;
if (!PORT) {
  console.error('PORT no está definido; el runtime debe inyectarlo.');
  process.exit(1);
}

// SIN LOGIN hasta nuevo aviso (fase de QA): ver lib/auth.js para restaurar el inicio de sesión con Microsoft.
console.warn('AVISO: el servicio está SIN LOGIN (fase de QA): cualquiera con el enlace entra.');

// Diagnóstico seguro al arrancar: solo nombres de variables, nunca sus valores.
const OPTIONAL = {
  'redacción con Claude': ['ANTHROPIC_API_KEY'],
  'fuente Reddit': ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT'],
  'fuente GitHub': ['GITHUB_TOKEN'],
};
for (const [what, names] of Object.entries(OPTIONAL)) {
  const missing = names.filter((n) => !String(process.env[n] || '').trim());
  if (missing.length) console.warn(`${what}: faltan ${missing.join(', ')}`);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
// Encabezados de seguridad: sin incrustar en otros sitios, sin adivinar tipos de contenido
// (el reporte en Markdown trae texto de terceros), sin filtrar la URL al abrir enlaces externos.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '64kb' }));

app.get(['/health', '/api/health'], (req, res) => res.json({ status: 'ok' }));

auth.mount(app); // sin login por ahora: asigna el usuario de QA a cada petición
app.use(require('./routes/api'));
app.use(express.static(path.join(__dirname, 'public'), {
  redirect: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'),
}));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

(async () => {
  if (hasDb()) {
    await require('./db/migrate').migrate();
    console.log('tablas listas');
  } else {
    console.warn('Sin base de datos: la cola y la corrida diaria no funcionan (solo pruebas locales).');
  }
  app.listen(PORT, () => {
    console.log(`Agente de escucha en el puerto ${PORT} (sin login)`);
    if (hasDb()) startScheduler();
  });
})().catch((e) => {
  console.error('Fallo al arrancar:', e.message);
  process.exit(1);
});
