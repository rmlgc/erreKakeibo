// Ajustes > Reglas automáticas: clasifica movimientos nuevos sin que tengas que hacerlo a mano.
'use strict';

const UIRules = (() => {
  function render(container) {
    const state = DB.get();
    const rules = [...state.rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    container.innerHTML = `
      <h2>Reglas automáticas ${Widgets.helpIcon('Una regla reconoce una palabra en el concepto de un movimiento (ej. "MERCADONA") y le asigna automáticamente el pilar, el tipo y las etiquetas que tú elijas, para que no tengas que clasificarlo cada vez a mano.')}</h2>
      <p class="muted">Se crean solas cada vez que clasificas un gasto por revisar y marcas "recordar esta clasificación". También puedes crearlas aquí a mano.</p>
      <div class="row between wrap" style="margin:10px 0; gap:8px;">
        <div class="row wrap" style="gap:8px;">
          <button class="btn" id="btn-apply-history">Volver a aplicar las reglas a todo el historial</button>
          <button class="btn" id="btn-restore-defaults">Restaurar reglas recomendadas por defecto</button>
          <button class="btn" id="btn-export-rules">Exportar diccionario (.json)</button>
          <button class="btn" id="btn-import-rules">Importar diccionario (.json)</button>
          <input type="file" id="f-import-rules" accept=".json,application/json" style="display:none;">
        </div>
        <button class="btn primary" id="btn-new-rule">+ Nueva regla</button>
      </div>
      <div class="card" style="padding:0;">
        <div style="overflow-x:auto;">
          <table>
            <thead><tr><th>Prioridad</th><th>Si el concepto contiene...</th><th>Tipo</th><th>Pilar</th><th>Etiquetas</th><th>Activa</th><th></th></tr></thead>
            <tbody id="rules-rows"></tbody>
          </table>
        </div>
        ${rules.length === 0 ? '<div class="empty-state">Todavía no tienes ninguna regla. Se crean solas al clasificar un gasto, o puedes añadir una con el botón de arriba.</div>' : ''}
      </div>
    `;
    const tbody = container.querySelector('#rules-rows');
    for (const r of rules) {
      const pillarDef = DB.PILLARS.find((p) => p.id === r.pillar);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="number" class="prio" value="${r.priority || 0}" style="width:60px;"></td>
        <td>${Widgets.escapeHtml(r.pattern)} ${r.isRegex ? '<span class="tag">regex</span>' : ''}</td>
        <td>${r.type || '—'}</td>
        <td>${pillarDef ? pillarDef.name : '—'}</td>
        <td>${(r.tags || []).join(' ')}</td>
        <td><input type="checkbox" style="width:auto;" class="active-cb" ${r.active !== false ? 'checked' : ''}></td>
        <td><button class="btn sm edit-rule">Editar</button> <button class="btn sm danger del-rule">Borrar</button></td>
      `;
      tr.querySelector('.prio').onchange = (e) => { r.priority = parseInt(e.target.value) || 0; DB.markDirty(); };
      tr.querySelector('.active-cb').onchange = (e) => { r.active = e.target.checked; DB.markDirty(); };
      tr.querySelector('.edit-rule').onclick = () => openRuleForm(r, () => render(container));
      tr.querySelector('.del-rule').onclick = () => {
        Widgets.confirmDialog('¿Eliminar esta regla?', () => {
          state.rules = state.rules.filter((x) => x.id !== r.id);
          DB.markDirty();
          render(container);
        });
      };
      tbody.appendChild(tr);
    }
    container.querySelector('#btn-new-rule').onclick = () => openRuleForm(null, () => render(container));
    container.querySelector('#btn-apply-history').onclick = () => {
      const { transactions, changed } = Rules.applyRulesToAll(state.transactions, state.rules);
      state.transactions = transactions;
      DB.markDirty();
      Widgets.toast(`Listo: ${changed} movimientos actualizados con tus reglas.`, 'success');
      render(container);
    };
    container.querySelector('#btn-restore-defaults').onclick = () => {
      const existingPatterns = new Set(state.rules.map((r) => Utils.normalizeText(r.pattern)));
      const fresh = DefaultRules.build().filter((r) => !existingPatterns.has(Utils.normalizeText(r.pattern)));
      if (fresh.length === 0) {
        Widgets.toast('Ya tienes cargadas todas las reglas recomendadas.', 'info');
        return;
      }
      state.rules.push(...fresh);
      DB.markDirty();
      Widgets.toast(`Se han añadido ${fresh.length} reglas recomendadas. Usa "Volver a aplicar las reglas a todo el historial" para clasificar con ellas tus movimientos ya importados.`, 'success');
      render(container);
    };
    container.querySelector('#btn-export-rules').onclick = () => exportRules();
    container.querySelector('#btn-import-rules').onclick = () => container.querySelector('#f-import-rules').click();
    container.querySelector('#f-import-rules').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = ''; // permite volver a elegir el mismo archivo más adelante
      try {
        const parsed = JSON.parse(await file.text());
        const importedRules = Array.isArray(parsed) ? parsed : parsed.rules;
        if (!Array.isArray(importedRules)) throw new Error('El archivo no tiene el formato esperado (falta "rules").');
        openImportRulesDialog(container, importedRules);
      } catch (err) {
        Widgets.toast('No se pudo leer el diccionario: ' + err.message, 'error');
      }
    };
  }

  function exportRules() {
    const state = DB.get();
    const payload = {
      kind: 'kakeibo-reglas',
      exportedAt: new Date().toISOString(),
      rules: state.rules,
    };
    Utils.downloadText('diccionario_reglas_kakeibo.json', JSON.stringify(payload, null, 2), 'application/json');
    Widgets.toast('Diccionario de reglas exportado', 'success');
  }

  // ---------- Normalización de esquemas de diccionario ----------
  // Acepta tanto el esquema interno de la app (pattern/isRegex/pillar/subcategory/
  // tags/active) como el esquema estándar en español (patron/tipoCoincidencia/pilar/
  // subcategoria/etiquetas/activa), para poder importar diccionarios de otras personas
  // o herramientas sin que tengan que conocer nuestros nombres de campo internos.
  function resolvePillarValue(raw) {
    if (!raw) return null;
    const byId = DB.PILLARS.find((p) => p.id === raw);
    if (byId) return byId.id;
    const byName = DB.PILLARS.find((p) => Utils.normalizeText(p.name) === Utils.normalizeText(raw));
    return byName ? byName.id : null;
  }

  function resolveIsRegex(raw, fallback) {
    if (raw == null) return !!fallback;
    const v = Utils.normalizeText(String(raw));
    if (v === 'REGEX') return true;
    if (v === 'CONTIENE' || v === 'CONTAINS') return false;
    return !!fallback;
  }

  function normalizeImportedRule(r) {
    const pattern = (r.pattern != null ? r.pattern : r.patron || '').trim();
    const isRegex = resolveIsRegex(r.tipoCoincidencia, r.isRegex);
    const pillar = resolvePillarValue(r.pillar != null ? r.pillar : r.pilar);
    const subcategory = (r.subcategory != null ? r.subcategory : r.subcategoria) || null;
    const rawTags = r.tags != null ? r.tags : r.etiquetas;
    const tags = Array.isArray(rawTags) ? rawTags.map((t) => (String(t).startsWith('#') ? t : `#${t}`)) : [];
    const active = r.active != null ? !!r.active : (r.activa != null ? !!r.activa : true);
    return {
      pattern, isRegex, type: r.type || null, pillar, subcategory, tags, active,
      priority: r.priority != null ? r.priority : null,
    };
  }

  function classificationEquals(a, b) {
    const tagsA = [...(a.tags || [])].map(Utils.normalizeText).sort().join('|');
    const tagsB = [...(b.tags || [])].map(Utils.normalizeText).sort().join('|');
    return (a.pillar || null) === (b.pillar || null)
      && Utils.normalizeText(a.subcategory || '') === Utils.normalizeText(b.subcategory || '')
      && (a.type || null) === (b.type || null)
      && tagsA === tagsB;
  }

  // Compara el diccionario importado contra el actual y separa cada regla en: nueva
  // (patrón que no existe todavía), idéntica (mismo patrón y misma clasificación) o en
  // conflicto (mismo patrón, clasificación distinta). Si el propio archivo trae el
  // mismo patrón repetido, se queda con la primera aparición.
  function reconcileImport(existingRules, importedRaw) {
    const seen = new Set();
    const normalizedImported = [];
    for (const raw of importedRaw) {
      const norm = normalizeImportedRule(raw);
      if (!norm.pattern) continue;
      const key = Utils.normalizeText(norm.pattern);
      if (seen.has(key)) continue;
      seen.add(key);
      normalizedImported.push(norm);
    }
    const byKey = new Map(existingRules.map((r) => [Utils.normalizeText(r.pattern), r]));
    const brandNew = [];
    const identical = [];
    const conflicts = [];
    for (const imp of normalizedImported) {
      const existing = byKey.get(Utils.normalizeText(imp.pattern));
      if (!existing) brandNew.push(imp);
      else if (classificationEquals(existing, imp)) identical.push(imp);
      else conflicts.push({ existing, imported: imp });
    }
    return { brandNew, identical, conflicts };
  }

  function openImportRulesDialog(container, importedRules) {
    const state = DB.get();
    Widgets.openModal(`
      <h2>Importar diccionario de reglas</h2>
      <p class="muted">El archivo trae ${importedRules.length} regla${importedRules.length === 1 ? '' : 's'}. ¿Qué quieres hacer?</p>
      <div class="field">
        <label class="row" style="gap:6px;"><input type="radio" name="import-mode" value="combine" checked style="width:auto;"> Extender / combinar con mi diccionario actual</label>
        <label class="row" style="gap:6px;"><input type="radio" name="import-mode" value="replace" style="width:auto;"> Reemplazar mi diccionario actual</label>
      </div>
      <label class="row" style="gap:6px;margin-top:6px;"><input type="checkbox" id="f-apply-review" style="width:auto;" checked> Aplicar automáticamente a mis gastos por revisar</label>
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn ghost" id="cancel">Cancelar</button>
        <button class="btn primary" id="confirm-import">Importar</button>
      </div>
    `, {
      onMount: (modal) => {
        modal.querySelector('#cancel').onclick = Widgets.closeModal;
        modal.querySelector('#confirm-import').onclick = () => {
          const mode = modal.querySelector('input[name="import-mode"]:checked').value;
          const applyToReview = modal.querySelector('#f-apply-review').checked;

          if (mode === 'replace') {
            Widgets.closeModal();
            Widgets.confirmDialog(
              'Esto borrará todas tus reglas actuales y las sustituirá por las del archivo importado. ¿Continuar?',
              () => {
                const freshRules = importedRules.map((r) => {
                  const n = normalizeImportedRule(r);
                  return {
                    id: Utils.uid('rule_imported'), pattern: n.pattern, isRegex: n.isRegex,
                    type: n.type, pillar: n.pillar, subcategory: n.subcategory, tags: n.tags,
                    priority: n.priority != null ? n.priority : 500, active: n.active,
                  };
                }).filter((r) => r.pattern);
                state.rules = freshRules;
                finishImport(container, applyToReview, { brandNew: freshRules.length, identical: 0, replaced: 0, kept: 0 });
              },
              { confirmLabel: 'Reemplazar', danger: true }
            );
            return;
          }

          const { brandNew, identical, conflicts } = reconcileImport(state.rules, importedRules);
          Widgets.closeModal();
          if (conflicts.length === 0) {
            addNewRules(state, brandNew);
            finishImport(container, applyToReview, { brandNew: brandNew.length, identical: identical.length, replaced: 0, kept: 0 });
          } else {
            openConflictResolutionDialog(container, state, brandNew, identical, conflicts, applyToReview);
          }
        };
      },
    });
  }

  function addNewRules(state, brandNew) {
    for (const n of brandNew) {
      state.rules.push({
        id: Utils.uid('rule_imported'), pattern: n.pattern, isRegex: n.isRegex,
        type: n.type, pillar: n.pillar, subcategory: n.subcategory, tags: n.tags,
        priority: n.priority != null ? n.priority : 500, active: n.active,
      });
    }
  }

  // Panel de resolución de conflictos: por cada patrón que ya existía con una
  // clasificación distinta, el usuario elige fila a fila (o con los dos botones
  // globales) si se queda con la suya o con la del archivo importado.
  function openConflictResolutionDialog(container, state, brandNew, identical, conflicts, applyToReview) {
    const pillarName = (id) => (DB.PILLARS.find((p) => p.id === id)?.name) || '— Sin pilar —';
    const describe = (c) => `${pillarName(c.pillar)} · ${c.subcategory || '—'} · ${(c.tags || []).join(' ') || '—'}`;
    Widgets.openModal(`
      <h2>Reglas en conflicto</h2>
      <p class="muted">Estas ${conflicts.length} palabra${conflicts.length === 1 ? '' : 's'} clave ya existía${conflicts.length === 1 ? '' : 'n'} en tu diccionario con una clasificación distinta. Elige qué versión quieres conservar.</p>
      <div class="row" style="margin-bottom:10px;">
        <button class="btn sm" id="keep-all">Conservar todas las mías</button>
        <button class="btn sm" id="replace-all">Sustituir todas por las importadas</button>
      </div>
      <div style="max-height:360px;overflow-y:auto;">
        ${conflicts.map((c, i) => `
          <div class="card" style="margin-bottom:8px;" data-conflict="${i}">
            <strong>${Widgets.escapeHtml(c.existing.pattern)}</strong>
            <div class="grid cols-2" style="margin-top:8px;">
              <label class="row" style="gap:6px;align-items:flex-start;">
                <input type="radio" name="conflict-${i}" value="keep" checked style="width:auto;margin-top:3px;">
                <span><strong>Mi regla actual</strong><br><span class="muted" style="font-size:12px;">${Widgets.escapeHtml(describe(c.existing))}</span></span>
              </label>
              <label class="row" style="gap:6px;align-items:flex-start;">
                <input type="radio" name="conflict-${i}" value="replace" style="width:auto;margin-top:3px;">
                <span><strong>Regla importada</strong><br><span class="muted" style="font-size:12px;">${Widgets.escapeHtml(describe(c.imported))}</span></span>
              </label>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn ghost" id="cancel">Cancelar importación</button>
        <button class="btn primary" id="confirm-conflicts">Aplicar</button>
      </div>
    `, {
      wide: true,
      onMount: (modal) => {
        modal.querySelector('#cancel').onclick = Widgets.closeModal;
        modal.querySelector('#keep-all').onclick = () => {
          modal.querySelectorAll('input[value="keep"]').forEach((r) => { r.checked = true; });
        };
        modal.querySelector('#replace-all').onclick = () => {
          modal.querySelectorAll('input[value="replace"]').forEach((r) => { r.checked = true; });
        };
        modal.querySelector('#confirm-conflicts').onclick = () => {
          let replacedCount = 0;
          let keptCount = 0;
          conflicts.forEach((c, i) => {
            const choice = modal.querySelector(`input[name="conflict-${i}"]:checked`).value;
            if (choice === 'replace') {
              const idx = state.rules.findIndex((r) => r.id === c.existing.id);
              if (idx !== -1) {
                state.rules[idx] = {
                  ...state.rules[idx],
                  isRegex: c.imported.isRegex, type: c.imported.type, pillar: c.imported.pillar,
                  subcategory: c.imported.subcategory, tags: c.imported.tags,
                  active: c.imported.active,
                };
              }
              replacedCount++;
            } else {
              keptCount++;
            }
          });
          addNewRules(state, brandNew);
          Widgets.closeModal();
          finishImport(container, applyToReview, {
            brandNew: brandNew.length, identical: identical.length, replaced: replacedCount, kept: keptCount,
          });
        };
      },
    });
  }

  function finishImport(container, applyToReview, counts) {
    const state = DB.get();
    let summary = `${counts.brandNew} regla${counts.brandNew === 1 ? '' : 's'} nueva${counts.brandNew === 1 ? '' : 's'} añadida${counts.brandNew === 1 ? '' : 's'}`;
    if (counts.replaced > 0 || counts.kept > 0) {
      summary += `, ${counts.replaced + counts.kept} conflicto${(counts.replaced + counts.kept) === 1 ? '' : 's'} resuelto${(counts.replaced + counts.kept) === 1 ? '' : 's'} (${counts.replaced} sustituida${counts.replaced === 1 ? '' : 's'}, ${counts.kept} conservada${counts.kept === 1 ? '' : 's'})`;
    }
    if (counts.identical > 0) {
      summary += `, ${counts.identical} idéntica${counts.identical === 1 ? '' : 's'} omitida${counts.identical === 1 ? '' : 's'}`;
    }
    if (applyToReview) {
      const { transactions, changed } = Rules.applyRulesToUnclassifiedOnly(state.transactions, state.rules);
      state.transactions = transactions;
      summary += `. ${changed} gasto${changed === 1 ? '' : 's'} por revisar se ${changed === 1 ? 'ha' : 'han'} clasificado solo${changed === 1 ? '' : 's'}.`;
    }
    DB.markDirty();
    Widgets.toast(summary, 'success');
    render(container);
  }

  function openRuleForm(rule, onDone) {
    const isEdit = !!rule;
    const data = rule || { pattern: '', isRegex: false, type: 'gasto', pillar: '', subcategory: '', tags: [], priority: 100, active: true };
    Widgets.openModal(`
      <h2>${isEdit ? 'Editar regla' : 'Nueva regla'}</h2>
      <div class="field"><label>Si el concepto contiene...</label><input id="f-pattern" value="${Widgets.escapeHtml(data.pattern)}" placeholder="ej. MERCADONA"></div>
      <label class="row" style="gap:6px;margin-bottom:10px;"><input type="checkbox" style="width:auto;" id="f-regex" ${data.isRegex ? 'checked' : ''}> Es una expresión regular (avanzado)</label>
      <div class="grid cols-2">
        <div class="field"><label>Tipo</label>
          <select id="f-type">
            <option value="gasto" ${data.type === 'gasto' ? 'selected' : ''}>Gasto</option>
            <option value="ingreso" ${data.type === 'ingreso' ? 'selected' : ''}>Ingreso</option>
            <option value="traspaso" ${data.type === 'traspaso' ? 'selected' : ''}>Traspaso interno</option>
            <option value="retencion" ${data.type === 'retencion' ? 'selected' : ''}>Retención / Anulado</option>
          </select>
        </div>
        <div class="field"><label>Pilar</label>
          <select id="f-pillar"><option value="">—</option>${DB.PILLARS.map((p) => `<option value="${p.id}" ${data.pillar === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Subcategoría</label><input id="f-subcat" list="dl-subcats" value="${Widgets.escapeHtml(data.subcategory || '')}"></div>
      <div class="field"><label>Etiquetas ${Widgets.helpIcon('Puedes poner varias: escríbelas separadas por un espacio, cada una con su #. Ej: #ocio #impulso — se aplicarán todas a la vez a los movimientos que coincidan con esta regla.')}</label><input id="f-tags" list="dl-tags" value="${(data.tags || []).join(' ')}" placeholder="#ocio #impulso"></div>
      ${Widgets.datalist('dl-subcats', Catalog.allSubcategoryNames(DB.get()))}
      ${Widgets.datalist('dl-tags', Catalog.allTagNames(DB.get()))}
      <div class="field"><label>Prioridad (número más bajo = se aplica antes)</label><input type="number" id="f-prio" value="${data.priority || 0}"></div>
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn ghost" id="cancel">Cancelar</button>
        <button class="btn primary" id="save">Guardar</button>
      </div>
    `, {
      onMount: (modal) => {
        modal.querySelector('#cancel').onclick = Widgets.closeModal;
        modal.querySelector('#save').onclick = () => {
          const pattern = modal.querySelector('#f-pattern').value.trim();
          if (!pattern) { Widgets.toast('Escribe qué palabra debe contener el concepto', 'error'); return; }
          const state = DB.get();
          const rawTags = modal.querySelector('#f-tags').value.split(/\s+/).map((v) => v.trim()).filter(Boolean);
          const tags = Catalog.canonicalTags(state, rawTags);
          const pillar = modal.querySelector('#f-pillar').value || null;
          const subcatRaw = modal.querySelector('#f-subcat').value.trim();
          const subcategory = subcatRaw ? Catalog.canonicalSubcategory(state, subcatRaw, pillar) : null;
          const newRule = {
            id: isEdit ? rule.id : Utils.uid('rule'),
            pattern, isRegex: modal.querySelector('#f-regex').checked,
            type: modal.querySelector('#f-type').value,
            pillar,
            subcategory,
            tags, priority: parseInt(modal.querySelector('#f-prio').value) || 0, active: true,
          };
          const saveRule = () => {
            if (isEdit) {
              const idx = state.rules.findIndex((r) => r.id === rule.id);
              state.rules[idx] = newRule;
            } else {
              state.rules.push(newRule);
            }
            DB.markDirty();
            Widgets.closeModal();
            onDone();
          };
          // Mismo patrón (ignorando mayúsculas/acentos) ya registrado en otra regla:
          // avisa antes de guardar, para no acabar con dos reglas que compiten por el
          // mismo concepto sin que el usuario se dé cuenta (solo gana la de prioridad
          // más baja, y la otra queda "muerta" en silencio).
          const dupe = state.rules.find((r) => r.id !== newRule.id && Utils.normalizeText(r.pattern) === Utils.normalizeText(newRule.pattern));
          if (dupe) {
            const pillarName = (id) => (DB.PILLARS.find((p) => p.id === id)?.name) || '— Sin pilar —';
            const same = classificationEquals(dupe, newRule);
            const msg = same
              ? `Ya tienes una regla para "${Widgets.escapeHtml(dupe.pattern)}" con la misma clasificación (${pillarName(dupe.pillar)}). Crear otra sería redundante — ¿la guardas igual?`
              : `Ya tienes una regla para "${Widgets.escapeHtml(dupe.pattern)}" clasificada como ${pillarName(dupe.pillar)}, con prioridad ${dupe.priority || 0}. Si guardas esta, solo se aplicará la de prioridad más baja de las dos — la otra quedará sin efecto. ¿Seguro que quieres guardarla igual?`;
            Widgets.confirmDialog(msg, saveRule, { confirmLabel: 'Guardar igualmente', danger: !same });
            return;
          }
          saveRule();
        };
      },
    });
  }

  return { render, openRuleForm };
})();
