// Pestaña: Resumen
'use strict';

const UIDashboard = (() => {
  let drilldownPillar = null; // pilar seleccionado para el desglose por subcategorías
  let chartMode = 'monthly'; // 'monthly' | 'yearly'
  let monthlyRange = 'last12'; // 'last12' | 'YYYY'
  let yearlyMetric = 'gasto'; // 'gasto' | 'ahorro' | 'tasaAhorro' | 'ingresos' | 'impulso' | pillarId
  let selectedYears = null; // array de años (números) activos en modo 'yearly'

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
    const antGroups = groupAntExpenses(ants.transactions);
    const impulse = Budget.computeImpulseStats(txs);
    const impulseList = [...impulse.transactions].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    // El saldo de cada cuenta se calcula siempre sobre su historial completo (no sobre
    // el periodo filtrado, un saldo "de este mes" no tendría sentido), pero si hay
    // cuentas seleccionadas en el filtro del topbar, solo se suman esas, no todas.
    const accountsForSaldo = (periodFilter.accountIds && periodFilter.accountIds.length)
      ? state.accounts.filter((a) => periodFilter.accountIds.includes(a.id))
      : state.accounts;
    const saldoTotal = accountsForSaldo.reduce((acc, a) => acc + UIAccounts.computeBalance(a.id, state.transactions), 0);

    const unclassifiedCount = txs.filter(Rules.isUnclassified).length;
    const periodMonths = countPeriodMonths(periodFilter, txs);
    const incomeForPeriod = state.settings.useRealIncome
      ? kpis.ingresos
      : (state.settings.incomeBaseMonthly * periodMonths);
    const needsIncomeSetup = incomeForPeriod === 0;

    const lastDate = Utils.maxDate(accountScoped.map((t) => t.date));
    const budgetConfigured = !!state.settings.budgetConfigured;
    const preset = state.budgetPresets.find((p) => p.id === state.activeBudgetPresetId) || state.budgetPresets[0];
    const budgetResult = Budget.computeBudget(txs, preset, incomeForPeriod);
    const savingsBlock = budgetResult.blocks.find((b) => b.isSavings);

    const availableYears = getAvailableYears(accountScoped);
    if (monthlyRange !== 'last12' && !availableYears.includes(Number(monthlyRange))) {
      monthlyRange = 'last12';
    }
    if (availableYears.length < 2 && chartMode === 'yearly') {
      chartMode = 'monthly';
    }
    if (!selectedYears || selectedYears.length === 0) {
      selectedYears = availableYears.slice(0, 2);
    } else {
      selectedYears = selectedYears.filter((y) => availableYears.includes(y));
      if (selectedYears.length === 0) selectedYears = availableYears.slice(0, 2);
    }

    const YEARLY_METRICS = [
      { id: 'gasto', label: 'Gasto total (€)' },
      { id: 'ahorro', label: 'Ahorro neto (€)' },
      { id: 'tasaAhorro', label: 'Tasa de ahorro (%)' },
      { id: 'ingresos', label: 'Ingresos (€)' },
      { id: 'impulso', label: 'Gasto por impulso (€)' },
      ...DB.PILLARS.map((p) => ({ id: p.id, label: `Pilar: ${p.name} (€)` })),
    ];

    container.innerHTML = `
      <h1>Resumen</h1>
      ${renderLastUpdated(lastDate)}
      ${renderPendingBar(unclassifiedCount, needsIncomeSetup)}
      ${renderKakeiboCard(budgetConfigured, budgetResult, savingsBlock, kpis, incomeForPeriod, unclassifiedCount, periodMonths)}
      <div class="grid cols-5" style="margin-bottom:18px;">
        ${kpiCard('Ingresos', Utils.fmtMoney(kpis.ingresos), 'positive')}
        ${kpiCard('Gastos', Utils.fmtMoney(kpis.gastos), 'negative')}
        ${kpiCard('Balance / Ahorro neto', Utils.fmtMoney(kpis.balance), kpis.balance >= 0 ? 'positive' : 'negative')}
        ${kpiCard('Tasa de ahorro', Utils.fmtPct(kpis.tasaAhorro), kpis.tasaAhorro >= 0 ? 'positive' : 'negative')}
        ${kpiCard('Saldo total', Utils.fmtMoney(saldoTotal))}
      </div>
      <div class="grid cols-2" style="margin-bottom:18px; align-items:stretch;">
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
        <div id="drilldown-host">${renderDrilldownHtml(drilldownPillar, txs)}</div>
      </div>
      <div class="card" style="margin-bottom:18px;">
        <div class="row between wrap" style="gap:8px; margin-bottom:8px;">
          <h2 style="margin:0;">Evolución mensual</h2>
          <div class="row" style="gap:6px;">
            <div class="chart-mode-pills">
              <button type="button" class="btn sm ${chartMode === 'monthly' ? 'primary' : 'ghost'}" data-cmode="monthly">Mes a mes</button>
              <button type="button" class="btn sm ${chartMode === 'yearly' ? 'primary' : 'ghost'}" data-cmode="yearly" ${availableYears.length < 2 ? 'disabled title="Necesitas datos de al menos 2 años para comparar"' : ''}>Comparar años</button>
            </div>
            ${chartMode === 'monthly' ? `
              <select id="sel-mom-range" style="width:auto; min-width:130px;">
                <option value="last12" ${monthlyRange === 'last12' ? 'selected' : ''}>Últimos 12 meses</option>
                ${availableYears.map((y) => `<option value="${y}" ${monthlyRange === String(y) ? 'selected' : ''}>Año ${y}</option>`).join('')}
              </select>
            ` : `
              <select id="sel-yoy-metric" style="width:auto; min-width:155px;">
                ${YEARLY_METRICS.map((m) => `<option value="${m.id}" ${yearlyMetric === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}
              </select>
            `}
          </div>
        </div>
        ${chartMode === 'yearly' ? `
          <div class="row wrap" style="gap:6px; margin-bottom:8px;">
            <span class="muted" style="font-size:12px;">Años (máx. 5):</span>
            ${availableYears.slice(0, 5).map((y) => {
              const active = selectedYears.includes(y);
              return `<button type="button" class="btn sm ${active ? 'lavender' : 'ghost'} btn-yoy-year" data-year="${y}">${y}</button>`;
            }).join('')}
          </div>
        ` : ''}
        <div class="chart-box"><canvas id="chart-evolution"></canvas></div>
      </div>
      <div class="grid cols-3" style="align-items:start;">
        <details class="card widget-collapse" ${recurring.length > 0 ? 'open' : ''}>
          <summary class="widget-summary">
            <span>Gastos recurrentes / suscripciones</span>
            <span class="badge">${recurring.length > 0 ? `${recurring.length} detectados` : '0 detectados'}</span>
          </summary>
          <div class="widget-body">
            ${recurring.length === 0 ? '<p class="muted">No se detectan gastos recurrentes aún (≥3 repeticiones).</p>' : `
              <div class="card-bleed" style="overflow-x:auto;">
                <table><thead><tr><th>Concepto</th><th>Veces</th><th>Media</th><th>Total</th></tr></thead><tbody>
                  ${recurring.slice(0, 8).map((r) => `<tr><td>${Widgets.escapeHtml(r.label)}</td><td>${r.count}</td><td>${Utils.fmtMoney(r.avgAmount)}</td><td>${Utils.fmtMoney(r.totalAmount)}</td></tr>`).join('')}
                </tbody></table>
              </div>
            `}
          </div>
        </details>

        <details class="card widget-collapse" ${ants.count > 0 ? 'open' : ''}>
          <summary class="widget-summary">
            <span>Gastos hormiga ${Widgets.helpIcon('Los gastos hormiga son esas compras pequeñas (un café, una chuchería...) que por separado parecen nada, pero suman bastante dinero al mes si las juntas todas.')}</span>
            <span class="badge">${ants.count} movs · ${Utils.fmtMoney(ants.total)}</span>
          </summary>
          <div class="widget-body">
            <div class="row between wrap" style="gap:8px; margin-bottom:8px;">
              <span class="muted" style="font-size:12px;">Peso sobre gasto: <strong>${Utils.fmtPct(ants.pctOfTotal)}</strong></span>
              <div class="row" style="gap:4px;">
                <input type="number" id="f-ant-threshold" value="${state.settings.antThreshold}" style="width:70px;">
                <span class="muted" style="font-size:12px;">€ umbral</span>
              </div>
            </div>
            <div class="progress-bar" style="margin-bottom:10px;"><div style="width:${Math.min(100, ants.pctOfTotal * 100)}%;background:var(--accent-lavender);"></div></div>
            ${antGroups.length === 0 ? '<p class="muted">No hay gastos por debajo del umbral en este periodo.</p>' : `
              <div class="card-bleed" style="overflow-x:auto;">
                <table><thead><tr><th>Concepto</th><th>Veces</th><th>Total</th></tr></thead><tbody>
                  ${antGroups.slice(0, 8).map((g) => `<tr><td>${Widgets.escapeHtml(g.label)}</td><td>${g.count}</td><td>${Utils.fmtMoney(g.total)}</td></tr>`).join('')}
                </tbody></table>
              </div>
              ${antGroups.length > 8 ? `<p class="muted" style="font-size:11px;margin:6px 0 0;">Mostrando los 8 conceptos con mayor acumulado (de ${antGroups.length}).</p>` : ''}
            `}
          </div>
        </details>

        <details class="card widget-collapse" ${impulse.count > 0 ? 'open' : ''}>
          <summary class="widget-summary">
            <span>⚡ Gasto por impulso ${Widgets.helpIcon('Compras marcadas con la etiqueta #impulso: las que hiciste "por gastar", sin planificar, frente a tus compras conscientes. Márcalas desde Mis Gastos o desde la Vista Previa al importar.')}</span>
            <span class="badge">${impulse.count} movs · ${Utils.fmtMoney(impulse.total)}</span>
          </summary>
          <div class="widget-body">
            <p class="muted" style="font-size:12px; margin:0 0 6px;">Peso sobre el gasto: <strong>${Utils.fmtPct(impulse.pctOfTotal)}</strong></p>
            <div class="progress-bar" style="margin-bottom:10px;"><div style="width:${Math.min(100, impulse.pctOfTotal * 100)}%;background:var(--accent-orange);"></div></div>
            ${impulseList.length === 0 ? '<p class="muted">Sin compras marcadas con <code>#impulso</code> en este periodo.</p>' : `
              <div class="card-bleed" style="overflow-x:auto;">
                <table><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th></tr></thead><tbody>
                  ${impulseList.slice(0, 8).map((t) => `<tr><td>${Utils.fmtDate(t.date)}</td><td>${Widgets.escapeHtml(t.concept)}</td><td>${Utils.fmtMoney(Math.abs(t.amount))}</td></tr>`).join('')}
                </tbody></table>
              </div>
              ${impulseList.length > 8 ? `<p class="muted" style="font-size:11px;margin:6px 0 0;">Mostrando las 8 compras más altas (de ${impulseList.length}).</p>` : ''}
            `}
          </div>
        </details>
      </div>
    `;

    container.querySelector('#f-ant-threshold').onchange = (e) => {
      state.settings.antThreshold = parseFloat(e.target.value) || 10;
      DB.markDirty();
      render(container, periodFilter);
    };
    container.querySelector('#sel-drilldown').onchange = (e) => {
      drilldownPillar = e.target.value || null;
      updateDrilldown(container, txs);
    };
    container.querySelectorAll('[data-cmode]').forEach((btn) => {
      btn.onclick = () => {
        if (btn.disabled) return;
        chartMode = btn.dataset.cmode;
        render(container, periodFilter);
      };
    });
    const momRangeSel = container.querySelector('#sel-mom-range');
    if (momRangeSel) {
      momRangeSel.onchange = (e) => {
        monthlyRange = e.target.value;
        render(container, periodFilter);
      };
    }
    const yoyMetricSel = container.querySelector('#sel-yoy-metric');
    if (yoyMetricSel) {
      yoyMetricSel.onchange = (e) => {
        yearlyMetric = e.target.value;
        render(container, periodFilter);
      };
    }
    container.querySelectorAll('.btn-yoy-year').forEach((btn) => {
      btn.onclick = () => {
        const y = Number(btn.dataset.year);
        if (selectedYears.includes(y)) {
          if (selectedYears.length <= 1) return; // mantener al menos 1 año activo
          selectedYears = selectedYears.filter((v) => v !== y);
        } else {
          if (selectedYears.length >= 5) {
            Widgets.toast('Máximo 5 años a la vez para mantener la gráfica legible', 'info');
            return;
          }
          selectedYears = [...selectedYears, y].sort((a, b) => b - a);
        }
        render(container, periodFilter);
      };
    });
    bindDrilldownRows(container);
    const reviewBtn = container.querySelector('#btn-pending-review');
    if (reviewBtn) reviewBtn.onclick = () => App.goToTab('gastos', { unclassifiedOnly: true });
    const incomeBtn = container.querySelector('#btn-pending-income');
    if (incomeBtn) incomeBtn.onclick = () => App.goToTab('presupuesto', { subtab: 'presupuesto' });
    const staleBtn = container.querySelector('#btn-stale-upload');
    if (staleBtn) staleBtn.onclick = () => App.goToTab('subir');
    const budgetSetupBtn = container.querySelector('#btn-setup-budget');
    if (budgetSetupBtn) budgetSetupBtn.onclick = () => App.goToTab('presupuesto', { subtab: 'presupuesto' });
    container.querySelectorAll('.btn-setup-action').forEach((btn) => {
      btn.onclick = () => App.goToTab(btn.dataset.action, btn.dataset.action === 'presupuesto' ? { subtab: 'presupuesto' } : {});
    });

    Charts.pillarDonut('chart-pillars', breakdown, (pillarId) => {
      drilldownPillar = (drilldownPillar === pillarId) ? null : pillarId;
      updateDrilldown(container, txs);
    });
    if (chartMode === 'yearly' && availableYears.length >= 2) {
      const series = buildYearlyComparison(state.transactions, periodFilter, selectedYears, yearlyMetric);
      const target = buildYearlyTarget(state, accountScoped, selectedYears, yearlyMetric, preset);
      Charts.yearOverYear('chart-evolution', series, { isPct: yearlyMetric === 'tasaAhorro', target });
    } else {
      Charts.monthOverMonth('chart-evolution', buildMonthOverMonth(state, periodFilter, monthlyRange, preset));
    }
  }

  function bindDrilldownRows(container) {
    const drilldownHost = container.querySelector('#drilldown-content');
    if (drilldownHost) {
      drilldownHost.querySelectorAll('.drilldown-subcat').forEach((row) => {
        row.onclick = () => App.goToTab('gastos', { pillar: drilldownPillar, subcategory: row.dataset.subcat });
      });
    }
  }

  function updateDrilldown(container, txs) {
    const host = container.querySelector('#drilldown-host');
    const sel = container.querySelector('#sel-drilldown');
    if (sel) sel.value = drilldownPillar || '';
    if (host) {
      host.innerHTML = renderDrilldownHtml(drilldownPillar, txs);
      bindDrilldownRows(container);
    }
  }

  function renderKakeiboCard(budgetConfigured, budgetResult, savingsBlock, kpis, incomeForPeriod, unclassifiedCount = 0, periodMonths = 1) {
    const hasIncome = incomeForPeriod > 0;
    const steps = [
      { done: true, label: 'Extracto bancario importado' },
      { done: unclassifiedCount === 0, label: 'Gastos clasificados por pilar', action: 'gastos' },
      { done: budgetConfigured && hasIncome, label: 'Meta de ahorro configurada', action: 'presupuesto' },
    ];
    const allDone = steps.every((s) => s.done);

    if (!allDone) {
      return `<div class="card kakeibo-setup-card" style="margin-bottom:18px;">
        <div class="row between" style="margin-bottom:12px;">
          <h2 style="margin:0;">🌱 Configura tu Kakeibo</h2>
          <span class="muted" style="font-size:12px;">${steps.filter((s) => s.done).length} de ${steps.length} completados</span>
        </div>
        <div class="kakeibo-steps-list">
          ${steps.map((s) => `<div class="kakeibo-step-row ${s.done ? 'done' : ''}">
            <span class="kakeibo-step-check">${s.done ? '✓' : '○'}</span>
            <span class="kakeibo-step-label">${s.label}</span>
            ${!s.done && s.action ? `<button class="btn sm primary btn-setup-action" data-action="${s.action}">Ir ahora →</button>` : ''}
          </div>`).join('')}
        </div>
        ${!budgetConfigured || !hasIncome ? `<p class="muted" style="margin:12px 0 4px; font-size:12px;">💡 Los mini-sobres dentro del bloque Ahorro te permiten dividir tu meta entre objetivos concretos (vacaciones, fondo de emergencia...).</p>` : ''}
      </div>`;
    }

    // --- Active plan card ---
    const spent = savingsBlock ? savingsBlock.spent : Math.max(0, kpis.ingresos - kpis.gastos);
    const limit = savingsBlock ? savingsBlock.limit : 0;
    const pct = limit > 0 ? Math.min(1, spent / limit) : 0;
    const ahead = spent >= limit && limit > 0;
    const spentBlocks = budgetResult ? budgetResult.blocks.filter((b) => !b.isSavings && b.limit > 0) : [];

    return `<div class="card kakeibo-plan-card" style="margin-bottom:18px;">
      <div class="row between wrap" style="margin-bottom:12px; gap:8px;">
        <h2 style="margin:0;">📊 Tu plan Kakeibo este periodo ${periodMonths > 1 ? `<span class="muted" style="font-weight:400;font-size:13px;">(${periodMonths} meses)</span>` : ''}</h2>
        <button class="btn sm btn-setup-action" data-action="presupuesto">Ajustar plan</button>
      </div>
      ${savingsBlock && limit > 0 ? `
        <div style="margin-bottom:14px;">
          <div class="row between wrap" style="gap:6px; margin-bottom:4px;">
            <span style="font-size:13px;"><strong>${Widgets.escapeHtml(savingsBlock.name)}</strong></span>
            <span class="kakeibo-block-hero ${ahead ? 'positive' : ''}">
              ${ahead
                ? `¡Meta superada +${Utils.fmtMoney(spent - limit)}! ✓`
                : `Faltan ${Utils.fmtMoney(Math.max(0, limit - spent))} para tu meta`}
            </span>
          </div>
          <div class="progress-bar"><div style="width:${pct * 100}%;background:${ahead ? 'var(--success,#5FB49C)' : 'var(--accent-orange)'};"></div></div>
          <p class="muted" style="font-size:12px; margin:4px 0 0;">${Utils.fmtMoney(spent)} / ${Utils.fmtMoney(limit)} ahorrado (${Math.round(pct * 100)}%)</p>
        </div>` : ''}
      ${spentBlocks.length > 0 ? `
        <div class="grid cols-${Math.min(spentBlocks.length, 3)}" style="gap:12px;">
          ${spentBlocks.map((b) => {
            const p = Math.min(1, b.pctUsed || 0);
            return `<div>
              <div class="row between" style="font-size:12px; margin-bottom:2px;">
                <span><strong>${Widgets.escapeHtml(b.name)}</strong></span>
              </div>
              <div class="kakeibo-block-hero ${b.over ? 'negative' : ''}" style="margin-bottom:4px;">
                ${b.over ? `Excedido +${Utils.fmtMoney(b.spent - b.limit)}` : `Quedan ${Utils.fmtMoney(b.limit - b.spent)}`}
              </div>
              <div class="progress-bar" style="height:6px;"><div style="width:${p * 100}%;background:${b.over ? 'var(--danger)' : 'var(--accent-lavender)'};"></div></div>
              <p class="muted" style="font-size:11px; margin:3px 0 0;">${Utils.fmtMoney(b.spent)} / ${Utils.fmtMoney(b.limit)} (${Math.round((b.pctUsed || 0) * 100)}%)</p>
            </div>`;
          }).join('')}
        </div>` : ''}
    </div>`;
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
    if (!pillarId) {
      return `
        <div class="card" style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; min-height:220px;">
          <h2 style="margin-bottom:6px;">Desglose por subcategorías</h2>
          <p class="muted" style="max-width:320px; margin:0;">Pulsa sobre una porción del gráfico <strong>Pilares Kakeibo</strong> o elige un pilar en su selector para ver en qué subcategorías se va el dinero.</p>
        </div>
      `;
    }
    const pillarDef = DB.PILLARS.find((p) => p.id === pillarId);
    const rows = Budget.computeSubcategoryBreakdown(txs, pillarId);
    const pillarTotal = rows.reduce((a, r) => a + r.total, 0);
    return `
      <div class="card" style="height:100%;">
        <h2>Desglose de ${pillarDef ? pillarDef.name : pillarId} <span class="muted" style="font-weight:400;">(${Utils.fmtMoney(pillarTotal)})</span></h2>
        <div id="drilldown-content">
          ${rows.length === 0 ? '<p class="muted">No hay movimientos clasificados en este pilar en el periodo seleccionado.</p>' : `
            <div class="card-bleed" style="overflow-x:auto;">
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
              <div class="welcome-step-header">
                <strong>Sube tu extracto del banco</strong>
                <button class="btn primary" id="w-upload">Subir extracto</button>
              </div>
              <span class="muted">Descarga el movimiento de tu banco en formato .csv y súbelo aquí. Lo entendemos solo.</span>
            </div>
          </div>
          <div class="welcome-step step-secondary">
            <span class="step-number">2</span>
            <div class="welcome-step-body">
              <div class="welcome-step-header">
                <strong>¿Tienes un archivo guardado de antes?</strong>
                <button class="btn lavender" id="w-open">Abrir mi archivo de contabilidad</button>
              </div>
              <span class="muted">Si ya usabas esta app, abre tu archivo "contabilidad_kakeibo.json" desde tu disco.</span>
            </div>
          </div>
          <div class="welcome-step step-tertiary">
            <span class="step-number">3</span>
            <div class="welcome-step-body">
              <div class="welcome-step-header">
                <strong>Solo quiero curiosear</strong>
                <button class="btn ghost" id="w-sample">Cargar mes de ejemplo</button>
              </div>
              <span class="muted">Rellenamos la app con un mes de ejemplo ficticio para que veas cómo funciona todo.</span>
            </div>
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

  function getAvailableYears(transactions) {
    const years = new Set();
    for (const t of transactions) {
      if (t.type === 'traspaso' || t.type === 'retencion' || t.isSplitOriginal) continue;
      if (t.date && t.date.length >= 4) years.add(Number(t.date.slice(0, 4)));
    }
    return Array.from(years).filter((y) => !Number.isNaN(y)).sort((a, b) => b - a);
  }

  function groupAntExpenses(antTxs) {
    const groups = new Map();
    for (const t of antTxs) {
      const key = Utils.normalizeText(t.concept).replace(/[0-9]/g, '#');
      if (!groups.has(key)) groups.set(key, { label: t.concept, count: 0, total: 0 });
      const g = groups.get(key);
      g.count++;
      g.total += Math.abs(t.amount);
    }
    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }

  function buildMonthOverMonth(state, periodFilter, range = 'last12', preset = null) {
    const txs = App.filterByAccount(state.transactions, periodFilter);
    const byMonth = new Map();
    const makeBucket = () => {
      const pillars = {};
      for (const p of DB.PILLARS) pillars[p.id] = 0;
      return { pillars, unclassified: 0, gasto: 0, ingreso: 0 };
    };
    for (const t of txs) {
      if (t.type === 'traspaso' || t.type === 'retencion' || t.isSplitOriginal) continue;
      if (range !== 'last12' && !t.date.startsWith(`${range}-`)) continue;
      const mk = Utils.monthKey(t.date);
      if (!byMonth.has(mk)) byMonth.set(mk, makeBucket());
      const b = byMonth.get(mk);
      if (t.type === 'gasto') {
        const amt = Math.abs(t.amount);
        b.gasto += amt;
        if (t.pillar && b.pillars[t.pillar] !== undefined) b.pillars[t.pillar] += amt;
        else b.unclassified += amt;
      } else if (t.type === 'ingreso') {
        if (t.netPillar && t.pillar && b.pillars[t.pillar] !== undefined) {
          b.pillars[t.pillar] -= Math.abs(t.amount);
        } else {
          b.ingreso += Math.abs(t.amount);
        }
      }
    }

    const blocks = (preset && preset.blocks) || [];
    const savingsBlockDef = blocks.find((b) => b.isSavings);
    const spentPct = blocks.filter((b) => !b.isSavings).reduce((acc, b) => acc + (Number(b.pct) || 0), 0);
    const savingsPct = savingsBlockDef ? (Number(savingsBlockDef.pct) || 0) : 0;

    const keys = Array.from(byMonth.keys()).sort();
    const months = range === 'last12' ? keys.slice(-12) : keys;
    return months.map((mk) => {
      const v = byMonth.get(mk);
      const refIncome = state.settings.useRealIncome ? v.ingreso : (state.settings.incomeBaseMonthly || 0);
      return {
        label: mk,
        pillars: v.pillars,
        unclassified: v.unclassified,
        ahorro: v.ingreso - v.gasto,
        topeGasto: refIncome > 0 && spentPct > 0 ? refIncome * (spentPct / 100) : null,
        metaAhorro: refIncome > 0 && savingsPct > 0 ? refIncome * (savingsPct / 100) : null,
      };
    });
  }

  function buildYearlyComparison(allTransactions, periodFilter, years, metric) {
    const txs = App.filterByAccount(allTransactions, periodFilter);
    const YEAR_COLORS = ['#f89e49', '#cda3ff', '#5FB49C', '#4a90e2', '#e06c75'];
    const isPillar = DB.PILLARS.some((p) => p.id === metric);

    return years.map((year, idx) => {
      const buckets = Array.from({ length: 12 }, () => ({
        hasData: false, gasto: 0, ingreso: 0, impulso: 0, pillar: 0,
      }));
      for (const t of txs) {
        if (t.type === 'traspaso' || t.type === 'retencion' || t.isSplitOriginal) continue;
        const [y, m] = t.date.split('-').map(Number);
        if (y !== year || m < 1 || m > 12) continue;
        const b = buckets[m - 1];
        b.hasData = true;
        if (t.type === 'gasto') {
          const amt = Math.abs(t.amount);
          b.gasto += amt;
          if ((t.tags || []).includes('#impulso')) b.impulso += amt;
          if (isPillar && t.pillar === metric) b.pillar += amt;
        } else if (t.type === 'ingreso') {
          if (t.netPillar && t.pillar) {
            if (isPillar && t.pillar === metric) b.pillar -= Math.abs(t.amount);
          } else {
            b.ingreso += Math.abs(t.amount);
          }
        }
      }

      const data = buckets.map((b) => {
        if (!b.hasData) return null;
        if (metric === 'gasto') return b.gasto;
        if (metric === 'ingresos') return b.ingreso;
        if (metric === 'ahorro') return b.ingreso - b.gasto;
        if (metric === 'tasaAhorro') return b.ingreso > 0 ? (b.ingreso - b.gasto) / b.ingreso : 0;
        if (metric === 'impulso') return b.impulso;
        if (isPillar) return Math.max(0, b.pillar);
        return 0;
      });

      const validVals = data.filter((v) => v !== null);
      let summary = '';
      if (validVals.length > 0) {
        if (metric === 'tasaAhorro') {
          const avg = validVals.reduce((a, b) => a + b, 0) / validVals.length;
          summary = ` (${Utils.fmtPct(avg)} med.)`;
        } else {
          const sum = validVals.reduce((a, b) => a + b, 0);
          summary = ` (${Utils.fmtMoney(sum)})`;
        }
      }

      return {
        label: `${year}${summary}`,
        data,
        color: YEAR_COLORS[idx % YEAR_COLORS.length],
      };
    });
  }

  function countPeriodMonths(periodFilter, txs) {
    if (periodFilter && periodFilter.mode === 'month') return 1;
    const { from, to } = App.resolveRange(periodFilter || {});
    if (from && to) {
      const [y1, m1] = from.split('-').map(Number);
      const [y2, m2] = to.split('-').map(Number);
      return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
    }
    const distinct = new Set(txs.map((t) => Utils.monthKey(t.date)));
    return Math.max(1, distinct.size);
  }

  function buildYearlyTarget(state, accountScoped, years, metric, preset) {
    if (!preset || !preset.blocks) return null;
    const savingsBlockDef = preset.blocks.find((b) => b.isSavings);
    const spentPct = preset.blocks.filter((b) => !b.isSavings).reduce((acc, b) => acc + (Number(b.pct) || 0), 0);

    if (metric === 'tasaAhorro') {
      if (!savingsBlockDef || !savingsBlockDef.pct) return null;
      return { label: 'Meta ahorro', value: savingsBlockDef.pct / 100 };
    }

    const isPillar = DB.PILLARS.some((p) => p.id === metric);
    if (metric !== 'ahorro' && metric !== 'gasto' && !isPillar) return null;

    let refMonthlyIncome = !state.settings.useRealIncome && state.settings.incomeBaseMonthly > 0
      ? state.settings.incomeBaseMonthly
      : 0;

    if (refMonthlyIncome <= 0) {
      const monthIncomes = new Map();
      for (const t of accountScoped) {
        if (t.type !== 'ingreso' || t.isSplitOriginal || (t.netPillar && t.pillar)) continue;
        const y = Number(t.date.slice(0, 4));
        if (!years.includes(y)) continue;
        const mk = Utils.monthKey(t.date);
        monthIncomes.set(mk, (monthIncomes.get(mk) || 0) + Math.abs(t.amount));
      }
      if (monthIncomes.size > 0) {
        const total = Array.from(monthIncomes.values()).reduce((a, b) => a + b, 0);
        refMonthlyIncome = total / monthIncomes.size;
      }
    }
    if (refMonthlyIncome <= 0) return null;

    if (metric === 'ahorro') {
      if (!savingsBlockDef || !savingsBlockDef.pct) return null;
      return { label: 'Meta ahorro/mes', value: refMonthlyIncome * (savingsBlockDef.pct / 100) };
    }
    if (isPillar) {
      const matchingBlocks = preset.blocks.filter((b) => !b.isSavings && b.pillars && b.pillars.includes(metric));
      if (matchingBlocks.length === 0) return null;
      const pct = matchingBlocks.reduce((acc, b) => acc + (Number(b.pct) || 0), 0);
      if (pct <= 0) return null;
      const singleExclusive = matchingBlocks.length === 1 && matchingBlocks[0].pillars.length === 1;
      const pillarName = DB.PILLARS.find((p) => p.id === metric)?.name || metric;
      const label = singleExclusive
        ? `Tope ${pillarName}/mes`
        : `Tope ${matchingBlocks.map((b) => b.name).join(' + ')}/mes`;
      return { label, value: refMonthlyIncome * (pct / 100) };
    }
    return { label: 'Tope gasto/mes', value: refMonthlyIncome * (spentPct / 100) };
  }

  return { render };
})();
