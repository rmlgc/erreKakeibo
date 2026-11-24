// Pestaña: Presupuesto por bloques
'use strict';

const UIBudget = (() => {
  // Plantillas base para arrancar la configuración de bloques. Son solo un punto de
  // partida editable: al elegir una se sustituyen los bloques en edición (todavía sin
  // guardar hasta pulsar "Guardar").
  const BUDGET_TEMPLATES = {
    cuartos: {
      label: 'Regla de Cuartos (50/25/25)',
      blocks: () => [
        { name: 'Ahorro', pct: 25, pillars: [], subcats: [], tags: [], isSavings: true, subLimits: [] },
        {
          name: 'Gastos propios', pct: 25, pillars: ['ocio', 'cultura'], subcats: [], tags: [],
          subLimits: [{ label: 'Capricho súper', amount: 50, matchTags: ['#capricho_super'], matchSubcategory: null }],
        },
        { name: 'Todo lo demás', pct: 50, pillars: ['supervivencia', 'extras'], subcats: [], tags: [], subLimits: [] },
      ],
    },
    clasica: {
      label: 'Regla 50/30/20 (Clásica)',
      blocks: () => [
        { name: 'Necesidades', pct: 50, pillars: ['supervivencia'], subcats: [], tags: [], subLimits: [] },
        { name: 'Deseos', pct: 30, pillars: ['ocio', 'cultura', 'extras'], subcats: [], tags: [], subLimits: [] },
        { name: 'Ahorro', pct: 20, pillars: [], subcats: [], tags: [], isSavings: true, subLimits: [] },
      ],
    },
    cuatro_pilares: {
      label: 'Kakeibo 4 Pilares + Ahorro',
      blocks: () => [
        { name: 'Ahorro', pct: 10, pillars: [], subcats: [], tags: [], isSavings: true, subLimits: [] },
        { name: 'Supervivencia', pct: 45, pillars: ['supervivencia'], subcats: [], tags: [], subLimits: [] },
        { name: 'Ocio y Vicio', pct: 20, pillars: ['ocio'], subcats: [], tags: [], subLimits: [] },
        { name: 'Cultura', pct: 10, pillars: ['cultura'], subcats: [], tags: [], subLimits: [] },
        { name: 'Extras', pct: 15, pillars: ['extras'], subcats: [], tags: [], subLimits: [] },
      ],
    },
    blanco: { label: 'Personalizado en blanco', blocks: () => [] },
  };

  function render(container, periodFilter) {
    const state = DB.get();
    const preset = state.budgetPresets.find((p) => p.id === state.activeBudgetPresetId) || state.budgetPresets[0];
    const txs = App.filterByPeriodAndAccount(state.transactions, periodFilter);
    const kpis = Budget.computeKPIs(txs);
    const incomeForPeriod = state.settings.useRealIncome ? kpis.ingresos : state.settings.incomeBaseMonthly;
    const result = Budget.computeBudget(txs, preset, incomeForPeriod);

    container.innerHTML = `
      <div class="row between" style="margin-bottom:12px;">
        <h1>Presupuesto por bloques</h1>
        <button class="btn primary" id="btn-edit-preset">Configurar bloques</button>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="row wrap">
          <div class="field" style="min-width:220px;"><label>Preset activo</label>
            <select id="sel-preset">${state.budgetPresets.map((p) => `<option value="${p.id}" ${p.id === preset.id ? 'selected' : ''}>${Widgets.escapeHtml(p.name)}</option>`).join('')}</select>
          </div>
          <div class="field" style="min-width:200px;"><label>Base de ingreso</label>
            <select id="sel-income-mode">
              <option value="real" ${state.settings.useRealIncome ? 'selected' : ''}>Ingresos reales del periodo</option>
              <option value="fixed" ${!state.settings.useRealIncome ? 'selected' : ''}>Ingreso base fijo</option>
            </select>
          </div>
          ${!state.settings.useRealIncome ? `<div class="field" style="min-width:160px;"><label>Ingreso base mensual</label><input type="number" id="f-income-base" value="${state.settings.incomeBaseMonthly}"></div>` : ''}
        </div>
        <p class="muted">Base de cálculo del periodo: <strong>${Utils.fmtMoney(result.totalIncome)}</strong></p>
      </div>
      <div class="grid cols-3" id="blocks-grid"></div>
    `;

    const grid = container.querySelector('#blocks-grid');
    for (const b of result.blocks) {
      const pct = Math.min(1, Math.max(0, b.pctUsed));
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="row between"><strong>${Widgets.escapeHtml(b.name)}</strong><span class="tag">${b.pct}%</span></div>
        <div class="muted" style="margin:6px 0;">Límite: ${Utils.fmtMoney(b.limit)}</div>
        <div class="progress-bar"><div style="width:${pct * 100}%;background:${b.over ? 'var(--danger)' : 'var(--accent-orange)'};"></div></div>
        <div class="row between" style="margin-top:8px;font-size:13px;">
          <span>${b.isSavings ? 'Ahorrado' : 'Gastado'}: ${Utils.fmtMoney(b.spent)}</span>
          <span class="${b.over ? 'kpi-value negative' : ''}" style="font-size:13px;">${b.over ? 'Excedido' : `Restante: ${Utils.fmtMoney(b.remaining)}`}</span>
        </div>
        ${b.subLimits.length ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">${b.subLimits.map((sl) => `
          <div class="row between" style="font-size:12px;">
            <span>${Widgets.escapeHtml(sl.label)}</span>
            <span style="color:${sl.over ? 'var(--danger)' : 'var(--text-muted)'}">${Utils.fmtMoney(sl.used)} / ${Utils.fmtMoney(sl.amount)}</span>
          </div>
        `).join('')}</div>` : ''}
      `;
      grid.appendChild(card);
    }

    container.querySelector('#sel-preset').onchange = (e) => { state.activeBudgetPresetId = e.target.value; DB.markDirty(); render(container, periodFilter); };
    container.querySelector('#sel-income-mode').onchange = (e) => { state.settings.useRealIncome = e.target.value === 'real'; DB.markDirty(); render(container, periodFilter); };
    const incomeInput = container.querySelector('#f-income-base');
    if (incomeInput) incomeInput.onchange = (e) => { state.settings.incomeBaseMonthly = parseFloat(e.target.value) || 0; DB.markDirty(); render(container, periodFilter); };
    container.querySelector('#btn-edit-preset').onclick = () => openPresetEditor(preset, () => render(container, periodFilter));
  }

  function openPresetEditor(preset, onDone) {
    Widgets.openModal(`
      <h2>Configurar: ${Widgets.escapeHtml(preset.name)}</h2>
      <div class="grid cols-2">
        <div class="field"><label>Nombre del preset</label><input id="f-name" value="${Widgets.escapeHtml(preset.name)}"></div>
        <div class="field"><label>Empezar desde una plantilla</label>
          <select id="sel-template">
            <option value="">— Elegir plantilla (sustituye los bloques) —</option>
            ${Object.entries(BUDGET_TEMPLATES).map(([key, t]) => `<option value="${key}">${t.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="blocks-editor"></div>
      <button class="btn sm" id="add-block" style="margin-top:8px;">+ Añadir bloque</button>
      <p id="sum-warning" class="muted" style="margin-top:10px;"></p>
      <div class="row" style="justify-content:flex-end;margin-top:14px;">
        <button class="btn ghost" id="cancel">Cancelar</button>
        <button class="btn primary" id="save">Guardar</button>
      </div>
    `, {
      wide: true,
      onMount: (modal) => {
        let blocks = JSON.parse(JSON.stringify(preset.blocks));

        const updateSum = () => {
          const sum = blocks.reduce((acc, b) => acc + (Number(b.pct) || 0), 0);
          const el = modal.querySelector('#sum-warning');
          el.textContent = Math.abs(sum - 100) < 0.01 ? `✓ Suma: ${sum}%` : `La suma de los bloques es ${sum}% — debe ser 100%`;
          el.style.color = Math.abs(sum - 100) < 0.01 ? 'var(--success)' : 'var(--danger)';
        };

        const renderSubLimits = (b, i) => {
          const editing = b._editingSubLimit;
          const list = (b.subLimits || []).map((sl, si) => {
            if (editing === si) return subLimitFormHtml(sl, i, si);
            const matchDesc = (sl.matchTags && sl.matchTags.length) ? sl.matchTags.join(' ') : (sl.matchSubcategory || '—');
            return `
              <div class="row between" style="font-size:12px;padding:3px 0;">
                <span>${Widgets.escapeHtml(sl.label)} <span class="muted">(${Widgets.escapeHtml(matchDesc)})</span> — ${Utils.fmtMoney(sl.amount)}</span>
                <span class="row" style="gap:4px;">
                  <button class="btn sm edit-sublimit" data-block="${i}" data-sl="${si}">Editar</button>
                  <button class="btn sm danger del-sublimit" data-block="${i}" data-sl="${si}">Borrar</button>
                </span>
              </div>
            `;
          }).join('');
          const newForm = editing === 'new' ? subLimitFormHtml(null, i, 'new') : '';
          return `
            <div class="field">
              <label>Mini-sobres / topes en euros (por etiqueta o subcategoría) ${Widgets.helpIcon('Un límite aparte dentro de este bloque, p.ej. 50€ para #capricho_super. Si otro bloque cuenta el pilar completo, ese importe ya no se le suma dos veces.')}</label>
              ${list || '<p class="muted" style="font-size:12px;">Sin mini-sobres.</p>'}
              ${newForm}
              <button class="btn sm add-sublimit" data-block="${i}" style="margin-top:4px;">+ Añadir mini-sobre</button>
            </div>
          `;
        };

        const renderBlocks = () => {
          modal.querySelector('#blocks-editor').innerHTML = blocks.map((b, i) => `
            <div class="card" style="margin-bottom:10px;" data-block="${i}">
              <div class="grid cols-2">
                <div class="field"><label>Nombre</label><input class="b-name" value="${Widgets.escapeHtml(b.name)}"></div>
                <div class="field"><label>% del ingreso</label><input type="number" class="b-pct" value="${b.pct}"></div>
              </div>
              <div class="field"><label>Pilares incluidos</label>
                <div class="row wrap">${DB.PILLARS.map((p) => `
                  <button type="button" class="btn sm b-pillar-chip ${b.pillars.includes(p.id) ? 'primary' : ''}" data-block="${i}" data-pillar="${p.id}">${p.name}</button>
                `).join('')}</div>
              </div>
              <div class="field"><label>Etiquetas incluidas (opcional, separadas por espacio)</label><input class="b-tags" value="${(b.tags || []).join(' ')}"></div>
              <label class="row" style="gap:6px;"><input type="checkbox" style="width:auto;" class="b-savings" ${b.isSavings ? 'checked' : ''}> Es un bloque de ahorro</label>
              ${renderSubLimits(b, i)}
              <button class="btn sm danger del-block" style="margin-top:8px;">Eliminar bloque</button>
            </div>
          `).join('');
          wireBlockEvents();
          updateSum();
        };

        function wireBlockEvents() {
          modal.querySelectorAll('.del-block').forEach((btn, i) => btn.onclick = () => { blocks.splice(i, 1); renderBlocks(); });
          modal.querySelectorAll('.b-pillar-chip').forEach((btn) => {
            btn.onclick = () => {
              const b = blocks[Number(btn.dataset.block)];
              const pid = btn.dataset.pillar;
              b.pillars = b.pillars.includes(pid) ? b.pillars.filter((x) => x !== pid) : [...b.pillars, pid];
              renderBlocks();
            };
          });
          modal.querySelectorAll('.b-name').forEach((input, i) => { input.onchange = () => { blocks[i].name = input.value.trim() || 'Bloque'; }; });
          modal.querySelectorAll('.b-pct').forEach((input, i) => { input.oninput = () => { blocks[i].pct = parseFloat(input.value) || 0; updateSum(); }; });
          modal.querySelectorAll('.b-tags').forEach((input, i) => {
            input.onchange = () => { blocks[i].tags = input.value.split(/\s+/).map((s) => s.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`)); };
          });
          modal.querySelectorAll('.b-savings').forEach((input, i) => { input.onchange = () => { blocks[i].isSavings = input.checked; }; });
          modal.querySelectorAll('.add-sublimit').forEach((btn) => {
            btn.onclick = () => { blocks[Number(btn.dataset.block)]._editingSubLimit = 'new'; renderBlocks(); };
          });
          modal.querySelectorAll('.edit-sublimit').forEach((btn) => {
            btn.onclick = () => { blocks[Number(btn.dataset.block)]._editingSubLimit = Number(btn.dataset.sl); renderBlocks(); };
          });
          modal.querySelectorAll('.del-sublimit').forEach((btn) => {
            btn.onclick = () => {
              const b = blocks[Number(btn.dataset.block)];
              b.subLimits.splice(Number(btn.dataset.sl), 1);
              renderBlocks();
            };
          });
          modal.querySelectorAll('.sl-cancel').forEach((btn) => {
            btn.onclick = () => { blocks[Number(btn.dataset.block)]._editingSubLimit = null; renderBlocks(); };
          });
          modal.querySelectorAll('.sl-save').forEach((btn) => {
            btn.onclick = () => {
              const i = Number(btn.dataset.block);
              const form = btn.closest('[data-sl-form]');
              const b = blocks[i];
              const label = form.querySelector('.sl-label').value.trim();
              const amount = parseFloat(form.querySelector('.sl-amount').value) || 0;
              const matchTags = form.querySelector('.sl-tags').value.split(/\s+/).map((s) => s.trim()).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`));
              const matchSubcategory = form.querySelector('.sl-subcat').value || null;
              if (!label) { Widgets.toast('Ponle un nombre al mini-sobre', 'error'); return; }
              if (!matchTags.length && !matchSubcategory) { Widgets.toast('Indica al menos una etiqueta o una subcategoría a vigilar', 'error'); return; }
              const sl = { label, amount, matchTags, matchSubcategory };
              if (!b.subLimits) b.subLimits = [];
              if (b._editingSubLimit === 'new') b.subLimits.push(sl);
              else b.subLimits[b._editingSubLimit] = sl;
              b._editingSubLimit = null;
              renderBlocks();
            };
          });
        }

        function subLimitFormHtml(sl, blockIndex, slIndex) {
          const state = DB.get();
          return `
            <div class="card" style="margin:6px 0;background:var(--paper);" data-sl-form>
              <div class="grid cols-2">
                <div class="field"><label>Nombre</label><input class="sl-label" value="${sl ? Widgets.escapeHtml(sl.label) : ''}"></div>
                <div class="field"><label>Tope en €</label><input type="number" class="sl-amount" value="${sl ? sl.amount : 50}"></div>
              </div>
              <div class="field"><label>Etiquetas a vigilar</label><input class="sl-tags" list="dl-tags-budget" value="${sl ? (sl.matchTags || []).join(' ') : ''}"></div>
              <div class="field"><label>O subcategoría a vigilar</label>
                <select class="sl-subcat"><option value="">—</option>${state.catalog.subcategories.map((s) => `<option value="${Widgets.escapeHtml(s.name)}" ${sl && sl.matchSubcategory === s.name ? 'selected' : ''}>${Widgets.escapeHtml(s.name)}</option>`).join('')}</select>
              </div>
              <div class="row" style="justify-content:flex-end;">
                <button type="button" class="btn ghost sm sl-cancel" data-block="${blockIndex}">Cancelar</button>
                <button type="button" class="btn primary sm sl-save" data-block="${blockIndex}">Guardar mini-sobre</button>
              </div>
            </div>
          `;
        }

        modal.insertAdjacentHTML('beforeend', Widgets.datalist('dl-tags-budget', Catalog.allTagNames(DB.get())));
        renderBlocks();
        modal.querySelector('#add-block').onclick = () => {
          blocks.push({ id: Utils.uid('block'), name: 'Nuevo bloque', pct: 0, pillars: [], subcats: [], tags: [], subLimits: [] });
          renderBlocks();
        };
        modal.querySelector('#sel-template').onchange = (e) => {
          const key = e.target.value;
          if (!key) return;
          blocks = BUDGET_TEMPLATES[key].blocks().map((b) => ({ id: Utils.uid('block'), subcats: [], tags: [], subLimits: [], ...b }));
          renderBlocks();
        };
        modal.querySelector('#cancel').onclick = Widgets.closeModal;
        modal.querySelector('#save').onclick = () => {
          const sum = blocks.reduce((acc, b) => acc + (Number(b.pct) || 0), 0);
          if (Math.abs(sum - 100) > 0.01) { Widgets.toast('Los bloques deben sumar 100%', 'error'); return; }
          preset.name = modal.querySelector('#f-name').value.trim() || preset.name;
          preset.blocks = blocks.map((b) => ({
            id: b.id, name: b.name, pct: b.pct, pillars: b.pillars, subcats: b.subcats || [],
            tags: b.tags || [], isSavings: !!b.isSavings, subLimits: b.subLimits || [],
          }));
          DB.markDirty();
          Widgets.closeModal();
          onDone();
        };
      },
    });
  }

  return { render };
})();
