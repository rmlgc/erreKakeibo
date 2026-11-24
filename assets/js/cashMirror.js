// Gestión del "movimiento espejo" al convertir una retirada de cajero en traspaso
// interno: crea el abono correspondiente en la cuenta de Efectivo / Cartera, sin que
// el dinero se cuente dos veces (una al sacarlo del banco, otra al gastarlo en
// metálico) y sin duplicarlo si el extracto se reimporta más adelante.
'use strict';

const CashMirror = (() => {
  // Si hay una única cuenta de efectivo, la usa sola; si hay varias, devuelve null
  // (el que llama debe dejar elegir); si no hay ninguna, crea "Efectivo / Cartera".
  function resolveCashAccountId(state, chosenId) {
    if (chosenId) return chosenId;
    const cashAccounts = state.accounts.filter((a) => a.type === 'cash');
    if (cashAccounts.length === 1) return cashAccounts[0].id;
    if (cashAccounts.length === 0) {
      const acc = { id: Utils.uid('acc'), name: 'Efectivo / Cartera', type: 'cash', iban: null, color: '#f89e49', bankAdapter: null };
      state.accounts.push(acc);
      return acc.id;
    }
    return null; // ambiguo: 2+ cuentas de efectivo, hace falta que el usuario elija
  }

  // Crea el movimiento espejo en la cuenta de efectivo a partir del movimiento de
  // retirada YA GUARDADO (con su importHash real). Nunca duplica: ni por reimportar
  // el mismo extracto (hash determinista mirror_<original>), ni -con un aviso- si ya
  // hay un movimiento manual con la misma fecha e importe en esa cuenta.
  function createMirrorIfNeeded(state, originTx, cashAccountId) {
    const mirrorHash = `mirror_${originTx.importHash}`;
    if (state.transactions.some((t) => t.importHash === mirrorHash)) {
      return { created: false, reason: 'already-exists' };
    }
    const amount = Math.abs(originTx.amount);
    const possibleDuplicate = state.transactions.some((t) => (
      t.accountId === cashAccountId && t.date === originTx.date && Math.abs(Math.abs(t.amount) - amount) < 0.01
    ));
    if (possibleDuplicate) {
      return { created: false, reason: 'possible-duplicate' };
    }
    const originAccount = state.accounts.find((a) => a.id === originTx.accountId);
    const mirror = {
      id: Utils.uid('tx'), accountId: cashAccountId, date: originTx.date,
      concept: `Retirada de cajero (${originAccount ? originAccount.name : 'cuenta origen'})`,
      amount, balance: null, type: 'traspaso',
      pillar: null, subcategory: null, tags: ['#cajero'], netPillar: false,
      importHash: mirrorHash, rawRow: null, source: 'cash-mirror',
    };
    state.transactions.push(mirror);
    return { created: true, transaction: mirror };
  }

  return { resolveCashAccountId, createMirrorIfNeeded };
})();
