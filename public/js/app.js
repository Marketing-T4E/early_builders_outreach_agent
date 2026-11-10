'use strict';
/* Arranque, estado compartido y controles de la barra superior y el menú lateral. */
(function (A) {
  const U = A.ui;
  const S = A.S = { tab: null, me: null, counts: {}, source: A.store('escucha-source') || '', leaving: false };

  // ---------- tema: el del sistema operativo hasta que la persona elija; se recuerda por navegador
  const root = document.documentElement;
  const saved = A.store('escucha-theme');
  root.dataset.theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.getElementById('theme-btn').addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    A.store('escucha-theme', root.dataset.theme);
  });

  // ---------- quién soy, tope del día, fase de enlaces
  A.loadMe = async () => {
    try { S.me = await A.api('api/me'); } catch (e) { U.toast(e.message, 'error'); return; }
    const u = S.me.user;
    const name = u.name || u.email;
    document.getElementById('user-avatar').textContent = name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('');
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-name').title = u.email;
    document.getElementById('user-role').textContent = `Publicadas hoy ${S.me.postsToday}/${S.me.maxPostsPerDay}`;
    document.getElementById('links-foot').textContent = S.me.linksEnabled ? 'Enlaces activos' : 'Fase sin enlaces';
    document.getElementById('links-dot').style.background = S.me.linksEnabled ? '' : 'var(--color-warning)';
  };

  // ---------- contadores del menú
  A.setCounts = (counts) => {
    S.counts = counts || {};
    document.querySelectorAll('[data-count]').forEach((el) => {
      const n = S.counts[el.dataset.count] || 0;
      el.textContent = n ? U.fmt(n) : '';
      el.classList.toggle('hot', el.dataset.count === 'en_cola' && n > 0);
    });
  };
  A.refreshCounts = async () => {
    try { A.setCounts((await A.api('api/queue?status=en_cola&limit=1')).counts); } catch (e) { /* la vista muestra su propio error */ }
  };

  // ---------- filtro de fuente (aplica a las vistas de la cola)
  const sourceSel = document.getElementById('source');
  sourceSel.value = S.source;
  sourceSel.addEventListener('change', async () => {
    if (!(await A.leaveOk())) { sourceSel.value = S.source; return; }
    S.source = sourceSel.value;
    A.store('escucha-source', S.source);
    const view = A.views[S.tab];
    if (view.enter) view.enter();
    A.render();
  });

  // ---------- buscar ahora
  document.getElementById('scan-btn').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      await A.send('api/scan');
      U.toast('Búsqueda iniciada. Toma unos minutos; mira el avance en Corridas.');
      if (['corridas', 'resumen'].includes(S.tab)) setTimeout(() => A.views[S.tab].enter(), 1500);
    } catch (err) { U.toast(err.message, 'error'); }
    finally { setTimeout(() => { b.disabled = false; }, 3000); }
  });

  // ---------- arranque
  A.loadMe();
  A.refreshCounts();
  A.setTab(location.hash.slice(1) || 'en_cola');
  if (location.hash.slice(1) !== S.tab) history.replaceState(null, '', `#${S.tab}`);
})(window.App);
