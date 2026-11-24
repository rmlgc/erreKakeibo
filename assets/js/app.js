// Núcleo de la aplicación: navegación, filtros de periodo/cuenta, guardado del JSON.
'use strict';

const App = (() => {
  let currentTab = 'resumen';
  let pendingOpts = null; // opciones de navegación de un solo uso (ej. abrir ya filtrado)
  let presupuestoSub = 'presupuesto';
  let periodFilter = { range: 'month', from: null, to: null, accountIds: [] };
  let accountPanelOpen = false; // se preserva entre renderPeriodToolbar() para no cerrarse al marcar cada casilla
  let periodToolbarOutsideClickWired = false;

  const TABS = [
    { id: 'resumen', label: 'Resumen', render: (c, opts) => UIDashboard.render(c, periodFilter, opts) },
    { id: 'gastos', label: 'Mis Gastos', render: (c, opts) => UITransactions.render(c, periodFilter, opts) },
    { id: 'subir', label: 'Subir Extracto', render: (c) => UIImport.render(c) },
    { id: 'presupuesto', label: 'Mi Presupuesto', render: (c, opts) => renderPresupuestoTab(c, opts) },
    { id: 'ajustes', label: 'Ajustes', render: (c, opts) => UISettings.render(c, opts) },
  ];

  function renderPresupuestoTab(container, opts) {
    if (opts && opts.subtab) presupuestoSub = opts.subtab;
    const subtabs = [['presupuesto', 'Mi presupuesto'], ['reflexion', 'Reflexión del mes']];
    container.innerHTML = `
      <div class="subtabbar">
        ${subtabs.map(([id, label]) => `<button data-sub="${id}" class="${presupuestoSub === id ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <div id="presupuesto-content"></div>
    `;
    container.querySelectorAll('[data-sub]').forEach((b) => {
      b.onclick = () => { presupuestoSub = b.dataset.sub; renderPresupuestoTab(container); };
    });
    const content = container.querySelector('#presupuesto-content');
    if (presupuestoSub === 'presupuesto') UIBudget.render(content, periodFilter);
    else UIReflections.render(content);
  }

  // Navega a otra sección, opcionalmente con opciones de un solo uso para esa pantalla
  // (ej. {unclassifiedOnly:true} para abrir "Mis Gastos" ya filtrado en los pendientes
  // de revisar, o {subtab:'reflexion'} para abrir directamente la reflexión mensual).
  function goToTab(tabId, opts) {
    currentTab = tabId;
    pendingOpts = opts || null;
    if (opts && opts.unclassifiedOnly) {
      // "Revisar gastos sin clasificar" debe mostrarlos SÍ o SÍ: si el filtro de fecha
      // activo (ej. "Este Mes") no cubre esos movimientos, la lista saldría vacía y
      // parecería que el botón no ha hecho nada. Se amplía a "Todo" y se limpia
      // cualquier otro filtro de cuenta que pudiera ocultarlos.
      periodFilter = { range: 'all', from: null, to: null, accountIds: [] };
      renderPeriodToolbar();
    }
    renderTab();
  }

  const MONTH_NAMES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function isoDate(d) { return `${d.getFullYear()}-${Utils.pad2(d.getMonth() + 1)}-${Utils.pad2(d.getDate())}`; }
  function lastDayOfMonth(year, month1based) { return new Date(year, month1based, 0).getDate(); }

  // Límites de calendario completos (1 de mes a fin de mes, lunes a domingo...), no
  // solo "hasta hoy": como nunca puede haber movimientos en el futuro, filtrar hasta
  // el fin de mes real en vez de hasta hoy da el mismo resultado pero permite mostrar
  // la etiqueta del periodo ("01/10 – 31/10") sin que luego no cuadre con lo filtrado.
  function computeRange(range) {
    const now = new Date();
    const y = now.getFullYear();
    const m1 = now.getMonth() + 1; // 1-indexado
    if (range === 'today') { const t = todayISO(); return { from: t, to: t }; }
    if (range === 'week') {
      const day = (now.getDay() + 6) % 7; // lunes=0
      const monday = new Date(now); monday.setDate(now.getDate() - day);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { from: isoDate(monday), to: isoDate(sunday) };
    }
    if (range === 'month') {
      return { from: `${y}-${Utils.pad2(m1)}-01`, to: `${y}-${Utils.pad2(m1)}-${Utils.pad2(lastDayOfMonth(y, m1))}` };
    }
    if (range === 'quarter') {
      const startMonth = Math.floor((m1 - 1) / 3) * 3 + 1;
      const endMonth = startMonth + 2;
      return { from: `${y}-${Utils.pad2(startMonth)}-01`, to: `${y}-${Utils.pad2(endMonth)}-${Utils.pad2(lastDayOfMonth(y, endMonth))}` };
    }
    if (range === 'year') {
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    return { from: null, to: null }; // 'all'
  }

  // Límites EFECTIVOS del filtro activo, iguales a los que usa filterByPeriodAndAccount
  // (para 'custom' son los que el usuario eligió a mano).
  function resolveRange(pf) {
    return pf.range === 'custom' ? { from: pf.from, to: pf.to } : computeRange(pf.range);
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Etiqueta legible del periodo activo, con fechas exactas, para que nunca haya que
  // adivinar qué rango se está mirando (ej. "Mostrando: Octubre 2026 (01/10/2026 –
  // 31/10/2026)"). Para "Todo" usa las fechas reales de los datos, no el calendario.
  function describePeriod(pf) {
    const state = DB.get();
    if (pf.range === 'all') {
      if (!state.transactions.length) return 'Todo el historial disponible';
      const dates = state.transactions.map((t) => t.date);
      const min = dates.reduce((a, b) => (b < a ? b : a));
      const max = dates.reduce((a, b) => (b > a ? b : a));
      return `Todo el historial disponible (${Utils.fmtDate(min)} – ${Utils.fmtDate(max)})`;
    }
    const { from, to } = resolveRange(pf);
    const now = new Date();
    let label;
    if (pf.range === 'custom') label = 'Rango personalizado';
    else if (pf.range === 'today') label = 'Hoy';
    else if (pf.range === 'week') label = 'Esta semana';
    else if (pf.range === 'month') label = `${capitalize(MONTH_NAMES_ES[now.getMonth()])} ${now.getFullYear()}`;
    else if (pf.range === 'quarter') label = `Trimestre ${Math.floor(now.getMonth() / 3) + 1} de ${now.getFullYear()}`;
    else if (pf.range === 'year') label = `Año ${now.getFullYear()}`;
    else label = '';
    const fromLabel = from ? Utils.fmtDate(from) : '—';
    const toLabel = to ? Utils.fmtDate(to) : '—';
    return `Mostrando: ${label} (${fromLabel} – ${toLabel})`;
  }

  function filterByAccount(transactions, pf) {
    if (!pf.accountIds || !pf.accountIds.length) return transactions;
    return transactions.filter((t) => pf.accountIds.includes(t.accountId));
  }

  function filterByPeriodAndAccount(transactions, pf) {
    let result = filterByAccount(transactions, pf);
    let { from, to } = pf.range === 'custom' ? { from: pf.from, to: pf.to } : computeRange(pf.range);
    if (from) result = result.filter((t) => t.date >= from);
    if (to) result = result.filter((t) => t.date <= to);
    return result;
  }

  // Si el filtro de fecha activo (normalmente "Mes", el de por defecto) no incluye
  // ningún movimiento, el Resumen mostraría 0,00 € en todo aunque el usuario SÍ tenga
  // datos — solo que son, por ejemplo, de hace unas semanas. Pasa justo después de
  // importar un extracto que no llega hasta hoy, pero también cada vez que se reabre
  // la app o se carga un archivo cuyo último movimiento no es del mes en curso. En
  // ese caso se mueve el filtro al último mes con movimientos, para que se vea algo
  // real de inmediato en vez de ceros engañosos.
  function ensureDataVisibleInCurrentPeriod() {
    const state = DB.get();
    // Se llama tras abrir/importar un archivo, que es justo cuando puede haberse creado
    // una cuenta nueva (p.ej. "Efectivo / Cartera" al detectar una retirada de cajero):
    // refresca siempre el selector de cuentas del topbar para que aparezca ya, sin
    // esperar a que coincida con el otro caso (periodo sin movimientos visibles).
    const host = document.getElementById('period-toolbar');
    if (host) renderPeriodToolbar();
    if (!state.transactions.length) return;
    const currentlyVisible = filterByPeriodAndAccount(state.transactions, periodFilter);
    if (currentlyVisible.length > 0) return;
    // El rango "último mes con movimientos" se busca dentro de la(s) cuenta(s) elegidas
    // en el filtro, no en todo el histórico global: si no, al elegir p.ej. "Efectivo"
    // podría expandirse a un mes que tiene datos de OTRA cuenta pero sigue sin tener
    // nada de la elegida, y seguiría pareciendo vacío sin motivo aparente.
    const accountScoped = filterByAccount(state.transactions, periodFilter);
    if (!accountScoped.length) return; // la cuenta elegida no tiene ningún movimiento en todo su historial
    const lastDate = accountScoped.reduce((max, t) => (t.date > max ? t.date : max), accountScoped[0].date);
    const monthStart = lastDate.slice(0, 7) + '-01';
    periodFilter = { range: 'custom', from: monthStart, to: todayISO(), accountIds: periodFilter.accountIds };
    if (host) renderPeriodToolbar();
  }

  function renderShell() {
    const root = document.getElementById('app');
    root.innerHTML = `
      <div class="sidebar">
        <div class="brand">家計<span>簿</span> ErreKakeibo</div>
        ${TABS.map((t) => `<button class="nav-btn" data-tab="${t.id}">${t.label}</button>`).join('')}
        <div class="sidebar-footer">
          <button class="btn sm" id="btn-theme">Cambiar tema</button>
          <button class="btn sm" id="btn-wipe-browser" title="Borra todo rastro de tu contabilidad de este navegador (no toca tu archivo en disco)">🧹 Limpiar navegador</button>
        </div>
      </div>
      <div class="main">
        <div id="sample-banner-host"></div>
        <div class="topbar" style="flex-direction:column;align-items:stretch;gap:6px;">
          <!-- Franja compacta: siempre visible (sticky), incluso con el resto
               colapsado en móvil — es lo que hace falta ver de un vistazo rápido:
               qué rango de fechas se está mirando y si hay cambios sin guardar. -->
          <div class="row between" style="gap:8px;">
            <div class="muted" id="period-label" style="font-size:12px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></div>
            <div class="row" style="gap:8px; flex-shrink:0;">
              <span class="dirty-indicator" id="dirty-indicator"><span class="dirty-dot" id="dirty-dot"></span><span id="dirty-text">Guardado</span></span>
              <button class="btn sm" id="btn-toggle-topbar">Filtros ▾</button>
            </div>
          </div>
          <div id="topbar-expanded" class="collapsed">
            <div class="row between wrap">
              <div class="row wrap" id="period-toolbar"></div>
              <div class="row wrap">
                <button class="btn" id="btn-open-file">Abrir mi archivo</button>
                <button class="btn primary" id="btn-save-file">Guardar mi archivo</button>
              </div>
            </div>
          </div>
        </div>
        <div class="content" id="tab-content"></div>
      </div>
    `;
    renderPeriodToolbar();
    renderSampleBanner();
    root.querySelectorAll('.nav-btn').forEach((b) => {
      b.onclick = () => { currentTab = b.dataset.tab; pendingOpts = null; renderTab(); };
    });
    document.getElementById('btn-theme').onclick = toggleTheme;
    document.getElementById('btn-wipe-browser').onclick = () => UIPrivacy.openModal();
    document.getElementById('btn-toggle-topbar').onclick = (e) => {
      const expanded = document.getElementById('topbar-expanded');
      const collapsed = expanded.classList.toggle('collapsed');
      e.target.textContent = collapsed ? 'Filtros ▾' : 'Filtros ▴';
    };
    document.getElementById('btn-open-file').onclick = () => openFileFlow();
    document.getElementById('btn-save-file').onclick = async () => {
      const res = await DB.saveFile();
      if (res.ok) Widgets.toast(`Tu archivo se ha guardado (${res.fileName})`, 'success');
    };
    updateDirtyIndicator();
    renderTab();
  }

  // Abre otro archivo JSON, pero si hay cambios sin guardar en pantalla, pide
  // confirmación primero: abrir sobreescribe el estado en memoria con el contenido
  // del archivo elegido, y esos cambios se perderían sin aviso si no se confirma.
  function openFileFlow() {
    if (DB.isDirty()) {
      Widgets.confirmDialog(
        'Tienes cambios sin guardar. Si abres otro archivo ahora, se reemplazarán por los del archivo que elijas (no se borra nada de tu disco, pero perderás estos cambios en pantalla si no los has guardado antes). ¿Quieres continuar?',
        () => doOpenFile(),
        { confirmLabel: 'Abrir de todos modos', danger: true }
      );
    } else {
      doOpenFile();
    }
  }

  async function doOpenFile() {
    try {
      const ok = await DB.openFile();
      if (ok) {
        Widgets.toast('Tu archivo se ha cargado correctamente', 'success');
        ensureDataVisibleInCurrentPeriod();
        renderSampleBanner();
        renderTab();
      }
    } catch (e) {
      if (e.name !== 'AbortError') Widgets.toast('No se pudo abrir el archivo: ' + e.message, 'error');
    }
  }

  function renderSampleBanner() {
    const host = document.getElementById('sample-banner-host');
    if (!host) return;
    if (!SampleData.isActive()) { host.innerHTML = ''; return; }
    host.innerHTML = `
      <div class="sample-banner">
        <span>Estás viendo datos de ejemplo para curiosear la app</span>
        <button class="btn sm" id="btn-clear-sample">Borrar datos de ejemplo y empezar con los míos</button>
      </div>
    `;
    host.querySelector('#btn-clear-sample').onclick = () => {
      Widgets.confirmDialog('Esto borrará todas las cuentas y movimientos de ejemplo. Tus propios datos (si los hay) no se tocan. ¿Continuar?', () => {
        SampleData.clear();
        renderSampleBanner();
        renderTab();
      }, { confirmLabel: 'Borrar datos de ejemplo', danger: false });
    };
  }

  function renderPeriodToolbar() {
    const state = DB.get();
    const host = document.getElementById('period-toolbar');
    const ranges = [
      ['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes'], ['quarter', 'Trimestre'], ['year', 'Año'], ['all', 'Todo'],
    ];
    // En móvil, el rango personalizado y el filtro de cuenta se usan menos que
    // los botones rápidos: van colapsados bajo un desplegable nativo para no
    // ocupar varias filas enteras antes de llegar al contenido (en escritorio
    // hay sitio de sobra, así que se muestran siempre abiertos).
    const isNarrow = window.innerWidth <= 760;
    host.innerHTML = `
      ${ranges.map(([id, label]) => `<button class="btn sm ${periodFilter.range === id ? 'primary' : ''}" data-range="${id}">${label}</button>`).join('')}
      <button class="btn sm" id="btn-more-filters" style="${isNarrow ? '' : 'display:none;'}">Más filtros</button>
      <div class="row wrap" id="more-filters" style="${isNarrow ? 'display:none;' : ''}">
        <input type="date" id="pf-from" style="width:140px;" value="${periodFilter.from || ''}">
        <input type="date" id="pf-to" style="width:140px;" value="${periodFilter.to || ''}">
        <div style="position:relative;">
          <button class="btn sm" id="pf-account-btn">${accountFilterLabel(state, periodFilter)}</button>
          <div class="account-filter-panel" id="pf-account-panel" style="${accountPanelOpen ? 'display:block;' : 'display:none;'}">
            <label class="row" style="gap:6px;">
              <input type="checkbox" id="pf-acc-all" ${periodFilter.accountIds.length === 0 ? 'checked' : ''}> <strong>Todas las cuentas</strong>
            </label>
            <hr style="margin:6px 0;border:none;border-top:1px solid var(--border);">
            ${state.accounts.map((a) => `
              <label class="row" style="gap:6px;">
                <input type="checkbox" class="pf-acc-item" value="${a.id}" ${periodFilter.accountIds.includes(a.id) ? 'checked' : ''}> ${Widgets.escapeHtml(a.name)}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    const moreBtn = host.querySelector('#btn-more-filters');
    const morePanel = host.querySelector('#more-filters');
    if (moreBtn) {
      moreBtn.onclick = () => {
        const showing = morePanel.style.display !== 'none';
        morePanel.style.display = showing ? 'none' : 'flex';
        moreBtn.classList.toggle('primary', !showing);
      };
    }
    host.querySelectorAll('[data-range]').forEach((b) => {
      b.onclick = () => { periodFilter.range = b.dataset.range; renderPeriodToolbar(); renderTab(); };
    });
    host.querySelector('#pf-from').onchange = (e) => { periodFilter.range = 'custom'; periodFilter.from = e.target.value; renderPeriodToolbar(); renderTab(); };
    host.querySelector('#pf-to').onchange = (e) => { periodFilter.range = 'custom'; periodFilter.to = e.target.value; renderPeriodToolbar(); renderTab(); };
    const accBtn = host.querySelector('#pf-account-btn');
    const accPanel = host.querySelector('#pf-account-panel');
    accBtn.onclick = (e) => {
      e.stopPropagation();
      accountPanelOpen = !accountPanelOpen;
      accPanel.style.display = accountPanelOpen ? 'block' : 'none';
    };
    accPanel.onclick = (e) => e.stopPropagation();
    if (!periodToolbarOutsideClickWired) {
      document.addEventListener('click', () => {
        if (!accountPanelOpen) return;
        accountPanelOpen = false;
        const panel = document.getElementById('pf-account-panel');
        if (panel) panel.style.display = 'none';
      });
      periodToolbarOutsideClickWired = true;
    }
    host.querySelector('#pf-acc-all').onchange = (e) => {
      if (e.target.checked) periodFilter.accountIds = [];
      ensureDataVisibleInCurrentPeriod(); // re-renderiza el topbar y, si hiciera falta, amplía el rango de fechas
      renderTab();
    };
    host.querySelectorAll('.pf-acc-item').forEach((cb) => {
      cb.onchange = (e) => {
        const id = e.target.value;
        const set = new Set(periodFilter.accountIds);
        if (e.target.checked) set.add(id); else set.delete(id);
        periodFilter.accountIds = [...set];
        ensureDataVisibleInCurrentPeriod();
        renderTab();
      };
    });
    const label = document.getElementById('period-label');
    if (label) label.textContent = describePeriod(periodFilter);
  }

  // "Todas" (vacío) / una cuenta / varias — el botón del desplegable multi-selección
  // resume la selección actual sin obligar a abrir el panel para saber qué hay activo.
  function accountFilterLabel(state, pf) {
    if (!pf.accountIds || !pf.accountIds.length) return 'Cuentas: Todas ▾';
    if (pf.accountIds.length === 1) {
      const acc = state.accounts.find((a) => a.id === pf.accountIds[0]);
      return `Cuenta: ${acc ? Widgets.escapeHtml(acc.name) : '1'} ▾`;
    }
    return `Cuentas: ${pf.accountIds.length} seleccionadas ▾`;
  }

  function renderTab() {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
    const content = document.getElementById('tab-content');
    const tab = TABS.find((t) => t.id === currentTab);
    const opts = pendingOpts;
    pendingOpts = null; // se consume una sola vez
    tab.render(content, opts || {});
  }

  function updateDirtyIndicator() {
    const el = document.getElementById('dirty-indicator');
    const dot = document.getElementById('dirty-dot');
    const text = document.getElementById('dirty-text');
    if (!dot) return;
    const dirty = DB.isDirty();
    dot.classList.toggle('on', dirty);
    el.classList.toggle('dirty-on', dirty);
    text.textContent = dirty ? 'Tienes cambios sin guardar' : 'Guardado';
  }

  function toggleTheme() {
    const state = DB.get();
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    DB.markDirty();
  }

  // "Limpiar navegador" (modo ordenador compartido): borra TODO rastro de la
  // contabilidad que este navegador tuviera guardado (localStorage completo +
  // cualquier IndexedDB), resetea el estado en memoria y vuelve a la pantalla de
  // bienvenida vacía. No toca ningún archivo en disco — el JSON que el usuario ya
  // haya guardado en su disco externo sigue intacto donde esté.
  async function wipeBrowserData() {
    try { localStorage.clear(); } catch (e) { /* best-effort */ }
    await clearAllIndexedDbSafely();
    DB.hardReset();
    currentTab = 'resumen';
    pendingOpts = null;
    presupuestoSub = 'presupuesto';
    periodFilter = { range: 'month', from: null, to: null, accountIds: [] };
    document.documentElement.setAttribute('data-theme', 'light');
    renderSampleBanner();
    renderPeriodToolbar();
    renderTab();
    Widgets.toast('Todos los datos locales de este navegador han sido eliminados.', 'success');
  }

  // indexedDB.open()/databases() pueden quedarse colgados para siempre bajo origen
  // file:// (ya nos pasó antes en este proyecto): nunca se espera sin límite de
  // tiempo, para que "Limpiar navegador" no se quede bloqueado si eso ocurre.
  function clearAllIndexedDbSafely() {
    const attempt = (async () => {
      try {
        if (!indexedDB || !indexedDB.databases) return;
        const dbs = await indexedDB.databases();
        for (const info of dbs) {
          if (!info || !info.name) continue;
          await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(info.name);
            req.onsuccess = resolve;
            req.onerror = resolve;
            req.onblocked = resolve;
          });
        }
      } catch (e) { /* best-effort */ }
    })();
    const timeout = new Promise((resolve) => setTimeout(resolve, 600));
    return Promise.race([attempt, timeout]);
  }

  function init() {
    DB.onChange(() => {
      updateDirtyIndicator();
      renderSampleBanner();
      const label = document.getElementById('period-label');
      if (label) label.textContent = describePeriod(periodFilter);
    });
    DB.init().then((state) => {
      document.documentElement.setAttribute('data-theme', state.settings.theme || 'light');
      ensureDataVisibleInCurrentPeriod();
      renderShell();
    });
    Widgets.wireHelpIcons(document.body);
    window.addEventListener('beforeunload', (e) => {
      if (DB.isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  return {
    init, filterByPeriodAndAccount, filterByAccount, renderTab, goToTab, openFileFlow,
    ensureDataVisibleInCurrentPeriod, resolveRange, describePeriod, wipeBrowserData,
  };
})();

window.addEventListener('DOMContentLoaded', App.init);
