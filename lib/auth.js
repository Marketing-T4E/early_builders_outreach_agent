'use strict';
// Inicio de sesión con Microsoft (Entra ID, solo el tenant de think4ever) y control de sesión para toda
// página y API. Adaptado de latam_growth/lib/msauth.js (tablero #286) para que las dos herramientas
// funcionen igual y usen las mismas variables del servicio:
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AUTH_REDIRECT_URI,
//   ALLOWED_EMAIL_DOMAIN (por defecto think4ever.com), SESSION_SECRET, SESSION_HOURS (por defecto 10).
// Sin login de usuario y contraseña ni llave de ingesta: este servicio no los necesita.
// AUTH_MODE=local-dev entra sin Microsoft, solo escuchando en 127.0.0.1 (lo controla server.js).
const crypto = require('crypto');
const session = require('express-session');
const msal = require('@azure/msal-node');
const { dbOptions, hasDb, getPool } = require('../db/pool');

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];
const COOKIE = 't4e_listen_ms';
const env = (k) => String(process.env[k] || '').trim();
const TENANT = () => env('AZURE_TENANT_ID');
const DOMAIN = () => (env('ALLOWED_EMAIL_DOMAIN') || 'think4ever.com').toLowerCase().replace(/^@/, '');
const HOURS = () => (Number(env('SESSION_HOURS')) > 0 ? Number(env('SESSION_HOURS')) : 10);
const localDev = () => env('AUTH_MODE') === 'local-dev';

// Prefijo público de la app: todo lo que va antes de /auth/ en AUTH_REDIRECT_URI
// (ej. /project-xxxx/123), o BASE_PATH (/run/<id>) si no se puede leer.
function publicPrefix() {
  try {
    const p = new URL(env('AUTH_REDIRECT_URI')).pathname;
    const i = p.indexOf('/auth/');
    if (i >= 0) return p.slice(0, i).replace(/\/+$/, '');
  } catch (e) { /* sigue abajo */ }
  return env('BASE_PATH').replace(/\/+$/, '');
}

const msConfigured = () => ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AUTH_REDIRECT_URI'].every((k) => env(k));

function missingAuthSettings() {
  if (localDev()) return [];
  return ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AUTH_REDIRECT_URI', 'SESSION_SECRET'].filter((k) => !env(k));
}

// Páginas y rutas que no piden sesión. La hoja de estilos va abierta porque la usa login.html; no trae datos.
const OPEN = new Set(['/login.html', '/css/app.css', '/health', '/api/health', '/favicon.ico']);

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

let _cca;
function client() {
  if (!_cca) {
    _cca = new msal.ConfidentialClientApplication({
      auth: { clientId: env('AZURE_CLIENT_ID'), authority: `https://login.microsoftonline.com/${TENANT()}`, clientSecret: env('AZURE_CLIENT_SECRET') },
      system: { loggerOptions: { loggerCallback() {}, piiLoggingEnabled: false } },
    });
  }
  return _cca;
}

function sessionMiddleware(prefix) {
  let secret = env('SESSION_SECRET');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    console.warn('SESSION_SECRET no está definido: se usa uno aleatorio y las sesiones terminan en cada reinicio.');
  }
  let store;
  if (hasDb()) {
    const MySQLStore = require('express-mysql-session')(session);
    store = new MySQLStore({
      ...dbOptions(),
      createDatabaseTable: true,
      clearExpired: true,
      checkExpirationInterval: 15 * 60e3,
      expiration: HOURS() * 3600e3,
      schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
    });
  } else {
    console.warn('Sin base de datos: las sesiones quedan en memoria (solo pruebas locales).');
  }
  const inner = session({
    name: COOKIE,
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    proxy: true, // la URL pública es HTTPS en el proxy; se lee X-Forwarded-Proto para la cookie segura
    cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: `${prefix}/`, maxAge: HOURS() * 3600e3 },
  });
  // El proxy quita /run/<id> antes de reenviar, pero express-session compara la ruta de la cookie
  // con req.originalUrl y omite la sesión si no coinciden. Se muestra la ruta pública solo en esa llamada.
  return function sessionWithPublicPath(req, res, next) {
    const orig = req.originalUrl;
    if (!prefix || orig === prefix || orig.startsWith(`${prefix}/`)) return inner(req, res, next);
    req.originalUrl = prefix + orig;
    try {
      inner(req, res, next);
    } finally {
      if (req.originalUrl === prefix + orig) req.originalUrl = orig;
    }
  };
}

const REASONS = {
  tenant: 'Esta cuenta pertenece a otra organización. Solo se aceptan cuentas de think4ever.',
  domain: () => `Solo se aceptan cuentas @${DOMAIN()}. Inicia sesión con tu cuenta de think4ever.`,
  guest: 'Las cuentas invitadas (de otros dominios) no tienen acceso. Usa tu cuenta de think4ever.',
  disabled: 'Tu usuario está desactivado. Pide acceso al equipo de Research.',
  conflict: 'Ya existe un usuario con este correo vinculado a otra cuenta. Pide ayuda al equipo de Research.',
  not_configured: 'El inicio de sesión con Microsoft todavía no está configurado. Avisa al equipo de Research.',
  cancelled: 'Se canceló el inicio de sesión con Microsoft.',
  state: 'La solicitud de inicio de sesión expiró o no es válida. Inténtalo de nuevo.',
  token: 'No pudimos validar tu cuenta con Microsoft. Inténtalo de nuevo.',
  session: 'No pudimos iniciar tu sesión. Inténtalo de nuevo.',
};

// Redirecciones siempre RELATIVAS: el proxy quita /run/<id> y una ruta absoluta se saldría de la app.
// "" en la raíz, "../" bajo auth/, "../../" bajo auth/microsoft/...
function toRoot(reqPath) {
  const depth = Math.max(0, String(reqPath).split('/').length - 2);
  return '../'.repeat(depth);
}

function deny(req, res, reason) {
  console.warn('auth rechazado:', reason);
  const r = REASONS[reason] || REASONS.token;
  const msg = typeof r === 'function' ? r() : r;
  res.status(403).type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acceso · Cola de escucha</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:0 16px;background:#f6f7f9;color:#1d2330}
.box{max-width:420px;background:#fff;border:1px solid #dfe3ea;border-radius:8px;padding:20px}a{color:#2457d6}</style></head>
<body><div class="box"><h1 style="font-size:19px;margin:0 0 8px">No se pudo entrar</h1><p>${msg}</p>
<p><a href="${toRoot(req.path)}login.html">Volver a iniciar sesión</a></p></div></body></html>`);
}

function logoutUrl(req, prefix) {
  if (!msConfigured()) return `${toRoot(req.path)}login.html`;
  let origin = '';
  try { origin = new URL(env('AUTH_REDIRECT_URI')).origin; } catch (e) { origin = `${req.protocol}://${req.get('host')}`; }
  const back = `${origin}${prefix}/login.html`;
  return `https://login.microsoftonline.com/${encodeURIComponent(TENANT())}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(back)}`;
}

function requireAuth(req, res, next) {
  if (OPEN.has(req.path) || req.path.startsWith('/auth/')) return next();
  if (localDev()) {
    req.user = { email: env('LOCAL_DEV_USER') || 'local-dev@think4ever.com', name: 'Desarrollo local' };
    return next();
  }
  const u = req.session && req.session.user;
  if (u) {
    req.user = { email: u.email, name: u.name };
    return next();
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'auth' });
  return res.redirect(`${toRoot(req.path)}login.html`);
}

// Las reglas del token, separadas para poder probarlas sin Microsoft.
function checkClaims(c, tenant = TENANT(), domain = DOMAIN()) {
  const tid = String(c.tid || '').toLowerCase();
  if (!tid || !sameText(tid, String(tenant).toLowerCase())) return { reason: 'tenant' };
  // Invitados (B2B): su claim idp apunta al emisor de su propia organización.
  if (c.idp && String(c.idp).toLowerCase().replace(/\/+$/, '') !== `https://sts.windows.net/${tid}`) return { reason: 'guest' };
  const email = String(c.email || c.preferred_username || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !email.endsWith(`@${domain}`)) return { reason: 'domain' };
  if (!c.oid) return { reason: 'token' };
  return { email, oid: String(c.oid), name: String(c.name || email).slice(0, 255) };
}

function mount(app) {
  const prefix = publicPrefix();
  if (!localDev()) app.use(sessionMiddleware(prefix));

  app.get('/auth/login', async (req, res) => {
    if (localDev()) return res.redirect(toRoot(req.path) || './');
    if (!msConfigured()) return deny(req, res, 'not_configured');
    try {
      const { verifier, challenge } = await new msal.CryptoProvider().generatePkceCodes();
      const state = crypto.randomBytes(24).toString('base64url');
      req.session.msAuth = { state, verifier, at: Date.now() };
      const url = await client().getAuthCodeUrl({
        scopes: SCOPES, redirectUri: env('AUTH_REDIRECT_URI'), state,
        codeChallenge: challenge, codeChallengeMethod: 'S256', prompt: 'select_account',
      });
      req.session.save((err) => (err ? deny(req, res, 'session') : res.redirect(url)));
    } catch (e) {
      console.error('auth login', e.errorCode || e.message);
      deny(req, res, 'token');
    }
  });

  // Las dos direcciones hacen lo mismo; el tablero registra auth/microsoft/callback en Entra.
  app.get(['/auth/callback', '/auth/microsoft/callback'], async (req, res) => {
    if (!msConfigured()) return deny(req, res, 'not_configured');
    const pending = req.session && req.session.msAuth;
    if (req.session) delete req.session.msAuth;
    if (req.query.error) return deny(req, res, req.query.error === 'access_denied' ? 'cancelled' : 'token');
    if (!pending || !req.query.state || !req.query.code || Date.now() - pending.at > 15 * 60e3
      || !sameText(req.query.state, pending.state)) return deny(req, res, 'state');

    let result;
    try {
      result = await client().acquireTokenByCode({
        code: String(req.query.code), scopes: SCOPES, redirectUri: env('AUTH_REDIRECT_URI'), codeVerifier: pending.verifier,
      });
    } catch (e) {
      console.warn('auth token', e.errorCode || e.message);
      return deny(req, res, 'token');
    }
    const claims = checkClaims((result && result.idTokenClaims) || {});
    if (claims.reason) return deny(req, res, claims.reason);

    let user;
    try {
      const db = getPool();
      await db.query(
        `INSERT INTO users (entra_oid, email, display_name, last_login_at) VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           email = IF(entra_oid = VALUES(entra_oid), VALUES(email), email),
           display_name = IF(entra_oid = VALUES(entra_oid), VALUES(display_name), display_name),
           last_login_at = IF(entra_oid = VALUES(entra_oid), NOW(), last_login_at)`,
        [claims.oid, claims.email, claims.name]);
      const [rows] = await db.query('SELECT id, email, display_name, status FROM users WHERE entra_oid = ?', [claims.oid]);
      user = rows[0];
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return deny(req, res, 'conflict');
      console.error('auth usuario', e.message);
      return deny(req, res, 'session');
    }
    if (!user) return deny(req, res, 'conflict');
    if (user.status === 'disabled') return deny(req, res, 'disabled');

    req.session.regenerate((err) => {
      if (err) return deny(req, res, 'session');
      req.session.user = { id: user.id, email: user.email, name: user.display_name || user.email };
      req.session.save((e) => (e ? deny(req, res, 'session') : res.redirect(toRoot(req.path) || './')));
    });
  });

  app.get('/auth/logout', (req, res) => {
    const done = () => {
      res.clearCookie(COOKIE, { path: `${prefix}/`, httpOnly: true, secure: true, sameSite: 'lax' });
      res.redirect(logoutUrl(req, prefix));
    };
    if (req.session) req.session.destroy(() => done()); else done();
  });

  app.use(requireAuth);
}

module.exports = { mount, requireAuth, missingAuthSettings, msConfigured, publicPrefix, toRoot, checkClaims, localDev };
