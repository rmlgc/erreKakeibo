// Pestaña: Resumen
'use strict';

const UIDashboard = (() => {
  let drilldownPillar = null; // pilar seleccionado para el desglose por subcategorías

  function render(container, periodFilter, opts = {}) {
    const state = DB.get();

    if (state.transactions.length === 0) {
      renderWelcome(container);
      return;
    }

    const accountScoped = App.filterByAccount(state.transactions, periodFilter);
    const txs = App.filterByPeriodAndAccount(state.transactions, periodFilter);

    if (txs.length === 0) {
      renderEmptyPeriod(container, periodFilter, accountScoped);
      return;
    }

    const kpis = Budget.computeKPIs(txs);
    const breakdown = Budget.computePillarBreakdown(txs);
    const recurring = Budget.detectRecurring(txs);
    const ants = Budget.detectAntExpenses(txs, state.settings.antThreshold);
    // El saldo de cada cuenta se calcula siempre sobre su historial completo (no sobre
    // el periodo filtrado, un saldo "de este mes" no tendría sentido), pero si hay
    // cuentas seleccionadas en el filtro del topbar, solo se suman esas, no todas.
    const accountsForSaldo = (periodFilter.accountIds && periodFilter.accountIds.length)
      ? state.accounts.filter((a) => periodFilter.accountIds.includes(a.id))
      : state.accounts;
    const saldoTotal = accountsForSaldo.reduce((acc, a) => acc + UIAccounts.computeBalance(a.id, state.transactions), 0);

    const unclassifiedCount = txs.filter(Rules.isUnclassified).length;
    const incomeForPeriod = state.settings.useRealIncome ? kpis.ingresos : state.settings.incomeBaseMonthly;
    const needsIncomeSetup = incomeForPeriod === 0;
    const impulse = Budget.computeImpulseStats(txs);

    const lastDate = Utils.maxDate(accountScoped.map((t) => t.date));

    container.innerHTML = `
      <h1>Resumen</h1>
      ${renderLastUpdated(lastDate)}
      ${renderPendingBar(unclassifiedCount, needsIncomeSetup)}
      <div class="grid cols-5" style="margin-bottom:18px;">
        ${kpiCard('Ingresos', Utils.fmtMoney(kpis.ingresos), 'positive')}
        ${kpiCard('Gastos', Utils.fmtMoney(kpis.gastos), 'negative')}
        ${kpiCard('Balance / Ahorro neto', Utils.fmtMoney(kpis.balance), kpis.balance >= 0 ? 'positive' : 'negative')}
        ${kpiCard('Tasa de ahorro', Utils.fmtPct(kpis.tasaAhorro), kpis.tasaAhorro >= 0 ? 'positive' : 'negative')}
        ${kpiCard('Saldo total', Utils.fmtMoney(saldoTotal))}
      </div>
      <div class="grid cols-2" style="margin-bottom:18px;">
        <div class="card">
          <div class="row between">
            <h2>Pilares Kakeibo ${Widgets.helpIcon('Las 4 categorías del método japonés Kakeibo para ordenar tus gastos: Supervivencia (lo necesario), Ocio y Vicio (lo que te apetece), Cultura y Extras. Haz clic en una porción (o elige arriba) para ver el desglose por subcategorías.')}</h2>
            <select id="sel-drilldown" style="width:170px;">
              <option value="">Elige un pilar...</option>
              ${DB.PILLARS.map((p) => `<option value="${p.id}" ${drilldownPillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="chart-box"><canvas id="chart-pillars"></canvas></div>
        </div>
        <div class="card"><h2>Comparativa mes a mes</h2><div class="chart-box"><canvas id="chart-mom"></canvas></div></div>
      </div>
      ${drilldownPillar ? renderDrilldownHtml(drilldownPillar, txs) : ''}
      <div class="card" style="margin-bottom:18px;">
        <h2>Interanual (Año actual vs. anterior)</h2>
        <div class="chart-box"><canvas id="chart-yoy"></canvas></div>
      </div>
      <div class="grid cols-3">
        <div class="card">
          <h2>Gastos recurrentes / suscripciones</h2>
          ${recurring.length === 0 ? '<p class="muted">No se detectan gastos recurrentes aún (≥3 repeticiones).</p>' : `
            <div style="overflow-x:auto;">
              <table><thead><tr><th>Concepto</th><th>Veces</th><th>Media</th><th>Total</th></tr></thead><tbody>
                ${recurring.slice(0, 8).map((r) => `<tr><td>${Widgets.escapeHtml(r.label)}</td><td>${r.count}</td><td>${Utils.fmtMoney(r.avgAmount)}</td><td>${Utils.fmtMoney(r.totalAmount)}</td></tr>`).join('')}
              </tbody></table>
            </div>
          `}
        </div>
        <div class="card">
          <div class="row between"><h2>Gastos hormiga ${Widgets.helpIcon('Los gastos hormiga son esas compras pequeñas (un café, una chuchería...) que por separado parecen nada, pero suman bastante dinero al mes si las juntas todas.')}</h2>
            <input type="number" id="f-ant-threshold" value="${state.settings.antThreshold}" style="width:80px;"> <span class="muted">€ umbral</span>
          </div>
          <p>Nº movimientos: <strong>${ants.count}</strong> · Total: <strong>${Utils.fmtMoney(ants.total)}</strong> · Peso sobre el gasto: <strong>${Utils.fmtPct(ants.pctOfTotal)}</strong></p>
          <div class="progress-bar"><div style="width:${Math.min(100, ants.pctOfTotal * 100)}%;background:var(--accent-lavender);"></div></div>
        </div>
        <div class="card">
          <h2>⚡ Gasto por impulso ${Widgets.helpIcon('Compras marcadas con la etiqueta #impulso: las que hiciste "por gastar", sin planificar, frente a tus compras conscientes. Márcalas desde Mis Gastos o desde la Vista Previa al importar.')}</h2>
          <p>Nº movimientos: <strong>${impulse.count}</strong> · Total: <strong>${Utils.fmtMoney(impulse.total)}</strong> · Peso sobre el gasto: <strong>${Utils.fmtPct(impulse.pctOfTotal)}</strong></p>
          <div class="progress-bar"><div style="width:${Math.min(100, impulse.pctOfTotal * 100)}%;background:var(--accent-orange);"></div></div>
        </div>
      </div>
    `;

    container.querySelector('#f-ant-threshold').onchange = (e) => {
      state.settings.antThreshold = parseFloat(e.target.value) || 10;
      DB.markDirty();
      render(container, periodFilter);
    };
    container.querySelector('#sel-drilldown').onchange = (e) => {
      drilldownPillar = e.target.value || null;
      render(container, periodFilter);
    };
    const drilldownHost = container.querySelector('#drilldown-content');
    if (drilldownHost) {
      drilldownHost.querySelectorAll('.drilldown-subcat').forEach((row) => {
        row.onclick = () => App.goToTab('gastos', { pillar: drilldownPillar, subcategory: row.dataset.subcat });
      });
    }
    const reviewBtn = container.querySelector('#btn-pending-review');
    if (reviewBtn) reviewBtn.onclick = () => App.goToTab('gastos', { unclassifiedOnly: true });
    const incomeBtn = container.querySelector('#btn-pending-income');
    if (incomeBtn) incomeBtn.onclick = () => App.goToTab('presupuesto', { subtab: 'presupuesto' });
    const staleBtn = container.querySelector('#btn-stale-upload');
    if (staleBtn) staleBtn.onclick = () => App.goToTab('subir');

    Charts.pillarDonut('chart-pillars', breakdown, (pillarId) => {
      drilldownPillar = pillarId;
      render(container, periodFilter);
    });
    Charts.monthOverMonth('chart-mom', buildMonthOverMonth(state.transactions, periodFilter));
    const yoy = buildYoY(state.transactions, periodFilter);
    Charts.yearOverYear('chart-yoy', yoy.current, yoy.previous);
  }

  function renderPendingBar(unclassifiedCount, needsIncomeSetup) {
    const items = [];
    if (unclassifiedCount > 0) {
      items.push(`
        <div class="pending-item">
          <span>Tienes <strong>${unclassifiedCount}</strong> gasto${unclassifiedCount === 1 ? '' : 's'} sin clasificar</span>
          <button class="btn sm primary" id="btn-pending-review">Revisarlos ahora</button>
        </div>
      `);
    }
    if (needsIncomeSetup) {
      items.push(`
        <div class="pending-item">
          <span>Configura tu ingreso mensual para activar tu regla de ahorro</span>
          <button class="btn sm primary" id="btn-pending-income">Configurar</button>
        </div>
      `);
    }
    return items.length ? `<div class="pending-bar">${items.join('')}</div>` : '';
  }

  // Desglose por subcategorías del pilar elegido (clic en el donut o desplegable):
  // importe, % sobre el pilar, nº de compras y ticket medio. Clic en una fila lleva a
  // Mis Gastos ya filtrado por ese pilar + esa subcategoría.
  function renderDrilldownHtml(pillarId, txs) {
    const pillarDef = DB.PILLARS.find((p) => p.id === pillarId);
    const rows = Budget.computeSubcategoryBreakdown(txs, pillarId);
    const pillarTotal = rows.reduce((a, r) => a + r.total, 0);
    return `
      <div class="card" style="margin-bottom:18px;">
        <h2>Desglose de ${pillarDef ? pillarDef.name : pillarId} <span class="muted" style="font-weight:400;">(${Utils.fmtMoney(pillarTotal)})</span></h2>
        <div id="drilldown-content">
          ${rows.length === 0 ? '<p class="muted">No hay movimientos clasificados en este pilar en el periodo seleccionado.</p>' : `
            <div style="overflow-x:auto;">
              <table>
                <thead><tr><th>Subcategoría</th><th>Importe</th><th>% del pilar</th><th>Nº compras</th><th>Ticket medio</th></tr></thead>
                <tbody>
                  ${rows.map((r) => `
                    <tr class="drilldown-subcat" style="cursor:pointer;" data-subcat="${r.name ? Widgets.escapeHtml(r.name) : '__none__'}">
                      <td>${r.name ? Widgets.escapeHtml(r.name) : '— Sin subcategoría —'}</td>
                      <td>${Utils.fmtMoney(r.total)}</td>
                      <td>${Utils.fmtPct(r.pctOfPillar)}</td>
                      <td>${r.count}</td>
                      <td>${Utils.fmtMoney(r.avgTicket)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderLastUpdated(lastDate) {
    if (!lastDate) return '';
    const days = Utils.daysSince(lastDate);
    const threshold = DB.get().settings.staleDataThresholdDays;
    const stale = days > threshold;
    return `
      <p class="muted" style="margin:-4px 0 14px;">Datos actualizados hasta el <strong>${Utils.fmtDate(lastDate)}</strong></p>
      ${stale ? `
        <div class="pending-bar">
          <div class="pending-item">
            <span>Tu contabilidad lleva <strong>${days}</strong> días sin actualizar</span>
            <button class="btn sm primary" id="btn-stale-upload">Subir extracto</button>
          </div>
        </div>
      ` : ''}
    `;
  }

  // Cuando el periodo elegido (ej. una semana o mes concretos) no tiene ningún
  // movimiento, hay que distinguir dos situaciones para que el usuario sepa si debe
  // "subir más datos" o si de verdad no gastó nada esos días.
  function renderEmptyPeriod(container, periodFilter, accountScoped) {
    const dates = accountScoped.map((t) => t.date);
    const minData = Utils.minDate(dates);
    const maxData = Utils.maxDate(dates);
    const { from, to } = App.resolveRange(periodFilter);
    let message;
    let showUploadBtn = false;
    if (!dates.length) {
      message = 'Esta cuenta todavía no tiene ningún movimiento registrado.';
    } else if (from && maxData && from > maxData) {
      message = `No hay datos en este periodo porque tu último registro es del <strong>${Utils.fmtDate(maxData)}</strong>. Sube un extracto más reciente para verlo.`;
      showUploadBtn = true;
    } else if (to && minData && to < minData) {
      message = `No hay datos en este periodo: tus movimientos registrados empiezan el <strong>${Utils.fmtDate(minData)}</strong>.`;
    } else {
      message = `No tienes ningún movimiento registrado entre el <strong>${Utils.fmtDate(from)}</strong> y el <strong>${Utils.fmtDate(to)}</strong>.`;
    }
    container.innerHTML = `
      <h1>Resumen</h1>
      ${renderLastUpdated(maxData)}
      <div class="card empty-state" style="text-align:left;">
        <p>${message}</p>
        ${showUploadBtn ? '<button class="btn primary" id="btn-empty-upload">Subir extracto</button>' : ''}
      </div>
    `;
    const staleBtn = container.querySelector('#btn-stale-upload');
    if (staleBtn) staleBtn.onclick = () => App.goToTab('subir');
    const uploadBtn = container.querySelector('#btn-empty-upload');
    if (uploadBtn) uploadBtn.onclick = () => App.goToTab('subir');
  }

  function renderWelcome(container) {
    container.innerHTML = `
      <div class="welcome-wrap">
        <h1>Bienvenido/a a tu contabilidad Kakeibo</h1>
        <p class="muted">Vamos a dar el primer paso. Elige una de estas tres opciones:</p>
        <div class="welcome-steps">
          <div class="welcome-step">
            <span class="step-number">1</span>
            <div class="welcome-step-body">
              <strong>Sube tu extracto del banco</strong>
              <span class="muted">Descarga el movimiento de tu banco en formato .csv y súbelo aquí. Lo entendemos solo.</span>
            </div>
            <button class="btn primary" id="w-upload">Subir extracto</button>
          </div>
          <div class="welcome-step step-secondary">
            <span class="step-number">2</span>
            <div class="welcome-step-body">
              <strong>¿Tienes un archivo guardado de antes?</strong>
              <span class="muted">Si ya usabas esta app, abre tu archivo "contabilidad_kakeibo.json" desde tu disco.</span>
            </div>
            <button class="btn lavender" id="w-open">Abrir mi archivo de contabilidad</button>
          </div>
          <div class="welcome-step step-tertiary">
            <span class="step-number">3</span>
            <div class="welcome-step-body">
              <strong>Solo quiero curiosear</strong>
              <span class="muted">Rellenamos la app con un mes de ejemplo ficticio para que veas cómo funciona todo.</span>
            </div>
            <button class="btn ghost" id="w-sample">Cargar mes de ejemplo</button>
          </div>
        </div>
      </div>
    `;
    container.querySelector('#w-upload').onclick = () => App.goToTab('subir');
    container.querySelector('#w-open').onclick = () => App.openFileFlow();
    container.querySelector('#w-sample').onclick = () => {
      SampleData.load();
      Widgets.toast('Hemos cargado un mes de ejemplo para que curiosees la app', 'success');
      App.renderTab();
    };
  }

  function kpiCard(label, value, cls = '') {
    return `<div class="card kpi-card"><span class="kpi-label">${label}</span><span class="kpi-value ${cls}">${value}</span></div>`;
  }

  function buildMonthOverMonth(allTransactions, periodFilter) {
    const txs = App.filterByAccount(allTransactions, periodFilter);
    const byMonth = new Map();
    for (const t of txs) {
      if (t.type === 'traspaso' || t.type === 'retencion' || t.isSplitOriginal) continue;
      const mk = Utils.monthKey(t.date);
      if (!byMonth.has(mk)) byMonth.set(mk, { gasto: 0, ingreso: 0 });
      const net = Budget.pillarNetAmount(t);
      if (t.type === 'gasto') byMonth.get(mk).gasto += Math.abs(t.amount);
      if (t.type === 'ingreso' && !(t.netPillar && t.pillar)) byMonth.get(mk).ingreso += Math.abs(t.amount);
    }
    const months = Array.from(byMonth.keys()).sort().slice(-12);
    return months.map((mk) => {
      const v = byMonth.get(mk);
      return { label: mk, gasto: v.gasto, ahorro: v.ingreso - v.gasto };
    });
  }

  function buildYoY(allTransactions, periodFilter) {
    const txs = App.filterByAccount(allTransactions, periodFilter);
    const now = new Date();
    const yearCur = now.getFullYear();
    const yearPrev = yearCur - 1;
    const current = Array(12).fill(0);
    const previous = Array(12).fill(0);
    for (const t of txs) {
      if (t.type !== 'gasto' || t.isSplitOriginal) continue;
      const [y, m] = t.date.split('-').map(Number);
      if (y === yearCur) current[m - 1] += Math.abs(t.amount);
      if (y === yearPrev) previous[m - 1] += Math.abs(t.amount);
    }
    return { current, previous };
  }

  return { render };
})();
