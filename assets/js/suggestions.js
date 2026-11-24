// Motor de sugerencias para movimientos que ninguna regla activa reconoce. NUNCA
// clasifica solo: solo propone (con una insignia visible) una clasificación que el
// usuario puede aceptar con un clic o ignorar. Dos fuentes, en este orden:
//   1. Recurrencia: ya existe en el historial un movimiento clasificado con la misma
//      "palabra significativa" y un importe igual o muy parecido (±5%).
//   2. Palabra raíz de comercio: el concepto contiene una raíz genérica habitual en
//      extractos españoles (un diccionario aparte, más amplio/arriesgado que el de
//      reglas automáticas — por eso aquí solo SUGIERE, nunca se aplica solo).
'use strict';

const Suggestions = (() => {
  const ROOT_DICTIONARY = [
    { words: ['MINIMARKET', 'MARKET', 'PANADERIA', 'FRUTERIA', 'CARNICERIA'], pillar: 'supervivencia', tags: [] },
    { words: ['HOTDOG', 'HOT DOG', 'BURGER', 'KEBAB', 'CERVECERIA', 'TABERNA', 'HELADERIA'], pillar: 'ocio', tags: [] },
    { words: ['ADMON N', 'LOTERIA'], pillar: 'ocio', tags: ['#loteria'] },
    { words: ['KIABI', 'CORTEFIEL', 'OYSHO', 'MASSIMO DUTTI', 'UNIQLO'], pillar: 'ocio', tags: ['#ropa'] },
    { words: ['AMAZON', 'ALIEXPRESS', 'TEMU', 'SHEIN'], pillar: 'extras', tags: ['#compras_online'] },
  ];

  // Primera palabra "significativa" (4+ letras) del concepto ya normalizado y
  // tolerante a símbolos: "GOOGLE *GOOGLE*ON" -> "GOOGLE".
  function significantWord(concept) {
    const words = Utils.normalizeForMatch(concept).split(' ').filter(Boolean);
    return words.find((w) => w.length >= 4) || words[0] || '';
  }

  function findRecurrenceSuggestion(tx, history) {
    const word = significantWord(tx.concept);
    if (!word) return null;
    const sign = Math.sign(tx.amount);
    const amt = Math.abs(tx.amount);
    let best = null;
    for (const h of history) {
      if (h === tx || !h.pillar) continue;
      if (h.type !== 'gasto' && h.type !== 'ingreso') continue;
      if (Math.sign(h.amount) !== sign) continue;
      if (significantWord(h.concept) !== word) continue;
      const hAmt = Math.abs(h.amount);
      const diffPct = Math.abs(hAmt - amt) / Math.max(amt, 0.01);
      if (diffPct > 0.05) continue;
      if (!best || h.date > best.date) best = h;
    }
    if (!best) return null;
    return {
      source: 'recurrence',
      pillar: best.pillar, subcategory: best.subcategory || null, tags: best.tags || [],
      reason: `Parecido a "${best.concept}" (${Utils.fmtMoney(best.amount)})`,
      badge: 'Sugerido por historial',
    };
  }

  function findRootSuggestion(tx) {
    const norm = Utils.normalizeForMatch(tx.concept);
    for (const entry of ROOT_DICTIONARY) {
      for (const w of entry.words) {
        if (norm.includes(Utils.normalizeForMatch(w))) {
          return {
            source: 'root',
            pillar: entry.pillar, subcategory: null, tags: entry.tags,
            reason: `Coincide con "${w}"`,
            badge: 'Sugerido (comercio genérico)',
            matchedWord: w,
          };
        }
      }
    }
    return null;
  }

  function suggestForTransaction(tx, history) {
    return findRecurrenceSuggestion(tx, history) || findRootSuggestion(tx);
  }

  // Retiradas de efectivo en cajero: palabras clave habituales en extractos de
  // bancos españoles e internacionales.
  const ATM_KEYWORDS = ['CAJERO', 'REINTEGRO', 'DISPOSICION EFECTIVO', 'DISP EFECTIVO', 'DISP. EFECTIVO', 'ATM', 'CASH WITHDRAWAL'];

  function isAtmWithdrawal(tx) {
    if (tx.amount >= 0) return false;
    const norm = Utils.normalizeForMatch(tx.concept);
    return ATM_KEYWORDS.some((kw) => norm.includes(Utils.normalizeForMatch(kw)));
  }

  return { suggestForTransaction, significantWord, isAtmWithdrawal, ATM_KEYWORDS, ROOT_DICTIONARY };
})();
