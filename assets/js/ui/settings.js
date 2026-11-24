// Pestaña: Ajustes (cuentas, reglas automáticas, bancos guardados) — lo menos frecuente,
// fuera del día a día.
'use strict';

const UISettings = (() => {
  let activeSub = 'accounts';

  function render(container, opts = {}) {
    if (opts.subtab) activeSub = opts.subtab;
    const subtabs = [
      ['accounts', 'Mis cuentas'],
      ['rules', 'Reglas automáticas'],
      ['banks', 'Bancos guardados'],
      ['catalog', 'Subcategorías y Etiquetas'],
      ['privacy', 'Privacidad y datos locales'],
    ];
    container.innerHTML = `
      <h1>Ajustes</h1>
      <div class="subtabbar">
        ${subtabs.map(([id, label]) => `<button data-sub="${id}" class="${activeSub === id ? 'active' : ''}">${label}</button>`).join('')}
      </div>
      <div id="settings-content"></div>
    `;
    container.querySelectorAll('[data-sub]').forEach((b) => {
      b.onclick = () => { activeSub = b.dataset.sub; render(container); };
    });
    const content = container.querySelector('#settings-content');
    if (activeSub === 'accounts') UIAccounts.render(content);
    else if (activeSub === 'rules') UIRules.render(content);
    else if (activeSub === 'catalog') renderCatalog(content);
    else if (activeSub === 'privacy') UIPrivacy.renderInline(content);
    else renderBanks(content);
  }

  function renderCatalog(content) {
    const state = DB.get();
    const usage = Catalog.usageCounts(state);
    content.innerHTML = `
      <h2>Subcategorías y Etiquetas ${Widgets.helpIcon('Lista todas las subcategorías y etiquetas que has usado, con cuántas veces aparecen. Si ves variantes que en realidad son lo mismo (ej. "Super" y "Supermercado"), selecciónalas y fusiónalas en una sola.')}</h2>
      <div class="grid cols-2">
        <div class="card">
          <h3>Subcategorías</h3>
          <div id="subcat-list"></div>
          <div class="row" style="margin-top:10px;">
            <button class="btn sm" id="btn-merge-subcats" disabled>Fusionar seleccionadas</button>
          </div>
        </div>
        <div class="card">
          <h3>Etiquetas</h3>
          <div id="tag-list"></div>
          <div class="row" style="margin-top:10px;">
            <button class="btn sm" id="btn-merge-tags" disabled>Fusionar seleccionadas</button>
          </div>
        </div>
      </div>
    `;
    renderCatalogList(content.querySelector('#subcat-list'), usage.subcategories, content.querySelector('#btn-merge-subcats'));
    renderCatalogList(content.querySelector('#tag-list'), usage.tags, content.querySelector('#btn-merge-tags'));
    content.querySelector('#btn-merge-subcats').onclick = () => openMergeDialog(content, 'subcategories', usage.subcategories);
    content.querySelector('#btn-merge-tags').onclick = () => openMergeDialog(content, 'tags', usage.tags);
  }

  function renderCatalogList(host, items, mergeBtn) {
    if (!items.length) {
      host.innerHTML = '<p class="muted">Todavía no hay ninguna.</p>';
      return;
    }
    const sorted = [...items].sort((a, b) => b.count - a.count);
    host.innerHTML = `
      <div style="max-height:260px;overflow-y:auto;">
        ${sorted.map((it) => `
          <label class="row between" style="padding:4px 0;font-size:13px;">
            <span class="row" style="gap:6px;"><input type="checkbox" class="catalog-cb" value="${Widgets.escapeHtml(it.name)}" style="width:auto;"> ${Widgets.escapeHtml(it.name)}</span>
            <span class="muted">${it.count}</span>
          </label>
        `).join('')}
      </div>
    `;
    host.querySelectorAll('.catalog-cb').forEach((cb) => {
      cb.onchange = () => {
        const checked = host.querySelectorAll('.catalog-cb:checked').length;
        mergeBtn.disabled = checked < 2;
      };
    });
  }

  function openMergeDialog(container, kind, items) {
    const host = container.querySelector(kind === 'tags' ? '#tag-list' : '#subcat-list');
    const selected = Array.from(host.querySelectorAll('.catalog-cb:checked')).map((cb) => cb.value);
    if (selected.length < 2) return;
    const isTag = kind === 'tags';
    Widgets.openModal(`
      <h2>Fusionar ${isTag ? 'etiquetas' : 'subcategorías'}</h2>
      <p class="muted">Vas a combinar en una sola: ${selected.map((s) => `<strong>${Widgets.escapeHtml(s)}</strong>`).join(', ')}. Se actualizarán todos tus movimientos y reglas.</p>
      <div class="field"><label>Nombre final</label><input id="f-target" value="${Widgets.escapeHtml(selected[0])}"></div>
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn ghost" id="cancel">Cancelar</button>
        <button class="btn primary" id="confirm-merge">Fusionar</button>
      </div>
    `, {
      onMount: (modal) => {
        modal.querySelector('#cancel').onclick = Widgets.closeModal;
        modal.querySelector('#confirm-merge').onclick = () => {
          const target = modal.querySelector('#f-target').value.trim();
          if (!target) { Widgets.toast('Escribe el nombre final', 'error'); return; }
          const state = DB.get();
          if (isTag) Catalog.mergeTags(state, selected, target);
          else Catalog.mergeSubcategories(state, selected, target);
          DB.markDirty();
          Widgets.closeModal();
          Widgets.toast('Fusión completada', 'success');
          render(container);
        };
      },
    });
  }

  function renderBanks(content) {
    const state = DB.get();
    content.innerHTML = `
      <h2>Bancos guardados ${Widgets.helpIcon('Cuando subes un extracto de un banco que la app no reconoce automáticamente, te deja indicar manualmente qué columna es cuál. Ese mapeo se guarda aquí para que la próxima vez no tengas que repetirlo.')}</h2>
      <p class="muted">Mapeos de columnas que has guardado para bancos distintos de imagin/CaixaBank y Revolut (que ya se reconocen solos).</p>
      <div class="card" id="profiles-list"></div>
    `;
    const list = content.querySelector('#profiles-list');
    if (!state.bankProfiles.length) {
      list.innerHTML = '<div class="empty-state">Aún no has guardado ningún banco nuevo. Se guardan automáticamente la primera vez que subes un extracto de un banco no reconocido, en "Subir extracto".</div>';
      return;
    }
    list.innerHTML = state.bankProfiles.map((p) => `
      <div class="row between" style="padding:8px 0;border-bottom:1px solid var(--border);">
        <span>${Widgets.escapeHtml(p.name)} <span class="muted">(${p.delimiter === ',' ? 'coma' : p.delimiter === ';' ? 'punto y coma' : 'tabulador'})</span></span>
        <button class="btn sm danger del-profile" data-id="${p.id}">Eliminar</button>
      </div>
    `).join('');
    list.querySelectorAll('.del-profile').forEach((b) => b.onclick = () => {
      state.bankProfiles = state.bankProfiles.filter((p) => p.id !== b.dataset.id);
      DB.markDirty();
      renderBanks(content);
    });
  }

  return { render };
})();
