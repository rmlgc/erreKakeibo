// Motor de deduplicación multi-cuenta.
'use strict';

const Dedupe = (() => {
  // Hash = accountId + fecha + concepto normalizado + importe + saldo (o índice de ocurrencia diaria si no hay saldo)
  function computeHash(accountId, row, occurrenceIndex) {
    const conceptNorm = Utils.normalizeText(row.concept);
    const amountKey = row.amount.toFixed(2);
    const balanceKey = (row.balance != null) ? row.balance.toFixed(2) : `occ${occurrenceIndex}`;
    const raw = `${accountId}|${row.date}|${conceptNorm}|${amountKey}|${balanceKey}`;
    return Utils.hashString(raw);
  }

  // Dado un listado de filas normalizadas de UN import, asigna hashes considerando
  // ocurrencias repetidas el mismo día (cuando el banco no aporta saldo).
  function assignHashes(accountId, rows) {
    const dayCounts = new Map();
    return rows.map((row) => {
      if (row.balance == null) {
        const key = `${row.date}|${Utils.normalizeText(row.concept)}|${row.amount.toFixed(2)}`;
        const idx = (dayCounts.get(key) || 0);
        dayCounts.set(key, idx + 1);
        return { ...row, importHash: computeHash(accountId, row, idx) };
      }
      return { ...row, importHash: computeHash(accountId, row, 0) };
    });
  }

  function filterNewAgainstExisting(hashedRows, existingTransactions) {
    const existingHashes = new Set(existingTransactions.map((t) => t.importHash));
    const seenInBatch = new Set();
    const fresh = [];
    let duplicates = 0;
    for (const row of hashedRows) {
      if (existingHashes.has(row.importHash) || seenInBatch.has(row.importHash)) {
        duplicates++;
        continue;
      }
      seenInBatch.add(row.importHash);
      fresh.push(row);
    }
    return { fresh, duplicates };
  }

  return { computeHash, assignHashes, filterNewAgainstExisting };
})();
