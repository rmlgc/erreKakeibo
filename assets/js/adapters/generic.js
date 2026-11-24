// Adaptador genérico: usa un perfil de banco guardado por el usuario (mapeo de columnas).
'use strict';

(function () {
  function parse(rawText, profile) {
    const delimiter = profile.delimiter || ',';
    const parsed = Papa.parse(rawText.trim(), { header: true, skipEmptyLines: true, delimiter });
    const rows = [];
    for (const r of parsed.data) {
      const dateRaw = r[profile.columnMap.date];
      const date = Utils.parseDateToISO(dateRaw, profile.dateFormat);
      let amount;
      if (profile.columnMap.amount) {
        amount = profile.decimalFormat === 'eu'
          ? Utils.parseEuropeanAmount(r[profile.columnMap.amount])
          : parseFloat(String(r[profile.columnMap.amount]).replace(/,/g, ''));
      }
      const balance = profile.columnMap.balance
        ? (profile.decimalFormat === 'eu'
          ? Utils.parseEuropeanAmount(r[profile.columnMap.balance])
          : parseFloat(String(r[profile.columnMap.balance]).replace(/,/g, '')))
        : null;
      const concept = profile.columnMap.concept ? r[profile.columnMap.concept] : '';
      if (!date || amount == null || isNaN(amount)) continue;
      rows.push({
        date, concept: (concept || '').trim(), amount, balance,
        type: amount < 0 ? 'gasto' : 'ingreso',
        rawRow: JSON.stringify(r),
      });
    }
    return { rows, iban: null, error: rows.length ? null : 'No se encontraron movimientos válidos con este mapeo.' };
  }

  function detectColumns(rawText, delimiter) {
    const parsed = Papa.parse(rawText.trim().split(/\r?\n/)[0], { delimiter });
    return (parsed.data[0] || []).map((c) => String(c).trim());
  }

  Adapters.register({
    id: 'generic',
    label: 'Mapeo genérico (nuevo banco)',
    detect: () => false, // nunca se autodetecta; se elige manualmente
    parse,
    detectColumns,
  });
})();
