'use strict';
/* Bloques de interfaz compartidos (mismo patrón que latam_growth/public/js/ui.js):
   escape, fechas en hora de Bogotá, pills, tarjetas, KPI, tablas, toast y diálogos. */
(function (A) {
  const U = A.ui = {};
  const esc = U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.icon = (name, style = 'fa-solid', cls = '') => `<i class="${style} fa-${name}${cls ? ' ' + cls : ''}" aria-hidden="true"></i>`;
  U.fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-CO') : '–');

  // ---------- fechas: la base devuelve texto UTC "YYYY-MM-DD HH:MM:SS"
  U.parse = (s) => {
    if (!s) return null;
    const iso = String(s).trim().replace(' ', 'T');
    const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const FMT = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  U.when = (s) => { const d = U.parse(s); return d ? FMT.format(d) : '–'; };
  U.ago = (s) => {
    const d = U.parse(s); if (!d) return '';
    const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 6e4));
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 48) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} d`;
  };

  // ---------- fuentes
  const SRC = U.SRC = { reddit: 'Reddit', hn: 'Hacker News', github: 'GitHub' };
  U.source = (key, community) => `<span class="src-dot src-${esc(key)}" aria-hidden="true"></span><span class="community">${esc(SRC[key] || key)}${community ? ` · ${esc(community)}` : ''}</span>`;
  U.score = (n) => (n == null ? '' : `<span class="score ${n >= 75 ? 'hi' : n >= 50 ? 'mid' : ''}" title="Relevancia según el agente">${esc(n)}</span>`);
  U.persona = (p) => (p ? esc(String(p).split('-')[0]) : '');

  // ---------- bloques
  U.pill = (kind, text, dot) => `<span class="pill pill-${kind}">${dot ? '<span class="dot"></span>' : ''}${esc(text)}</span>`;
  U.card = (o) => `<section class="card ${o.cls || ''}"${o.id ? ` id="${o.id}"` : ''}><div class="card-header"><div><div class="card-title">${esc(o.title)}</div>${o.sub ? `<div class="card-sub">${o.sub}</div>` : ''}</div>${o.right || ''}</div>${o.body || ''}</section>`;
  U.kpi = (o) => `<div class="kpi-tile${o.go ? ' link' : ''}"${o.go ? ` data-go="${esc(o.go)}" role="link" tabindex="0"` : ''}><div class="kpi-label">${esc(o.label)}<span class="kpi-source">${esc(o.source || '')}</span></div><div class="kpi-value${o.hero ? ' hero' : ''}${o.small ? ' small' : ''}">${o.value}</div><div class="kpi-compare">${o.compare || ''}</div></div>`;
  U.kpiRow = (tiles, cols) => `<div class="kpi-row${cols ? ` cols-${cols}` : ''}">${tiles.filter(Boolean).join('')}</div>`;
  U.empty = (title, text, icon = 'inbox') => `<div class="empty-state slim">${U.icon(icon)}<b>${esc(title)}</b>${text ? `<span>${text}</span>` : ''}</div>`;
  U.loading = (text = 'Cargando…') => `<div class="loading">${U.icon('spinner', 'fa-solid', 'fa-spin')}${esc(text)}</div>`;
  U.table = (cols, rows) => `<div class="tbl-wrap"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? 'td-num' : ''}">${esc(c.t)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'td-num' : ''}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  U.download = (name, text, type = 'text/markdown') => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  U.toast = (text, kind = '') => {
    const el = document.getElementById('toast');
    el.innerHTML = `${U.icon(kind === 'error' ? 'circle-exclamation' : 'circle-check')}<span>${esc(text)}</span>`;
    el.className = `toast show ${kind}`;
    clearTimeout(U.toastTimer);
    U.toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 6000 : 3500);
  };

  // ---------- diálogos: confirmar, o pedir un texto (con validación opcional antes de cerrar)
  function modal(html, onReady) {
    return new Promise((resolve) => {
      const root = document.getElementById('modal-root');
      const prev = document.activeElement;
      root.innerHTML = `<div class="modal-backdrop"><form class="modal" role="dialog" aria-modal="true">${html}</form></div>`;
      const done = (v) => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') done(null); };
      document.addEventListener('keydown', onKey);
      const backdrop = root.querySelector('.modal-backdrop');
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-m="0"]')) done(null); });
      onReady(root.querySelector('.modal'), done);
    });
  }
  U.confirm = (message, okText = 'Confirmar', danger = true) => modal(
    `<p class="modal-text">${esc(message)}</p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-m="0">Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(okText)}</button></div>`,
    (form, done) => { form.addEventListener('submit', (e) => { e.preventDefault(); done(true); }); form.querySelector('button:not([type])').focus(); },
  ).then(Boolean);
  U.prompt = (o) => modal(
    `<p class="modal-text">${esc(o.message)}</p>
     <label class="modal-field"><span>${esc(o.label)}</span><input name="v" type="${o.type || 'text'}" placeholder="${esc(o.placeholder || '')}" autocomplete="off"${o.required ? ' required' : ''}></label>
     <div class="modal-error" role="alert"></div>
     <div class="modal-actions"><button type="button" class="btn btn-secondary" data-m="0">Cancelar</button><button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}">${esc(o.okText || 'Aceptar')}</button></div>`,
    (form, done) => {
      const input = form.querySelector('input');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = input.value.trim();
        const err = o.validate ? o.validate(v) : '';
        if (err) { form.querySelector('.modal-error').textContent = err; input.focus(); return; }
        done(v);
      });
      input.focus();
    },
  );
})(window.App);
