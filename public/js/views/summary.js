'use strict';
/* Resumen: cuánto hay en cada estado, mi tope del día, la fase de enlaces y la última corrida. */
(function (A) {
  const U = A.ui, esc = U.esc;
  const R = { runs: null, running: false, error: '' };

  async function load() {
    try {
      const [runs] = await Promise.all([A.api('api/runs'), A.refreshCounts()]);
      R.runs = runs.runs; R.running = runs.running; R.error = '';
    } catch (e) { R.error = e.message; R.runs = R.runs || []; }
    if (A.S.tab === 'resumen') A.render();
  }
  A.lastRunLine = (r, running) => {
    if (running) return `${U.icon('spinner', 'fa-solid', 'fa-spin')} Hay una corrida en curso.`;
    if (!r) return 'Todavía no hay corridas.';
    const errs = (r.errors || []).length;
    return `${esc(U.when(r.started_at))} · ${esc(r.trigger_by)} · ${U.fmt(r.fetched)} leídos, ${U.fmt(r.new_threads)} nuevos, ${U.fmt(r.drafted)} revisados por Claude${errs ? ` · <span style="color:var(--color-warning)">${errs} con error</span>` : ''}${r.finished_at ? '' : ' · sin terminar'}`;
  };

  A.views.resumen = {
    title: 'Resumen',
    enter() { load(); },
    render() {
      const c = A.S.counts || {}, me = A.S.me || {};
      const n = (k) => U.fmt(c[k] || 0);
      const last = R.runs && R.runs[0];
      return `
        ${U.kpiRow([
          U.kpi({ label: 'En cola', source: 'por revisar', value: n('en_cola'), hero: true, go: 'en_cola', compare: 'Borradores listos para revisión' }),
          U.kpi({ label: 'Aprobados', source: 'por publicar', value: n('aprobado'), go: 'aprobado', compare: 'Esperan que alguien los publique' }),
          U.kpi({ label: 'Publicados', source: 'total', value: n('publicado'), go: 'publicado', compare: 'Con URL registrada' }),
          U.kpi({ label: 'Mis publicaciones hoy', source: 'Bogotá', value: me.maxPostsPerDay ? `${U.fmt(me.postsToday)}<span class="text-muted" style="font-size:18px"> / ${U.fmt(me.maxPostsPerDay)}</span>` : '–', compare: 'Tope diario por persona' }),
        ], 4)}
        <div class="grid-2 mt-16">
          ${U.card({
            title: 'Última corrida', sub: 'La búsqueda corre a diario dentro del servicio. "Buscar ahora" la lanza a mano.',
            right: `<button type="button" class="btn btn-secondary btn-sm" data-go="corridas">${U.icon('rotate')}Ver corridas</button>`,
            body: R.runs == null ? U.loading() : R.error ? `<p class="text-muted">${esc(R.error)}</p>` : `<p>${A.lastRunLine(last, R.running)}</p>`,
          })}
          ${U.card({
            title: 'Reglas activas', sub: 'Vienen de las variables del servicio.',
            body: `<dl class="kv compact">
              <dt>Enlaces</dt><dd>${me.linksEnabled ? U.pill('success', 'Activos: un enlace con UTM', true) : U.pill('warning', 'Fase sin enlaces', true)}</dd>
              <dt>Aprobación</dt><dd>${me.requireDistinctApprover ? 'Quien edita no aprueba' : 'Cualquiera puede aprobar'}</dd>
              <dt>Tope diario</dt><dd>${esc(me.maxPostsPerDay ?? '–')} publicaciones por persona</dd>
              <dt>Publicar</dt><dd>Lo hace una persona desde su propia cuenta</dd>
            </dl>`,
          })}
        </div>
        ${U.card({
          cls: 'mt-16', title: 'Archivo',
          body: U.kpiRow([
            U.kpi({ label: 'Descartados', value: n('descartado'), small: true, go: 'descartado' }),
            U.kpi({ label: 'No relevantes', value: n('no_relevante'), small: true, go: 'no_relevante' }),
            U.kpi({ label: 'Pendientes de Claude', value: n('pendiente'), small: true, compare: 'Pasaron el filtro; se redactan en la próxima corrida' }),
            U.kpi({ label: 'Errores', value: n('error'), small: true, go: 'error' }),
          ], 4),
        })}`;
    },
  };
})(window.App);
