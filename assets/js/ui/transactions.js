// Pestaña: Mis Gastos (tabla, edición, movimientos a mano, dividir compra, etiquetas,
// gastos por revisar)
'use strict';

const UITransactions = (() => {
  let filters = { text: '', pillar: '', subcategory: '', unclassifiedOnly: false, type: '' };

  function render(container, periodFilter, opts = {}) {
    if (opts.unclassifiedOnly) {
      // Vista "de un clic" para revisar pendientes: no debe arrastrar un buscador de
      // texto o filtros de pilar/tipo de una sesión anterior que la dejen vacía.
      filters = { text: '', pillar: '', subcategory: '', unclassifiedOnly: true, type: '' };
    } else if (opts.pillar !== undefined) {
      // Llega desde el desglose por subcategorías de Resumen (clic en el donut).
      filters = { text: '', pillar: opts.pillar || '', subcategory: opts.subcategory || '', unclassifiedOnly: false, type: '' };
    }
    const state = DB.get();
    let txs = App.filterByPeriodAndAccount(state.transactions, periodFilter);
    if (filters.text) {
      const needle = Utils.normalizeText(filters.text);
      txs = txs.filter((t) => Utils.normalizeText(t.concept).includes(needle));
    }
    if (filters.pillar) txs = txs.filter((t) => t.pillar === filters.pillar);
    if (filters.subcategory) {
      txs = txs.filter((t) => (filters.subcategory === '__none__' ? !t.subcategory : t.subcategory === filters.subcategory));
    }
    if (filters.type) txs = txs.filter((t) => t.type === filters.type);
    if (filters.unclassifiedOnly) txs = txs.filter((t) => Rules.isUnclassified(t));
    txs = [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const periodScoped = App.filterByPeriodAndAccount(state.transactions, periodFilter);
    const unclassifiedCount = periodScoped.filter(Rules.isUnclassified).length;
    const retentionPairs = Budget.detectRetentionPairs(periodScoped.filter((t) => !t.isSplitOriginal));

    container.innerHTML = `
      <div class="row between wrap" style="margin-bottom:12px;">
        <h1>Mis gastos</h1>
        <div class="row">
          <button class="btn" id="btn-export-csv">Descargar como Excel</button>
          <button class="btn primary" id="btn-manual">+ Añadir a mano</button>
        </div>
      </div>
      ${unclassifiedCount > 0 && !filters.unclassifiedOnly ? `
        <div class="pending-bar">
          <div class="pending-item">
            <span>Tienes <strong>${unclassifiedCount}</strong> gasto${unclassifiedCount === 1 ? '' : 's'} por revisar (sin pilar asignado todavía)</span>
            <button class="btn sm primary" id="btn-review-now">Revisarlos ahora</button>
          </div>
        </div>
      ` : ''}
      ${retentionPairs.map((p, i) => `
        <div class="pending-bar">
          <div class="pending-item">
            <span>Posible retención y devolución detectada (±${Utils.fmtMoney(p.amount)}): "${Widgets.escapeHtml(p.a.concept)}" y "${Widgets.escapeHtml(p.b.concept)}"${p.looksLikeReversal ? ' <span class="tag">devolución</span>' : ''}</span>
            <button class="btn sm primary mark-retencion" data-pair="${i}">Marcar ambas como Retención / Anulado</button>
          </div>
        </div>
      `).join('')}
      <div class="card" style="margin-bottom:14px;">
        <div class="row wrap">
          <input id="f-text" placeholder="Buscar por concepto..." style="max-width:240px;" value="${Widgets.escapeHtml(filters.text)}">
          <select id="f-pillar" style="max-width:200px;">
            <option value="">Todos los pilares</option>
            ${DB.PILLARS.map((p) => `<option value="${p.id}" ${filters.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
          <select id="f-subcat" style="max-width:220px;">
            <option value="">Todas las subcategorías</option>
            <option value="__none__" ${filters.subcategory === '__none__' ? 'selected' : ''}>— Sin subcategoría —</option>
            ${state.catalog.subcategories.filter((s) => !filters.pillar || s.pillar === filters.pillar).map((s) => s.name).sort()
              .map((name) => `<option value="${Widgets.escapeHtml(name)}" ${filters.subcategory === name ? 'selected' : ''}>${Widgets.escapeHtml(name)}</option>`).join('')}
          </select>
          <select id="f-type" style="max-width:160px;">
            <option value="">Todos los tipos</option>
            <option value="gasto" ${filters.type === 'gasto' ? 'selected' : ''}>Gasto</option>
            <option value="ingreso" ${filters.type === 'ingreso' ? 'selected' : ''}>Ingreso</option>
            <option value="traspaso" ${filters.type === 'traspaso' ? 'selected' : ''}>Traspaso interno</option>
            <option value="retencion" ${filters.type === 'retencion' ? 'selected' : ''}>Retención / Anulado</option>
          </select>
          ${Widgets.helpIcon('"Traspaso interno" es un movimiento entre dos cuentas tuyas, como pasar dinero de tu cuenta del banco a tu efectivo. "Retención / Anulado" es una preautorización que el comercio devuelve en unos días (típico en gasolineras, hoteles, Uber o máquinas expendedoras). Ninguno de los dos cuenta como gasto ni como ingreso real, pero sí afectan al saldo de la cuenta.')}
          <label class="row" style="font-size:13px;gap:6px;"><input type="checkbox" style="width:auto;" id="f-unclass" ${filters.unclassifiedOnly ? 'checked' : ''}> Ver solo gastos por revisar
            ${unclassifiedCount > 0 ? `<span class="unclassified-badge">${unclassifiedCount}</span>` : ''}
          </label>
        </div>
      </div>
      <div class="card" style="padding:0;">
        <div class="table-meta">
          <span>${txs.length > 500
            ? `Mostrando <strong>500</strong> de <strong>${txs.length}</strong> movimientos`
            : `<strong>${txs.length}</strong> ${txs.length === 1 ? 'movimiento' : 'movimientos'}${txs.length !== periodScoped.length ? ` (de ${periodScoped.length} en el periodo)` : ''}`
          }</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="tx-table">
            <thead><tr>
              <th>Fecha</th><th class="col-account">Cuenta</th><th>Concepto</th><th>Importe</th><th>Tipo</th><th>Pilar</th><th>Etiquetas</th><th></th>
            </tr></thead>
            <tbody id="tx-rows"></tbody>
          </table>
        </div>
        ${txs.length === 0 ? '<div class="empty-state">No hay gastos con estos filtros.</div>' : ''}
      </div>
    `;

    const tbody = container.querySelector('#tx-rows');
    const accountsById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
    for (const t of txs.slice(0, 500)) {
      const acc = accountsById[t.accountId];
      const pillarDef = DB.PILLARS.find((p) => p.id === t.pillar);
      const unclassified = Rules.isUnclassified(t);
      const suggestion = unclassified ? Suggestions.suggestForTransaction(t, state.transactions) : null;
      const isAtm = t.type === 'gasto' && Suggestions.isAtmWithdrawal(t);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${Utils.fmtDate(t.date)}</td>
        <td class="col-account">${acc ? Widgets.escapeHtml(acc.name) : '—'}</td>
        <td>${Widgets.escapeHtml(t.concept)} ${t.splitGroupId ? '<span class="tag">dividido</span>' : ''}</td>
        <td style="color:${t.amount < 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600;">${Utils.fmtMoney(t.amount)}</td>
        <td>${typeBadge(t.type)}</td>
        <td>
          ${pillarDef ? `<span class="pill-badge" style="background:${pillarDef.color}">${pillarDef.name}</span>` : ((t.type === 'traspaso' || t.type === 'retencion') ? '' : '<span class="tag">por revisar</span>')}
          ${suggestion ? `
            <div style="margin-top:4px;">
              <span class="tag" style="background:var(--accent-lavender);color:#2a1e3d;border-color:var(--accent-lavender);" title="${Widgets.escapeHtml(suggestion.reason)}">${suggestion.badge}: ${DB.PILLARS.find((p) => p.id === suggestion.pillar)?.name || ''}</span>
              <button class="btn sm accept-suggestion" data-id="${t.id}">Aceptar</button>
            </div>
          ` : ''}
        </td>
        <td>${(t.tags || []).map((tg) => `<span class="tag">${Widgets.escapeHtml(tg)}</span>`).join(' ')}</td>
        <td>
          <button class="btn sm edit-tx" data-id="${t.id}">Editar</button>
          ${unclassified ? `<button class="btn sm quick-rule" data-id="${t.id}">${suggestion ? 'Fijar como regla' : 'Crear regla'}</button>` : ''}
          ${isAtm ? `<button class="btn sm atm-convert" data-id="${t.id}" title="Pasa este gasto a Traspaso interno y abona el mismo importe en tu cuenta de efectivo">Convertir en retirada</button>` : ''}
        </td>
      `;
      tbody.appendChild(tr);
      if (isAtm) {
        tr.querySelector('.atm-convert').onclick = () => convertToAtmWithdrawal(t, () => render(container, periodFilter));
      }
      if (suggestion) {
        tr.querySelector('.accept-suggestion').onclick = () => {
          t.pillar = suggestion.pillar;
          t.subcategory = suggestion.subcategory;
          t.tags = Catalog.canonicalTags(state, suggestion.tags);
          DB.markDirty();
          Widgets.toast('Sugerencia aceptada', 'success');
          render(container, periodFilter);
        };
      }
    }

    container.querySelector('#f-text').oninput = Utils.debounce((e) => { filters.text = e.target.value; render(container, periodFilter); }, 250);
    container.querySelector('#f-pillar').onchange = (e) => { filters.pillar = e.target.value; filters.subcategory = ''; render(container, periodFilter); };
    container.querySelector('#f-subcat').onchange = (e) => { filters.subcategory = e.target.value; render(container, periodFilter); };
    container.querySelector('#f-type').onchange = (e) => { filters.type = e.target.value; render(container, periodFilter); };
    container.querySelector('#f-unclass').onchange = (e) => { filters.unclassifiedOnly = e.target.checked; render(container, periodFilter); };
    container.querySelector('#btn-manual').onclick = () => openTxForm(null, () => render(container, periodFilter));
    container.querySelector('#btn-export-csv').onclick = () => exportCSV(txs, accountsById);
    const reviewBtn = container.querySelector('#btn-review-now');
    if (reviewBtn) reviewBtn.onclick = () => { filters.unclassifiedOnly = true; render(container, periodFilter); };
    container.querySelectorAll('.mark-retencion').forEach((btn) => {
      btn.onclick = () => {
        const pair = retentionPairs[Number(btn.dataset.pair)];
        pair.a.type = 'retencion';
        pair.b.type = 'retencion';
        DB.markDirty();
        Widgets.toast('Marcados como Retención / Anulado', 'success');
        render(container, periodFilter);
      };
    });
    tbody.querySelectorAll('.edit-tx').forEach((b) => {
      b.onclick = () => {
        const tx = state.transactions.find((x) => x.id === b.dataset.id);
        openTxForm(tx, () => render(container, periodFilter));
      };
    });
    tbody.querySelectorAll('.quick-rule').forEach((b) => {
      b.onclick = () => {
        const tx = state.transactions.find((x) => x.id === b.dataset.id);
        const suggestion = Rules.isUnclassified(tx) ? Suggestions.suggestForTransaction(tx, state.transactions) : null;
        openQuickRuleModal(tx, () => render(container, periodFilter), suggestion);
      };
    });
  }

  // Pasa un gasto a Traspaso interno y abona el mismo importe en la cuenta de
  // Efectivo (crea "Efectivo / Cartera" si no existe ninguna; si hay varias, pregunta
  // a cuál). Nunca duplica: hash determinista + aviso si ya hay un apunte parecido.
  function convertToAtmWithdrawal(tx, onDone) {
    const state = DB.get();
    const cashAccounts = state.accounts.filter((a) => a.type === 'cash');
    const doConvert = (cashAccountId) => {
      tx.type = 'traspaso';
      tx.tags = Catalog.canonicalTags(state, [...(tx.tags || []), '#cajero']);
      const resolvedId = CashMirror.resolveCashAccountId(state, cashAccountId);
      const result = CashMirror.createMirrorIfNeeded(state, tx, resolvedId);
      DB.markDirty();
      if (result.reason === 'possible-duplicate') {
        Widgets.toast('Convertido en traspaso, pero no se abonó en efectivo: ya había un movimiento parecido en esa cuenta', 'info');
      } else {
        Widgets.toast('Convertido en retirada de cajero y abonado en tu cuenta de efectivo', 'success');
      }
      onDone();
    };
    if (cashAccounts.length > 1) {
      Widgets.openModal(`
        <h2>¿A qué cuenta de efectivo lo abonamos?</h2>
        <div class="field"><label>Cuenta</label>
          <select id="f-cash-account">${cashAccounts.map((a) => `<option value="${a.id}">${Widgets.escapeHtml(a.name)}</option>`).join('')}</select>
        </div>
        <div class="row" style="justify-content:flex-end;margin-top:16px;">
          <button class="btn ghost" id="cancel">Cancelar</button>
          <button class="btn primary" id="confirm">Convertir</button>
        </div>
      `, {
        onMount: (modal) => {
          modal.querySelector('#cancel').onclick = Widgets.closeModal;
          modal.querySelector('#confirm').onclick = () => {
            const chosen = modal.querySelector('#f-cash-account').value;
            Widgets.closeModal();
            doConvert(chosen);
          };
        },
      });
    } else {
      doConvert(null);
    }
  }

  // Crea una regla con la palabra clave del comercio de este movimiento y la aplica
  // al momento a todos los demás gastos por revisar que coincidan (sin tocar los que
  // ya estuvieran clasificados, a mano o por otra regla). Si hay una sugerencia (por
  // historial o por palabra raíz de comercio), se usa para preseleccionar pilar y
  // etiquetas y para proponer una palabra clave más limpia.
  function openQuickRuleModal(tx, onDone, suggestion) {
    const suggestedPattern = suggestion ? Suggestions.significantWord(tx.concept) : tx.concept.split(/\s+/).slice(0, 2).join(' ');
    Widgets.openModal(`
      <h2>Crear regla</h2>
      <p class="muted">Los movimientos cuyo concepto contenga esta palabra se clasificarán solos a partir de ahora.</p>
      <div class="field"><label>Si el concepto contiene...</label><input id="f-pattern" value="${Widgets.escapeHtml(suggestedPattern)}"></div>
      <div class="field"><label>Pilar Kakeibo</label>
        <select id="f-pillar"><option value="">—</option>${DB.PILLARS.map((p) => `<option value="${p.id}" ${suggestion && suggestion.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Etiquetas (opcional)</label><input id="f-tags" list="dl-tags" value="${suggestion ? (suggestion.tags || []).join(' ') : ''}"></div>
      ${Widgets.datalist('dl-tags', Catalog.allTagNames(DB.get()))}
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn ghost" id="cancel">Cancelar</button>
        <button class="btn primary" id="save">Crear y aplicar</button>
      </div>
    `, {
      onMount: (modal) => {
        modal.querySelector('#cancel').onclick = Widgets.closeModal;
        modal.querySelector('#save').onclick = () => {
          const pattern = modal.querySelector('#f-pattern').value.trim();
          if (!pattern) { Widgets.toast('Escribe la palabra clave', 'error'); return; }
          const rawTags = modal.querySelector('#f-tags').value.split(/\s+/).map((v) => v.trim()).filter(Boolean);
          const tags = Catalog.canonicalTags(DB.get(), rawTags);
          const newRule = {
            id: Utils.uid('rule'), pattern, isRegex: false, type: null,
            pillar: modal.querySelector('#f-pillar').value || null,
            subcategory: null, tags, priority: 100, active: true,
          };
          const state = DB.get();
          state.rules.push(newRule);
          const { transactions, changed } = Rules.applyRulesToUnclassifiedOnly(state.transactions, state.rules);
          state.transactions = transactions;
          DB.markDirty();
          Widgets.closeModal();
          Widgets.toast(`Regla creada: ${changed} gasto${changed === 1 ? '' : 's'} por revisar se ${changed === 1 ? 'ha' : 'han'} clasificado solo${changed === 1 ? '' : 's'}.`, 'success');
          onDone();
        };
      },
    });
  }

  function typeBadge(type) {
    const map = { gasto: ['Gasto', 'var(--danger)'], ingreso: ['Ingreso', 'var(--success)'], traspaso: ['Traspaso', 'var(--text-muted)'], retencion: ['Retención', 'var(--accent-lavender)'] };
    const [label, color] = map[type] || [type, 'var(--text-muted)'];
    return `<span class="pill-badge" style="background:${color}">${label}</span>`;
  }

  function exportCSV(txs, accountsById) {
    const rows = txs.map((t) => ({
      Fecha: Utils.fmtDate(t.date),
      Cuenta: accountsById[t.accountId] ? accountsById[t.accountId].name : '',
      Concepto: t.concept,
      Importe: t.amount.toFixed(2).replace('.', ','),
      Tipo: t.type,
      Pilar: t.pillar || '',
      Subcategoria: t.subcategory || '',
      Etiquetas: (t.tags || []).join(' '),
    }));
    const csv = Utils.toCSV(rows, ['Fecha', 'Cuenta', 'Concepto', 'Importe', 'Tipo', 'Pilar', 'Subcategoria', 'Etiquetas']);
    Utils.downloadText('movimientos_kakeibo.csv', csv, 'text/csv');
  }

  function openTxForm(tx, onDone) {
    const state = DB.get();
    const isEdit = !!tx;
    const accounts = state.accounts;
    if (!isEdit && accounts.length === 0) {
      Widgets.toast('Crea primero una cuenta en Ajustes > Mis cuentas', 'error');
      return;
    }
    const data = tx || {
      id: null, accountId: accounts[0] ? accounts[0].id : null, date: new Date().toISOString().slice(0, 10),
      concept: '', amount: 0, type: 'gasto', pillar: null, subcategory: '', tags: [], netPillar: false,
    };
    Widgets.openModal(`
      <h2>${isEdit ? 'Editar movimiento' : 'Añadir un gasto o ingreso a mano'}</h2>
      <div class="grid cols-2">
        <div class="field"><label>Cuenta</label><select id="f-acc">${accounts.map((a) => `<option value="${a.id}" ${data.accountId === a.id ? 'selected' : ''}>${Widgets.escapeHtml(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Fecha</label><input type="date" id="f-date" value="${data.date}"></div>
      </div>
      <div class="field"><label>Concepto</label><input id="f-concept" value="${Widgets.escapeHtml(data.concept)}" placeholder="ej. Cena con amigos"></div>
      <div class="grid cols-2">
        <div class="field"><label>Importe (€, negativo = gasto)</label><input type="number" step="0.01" id="f-amount" value="${data.amount}"></div>
        <div class="field"><label>Tipo</label>
          <select id="f-type">
            <option value="gasto" ${data.type === 'gasto' ? 'selected' : ''}>Gasto</option>
            <option value="ingreso" ${data.type === 'ingreso' ? 'selected' : ''}>Ingreso</option>
            <option value="traspaso" ${data.type === 'traspaso' ? 'selected' : ''}>Traspaso interno</option>
            <option value="retencion" ${data.type === 'retencion' ? 'selected' : ''}>Retención / Anulado</option>
          </select>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="field"><label>Pilar Kakeibo ${Widgets.helpIcon('Los Pilares Kakeibo son las 4 categorías del método japonés para ordenar tus gastos: Supervivencia (lo necesario), Ocio y Vicio (lo que te apetece), Cultura y Extras.')}</label>
          <select id="f-pillar"><option value="">— Sin clasificar —</option>${DB.PILLARS.map((p) => `<option value="${p.id}" ${data.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Subcategoría</label><input id="f-subcat" list="dl-subcats" value="${Widgets.escapeHtml(data.subcategory || '')}"></div>
      </div>
      <div class="field">
        <label>Etiquetas (separadas por espacio, ej. #capricho_super #viaje)</label>
        <div class="row" style="gap:6px;">
          <input id="f-tags" list="dl-tags" value="${(data.tags || []).join(' ')}" style="flex:1;">
          <button type="button" class="btn sm ${(data.tags || []).includes('#impulso') ? 'primary' : ''}" id="f-impulso-toggle" title="Márcalo si fue una compra por impulso, sin planificar">⚡ Impulso</button>
        </div>
      </div>
      ${Widgets.datalist('dl-subcats', Catalog.allSubcategoryNames(state))}
      ${Widgets.datalist('dl-tags', Catalog.allTagNames(state))}
      <div class="field" id="net-wrap" style="${data.type === 'ingreso' ? '' : 'display:none;'}">
        <label class="row" style="gap:6px;"><input type="checkbox" style="width:auto;" id="f-net" ${data.netPillar ? 'checked' : ''}> Es una devolución/reembolso: restar del pilar en vez de sumar a Ingresos</label>
      </div>
      <div class="field" id="rule-wrap">
        <label class="row" style="gap:6px;"><input type="checkbox" style="width:auto;" id="f-make-rule"> Recordar esta clasificación para la próxima vez ${Widgets.helpIcon('La próxima vez que aparezca un gasto parecido (mismo concepto), se clasificará solo con este mismo pilar y estas etiquetas. Podrás verla y editarla en Ajustes > Reglas automáticas.')}</label>
      </div>
      <div class="row between" style="margin-top:16px;">
        <div>
          ${isEdit ? `<button class="btn danger" id="f-delete">Eliminar</button> <button class="btn" id="f-split">Dividir compra ${Widgets.helpIcon('Reparte un mismo ticket (ej. un ticket de súper de 80€) en varias partes con su propio pilar cada una, por ejemplo si en la misma compra llevabas cosas necesarias y algún capricho.')}</button>` : ''}
          ${isEdit && data.type === 'gasto' ? `<button class="btn" id="f-atm-convert">Convertir en retirada de cajero ${Widgets.helpIcon('Lo pasa a Traspaso interno (el dinero no desaparece, solo cambia de bolsillo) y abona el mismo importe en tu cuenta de Efectivo / Cartera, para que no se cuente dos veces.')}</button>` : ''}
        </div>
        <div class="row">
          <button class="btn ghost" id="f-cancel">Cancelar</button>
          <button class="btn primary" id="f-save">Guardar</button>
        </div>
      </div>
    `, {
      wide: false,
      onMount: (modal) => {
        modal.querySelector('#f-type').onchange = (e) => {
          modal.querySelector('#net-wrap').style.display = e.target.value === 'ingreso' ? '' : 'none';
        };
        modal.querySelector('#f-impulso-toggle').onclick = (e) => {
          const tagsInput = modal.querySelector('#f-tags');
          const current = tagsInput.value.split(/\s+/).map((v) => v.trim()).filter(Boolean);
          const has = current.some((t) => Utils.foldKey(t) === '#impulso');
          tagsInput.value = (has ? current.filter((t) => Utils.foldKey(t) !== '#impulso') : [...current, '#impulso']).join(' ');
          e.target.classList.toggle('primary', !has);
        };
        modal.querySelector('#f-cancel').onclick = Widgets.closeModal;
        if (isEdit) {
          modal.querySelector('#f-delete').onclick = () => {
            Widgets.confirmDialog('¿Eliminar este movimiento?', () => {
              const s = DB.get();
              s.transactions = s.transactions.filter((t) => t.id !== tx.id);
              DB.markDirty();
              Widgets.closeModal();
              onDone();
            });
          };
          modal.querySelector('#f-split').onclick = () => { Widgets.closeModal(); openSplitForm(tx, onDone); };
          const atmBtn = modal.querySelector('#f-atm-convert');
          if (atmBtn) atmBtn.onclick = () => { Widgets.closeModal(); convertToAtmWithdrawal(tx, onDone); };
        }
        modal.querySelector('#f-save').onclick = () => {
          const concept = modal.querySelector('#f-concept').value.trim();
          const amount = parseFloat(modal.querySelector('#f-amount').value);
          if (!concept || isNaN(amount)) { Widgets.toast('Completa concepto e importe', 'error'); return; }
          const s = DB.get();
          const rawTags = modal.querySelector('#f-tags').value.split(/\s+/).map((v) => v.trim()).filter(Boolean);
          const tags = Catalog.canonicalTags(s, rawTags);
          const pillar = modal.querySelector('#f-pillar').value || null;
          const subcategoryRaw = modal.querySelector('#f-subcat').value.trim();
          const subcategory = subcategoryRaw ? Catalog.canonicalSubcategory(s, subcategoryRaw, pillar) : null;
          const newData = {
            accountId: modal.querySelector('#f-acc').value,
            date: modal.querySelector('#f-date').value,
            concept,
            amount,
            type: modal.querySelector('#f-type').value,
            pillar,
            subcategory,
            tags,
            netPillar: modal.querySelector('#f-net').checked,
          };
          if (isEdit) {
            const idx = s.transactions.findIndex((t) => t.id === tx.id);
            s.transactions[idx] = { ...s.transactions[idx], ...newData };
          } else {
            s.transactions.push({
              id: Utils.uid('tx'), balance: null, importHash: Utils.uid('manual'),
              source: 'manual', rawRow: null, ...newData,
            });
          }
          if (modal.querySelector('#f-make-rule').checked && newData.pillar) {
            s.rules.push(Rules.ruleFromTransaction(newData));
            Widgets.toast('Movimiento guardado y regla creada para la próxima vez', 'success');
          } else {
            Widgets.toast('Movimiento guardado', 'success');
          }
          DB.markDirty();
          Widgets.closeModal();
          onDone();
        };
      },
    });
  }

  function openSplitForm(tx, onDone) {
    const rowsHtml = (n) => Array.from({ length: n }).map((_, i) => `
      <div class="card" style="margin-bottom:8px;" data-split-row="${i}">
        <div class="grid cols-2">
          <div class="field"><label>Importe</label><input type="number" step="0.01" class="split-amount" value="${i === 0 ? tx.amount : 0}"></div>
          <div class="field"><label>Pilar</label><select class="split-pillar"><option value="">—</option>${DB.PILLARS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label>Concepto</label><input class="split-concept" value="${Widgets.escapeHtml(tx.concept)}"></div>
        <div class="field"><label>Etiquetas</label><input class="split-tags" list="dl-tags" placeholder="#capricho_super"></div>
      </div>
    `).join('');

    let partCount = 2;
    const renderModal = () => Widgets.openModal(`
      <h2>Dividir compra</h2>
      <p class="muted">Importe original: <strong>${Utils.fmtMoney(tx.amount)}</strong></p>
      <div id="split-rows">${rowsHtml(partCount)}</div>
      ${Widgets.datalist('dl-tags', Catalog.allTagNames(DB.get()))}
      <div class="row">
        <button class="btn sm" id="add-row">+ Añadir parte</button>
        <span class="muted" id="sum-check"></span>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn ghost" id="f-cancel">Cancelar</button>
        <button class="btn primary" id="f-save">Confirmar división</button>
      </div>
    `, {
      wide: true,
      onMount: (modal) => {
        const updateSum = () => {
          const amounts = Array.from(modal.querySelectorAll('.split-amount')).map((i) => parseFloat(i.value) || 0);
          const sum = amounts.reduce((a, b) => a + b, 0);
          const diff = Math.abs(sum - tx.amount);
          const el = modal.querySelector('#sum-check');
          el.textContent = diff < 0.01 ? `✓ Suma correcta (${Utils.fmtMoney(sum)})` : `Suma actual: ${Utils.fmtMoney(sum)} — debe ser ${Utils.fmtMoney(tx.amount)}`;
          el.style.color = diff < 0.01 ? 'var(--success)' : 'var(--danger)';
        };
        modal.addEventListener('input', updateSum);
        updateSum();
        modal.querySelector('#add-row').onclick = () => { partCount++; Widgets.closeModal(); renderModal(); };
        modal.querySelector('#f-cancel').onclick = Widgets.closeModal;
        modal.querySelector('#f-save').onclick = () => {
          const s = DB.get();
          const rows = Array.from(modal.querySelectorAll('[data-split-row]')).map((row) => ({
            amount: parseFloat(row.querySelector('.split-amount').value) || 0,
            pillar: row.querySelector('.split-pillar').value || null,
            concept: row.querySelector('.split-concept').value.trim() || tx.concept,
            tags: Catalog.canonicalTags(s, row.querySelector('.split-tags').value.split(/\s+/).map((v) => v.trim()).filter(Boolean)),
          }));
          const sum = rows.reduce((a, r) => a + r.amount, 0);
          if (Math.abs(sum - tx.amount) > 0.01) { Widgets.toast('La suma de las partes debe coincidir con el importe original', 'error'); return; }
          const parent = s.transactions.find((t) => t.id === tx.id);
          parent.isSplitOriginal = true;
          for (const r of rows) {
            s.transactions.push({
              id: Utils.uid('tx'), accountId: tx.accountId, date: tx.date, concept: r.concept,
              amount: r.amount, balance: null, type: tx.type, pillar: r.pillar, subcategory: tx.subcategory,
              tags: r.tags, netPillar: tx.netPillar, importHash: Utils.uid('split'), source: 'split',
              splitGroupId: tx.id, rawRow: null,
            });
          }
          DB.markDirty();
          Widgets.closeModal();
          Widgets.toast('Compra dividida', 'success');
          onDone();
        };
      },
    });
    renderModal();
  }

  return { render, openTxForm };
})();
