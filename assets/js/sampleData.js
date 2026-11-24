// Generador de datos de ejemplo ficticios para que un usuario nuevo pueda "curiosear"
// la app sin subir sus propios extractos. Todo lo generado se marca con isSample:true
// para poder borrarlo de un clic sin tocar los datos reales del usuario.
'use strict';

const SampleData = (() => {
  function monthPrefix() {
    const now = new Date();
    return `${now.getFullYear()}-${Utils.pad2(now.getMonth() + 1)}`;
  }

  function d(day) {
    return `${monthPrefix()}-${Utils.pad2(day)}`;
  }

  function load() {
    const state = DB.get();
    const accId = 'sample_acc_banco';
    const accCashId = 'sample_acc_efectivo';

    state.accounts.push(
      { id: accId, name: 'Cuenta Ejemplo', type: 'bank', iban: null, color: '#5FB49C', bankAdapter: null, isSample: true },
      { id: accCashId, name: 'Efectivo (ejemplo)', type: 'cash', iban: null, color: '#f89e49', bankAdapter: null, isSample: true },
    );

    const rows = [
      { day: 1, concept: 'NOMINA EMPRESA SL', amount: 1800, type: 'ingreso', pillar: null, tags: [] },
      { day: 2, concept: 'COMPRA MERCADONA', amount: -62.30, type: 'gasto', pillar: 'supervivencia', tags: [] },
      { day: 3, concept: 'RECIBO ALQUILER', amount: -650, type: 'gasto', pillar: 'supervivencia', tags: [] },
      { day: 4, concept: 'NETFLIX.COM', amount: -12.99, type: 'gasto', pillar: 'ocio', tags: ['#suscripcion'] },
      { day: 5, concept: 'SPOTIFY', amount: -10.99, type: 'gasto', pillar: 'ocio', tags: ['#suscripcion'] },
      { day: 6, concept: 'GASOLINERA REPSOL', amount: -45, type: 'gasto', pillar: 'extras', tags: [] },
      { day: 7, concept: 'CAFETERIA EL SOL', amount: -3.50, type: 'gasto', pillar: null, tags: [] }, // sin clasificar a propósito
      { day: 8, concept: 'FARMACIA CENTRO', amount: -18.40, type: 'gasto', pillar: 'supervivencia', tags: [] },
      { day: 9, concept: 'BIZUM DE LAURA (CENA)', amount: 15, type: 'ingreso', pillar: 'ocio', tags: ['#cena'], netPillar: true },
      { day: 10, concept: 'CINE YELMO', amount: -9.50, type: 'gasto', pillar: 'cultura', tags: [] },
      { day: 11, concept: 'LIBRERIA FNAC', amount: -24.90, type: 'gasto', pillar: 'cultura', tags: ['#libros'] },
      { day: 12, concept: 'TRANSFERENCIA A EFECTIVO', amount: -100, type: 'traspaso', pillar: null, tags: [], accountOverride: accId },
      { day: 12, concept: 'TRANSFERENCIA A EFECTIVO', amount: 100, type: 'traspaso', pillar: null, tags: [], accountOverride: accCashId },
      { day: 13, concept: 'MERCADONA - CAPRICHO', amount: -8.20, type: 'gasto', pillar: 'ocio', tags: ['#capricho_super'] },
      { day: 14, concept: 'RESTAURANTE LA TASCA', amount: -32, type: 'gasto', pillar: 'ocio', tags: [] },
      { day: 15, concept: 'AMAZON COMPRA', amount: -27.99, type: 'gasto', pillar: null, tags: [] }, // sin clasificar
      { day: 16, concept: 'COMPRA MERCADONA', amount: -54.10, type: 'gasto', pillar: 'supervivencia', tags: [] },
      { day: 18, concept: 'PANADERIA ESQUINA', amount: -4.20, type: 'gasto', pillar: 'supervivencia', tags: [], account: accCashId },
      { day: 20, concept: 'SEGURO COCHE', amount: -38, type: 'gasto', pillar: 'extras', tags: ['#suscripcion'] },
      { day: 22, concept: 'REGALO CUMPLEAÑOS', amount: -25, type: 'gasto', pillar: 'extras', tags: ['#cumpleanos'] },
    ];

    for (const r of rows) {
      state.transactions.push({
        id: Utils.uid('tx_sample'),
        accountId: r.accountOverride || r.account || accId,
        date: d(r.day),
        concept: r.concept,
        amount: r.amount,
        balance: null,
        type: r.type,
        pillar: r.pillar || null,
        subcategory: null,
        tags: r.tags || [],
        netPillar: !!r.netPillar,
        importHash: Utils.uid('sample_hash'),
        source: 'sample',
        isSample: true,
      });
    }

    Catalog.ensureInitialized(state);
    DB.markDirty();
  }

  function clear() {
    const state = DB.get();
    state.accounts = state.accounts.filter((a) => !a.isSample);
    state.transactions = state.transactions.filter((t) => !t.isSample);
    // El ejemplo no crea reglas, perfiles de banco ni reflexiones propias; si tras
    // quitarlo no queda ningún dato real, no tiene sentido pedir que se guarde un
    // archivo vacío ni avisar al cerrar la pestaña.
    const hasRealData = state.accounts.length > 0 || state.transactions.length > 0
      || state.rules.length > 0 || state.bankProfiles.length > 0
      || Object.keys(state.reflections).length > 0;
    DB.markDirty({ silent: !hasRealData });
  }

  function isActive() {
    const state = DB.get();
    return state.accounts.some((a) => a.isSample) || state.transactions.some((t) => t.isSample);
  }

  return { load, clear, isActive };
})();
