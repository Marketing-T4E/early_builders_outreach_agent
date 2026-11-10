'use strict';
/* Reporte en Markdown para las tasks #229 y #231: se ve aquí, se copia o se descarga. */
(function (A) {
  const U = A.ui, esc = U.esc;
  const R = { days: 7, md: null, error: '', loading: false };

  async function load() {
    R.loading = true; R.error = '';
    if (A.S.tab === 'reporte') A.render();
    try { R.md = await A.apiText(`api/report?days=${R.days}`); } catch (e) { R.error = e.message; }
    R.loading = false;
    if (A.S.tab === 'reporte') A.render();
  }

  A.views.reporte = {
    title: 'Reporte',
    enter() { if (R.md == null) load(); },
    render() {
      const body = R.loading ? U.loading('Armando el reporte…')
        : R.error ? U.empty('No se pudo armar el reporte', esc(R.error), 'triangle-exclamation')
        : `<pre class="code-block report-md">${esc(R.md || '')}</pre>`;
      return U.card({
        title: `Reporte de los últimos ${R.days} días`,
        sub: 'Hilos por comunidad, tema y persona; preguntas más relevantes; ideas de contenido; lo publicado. Insumo de las tasks #229 y #231.',
        right: `<div class="card-actions">
          <select id="rep-days" aria-label="Días" style="width:auto;height:30px">${[7, 14, 30, 90].map((d) => `<option value="${d}"${d === R.days ? ' selected' : ''}>${d} días</option>`).join('')}</select>
          <button type="button" class="btn btn-secondary btn-sm" id="rep-copy" ${R.md ? '' : 'disabled'}>${U.icon('copy', 'fa-regular')}Copiar</button>
          <button type="button" class="btn btn-primary btn-sm" id="rep-dl" ${R.md ? '' : 'disabled'}>${U.icon('download')}Descargar .md</button>
        </div>`,
        body,
      });
    },
    mount(el) {
      el.querySelector('#rep-days').addEventListener('change', (e) => { R.days = Number(e.target.value); load(); });
      el.querySelector('#rep-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(R.md); U.toast('Reporte copiado.'); } catch (e) { U.toast('No se pudo copiar; usa Descargar.', 'error'); }
      });
      el.querySelector('#rep-dl').addEventListener('click', () => U.download(`reporte-escucha-${R.days}d-${new Date().toISOString().slice(0, 10)}.md`, R.md));
    },
  };
})(window.App);
