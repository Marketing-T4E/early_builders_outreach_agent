'use strict';
/* Corridas: las últimas 10 búsquedas, con lo que trajo cada una y sus errores. */
(function (A) {
  const U = A.ui, esc = U.esc;
  const R = { runs: null, running: false, error: '' };

  async function load() {
    try { const d = await A.api('api/runs'); R.runs = d.runs; R.running = d.running; R.error = ''; } catch (e) { R.error = e.message; R.runs = R.runs || []; }
    if (A.S.tab === 'corridas') A.render();
  }
  const duration = (r) => {
    const a = U.parse(r.started_at), b = U.parse(r.finished_at);
    if (!a || !b) return '–';
    const s = Math.round((b - a) / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
  };
  const errors = (r) => {
    const e = r.errors || [];
    if (!e.length) return U.pill('success', 'Sin errores');
    return `<details><summary class="linkish">${e.length} error${e.length > 1 ? 'es' : ''}</summary><ul class="history" style="margin-top:6px">${e.map((x) => `<li>${esc(typeof x === 'string' ? x : JSON.stringify(x))}</li>`).join('')}</ul></details>`;
  };

  A.views.corridas = {
    title: 'Corridas',
    enter() { R.runs = null; load(); },
    render() {
      const body = R.runs == null ? U.loading()
        : R.error ? U.empty('No se pudieron cargar las corridas', esc(R.error), 'triangle-exclamation')
        : !R.runs.length ? U.empty('Todavía no hay corridas', 'Usa "Buscar ahora" o espera la corrida diaria.', 'rotate')
        : U.table([
          { t: 'Inicio', f: (r) => `${esc(U.when(r.started_at))}<br><small>${esc(U.ago(r.started_at))}</small>` },
          { t: 'Lanzada por', f: (r) => esc(r.trigger_by) },
          { t: 'Duración', f: (r) => (r.finished_at ? duration(r) : U.pill('warning', R.running ? 'En curso' : 'Sin terminar', true)) },
          { t: 'Leídos', num: 1, f: (r) => U.fmt(r.fetched) },
          { t: 'Pasan filtro', num: 1, f: (r) => U.fmt(r.candidates) },
          { t: 'Nuevos', num: 1, f: (r) => U.fmt(r.new_threads) },
          { t: 'Revisados por Claude', num: 1, f: (r) => U.fmt(r.drafted) },
          { t: 'Errores', f: errors },
        ], R.runs);
      return U.card({
        title: 'Últimas corridas',
        sub: R.running ? `${U.icon('spinner', 'fa-solid', 'fa-spin')} Hay una corrida en curso. Toma unos minutos.` : 'Leídos: todo lo que trajeron las fuentes. Pasan filtro: lo que llega a Claude. Nuevos: hilos que no estaban. Revisados por Claude: hilos que Claude clasificó; solo los relevantes (puntaje ≥ MIN_RELEVANCE) pasan a En cola, el resto a No relevantes.',
        right: `<button type="button" class="btn btn-secondary btn-sm" id="runs-refresh">${U.icon('arrows-rotate')}Actualizar</button>`,
        body,
      });
    },
    mount(el) { el.querySelector('#runs-refresh').addEventListener('click', load); },
  };
})(window.App);
