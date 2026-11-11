'use strict';
/* La cola: un mismo módulo para cada estado (en cola, aprobados, publicados, descartados, no relevantes, errores).
   Lista a la izquierda, detalle del hilo a la derecha. Las reglas las aplica el servidor; aquí solo se muestran
   y se desactivan los botones que el servidor rechazaría. */
(function (A) {
  const U = A.ui, esc = U.esc;
  const STATUSES = {
    en_cola: { title: 'En cola', sub: 'Borradores listos para revisar. Editar borra la aprobación; quien edita no aprueba.', empty: 'No hay borradores en cola.' },
    aprobado: { title: 'Aprobados', sub: 'Listos para publicar. Copia la respuesta, publícala desde tu propia cuenta y registra la URL.', empty: 'No hay respuestas aprobadas.' },
    publicado: { title: 'Publicados', sub: 'Respuestas publicadas, con la persona y la URL.', empty: 'Aún no hay respuestas publicadas.' },
    descartado: { title: 'Descartados', sub: 'Hilos que una persona descartó, con el motivo.', empty: 'No hay hilos descartados.' },
    no_relevante: { title: 'No relevantes', sub: 'Hilos que pasaron el filtro previo pero el agente marcó como no relevantes. Sirven para afinar el filtro.', empty: 'No hay hilos en este estado.' },
    error: { title: 'Errores', sub: 'Hilos que fallaron al clasificar o redactar. El motivo está en el detalle.', empty: 'Sin errores.' },
  };
  const STATUS_PILL = { en_cola: ['info', 'En cola'], aprobado: ['success', 'Aprobado'], publicado: ['success', 'Publicado'], descartado: ['neutral', 'Descartado'], no_relevante: ['neutral', 'No relevante'], error: ['error', 'Error'], pendiente: ['warning', 'Pendiente'] };
  const POSTED_HOSTS = { reddit: /(^|\.)reddit\.com$/, hn: /^news\.ycombinator\.com$/, github: /^github\.com$/ };
  const ACTIONS = { redactado: 'El agente redactó el borrador', editado: 'editó el borrador', aprobado: 'aprobó', publicado: 'registró la publicación', descartado: 'descartó', error: 'error del agente' };

  const Q = { status: 'en_cola', items: null, sel: null, detail: null, detailLoading: false, error: '', draft: null };
  const editable = (t) => t && ['en_cola', 'aprobado'].includes(t.status);
  A.dirty = () => Boolean(Q.detail && editable(Q.detail) && Q.draft != null && Q.draft !== (Q.detail.reply || ''));

  async function loadList() {
    const status = Q.status;
    try {
      const q = new URLSearchParams({ status });
      if (A.S.source) q.set('source', A.S.source);
      const data = await A.api(`api/queue?${q}`);
      if (status !== Q.status) return;
      Q.items = data.items; Q.error = '';
      A.setCounts(data.counts);
    } catch (e) { Q.error = e.message; Q.items = Q.items || []; }
    if (A.S.tab === status) A.render();
  }

  async function select(id) {
    if (id === Q.sel) return;
    if (!(await A.leaveOk())) return;
    Q.sel = id; Q.detail = null; Q.draft = null; Q.detailLoading = true;
    paintSelection(); paintDetail();
    // En pantallas angostas el detalle queda debajo de la lista: llévalo a la vista.
    if (window.matchMedia('(max-width: 1100px)').matches) document.getElementById('detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { Q.detail = await A.api(`api/threads/${id}`); } catch (e) { U.toast(e.message, 'error'); }
    Q.detailLoading = false;
    if (Q.sel === id) paintDetail();
  }

  // Acción sobre el hilo: el servidor devuelve el hilo actualizado.
  async function act(path, body, okMsg) {
    try {
      Q.detail = await A.send(`api/threads/${Q.detail.id}${path}`, body, path ? 'POST' : 'PATCH');
      Q.draft = null;
      U.toast(okMsg);
      await Promise.all([loadList(), A.loadMe()]);
    } catch (e) { U.toast(e.message, 'error'); }
  }

  // ---------- lista
  function card(t) {
    const st = t.status !== Q.status ? U.pill(...STATUS_PILL[t.status] || ['neutral', t.status]) : '';
    return `<button type="button" class="thread-card${t.id === Q.sel ? ' is-selected' : ''}" data-id="${t.id}" aria-pressed="${t.id === Q.sel}">
      <div class="thread-top">${U.source(t.source, t.community)}<span class="age" title="${esc(U.when(t.thread_created_at || t.found_at))}">${esc(U.ago(t.thread_created_at || t.found_at))}</span></div>
      <div class="thread-title">${esc(t.title)}</div>
      <div class="thread-pills">${U.score(t.relevance_score)}${t.persona ? U.pill('neutral', U.persona(t.persona)) : ''}${t.theme ? U.pill('neutral', t.theme) : ''}${t.language ? U.pill('neutral', t.language) : ''}
        ${t.lint && !t.lint.ok ? U.pill('error', 'Revisar', true) : ''}${t.risks && t.risks.length ? U.pill('warning', 'Riesgos', true) : ''}${st}</div>
    </button>`;
  }
  function list() {
    if (Q.items == null) return U.loading('Cargando hilos…');
    if (Q.error) return `<section class="card">${U.empty('No se pudo cargar la cola', esc(Q.error), 'triangle-exclamation')}</section>`;
    if (!Q.items.length) return `<section class="card">${U.empty(STATUSES[Q.status].empty, A.S.source ? `Filtro: ${esc(U.SRC[A.S.source])}.` : '')}</section>`;
    return Q.items.map(card).join('');
  }
  function paintSelection() {
    document.querySelectorAll('.thread-card').forEach((c) => {
      const on = Number(c.dataset.id) === Q.sel;
      c.classList.toggle('is-selected', on); c.setAttribute('aria-pressed', on);
    });
  }

  // ---------- detalle
  function lintBlock(t) {
    const issues = (t.lint && t.lint.issues) || [];
    if (!issues.length) return `<div class="callout callout-success">${U.icon('circle-check')}<span>Revisión automática sin observaciones.</span></div>`;
    const bad = issues.some((i) => i.level === 'error');
    return `<div class="callout ${bad ? 'callout-error' : 'callout-warning'}">${U.icon(bad ? 'circle-xmark' : 'triangle-exclamation')}<ul class="issues">${issues.map((i) => `<li class="${i.level === 'error' ? 'error' : 'warning'}">${U.icon(i.level === 'error' ? 'xmark' : 'exclamation')}<span>${esc(i.msg)}</span></li>`).join('')}</ul></div>`;
  }
  function approveBlock(t) {
    if (t.status !== 'en_cola') return { disabled: true, why: '' };
    const me = A.S.me;
    if (A.dirty()) return { disabled: true, why: 'Guarda los cambios antes de aprobar.' };
    if (!t.lint || !t.lint.ok) return { disabled: true, why: 'La revisión automática tiene errores: corrígelos antes de aprobar.' };
    if (me && me.requireDistinctApprover && t.edited_by && t.edited_by.toLowerCase() === me.user.email.toLowerCase()) {
      return { disabled: true, why: 'Tú editaste este borrador: debe aprobarlo otra persona.' };
    }
    return { disabled: false, why: '' };
  }
  function history(t) {
    const ev = t.events || [];
    if (!ev.length) return '';
    const line = (e) => {
      const d = e.detail || {};
      const extra = e.action === 'editado' && d.aprobacion_borrada ? ' (se borró la aprobación)'
        : e.action === 'descartado' && d.reason ? `: ${d.reason}`
        : e.action === 'error' && d.message ? `: ${d.message}` : '';
      const who = e.actor === 'agente' ? '' : `<b>${esc(e.actor)}</b> `;
      return `<li><span>${esc(U.when(e.at))}</span> · ${who}${esc(ACTIONS[e.action] || e.action)}${esc(extra)}</li>`;
    };
    return `<details class="collapsible block"><summary>${U.icon('chevron-right', 'fa-solid', 'chev')}Registro<span class="count">${ev.length}</span></summary><div class="collapsible-body"><div class="pad"><ul class="history">${ev.map(line).join('')}</ul></div></div></details>`;
  }
  function detailHtml() {
    if (Q.detailLoading) return U.loading('Cargando hilo…');
    const t = Q.detail;
    if (!t) return U.empty('Elige un hilo de la lista', 'Aquí ves la pregunta, el borrador y las acciones.', 'hand-pointer');
    const me = A.S.me || {};
    const canEdit = editable(t);
    const reply = Q.draft != null ? Q.draft : (t.reply || '');
    const ap = approveBlock(t);
    const capped = me.postsToday != null && me.postsToday >= me.maxPostsPerDay;
    const [pk, pt] = STATUS_PILL[t.status] || ['neutral', t.status];
    return `
      <div class="card-header">
        <div style="min-width:0;flex:1">
          <div class="thread-top">${U.source(t.source, t.community)}</div>
          <h2 class="detail-title" style="margin-top:6px">${esc(t.title)}</h2>
          <div class="detail-meta">${U.pill(pk, pt, true)}${U.score(t.relevance_score)}${t.persona ? U.pill('neutral', t.persona) : ''}${t.theme ? U.pill('neutral', `tema: ${t.theme}`) : ''}${t.language ? U.pill('neutral', t.language) : ''}</div>
        </div>
        <a class="btn btn-secondary btn-sm" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${U.icon('arrow-up-right-from-square')}Abrir hilo</a>
      </div>
      <dl class="kv compact">
        <dt>Hilo creado</dt><dd>${esc(U.when(t.thread_created_at))} <small class="text-muted">${esc(U.ago(t.thread_created_at))}</small></dd>
        <dt>Encontrado</dt><dd>${esc(U.when(t.found_at))}</dd>
        ${t.matched_terms ? `<dt>Términos</dt><dd>${esc(t.matched_terms)}</dd>` : ''}
      </dl>
      ${t.discard_reason ? `<div class="block callout ${t.status === 'error' ? 'callout-error' : 'callout-info'}">${U.icon(t.status === 'error' ? 'triangle-exclamation' : 'box-archive')}<span><b>${t.status === 'error' ? 'Error' : 'Motivo'}:</b> ${esc(t.discard_reason)}</span></div>` : ''}
      ${t.question_summary ? `<div class="block"><div class="block-label">Pregunta</div><p class="question">${esc(t.question_summary)}</p></div>` : ''}
      <div class="block"><div class="block-label">Extracto del hilo</div><div class="excerpt">${esc(t.excerpt || 'Sin extracto.')}</div></div>
      ${t.risks && t.risks.length ? `<div class="block callout callout-warning">${U.icon('triangle-exclamation')}<div><b>Riesgos</b><ul>${t.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div></div>` : ''}
      ${t.reply != null || canEdit ? `
      <div class="block">
        <div class="block-label">Borrador <small>${t.edited_by ? `editado por ${esc(t.edited_by)} · ${esc(U.when(t.edited_at))}` : 'sin editar (borrador del agente)'} · <span class="char-count" id="char-count">${reply.length}</span> caracteres</small></div>
        <textarea class="reply-box" id="reply" aria-label="Borrador de respuesta" ${canEdit ? '' : 'readonly'}>${esc(reply)}</textarea>
      </div>
      <div class="block"><div class="block-label">Revisión automática</div>${lintBlock(t)}</div>` : ''}
      ${t.link_url ? `<div class="block"><div class="block-label">Enlace con UTM</div><code style="word-break:break-all">${esc(t.link_url)}</code></div>` : ''}
      ${t.content_idea ? `<div class="block"><div class="block-label">Idea de contenido</div><p>${esc(t.content_idea)}</p></div>` : ''}
      ${t.approved_by ? `<p class="card-note">${U.icon('circle-check')} Aprobado por <b>${esc(t.approved_by)}</b> · ${esc(U.when(t.approved_at))}</p>` : ''}
      ${t.posted_url ? `<p class="card-note">${U.icon('paper-plane')} Publicado por <b>${esc(t.posted_by)}</b> · ${esc(U.when(t.posted_at))} · <a href="${esc(t.posted_url)}" target="_blank" rel="noopener noreferrer">ver publicación</a></p>` : ''}
      <div class="action-bar">
        ${t.reply ? `<button type="button" class="btn btn-secondary" data-act="copy">${U.icon('copy', 'fa-regular')}Copiar respuesta</button>` : ''}
        ${canEdit ? `<button type="button" class="btn btn-secondary" data-act="save" ${A.dirty() ? '' : 'disabled'}>${U.icon('floppy-disk', 'fa-regular')}Guardar cambios</button>` : ''}
        <span class="spacer"></span>
        ${!['publicado', 'descartado'].includes(t.status) ? `<button type="button" class="btn btn-ghost" data-act="discard">${U.icon('box-archive')}Descartar</button>` : ''}
        ${t.status === 'en_cola' ? `<button type="button" class="btn btn-primary" data-act="approve" ${ap.disabled ? 'disabled' : ''}>${U.icon('check')}Aprobar</button>` : ''}
        ${t.status === 'aprobado' ? `<button type="button" class="btn btn-primary" data-act="posted" ${capped || A.dirty() ? 'disabled' : ''}>${U.icon('paper-plane')}Marcar publicado</button>` : ''}
        ${ap.why ? `<p class="action-hint" id="action-hint">${esc(ap.why)}</p>` : ''}
        ${t.status === 'aprobado' && capped ? `<p class="action-hint">Llegaste al tope de hoy (${esc(me.maxPostsPerDay)} publicaciones por persona).</p>` : ''}
      </div>
      ${history(t)}`;
  }
  function paintDetail() {
    const box = document.getElementById('detail');
    if (!box) return;
    box.innerHTML = detailHtml();
    wireDetail(box);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    U.toast('Respuesta copiada. Publícala desde tu propia cuenta.');
  }

  function wireDetail(box) {
    const t = Q.detail;
    if (!t) return;
    const ta = box.querySelector('#reply');
    if (ta && !ta.readOnly) {
      ta.addEventListener('input', () => {
        const wasDirty = A.dirty();
        Q.draft = ta.value;
        box.querySelector('#char-count').textContent = ta.value.length;
        if (wasDirty !== A.dirty()) { // cambia qué botones aplican: redibuja solo la barra
          const pos = [ta.selectionStart, ta.selectionEnd];
          paintDetail();
          const nta = document.getElementById('reply');
          nta.focus(); nta.setSelectionRange(pos[0], pos[1]);
        }
      });
    }
    box.querySelector('.action-bar').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const a = b.dataset.act;
      if (a === 'copy') return copy(ta ? ta.value : t.reply);
      if (a === 'save') {
        if (t.status === 'aprobado' && !(await U.confirm('Esta respuesta ya está aprobada. Guardar cambios borra la aprobación y la devuelve a la cola.', 'Guardar y volver a la cola'))) return;
        return act('', { reply: ta.value }, t.status === 'aprobado' ? 'Guardado. Volvió a la cola para aprobación.' : 'Cambios guardados.');
      }
      if (a === 'approve') return act('/approve', { seen: t.edited_at || '' }, 'Aprobado. Ya está en Aprobados.');
      if (a === 'posted') {
        const url = await U.prompt({
          message: 'Pega la URL de la respuesta que publicaste desde tu cuenta.',
          label: 'URL de la publicación', type: 'url', placeholder: 'https://', okText: 'Registrar', required: true,
          validate: (v) => {
            let u; try { u = new URL(v); } catch (err) { return 'La URL no es válida.'; }
            if (u.protocol !== 'https:') return 'La URL debe empezar por https://';
            if (!POSTED_HOSTS[t.source].test(u.hostname)) return `La URL debe ser de ${U.SRC[t.source]}.`;
            return '';
          },
        });
        if (url) return act('/posted', { url }, 'Registrado como publicado.');
        return;
      }
      if (a === 'discard') {
        if (A.dirty() && !(await U.confirm('Tienes cambios sin guardar. Si descartas el hilo, se pierden.', 'Seguir'))) return;
        const reason = await U.prompt({ message: 'El hilo sale de la cola. El motivo ayuda a afinar el filtro.', label: 'Motivo del descarte', placeholder: 'Ej.: ya respondido, fuera de tema, no permite autopromoción', okText: 'Descartar', danger: true });
        if (reason != null) return act('/discard', { reason: reason || 'sin motivo' }, 'Descartado.');
      }
    });
  }

  // ---------- vistas
  for (const [status, cfg] of Object.entries(STATUSES)) {
    A.views[status] = {
      title: cfg.title,
      usesSource: true,
      enter() { Q.status = status; Q.items = null; Q.sel = null; Q.detail = null; Q.draft = null; Q.error = ''; loadList(); },
      render: () => `
        <div class="section-head"><p class="section-sub">${esc(cfg.sub)}</p></div>
        <div class="queue-layout">
          <section class="thread-list" aria-label="Hilos">${list()}</section>
          <section class="card thread-detail" id="detail" aria-live="polite">${detailHtml()}</section>
        </div>`,
      mount(el) {
        el.querySelector('.thread-list').addEventListener('click', (e) => { const c = e.target.closest('.thread-card'); if (c) select(Number(c.dataset.id)); });
        wireDetail(el.querySelector('#detail'));
      },
    };
  }
})(window.App);
