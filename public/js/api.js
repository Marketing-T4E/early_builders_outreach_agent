'use strict';
/* Toda llamada al servidor pasa por aquí. Con la sesión vencida vuelve a login.html.
   Las peticiones que cambian datos van como JSON (el servidor rechaza lo demás). */
window.App = window.App || {};
(function (A) {
  A.views = A.views || {};
  A.store = function (k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  };
  async function request(path, opts = {}, asText = false) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const r = await fetch(path, { credentials: 'same-origin', ...opts, headers });
    if (r.status === 401) { location.href = 'login.html'; throw new Error('Sesión vencida'); }
    if (asText && r.ok) return r.text();
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  }
  A.api = (path) => request(path);
  A.apiText = (path) => request(path, {}, true);
  A.send = (path, body = {}, method = 'POST') => request(path, { method, body: JSON.stringify(body) });
})(window.App);
