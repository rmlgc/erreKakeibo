// Adaptador Revolut
'use strict';

(function () {
  const HEADER_COLS = ['type', 'product', 'started date', 'completed date', 'description', 'amount', 'fee', 'currency', 'state', 'balance'];

  function detect(rawText) {
    const firstLine = rawText.split(/\r?\n/)[0] || '';
    const lower = firstLine.toLowerCase();
    return HEADER_COLS.filter((c) => lower.includes(c)).length >= 6;
  }

  function parse(rawText, options = {}) {
    const includeReverted = options.includeReverted || false;
    const includePending = options.includePending || false;
    const parsed = Papa.parse(rawText.trim(), { header: true, skipEmptyLines: true });
    const rows = [];
    for (const r of parsed.data) {
      const state = (r.State || '').trim().toUpperCase();
      if (state === 'REVERTED' && !includeReverted) continue;
      if (state === 'PENDING' && !includePending) continue;
      const dateRaw = r['Completed Date'] || r['Started Date'];
      const date = Utils.parseDateToISO(dateRaw);
      const amount = Utils.parseEuropeanAmount(r.Amount);
      const fee = Utils.parseEuropeanAmount(r.Fee) || 0;
      const balance = Utils.parseEuropeanAmount(r.Balance);
      if (!date || amount == null) continue;
      const concept = [r.Description, r.Type].filter(Boolean).join(' - ');
      rows.push({
        date, concept: (r.Description || r.Type || '').trim(), amount, balance,
        type: amount < 0 ? 'gasto' : 'ingreso',
        fee,
        rawRow: JSON.stringify(r),
      });
      if (fee && Math.abs(fee) > 0.0001) {
        rows.push({
          date, concept: `Comisión: ${(r.Description || r.Type || '').trim()}`,
          amount: -Math.abs(fee), balance: null,
          type: 'gasto', rawRow: JSON.stringify(r), isFee: true,
        });
      }
    }
    return { rows, iban: null, error: rows.length ? null : 'No se encontraron movimientos válidos en el CSV de Revolut.' };
  }

  Adapters.register({
    id: 'revolut',
    label: 'Revolut',
    detect,
    parse,
    options: [
      { key: 'includeReverted', label: 'Incluir movimientos REVERTED', default: false },
      { key: 'includePending', label: 'Incluir movimientos PENDING', default: false },
    ],
  });
})();
