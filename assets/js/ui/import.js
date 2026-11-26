// Pestaña: Subir extracto del banco
'use strict';

const UIImport = (() => {
  let chosenAccountId = '__new__';
  let rawTextCache = null;
  // Estado de la vista previa (paso 4, entre "parsear" y "confirmar de verdad").
  // rows[i]: { date, concept, amount, balance, type, pillar, subcategory, tags, rawRow, importHash }
  let preview = null;

  function render(container) {
    const state = DB.get();
    preview = null;
    container.innerHTML = `
      <h1>Subir extracto del banco</h1>
      <div class="import-steps">
        <span>1. Elige tu cuenta</span>
        <span>2. Arrastra aquí el archivo que te descargaste del banco</span>
        <span>3. Revisa y confirma</span>
      </div>

      ${SampleData.isActive() ? `
        <div class="pending-bar">
          <div class="pending-item">
            <span>Estás viendo datos de ejemplo. Al confirmar esta importación los borraremos automáticamente, para que no se mezclen con tus movimientos reales.</span>
          </div>
        </div>
      ` : ''}

      <div class="card" style="margin-bottom:16px;">
        <h2>1. ¿De qué cuenta es este extracto?</h2>
        <div class="field"><label>Cuenta</label>
          <select id="sel-account">
            <option value="__new__">+ Es una cuenta nueva</option>
            ${state.accounts.filter((a) => !a.isSample).map((a) => `<option value="${a.id}">${Widgets.escapeHtml(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="new-account-name-wrap"><label>Nombre para esta cuenta nueva</label><input id="new-account-name" placeholder="ej. Mi banco"></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <h2>2. Sube el archivo</h2>
        <div class="dropzone" id="dropzone">
          <p style="margin:0 0 6px;font-weight:600;">Arrastra aquí tu extracto (.csv)</p>
          <p class="muted" style="margin:0;">o haz clic para elegirlo desde tu ordenador</p>
        </div>
        <input type="file" id="f-file" accept=".csv,text/csv" style="display:none;">
      </div>

      <div id="import-flow"></div>
    `;

    const sel = container.querySelector('#sel-account');
    sel.value = chosenAccountId;
    const toggleNewAccName = () => { container.querySelector('#new-account-name-wrap').style.display = sel.value === '__new__' ? '' : 'none'; };
    sel.onchange = () => { chosenAccountId = sel.value; toggleNewAccName(); };
    toggleNewAccName();

    const fileInput = container.querySelector('#f-file');
    const dropzone = container.querySelector('#dropzone');
    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dragover'); };
    dropzone.ondragleave = () => dropzone.classList.remove('dragover');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) readFile(container, file);
    };
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) readFile(container, file);
    };
  }

  async function readFile(container, file) {
    const buffer = await file.arrayBuffer();
    rawTextCache = Utils.detectEncodingAndDecode(buffer);
    container.querySelector('#dropzone').innerHTML = `<p style="margin:0;font-weight:600;">✓ Archivo cargado: ${Widgets.escapeHtml(file.name)}</p><p class="muted" style="margin:4px 0 0;">Haz clic aquí para elegir otro</p>`;
    handleFile(container, rawTextCache);
  }

  function handleFile(container, rawText) {
    const flow = container.querySelector('#import-flow');
    const detected = Adapters.detect(rawText);
    const state = DB.get();

    // Si el usuario aún no eligió una cuenta existente y el extracto trae IBAN
    // que ya conocemos, se lo sugerimos solo (sin forzar su elección).
    if (detected && detected.id === 'imagin' && chosenAccountId === '__new__') {
      const probe = detected.parse(rawText);
      if (probe.iban) {
        const match = state.accounts.find((a) => a.iban === probe.iban);
        if (match) {
          chosenAccountId = match.id;
          const sel = container.querySelector('#sel-account');
          sel.value = match.id;
          container.querySelector('#new-account-name-wrap').style.display = 'none';
          Widgets.toast(`Hemos reconocido el IBAN: usando la cuenta "${match.name}".`, 'info');
        }
      }
    }

    if (detected) {
      flow.innerHTML = `
        <div class="card">
          <h2>3. Revisa y confirma</h2>
          <p>Hemos reconocido automáticamente: <strong>${detected.label}</strong></p>
          ${detected.options ? detected.options.map((o) => `
            <label class="row" style="gap:6px;"><input type="checkbox" style="width:auto;" id="opt-${o.key}" ${o.default ? 'checked' : ''}> ${o.label}</label>
          `).join('') : ''}
          <button class="btn primary" id="btn-process" style="margin-top:10px;">Ver vista previa</button>
        </div>
      `;
      flow.querySelector('#btn-process').onclick = () => {
        const options = {};
        (detected.options || []).forEach((o) => { options[o.key] = flow.querySelector(`#opt-${o.key}`).checked; });
        const { rows, iban, error } = detected.parse(rawText, options);
        if (error) { Widgets.toast(error, 'error'); return; }
        buildPreview(container, rows, detected.id, iban);
      };
    } else {
      flow.innerHTML = `
        <div class="card">
          <h2>3. Revisa y confirma</h2>
          <p>No hemos reconocido este banco automáticamente. Dinos qué columna es cada cosa (solo la primera vez):</p>
          <div class="field"><label>Separador de columnas</label>
            <select id="g-delim"><option value=",">Coma (,)</option><option value=";">Punto y coma (;)</option><option value="\t">Tabulador</option></select>
          </div>
          <div class="field"><label>Formato de los importes</label>
            <select id="g-decimal"><option value="eu">Europeo (1.234,56)</option><option value="us">Americano (1,234.56)</option></select>
          </div>
          <div id="g-mapping"></div>
          <div class="field"><label>Ponle un nombre a este banco (para recordarlo la próxima vez)</label><input id="g-profile-name" placeholder="ej. Mi Banco XYZ"></div>
          <button class="btn primary" id="btn-process-generic" style="margin-top:10px;">Ver vista previa</button>
        </div>
      `;
      const genericAdapter = Adapters.get('generic');
      const updateMapping = () => {
        const delim = flow.querySelector('#g-delim').value;
        const cols = genericAdapter.detectColumns(rawText, delim);
        flow.querySelector('#g-mapping').innerHTML = `
          <div class="grid cols-2">
            ${['date', 'concept', 'amount', 'balance'].map((f) => `
              <div class="field"><label>Columna: ${{ date: 'Fecha', concept: 'Concepto', amount: 'Importe', balance: 'Saldo (opcional)' }[f]}</label>
              <select id="map-${f}"><option value="">—</option>${cols.map((c) => `<option value="${Widgets.escapeHtml(c)}">${Widgets.escapeHtml(c)}</option>`).join('')}</select></div>
            `).join('')}
          </div>
        `;
      };
      flow.querySelector('#g-delim').onchange = updateMapping;
      updateMapping();
      flow.querySelector('#btn-process-generic').onclick = () => {
        const profile = {
          id: Utils.uid('profile'),
          name: flow.querySelector('#g-profile-name').value.trim() || 'Banco sin nombre',
          delimiter: flow.querySelector('#g-delim').value,
          decimalFormat: flow.querySelector('#g-decimal').value,
          columnMap: {
            date: flow.querySelector('#map-date').value,
            concept: flow.querySelector('#map-concept').value,
            amount: flow.querySelector('#map-amount').value,
            balance: flow.querySelector('#map-balance').value,
          },
        };
        if (!profile.columnMap.date || !profile.columnMap.amount) { Widgets.toast('Indica al menos qué columna es la Fecha y cuál el Importe', 'error'); return; }
        const { rows, error } = genericAdapter.parse(rawText, profile);
        if (error) { Widgets.toast(error, 'error'); return; }
        state.bankProfiles.push(profile);
        DB.markDirty();
        buildPreview(container, rows, profile.id, null);
      };
    }
  }

  // ---------- Paso 4: vista previa interactiva ----------

  function buildPreview(container, rows, adapterId, iban) {
    const state = DB.get();
    const sel = container.querySelector('#sel-account');
    const isNewAccount = sel.value === '__new__';
    const newAccountName = isNewAccount ? container.querySelector('#new-account-name').value.trim() : null;
    if (isNewAccount && !newAccountName) { Widgets.toast('Ponle un nombre a tu cuenta nueva antes de continuar', 'error'); return; }

    // Para una cuenta nueva no hay nada con lo que deduplicar todavía: todo es nuevo.
    // Usamos un id provisional solo para el cálculo; se recalculará con el id real
    // de la cuenta al confirmar, si es que se crea una.
    const dedupeAccountId = isNewAccount ? '__preview_new__' : sel.value;
    const existing = isNewAccount ? [] : state.transactions.filter((t) => t.accountId === dedupeAccountId);
    const hashed = Dedupe.assignHashes(dedupeAccountId, rows);
    const { fresh, duplicates } = Dedupe.filterNewAgainstExisting(hashed, existing);

    const workingRows = fresh.map((r) => Rules.applyRulesToTransaction({
      date: r.date, concept: r.concept, amount: r.amount, balance: r.balance,
      type: r.type, pillar: null, subcategory: null, tags: [], netPillar: false,
      rawRow: r.rawRow, importHash: r.importHash,
    }, state.rules));

    // Para lo que ninguna regla reconoció, proponemos (nunca aplicamos solos) una
    // clasificación basada en el historial o en raíces de comercio habituales, ya
    // preseleccionada en los desplegables para que con "Confirmar e importar" baste
    // si es correcta.
    for (const row of workingRows) {
      if (!Rules.isUnclassified(row)) continue;
      const suggestion = Suggestions.suggestForTransaction(row, state.transactions);
      if (!suggestion) continue;
      row.suggestion = suggestion;
      row.pillar = suggestion.pillar;
      row.subcategory = suggestion.subcategory;
      row.tags = suggestion.tags;
    }

    // Retiradas de cajero: se sugiere pasar a Traspaso interno (el dinero no
    // desaparece, solo cambia de "bolsillo") y abonar el mismo importe en la cuenta
    // de Efectivo, marcado por defecto pero desmarcable.
    for (const row of workingRows) {
      if (!Suggestions.isAtmWithdrawal(row)) continue;
      row.isAtmWithdrawal = true;
      row.type = 'traspaso';
      row.tags = Catalog.canonicalTags(state, [...(row.tags || []), '#cajero']);
      row.mirrorToCash = true;
      row.cashAccountId = null;
    }

    preview = {
      isNewAccount, newAccountName, dedupeAccountId, adapterId, iban, duplicates,
      rows: workingRows, filterUnclassified: false, searchText: '', selectedIndices: new Set(),
    };
    renderPreview(container);
  }

  function renderPreview(container) {
    const flow = container.querySelector('#import-flow');
    const rows = preview.rows;
    const retentionPairs = Budget.detectRetentionPairs(rows);
    const unclassifiedCount = rows.filter(Rules.isUnclassified).length;
    const classifiedCount = rows.length - unclassifiedCount;
    const pct = rows.length ? Math.round((classifiedCount / rows.length) * 100) : 100;

    flow.innerHTML = `
      <div class="card">
        <h2>4. Vista previa — revisa antes de guardar</h2>
        <div class="pv-progress-wrap">
          <div class="row between wrap" style="gap:8px;font-size:13px;">
            <span id="pv-progress-text">
              <strong>${classifiedCount}</strong> de <strong>${rows.length}</strong> clasificados · faltan <strong>${unclassifiedCount}</strong>
            </span>
            ${preview.duplicates > 0 ? `<span class="muted">Repetidos omitidos: ${preview.duplicates}</span>` : ''}
          </div>
          <div class="progress-bar"><div id="pv-progress-fill" style="width:${pct}%;background:var(--accent-orange);"></div></div>
        </div>
        ${rows.length > 0 ? `
          <div class="pv-toolbar">
            <input id="pv-search" type="search" placeholder="Buscar por concepto..." value="${Widgets.escapeHtml(preview.searchText || '')}">
            <label class="row" style="gap:6px;align-items:center;margin:0;">
              <input type="checkbox" style="width:auto;" id="pv-filter-unclassified" ${preview.filterUnclassified ? 'checked' : ''} ${unclassifiedCount === 0 ? 'disabled' : ''}>
              <span>Mostrar solo sin clasificar (<span id="pv-unclassified-count">${unclassifiedCount}</span>)</span>
              ${Widgets.helpIcon('Oculta de esta lista los movimientos que ya tienen pilar asignado (por una regla o manualmente), para que no tengas que hacer scroll entre todos para encontrar los que faltan por revisar. No afecta a lo que se va a guardar: se guardan igualmente todos los movimientos, estén o no filtrados aquí.')}
            </label>
          </div>
          <div class="pv-bulk-bar" id="pv-bulk-bar">
            <label class="row" style="gap:6px;align-items:center;margin:0;">
              <input type="checkbox" style="width:auto;" id="pv-select-all">
              <span>Seleccionar visibles (<span id="pv-visible-count">0</span>)</span>
              <span class="muted" id="pv-selected-count"></span>
            </label>
            <div class="row wrap" style="gap:8px;">
              <select id="pv-bulk-type">
                <option value="">— Tipo (sin cambios) —</option>
                <option value="gasto">Gasto</option>
                <option value="ingreso">Ingreso</option>
                <option value="traspaso">Traspaso interno</option>
                <option value="retencion">Retención / Anulado</option>
              </select>
              <select id="pv-bulk-pillar">
                <option value="">— Elegir pilar —</option>
                ${DB.PILLARS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
              </select>
              <button class="btn sm primary" id="pv-bulk-apply" disabled>Aplicar a seleccionadas</button>
            </div>
          </div>
        ` : ''}
        ${retentionSuggestionsHtml(retentionPairs)}
        ${rows.length === 0 ? '<div class="empty-state">No hay movimientos nuevos que importar (todos ya estaban registrados).</div>' : `
          <div class="pv-table-wrap">
            <table class="pv-table">
              <thead><tr>
                <th style="width:32px;"></th>
                <th>Fecha</th><th>Concepto</th><th>Importe</th><th>Tipo</th><th>Pilar / Etiquetas</th><th></th>
              </tr></thead>
              <tbody id="preview-rows"></tbody>
            </table>
          </div>
          <div class="empty-state" id="pv-empty-filtered" style="display:none;"></div>
        `}
        <div class="row between pv-sticky-actions">
          <button class="btn ghost" id="btn-preview-back">‹ Volver</button>
          <button class="btn primary" id="btn-confirm-import" ${rows.length === 0 ? 'disabled' : ''}>Confirmar e importar</button>
        </div>
      </div>
    `;

    const progressTextEl = flow.querySelector('#pv-progress-text');
    const progressFillEl = flow.querySelector('#pv-progress-fill');
    const unclassCountEl = flow.querySelector('#pv-unclassified-count');
    const filterCb = flow.querySelector('#pv-filter-unclassified');
    const searchInput = flow.querySelector('#pv-search');
    const selectAllCb = flow.querySelector('#pv-select-all');
    const visibleCountEl = flow.querySelector('#pv-visible-count');
    const selectedCountEl = flow.querySelector('#pv-selected-count');
    const bulkApplyBtn = flow.querySelector('#pv-bulk-apply');
    const tbody = flow.querySelector('#preview-rows');
    const emptyFilteredEl = flow.querySelector('#pv-empty-filtered');

    function getVisibleEntries() {
      const needle = Utils.normalizeText(preview.searchText || '');
      const list = [];
      rows.forEach((r, i) => {
        if (preview.filterUnclassified && !Rules.isUnclassified(r)) return;
        if (needle && !Utils.normalizeText(r.concept).includes(needle)) return;
        list.push({ row: r, index: i });
      });
      return list;
    }

    function updateStats() {
      const unclass = rows.filter(Rules.isUnclassified).length;
      const classif = rows.length - unclass;
      const pctNow = rows.length ? Math.round((classif / rows.length) * 100) : 100;
      if (progressTextEl) {
        progressTextEl.innerHTML = `<strong>${classif}</strong> de <strong>${rows.length}</strong> clasificados · faltan <strong>${unclass}</strong>`;
      }
      if (progressFillEl) progressFillEl.style.width = `${pctNow}%`;
      if (unclassCountEl) unclassCountEl.textContent = String(unclass);
      if (filterCb) filterCb.disabled = unclass === 0 && !preview.filterUnclassified;
    }

    function updateSelectionUi() {
      if (!selectAllCb || !tbody) return;
      const visibleCheckboxes = Array.from(tbody.querySelectorAll('.pv-row-check'));
      const visibleTotal = visibleCheckboxes.length;
      const visibleChecked = visibleCheckboxes.filter((cb) => cb.checked).length;
      if (visibleCountEl) visibleCountEl.textContent = String(visibleTotal);
      selectAllCb.checked = visibleTotal > 0 && visibleChecked === visibleTotal;
      selectAllCb.indeterminate = visibleChecked > 0 && visibleChecked < visibleTotal;
      const selCount = preview.selectedIndices.size;
      if (selectedCountEl) selectedCountEl.textContent = selCount > 0 ? `· ${selCount} marcada${selCount === 1 ? '' : 's'}` : '';
      if (bulkApplyBtn) bulkApplyBtn.disabled = selCount === 0;
    }

    function updateEmptyFiltered(visibleLen) {
      if (!emptyFilteredEl) return;
      if (visibleLen === 0 && rows.length > 0) {
        emptyFilteredEl.textContent = preview.searchText
          ? 'Ningún movimiento coincide con tu búsqueda.'
          : 'Ya no queda ninguno sin clasificar en este lote.';
        emptyFilteredEl.style.display = '';
      } else {
        emptyFilteredEl.style.display = 'none';
      }
    }

    function renderRows() {
      if (!tbody) return;
      tbody.innerHTML = '';
      const entries = getVisibleEntries();
      for (const { row: r, index: i } of entries) {
        const tr = document.createElement('tr');
        tr.dataset.i = String(i);
        tr.innerHTML = `
          <td class="pv-col-check"><input type="checkbox" class="pv-row-check" data-i="${i}" style="width:auto;" ${preview.selectedIndices.has(i) ? 'checked' : ''}></td>
          <td class="pv-col-date">${Utils.fmtDate(r.date)}</td>
          <td class="pv-col-concept">${Widgets.escapeHtml(r.concept)}</td>
          <td class="pv-col-amount" style="color:${r.amount < 0 ? 'var(--danger)' : 'var(--success)'};font-weight:600;">${Utils.fmtMoney(r.amount)}</td>
          <td class="pv-col-type">
            <select class="pv-type" data-i="${i}">
              <option value="gasto" ${r.type === 'gasto' ? 'selected' : ''}>Gasto</option>
              <option value="ingreso" ${r.type === 'ingreso' ? 'selected' : ''}>Ingreso</option>
              <option value="traspaso" ${r.type === 'traspaso' ? 'selected' : ''}>Traspaso interno</option>
              <option value="retencion" ${r.type === 'retencion' ? 'selected' : ''}>Retención / Anulado</option>
            </select>
            ${r.isAtmWithdrawal ? renderAtmWithdrawalControls(r, i) : ''}
          </td>
          <td class="pv-col-pillar">
            <select class="pv-pillar" data-i="${i}">
              <option value="">— Sin clasificar —</option>
              ${DB.PILLARS.map((p) => `<option value="${p.id}" ${r.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
            ${(r.tags || []).map((tg) => `<span class="tag">${Widgets.escapeHtml(tg)}</span>`).join(' ')}
            ${r.suggestion ? `<div class="pv-suggestion-wrap"><span class="tag" style="background:var(--accent-lavender);color:#2a1e3d;border-color:var(--accent-lavender);" title="${Widgets.escapeHtml(r.suggestion.reason)}">${r.suggestion.badge}</span></div>` : ''}
          </td>
          <td class="pv-col-actions">
            <button class="btn sm pv-create-rule" data-i="${i}">${r.suggestion ? 'Fijar como regla' : 'Crear regla'}</button>
            <button class="btn sm ${(r.tags || []).some((t) => Utils.foldKey(t) === '#impulso') ? 'primary' : ''} pv-impulso" data-i="${i}" title="Márcalo si fue una compra por impulso, sin planificar">⚡</button>
          </td>
        `;
        tbody.appendChild(tr);
      }

      tbody.querySelectorAll('.pv-row-check').forEach((cb) => {
        cb.onchange = (e) => {
          const idx = Number(e.target.dataset.i);
          if (e.target.checked) preview.selectedIndices.add(idx);
          else preview.selectedIndices.delete(idx);
          updateSelectionUi();
        };
      });

      const handleRowChange = (tr, idx) => {
        const row = preview.rows[idx];
        row.manuallyEdited = true;
        row.suggestion = null;
        const sugEl = tr.querySelector('.pv-suggestion-wrap');
        if (sugEl) sugEl.remove();
        const ruleBtn = tr.querySelector('.pv-create-rule');
        if (ruleBtn) ruleBtn.textContent = 'Crear regla';
        updateStats();
        if (preview.filterUnclassified && !Rules.isUnclassified(row)) {
          preview.selectedIndices.delete(idx);
          tr.remove();
          updateSelectionUi();
          updateEmptyFiltered(tbody.children.length);
        }
      };

      tbody.querySelectorAll('.pv-type').forEach((sel) => {
        sel.onchange = (e) => {
          const idx = Number(e.target.dataset.i);
          preview.rows[idx].type = e.target.value;
          handleRowChange(e.target.closest('tr'), idx);
        };
      });

      tbody.querySelectorAll('.pv-pillar').forEach((sel) => {
        sel.onchange = (e) => {
          const idx = Number(e.target.dataset.i);
          preview.rows[idx].pillar = e.target.value || null;
          handleRowChange(e.target.closest('tr'), idx);
        };
      });

      tbody.querySelectorAll('.pv-create-rule').forEach((btn) => {
        btn.onclick = () => openQuickRuleModal(container, Number(btn.dataset.i));
      });

      tbody.querySelectorAll('.pv-impulso').forEach((btn) => {
        btn.onclick = (e) => {
          const idx = Number(e.target.dataset.i);
          const row = preview.rows[idx];
          const has = (row.tags || []).some((t) => Utils.foldKey(t) === '#impulso');
          row.tags = has
            ? row.tags.filter((t) => Utils.foldKey(t) !== '#impulso')
            : [...(row.tags || []), Catalog.canonicalTag(DB.get(), '#impulso')];
          e.target.classList.toggle('primary', !has);
        };
      });

      tbody.querySelectorAll('.pv-mirror-cash').forEach((cb) => {
        cb.onchange = (e) => { preview.rows[Number(e.target.dataset.i)].mirrorToCash = e.target.checked; };
      });
      tbody.querySelectorAll('.pv-cash-account').forEach((sel) => {
        sel.onchange = (e) => { preview.rows[Number(e.target.dataset.i)].cashAccountId = e.target.value; };
      });

      updateSelectionUi();
      updateEmptyFiltered(entries.length);
    }

    renderRows();

    if (filterCb) {
      filterCb.onchange = (e) => {
        preview.filterUnclassified = e.target.checked;
        renderRows();
        updateStats();
      };
    }
    if (searchInput) {
      searchInput.oninput = (e) => {
        preview.searchText = e.target.value;
        renderRows();
      };
    }
    if (selectAllCb && tbody) {
      selectAllCb.onchange = (e) => {
        const checked = e.target.checked;
        tbody.querySelectorAll('.pv-row-check').forEach((cb) => {
          cb.checked = checked;
          const idx = Number(cb.dataset.i);
          if (checked) preview.selectedIndices.add(idx);
          else preview.selectedIndices.delete(idx);
        });
        updateSelectionUi();
      };
    }
    if (bulkApplyBtn) {
      bulkApplyBtn.onclick = () => {
        const newType = flow.querySelector('#pv-bulk-type').value;
        const newPillar = flow.querySelector('#pv-bulk-pillar').value;
        if (!newType && !newPillar) {
          Widgets.toast('Elige un Tipo o un Pilar para aplicar en lote', 'info');
          return;
        }
        const count = preview.selectedIndices.size;
        if (count === 0) return;
        for (const idx of preview.selectedIndices) {
          const row = preview.rows[idx];
          if (!row) continue;
          if (newType) row.type = newType;
          if (newPillar) row.pillar = newPillar;
          row.manuallyEdited = true;
          row.suggestion = null;
        }
        preview.selectedIndices.clear();
        flow.querySelector('#pv-bulk-type').value = '';
        flow.querySelector('#pv-bulk-pillar').value = '';
        renderRows();
        updateStats();
        Widgets.toast(`Actualizados ${count} movimiento${count === 1 ? '' : 's'}`, 'success');
      };
    }

    flow.querySelectorAll('.pv-mark-retencion').forEach((btn) => {
      btn.onclick = () => {
        const pair = retentionPairs[Number(btn.dataset.pair)];
        pair.a.type = 'retencion';
        pair.a.manuallyEdited = true;
        pair.b.type = 'retencion';
        pair.b.manuallyEdited = true;
        renderPreview(container);
      };
    });
    flow.querySelector('#btn-preview-back').onclick = () => { preview = null; handleFile(container, rawTextCache); };
    const confirmBtn = flow.querySelector('#btn-confirm-import');
    if (confirmBtn) confirmBtn.onclick = () => confirmImport(container);
  }

  // Insignia + casilla "+ Abonar ese efectivo en mi cuenta Cartera" para una fila que
  // el motor de sugerencias reconoce como retirada de cajero. Si hay 2+ cuentas de
  // efectivo, deja elegir a cuál; con 0 o 1, no hace falta preguntar.
  function renderAtmWithdrawalControls(row, i) {
    const state = DB.get();
    const cashAccounts = state.accounts.filter((a) => a.type === 'cash');
    let destinationLabel;
    if (cashAccounts.length > 1) {
      destinationLabel = `<select class="pv-cash-account" data-i="${i}" style="width:auto;display:inline-block;">
        ${cashAccounts.map((a) => `<option value="${a.id}" ${row.cashAccountId === a.id ? 'selected' : ''}>${Widgets.escapeHtml(a.name)}</option>`).join('')}
      </select>`;
    } else if (cashAccounts.length === 1) {
      destinationLabel = `<strong>${Widgets.escapeHtml(cashAccounts[0].name)}</strong>`;
    } else {
      destinationLabel = `<strong>Efectivo / Cartera</strong> (se creará)`;
    }
    return `
      <div style="margin-top:4px;">
        <span class="tag" style="background:var(--accent-lavender);color:#2a1e3d;border-color:var(--accent-lavender);">Retirada de cajero</span>
        <label class="row" style="font-size:12px;gap:4px;margin-top:4px;">
          <input type="checkbox" class="pv-mirror-cash" data-i="${i}" style="width:auto;" ${row.mirrorToCash ? 'checked' : ''}>
          + Abonar ese efectivo en ${destinationLabel}
        </label>
      </div>
    `;
  }

  // "Posible retención y devolución detectada (±15,00 €) → Marcar ambas como
  // Retención / Anulado": dos movimientos con importe exactamente opuesto en pocos
  // días, típico de gasolineras, hoteles, Uber o máquinas expendedoras.
  function retentionSuggestionsHtml(pairs) {
    if (!pairs.length) return '';
    return `
      <div class="pending-bar">
        ${pairs.map((p, i) => `
          <div class="pending-item">
            <span>Posible retención y devolución detectada (±${Utils.fmtMoney(p.amount)}): "${Widgets.escapeHtml(p.a.concept)}" y "${Widgets.escapeHtml(p.b.concept)}"${p.looksLikeReversal ? ' <span class="tag">devolución</span>' : ''}</span>
            <button class="btn sm primary pv-mark-retencion" data-pair="${i}">Marcar ambas como Retención / Anulado</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Crea una regla a partir de una fila de la vista previa y la aplica al instante a
  // TODAS las filas de este mismo CSV que coincidan (no hace falta esperar a la
  // siguiente importación para ver el efecto).
  function openQuickRuleModal(container, rowIndex) {
    const row = preview.rows[rowIndex];
    const suggestedPattern = row.suggestion
      ? Suggestions.significantWord(row.concept)
      : row.concept.split(/\s+/).slice(0, 2).join(' ');
    Widgets.openModal(`
      <h2>Crear regla</h2>
      <p class="muted">Los movimientos cuyo concepto contenga esta palabra se clasificarán solos a partir de ahora.</p>
      <div class="field"><label>Si el concepto contiene...</label><input id="f-pattern" value="${Widgets.escapeHtml(suggestedPattern)}"></div>
      <div class="field"><label>Pilar Kakeibo</label>
        <select id="f-pillar"><option value="">—</option>${DB.PILLARS.map((p) => `<option value="${p.id}" ${row.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Etiquetas (opcional) ${Widgets.helpIcon('Puedes añadir varias: escríbelas separadas por un espacio, cada una con su #. Ej: #ocio #impulso.')}</label><input id="f-tags" list="dl-tags" value="${(row.tags || []).join(' ')}" placeholder="#ocio #impulso"></div>
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
          DB.markDirty();
          // Reclasifica al instante las filas de ESTE lote que coincidan con la
          // palabra clave recién creada. Se aplica solo esa regla (no todo el
          // cascada de reglas) y se respetan las filas que el usuario ya haya
          // editado a mano en la vista previa, para no pisar sus cambios.
          preview.rows = preview.rows.map((r) => (r.manuallyEdited ? r : Rules.applyRulesToTransaction(r, [newRule])));
          Widgets.closeModal();
          Widgets.toast('Regla creada y aplicada a este lote', 'success');
          renderPreview(container);
        };
      },
    });
  }

  function confirmImport(container) {
    clearSampleIfNeeded(container);
    const state = DB.get();
    let accountId;
    if (preview.isNewAccount) {
      const existingByIban = preview.iban ? state.accounts.find((a) => a.iban === preview.iban) : null;
      if (existingByIban) {
        accountId = existingByIban.id;
      } else {
        const acc = { id: Utils.uid('acc'), name: preview.newAccountName, type: 'bank', iban: preview.iban || null, color: '#5FB49C', bankAdapter: preview.adapterId };
        state.accounts.push(acc);
        accountId = acc.id;
      }
      // Los hashes se calcularon con un id provisional; se recalculan con el real
      // para que la deduplicación futura funcione correctamente.
      const rehashed = Dedupe.assignHashes(accountId, preview.rows);
      preview.rows = preview.rows.map((r, i) => ({ ...r, importHash: rehashed[i].importHash }));
    } else {
      accountId = preview.dedupeAccountId;
    }
    const newTxs = preview.rows.map((r) => ({
      id: Utils.uid('tx'), accountId, date: r.date, concept: r.concept, amount: r.amount, balance: r.balance,
      type: r.type, pillar: r.pillar, subcategory: r.subcategory, tags: r.tags, netPillar: r.netPillar || false,
      importHash: r.importHash, rawRow: r.rawRow, source: 'csv', adapterId: preview.adapterId,
    }));
    state.transactions.push(...newTxs);

    // Retiradas de cajero marcadas para abonar en Efectivo: se crea el espejo AHORA,
    // con el importHash real ya asignado arriba (necesario para el hash determinista
    // mirror_<original> que evita duplicados si se reimporta el mismo extracto).
    let mirrorsCreated = 0;
    let mirrorsSkippedDuplicate = 0;
    preview.rows.forEach((r, i) => {
      if (!r.isAtmWithdrawal || !r.mirrorToCash) return;
      const finalTx = newTxs[i];
      if (finalTx.type !== 'traspaso') return; // el usuario lo cambió a mano, respetar su elección
      const cashAccountId = CashMirror.resolveCashAccountId(state, r.cashAccountId);
      if (!cashAccountId) return; // ambiguo (2+ cuentas) y no eligió ninguna: no se crea nada
      const result = CashMirror.createMirrorIfNeeded(state, finalTx, cashAccountId);
      if (result.created) mirrorsCreated++;
      else if (result.reason === 'possible-duplicate') mirrorsSkippedDuplicate++;
    });

    DB.markDirty();
    App.ensureDataVisibleInCurrentPeriod();
    const accName = state.accounts.find((a) => a.id === accountId)?.name || '';
    const unclassifiedCount = newTxs.filter(Rules.isUnclassified).length;
    const duplicates = preview.duplicates;
    chosenAccountId = '__new__';
    rawTextCache = null;
    preview = null;
    if (mirrorsSkippedDuplicate > 0) {
      Widgets.toast(`No se abonó en efectivo ${mirrorsSkippedDuplicate} retirada${mirrorsSkippedDuplicate === 1 ? '' : 's'} porque ya había un movimiento parecido en esa cuenta.`, 'info');
    }
    renderResult(container, newTxs.length, duplicates, accName, unclassifiedCount, mirrorsCreated);
  }

  // Si el usuario estaba en modo "mes de ejemplo" y ahora importa un extracto real,
  // borramos el ejemplo justo antes de importar para que no se mezclen los movimientos
  // ficticios con los suyos. Se hace en el mismo clic de "Confirmar e importar" (sin
  // pasos extra) y se corrige el desplegable de cuenta por si apuntaba a una cuenta
  // de ejemplo que ya no existe.
  function clearSampleIfNeeded(container) {
    if (!SampleData.isActive()) return;
    SampleData.clear();
    const state = DB.get();
    const sel = container.querySelector('#sel-account');
    if (sel) {
      const current = sel.value;
      const stillValid = state.accounts.some((a) => a.id === current);
      sel.innerHTML = '<option value="__new__">+ Es una cuenta nueva</option>'
        + state.accounts.map((a) => `<option value="${a.id}">${Widgets.escapeHtml(a.name)}</option>`).join('');
      sel.value = stillValid ? current : '__new__';
      const nameWrap = container.querySelector('#new-account-name-wrap');
      if (nameWrap) nameWrap.style.display = sel.value === '__new__' ? '' : 'none';
      if (!stillValid && preview) preview.isNewAccount = true;
    }
    const banner = container.querySelector('.pending-bar');
    if (banner) banner.remove();
    Widgets.toast('Hemos borrado los datos de ejemplo para no mezclarlos con tus movimientos reales.', 'info');
  }

  function renderResult(container, addedCount, duplicates, accName, unclassifiedCount, mirrorsCreated = 0) {
    const state = DB.get();
    const showKakeiboPrompt = !state.settings.budgetConfigured;
    container.innerHTML = `
      <div class="welcome-wrap">
        <h1>¡Listo!</h1>
        <div class="card" style="text-align:left;">
          <p><strong>${addedCount}</strong> movimiento${addedCount === 1 ? '' : 's'} nuevo${addedCount === 1 ? '' : 's'} añadido${addedCount === 1 ? '' : 's'} en "${Widgets.escapeHtml(accName)}".</p>
          ${duplicates > 0 ? `<p class="muted">Movimientos repetidos omitidos automáticamente: ${duplicates} (ya los tenías registrados, no se han duplicado).</p>` : ''}
          ${mirrorsCreated > 0 ? `<p class="muted">Se ha${mirrorsCreated === 1 ? '' : 'n'} abonado ${mirrorsCreated} retirada${mirrorsCreated === 1 ? '' : 's'} de cajero en tu cuenta de efectivo.</p>` : ''}
          <div class="row" style="margin-top:16px;">
            ${unclassifiedCount > 0
              ? `<button class="btn primary" id="btn-go-review">Revisar ${unclassifiedCount} gasto${unclassifiedCount === 1 ? '' : 's'} nuevo${unclassifiedCount === 1 ? '' : 's'} sin clasificar</button>`
              : ''}
            <button class="btn ${unclassifiedCount > 0 ? '' : 'primary'}" id="btn-go-summary">Ver mi resumen ahora</button>
            <button class="btn ghost" id="btn-import-more">Subir otro extracto</button>
          </div>
          ${showKakeiboPrompt ? `<div class="pending-bar" style="margin-top:14px;">
            <div class="pending-item">
              <span>Siguiente paso: define tu meta de ahorro Kakeibo <span class="muted">(2 min)</span></span>
              <button class="btn sm primary" id="btn-go-budget">Configurar mi plan →</button>
            </div>
          </div>` : ''}
        </div>
      </div>
    `;
    const reviewBtn = container.querySelector('#btn-go-review');
    if (reviewBtn) reviewBtn.onclick = () => App.goToTab('gastos', { unclassifiedOnly: true });
    container.querySelector('#btn-go-summary').onclick = () => App.goToTab('resumen');
    container.querySelector('#btn-import-more').onclick = () => render(container);
    const budgetBtn = container.querySelector('#btn-go-budget');
    if (budgetBtn) budgetBtn.onclick = () => App.goToTab('presupuesto', { subtab: 'presupuesto' });
  }

  return { render };
})();
