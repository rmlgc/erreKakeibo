// Pestaña: Cuentas
'use strict';

const UIAccounts = (() => {
  const ACCOUNT_COLORS = ['#5FB49C', '#f89e49', '#cda3ff', '#6B8EAE', '#c9524b', '#3f8f6e'];

  function render(container) {
    const state = DB.get();
    const accounts = state.accounts;
    container.innerHTML = `
      <div class="row between" style="margin-bottom:16px;">
        <h2>Mis cuentas</h2>
        <button class="btn primary" id="btn-new-account">+ Nueva cuenta</button>
      </div>
      <div class="grid cols-3" id="accounts-grid"></div>
    `;
    const grid = container.querySelector('#accounts-grid');
    if (accounts.length === 0) {
      grid.innerHTML = `<div class="empty-state card">Aún no has creado ninguna cuenta. Crea tu primera cuenta bancaria o de efectivo.</div>`;
    } else {
      for (const acc of accounts) {
        const balance = computeBalance(acc.id, state.transactions);
        const accTxDates = state.transactions.filter((t) => t.accountId === acc.id).map((t) => t.date);
        const lastDate = Utils.maxDate(accTxDates);
        const days = lastDate ? Utils.daysSince(lastDate) : null;
        const stale = days != null && days > state.settings.staleDataThresholdDays;
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="row between">
            <div class="row"><span style="width:10px;height:10px;border-radius:50%;background:${acc.color}"></span>
              <strong>${Widgets.escapeHtml(acc.name)}</strong></div>
            <span class="tag">${acc.type === 'cash' ? 'Efectivo' : (acc.bankAdapter || 'Banco')}</span>
          </div>
          <div class="kpi-value" style="margin-top:10px;">${Utils.fmtMoney(balance)}</div>
          ${acc.iban ? `<div class="muted" style="font-size:12px;margin-top:4px;">${Widgets.escapeHtml(acc.iban)}</div>` : ''}
          <div class="muted" style="font-size:12px;margin-top:6px;${stale ? 'color:var(--accent-orange);font-weight:600;' : ''}">
            ${lastDate ? `Actualizado hasta el ${Utils.fmtDate(lastDate)}${stale ? ` (hace ${days} días)` : ''}` : 'Sin movimientos todavía'}
          </div>
          <div class="row" style="margin-top:14px;">
            <button class="btn sm edit-acc" data-id="${acc.id}">Editar</button>
            <button class="btn sm danger del-acc" data-id="${acc.id}">Eliminar</button>
          </div>
        `;
        grid.appendChild(card);
      }
    }
    container.querySelector('#btn-new-account').onclick = () => openAccountForm(null, () => render(container));
    grid.querySelectorAll('.edit-acc').forEach((b) => b.onclick = () => openAccountForm(accounts.find((a) => a.id === b.dataset.id), () => render(container)));
    grid.querySelectorAll('.del-acc').forEach((b) => b.onclick = () => confirmDelete(b.dataset.id, () => render(container)));
  }

  function computeBalance(accountId, transactions) {
    const txs = transactions.filter((t) => t.accountId === accountId && !t.isSplitOriginal);
    if (txs.length === 0) return 0;
    const withBalance = txs.filter((t) => t.balance != null);
    if (withBalance.length > 0) {
      // La fecha del extracto no lleva hora, así que varios movimientos del mismo día
      // (habitual importando el historial completo) empatan por fecha. No se puede
      // asumir que el orden de llegada en el array diga cuál pasó el último: cada
      // banco exporta en un sentido distinto (algunos ponen el más reciente primero,
      // otros al final). En vez de adivinar el sentido, se reconstruye la cadena real
      // de ese día con la propia aritmética saldo/importe: el saldo "antes" de cada
      // movimiento (saldo - importe) debería coincidir con el saldo "después" del que
      // pasó justo antes. El único movimiento del día cuyo saldo no es el "antes" de
      // ningún otro es el que ocurrió el último.
      const maxDate = withBalance.reduce((max, t) => (t.date > max ? t.date : max), withBalance[0].date);
      const sameDay = withBalance.filter((t) => t.date === maxDate);
      return resolveLastOfDay(sameDay);
    }
    return txs.reduce((acc, t) => acc + t.amount, 0);
  }

  function resolveLastOfDay(group) {
    if (group.length === 1) return group[0].balance;
    const EPS = 0.01;
    const round2 = (n) => Math.round(n * 100) / 100;
    const before = group.map((t) => round2(t.balance - t.amount));
    const candidates = group.filter((t, i) => {
      const bal = round2(t.balance);
      return !group.some((_, j) => j !== i && Math.abs(before[j] - bal) < EPS);
    });
    // Si la cadena no se reconstruye con claridad (p.ej. falta una fila intermedia,
    // o hay más de un candidato), nos quedamos con el último del grupo tal cual llegó,
    // como aproximación razonable antes que fallar.
    return candidates.length === 1 ? candidates[0].balance : group[group.length - 1].balance;
  }

  function openAccountForm(account, onDone) {
    const isEdit = !!account;
    Widgets.openModal(`
      <h2>${isEdit ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
      <div class="field"><label>Nombre</label><input id="f-name" value="${isEdit ? Widgets.escapeHtml(account.name) : ''}" placeholder="ej. imagin Principal"></div>
      <div class="field"><label>Tipo</label>
        <select id="f-type">
          <option value="bank" ${isEdit && account.type === 'bank' ? 'selected' : ''}>Cuenta bancaria</option>
          <option value="cash" ${isEdit && account.type === 'cash' ? 'selected' : ''}>Efectivo / Cartera</option>
        </select>
      </div>
      <div class="field"><label>IBAN (opcional)</label><input id="f-iban" value="${isEdit && account.iban ? Widgets.escapeHtml(account.iban) : ''}"></div>
      <div class="field"><label>Color</label>
        <select id="f-color">${ACCOUNT_COLORS.map((c) => `<option value="${c}" ${isEdit && account.color === c ? 'selected' : ''} style="background:${c}">${c}</option>`).join('')}</select>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn ghost" id="cancel">Cancelar</button>
        <button class="btn primary" id="save">Guardar</button>
      </div>
    `, {
      onMount: (modal) => {
        modal.querySelector('#cancel').onclick = Widgets.closeModal;
        modal.querySelector('#save').onclick = () => {
          const name = modal.querySelector('#f-name').value.trim();
          if (!name) { Widgets.toast('El nombre es obligatorio', 'error'); return; }
          const state = DB.get();
          const data = {
            id: isEdit ? account.id : Utils.uid('acc'),
            name,
            type: modal.querySelector('#f-type').value,
            iban: modal.querySelector('#f-iban').value.trim() || null,
            color: modal.querySelector('#f-color').value,
            bankAdapter: isEdit ? account.bankAdapter : null,
          };
          if (isEdit) {
            const idx = state.accounts.findIndex((a) => a.id === account.id);
            state.accounts[idx] = { ...state.accounts[idx], ...data };
          } else {
            state.accounts.push(data);
          }
          DB.markDirty();
          Widgets.closeModal();
          Widgets.toast('Cuenta guardada', 'success');
          if (onDone) onDone();
        };
      },
    });
  }

  function confirmDelete(accountId, onDone) {
    const state = DB.get();
    const hasTx = state.transactions.some((t) => t.accountId === accountId);
    Widgets.confirmDialog(
      hasTx
        ? 'Esta cuenta tiene movimientos asociados. Se eliminarán también. ¿Continuar?'
        : '¿Eliminar esta cuenta?',
      () => {
        state.accounts = state.accounts.filter((a) => a.id !== accountId);
        state.transactions = state.transactions.filter((t) => t.accountId !== accountId);
        DB.markDirty();
        Widgets.toast('Cuenta eliminada', 'success');
        if (onDone) onDone();
      }
    );
  }

  return { render, computeBalance };
})();
