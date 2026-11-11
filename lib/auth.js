'use strict';
// SIN LOGIN, temporal (fase de QA, desde 2026-11-10): el inicio de sesión con Microsoft se quitó hasta
// nuevo aviso, junto con sus variables de Azure y de sesión. Cualquiera con el
// enlace entra y todas las acciones quedan a nombre de un único usuario de QA.
// Para restaurar el login: recuperar lib/auth.js, server.js, login.html y las dependencias del commit
// 4ff4141 (adaptado de latam_growth/lib/msauth.js).

const QA_USER = Object.freeze({ email: 'qa@think4ever.com', name: 'QA (sin login)' });

function requireAuth(req, res, next) {
  req.user = { ...QA_USER };
  next();
}

function mount(app) {
  // Las rutas del login anterior llevan a la app (enlaces viejos o marcadores).
  app.get(['/auth/login', '/auth/logout', '/auth/callback', '/auth/microsoft/callback', '/login.html'], (req, res) => {
    const depth = Math.max(0, req.path.split('/').length - 2);
    res.redirect('../'.repeat(depth) || './');
  });
  app.use(requireAuth);
}

const authMode = () => 'open';

module.exports = { mount, requireAuth, authMode, QA_USER };
