// Motor de reglas: clasifica movimientos por palabra clave/regex sobre el concepto.
'use strict';

const Rules = (() => {
  // regla: { id, pattern, isRegex, field ('concept'), type, pillar, subcategory, tags: [], priority, active }

  function compileMatcher(rule) {
    if (rule.isRegex) {
      try {
        const re = new RegExp(rule.pattern, 'i');
        return (text) => re.test(text);
      } catch (e) {
        return () => false;
      }
    }
    // Tolerante a símbolos: los bancos alternan *, -, _, ., / para el MISMO comercio
    // ("GOOGLE *Google On" / "GOOGLE*GOOGLE ONE" / "GOOGLE *GOOGLE*ON"); se normaliza
    // igual el patrón de la regla y el concepto para que coincidan de todos modos.
    const needle = Utils.normalizeForMatch(rule.pattern);
    return (text) => Utils.normalizeForMatch(text).includes(needle);
  }

  function applyRulesToTransaction(tx, rules) {
    const sorted = [...rules].filter((r) => r.active !== false).sort((a, b) => (a.priority || 0) - (b.priority || 0));
    for (const rule of sorted) {
      const matcher = compileMatcher(rule);
      if (matcher(tx.concept)) {
        return {
          ...tx,
          type: rule.type || tx.type,
          pillar: rule.pillar !== undefined ? rule.pillar : tx.pillar,
          subcategory: rule.subcategory !== undefined ? rule.subcategory : tx.subcategory,
          tags: rule.tags && rule.tags.length ? Array.from(new Set([...(tx.tags || []), ...rule.tags])) : tx.tags,
          matchedRuleId: rule.id,
        };
      }
    }
    return tx;
  }

  function applyRulesToAll(transactions, rules) {
    let changed = 0;
    const result = transactions.map((tx) => {
      const updated = applyRulesToTransaction(tx, rules);
      if (updated !== tx && (updated.pillar !== tx.pillar || updated.type !== tx.type || updated.subcategory !== tx.subcategory)) {
        changed++;
      }
      return updated;
    });
    return { transactions: result, changed };
  }

  // Igual que applyRulesToAll, pero solo toca los movimientos que están "por
  // revisar" (sin pilar): nunca sobreescribe una clasificación que el usuario ya
  // tenía puesta, a mano o por una regla anterior.
  function applyRulesToUnclassifiedOnly(transactions, rules) {
    let changed = 0;
    const result = transactions.map((tx) => {
      if (!isUnclassified(tx)) return tx;
      const updated = applyRulesToTransaction(tx, rules);
      if (updated !== tx && updated.pillar !== tx.pillar) changed++;
      return updated;
    });
    return { transactions: result, changed };
  }

  function isUnclassified(tx) {
    return tx.type === 'gasto' || tx.type === 'ingreso' ? !tx.pillar : false;
  }

  // Convierte la clasificación manual actual de una transacción en una nueva regla reutilizable.
  function ruleFromTransaction(tx, patternText) {
    return {
      id: Utils.uid('rule'),
      pattern: patternText || tx.concept,
      isRegex: false,
      type: tx.type,
      pillar: tx.pillar || null,
      subcategory: tx.subcategory || null,
      tags: tx.tags || [],
      priority: 100,
      active: true,
    };
  }

  return { applyRulesToTransaction, applyRulesToAll, applyRulesToUnclassifiedOnly, isUnclassified, ruleFromTransaction };
})();
