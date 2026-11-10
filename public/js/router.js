'use strict';
/* Router por hash: un módulo de vista por opción del menú, dibujado dentro de #view.
   Si el borrador tiene cambios sin guardar, pregunta antes de salir. */
(function (A) {
  const U = A.ui;
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const closeNav = () => { sidebar.classList.remove('open'); scrim.classList.remove('show'); };

  A.dirty = A.dirty || (() => false); // la vista de la cola (cargada antes) define el real
  A.leaveOk = async () => !A.dirty() || U.confirm('Tienes cambios sin guardar en el borrador. ¿Salir sin guardarlos?', 'Salir sin guardar');

  A.resolve = (name) => (A.views[name] ? name : 'en_cola');
  A.go = async (name) => {
    const n = A.resolve(name);
    closeNav();
    if (n === A.S.tab) return;
    if (!(await A.leaveOk())) return;
    A.S.leaving = true;
    location.hash = n; // hashchange dibuja
  };
  A.setTab = (name) => {
    A.S.tab = A.resolve(name);
    const view = A.views[A.S.tab];
    if (view.enter) view.enter();
    A.render();
    window.scrollTo({ top: 0 });
  };
  window.addEventListener('hashchange', async () => {
    const n = A.resolve(location.hash.slice(1));
    if (n === A.S.tab) return;
    // Cambio por atrás/adelante del navegador: también protege el borrador.
    if (!A.S.leaving && !(await A.leaveOk())) { history.replaceState(null, '', `#${A.S.tab}`); return; }
    A.S.leaving = false;
    A.setTab(n);
  });

  A.render = () => {
    const S = A.S, view = A.views[S.tab];
    document.body.dataset.page = S.tab;
    document.querySelectorAll('#sidebar [data-page]').forEach((b) => {
      const on = b.dataset.page === S.tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.getElementById('page-title').textContent = view.title;
    document.title = `${view.title} · Escucha`;
    document.getElementById('source').hidden = !view.usesSource;
    const host = document.getElementById('view');
    const el = document.createElement('div');
    el.className = `view view-${S.tab} fade-in`;
    try { el.innerHTML = view.render(); } catch (e) {
      console.error(e);
      el.innerHTML = `<section class="card">${U.empty('No se pudo dibujar esta pantalla', U.esc(e.message), 'triangle-exclamation')}</section>`;
    }
    host.replaceChildren(el);
    if (view.mount) view.mount(el);
  };

  sidebar.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) A.go(b.dataset.page); });
  document.getElementById('nav-toggle').addEventListener('click', () => { sidebar.classList.add('open'); scrim.classList.add('show'); });
  scrim.addEventListener('click', closeNav);
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); A.go(g.dataset.go); } });
  document.addEventListener('keydown', (e) => {
    const g = e.target.closest && e.target.closest('[data-go]');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); A.go(g.dataset.go); }
  });
  window.addEventListener('beforeunload', (e) => { if (A.dirty()) { e.preventDefault(); e.returnValue = ''; } });
})(window.App);
