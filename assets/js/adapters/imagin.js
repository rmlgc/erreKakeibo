// Adaptador imagin / CaixaBank
'use strict';

(function () {
  const HEADER_RE = /Concepto\s*;\s*Fecha\s*;\s*Importe\s*;\s*Saldo disponible/i;
  const IBAN_RE = /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/;

  function detect(rawText) {
    return HEADER_RE.test(rawText);
  }

  function extractIban(rawText) {
    const m = rawText.match(IBAN_RE);
    return m ? m[1] : null;
  }

  function findHeaderLineIndex(lines) {
    for (let i = 0; i < lines.length; i++) {
      if (HEADER_RE.test(lines[i])) return i;
    }
    return -1;
  }

  function parse(rawText) {
    const lines = rawText.split(/\r?\n/).filter((l) => l.trim() !== '');
    const headerIdx = findHeaderLineIndex(lines);
    const iban = extractIban(rawText);
    if (headerIdx === -1) {
      return { rows: [], iban, error: 'No se encontró la cabecera esperada de imagin/CaixaBank.' };
    }
    const dataLines = lines.slice(headerIdx + 1).filter((l) => !HEADER_RE.test(l));
    const rows = [];
    for (const line of dataLines) {
      const cols = splitCsvLine(line, ';');
      if (cols.length < 4) continue;
      const [concept, dateRaw, amountRaw, balanceRaw] = cols;
      const date = Utils.parseDateToISO(dateRaw.trim());
      const amount = Utils.parseEuropeanAmount(amountRaw);
      const balance = Utils.parseEuropeanAmount(balanceRaw);
      if (!date || amount == null) continue;
      rows.push({
        date, concept: concept.trim(), amount, balance,
        type: amount < 0 ? 'gasto' : 'ingreso',
        rawRow: line,
      });
    }
    return { rows, iban, error: null };
  }

  function splitCsvLine(line, delimiter) {
    // soporta comillas simples alrededor de campos
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === delimiter && !inQuotes) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts;
  }

  Adapters.register({
    id: 'imagin',
    label: 'imagin / CaixaBank',
    detect,
    parse,
  });
})();
