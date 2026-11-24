// Motor de presupuesto por bloques + cálculo de KPIs del periodo.
'use strict';

const Budget = (() => {

  // Transacciones "efectivas": excluye traspasos internos, retenciones/preautorizaciones
  // anuladas (igual que un traspaso, cuentan para el saldo pero no son un gasto/ingreso
  // real) y originales ya divididos (split).
  function effectiveTransactions(transactions) {
    return transactions.filter((t) => t.type !== 'traspaso' && t.type !== 'retencion' && !t.isSplitOriginal);
  }

  // Importe "neto" de una transacción sobre su pilar: gastos restan, ingresos netPillar restan (netean) el gasto.
  function pillarNetAmount(tx) {
    if (tx.type === 'gasto') return Math.abs(tx.amount);
    if (tx.type === 'ingreso' && tx.netPillar && tx.pillar) return -Math.abs(tx.amount);
    return 0;
  }

  function computeKPIs(transactions) {
    const eff = effectiveTransactions(transactions);
    let ingresos = 0, gastos = 0;
    for (const t of eff) {
      if (t.type === 'ingreso' && !(t.netPillar && t.pillar)) ingresos += Math.abs(t.amount);
      if (t.type === 'gasto') gastos += Math.abs(t.amount);
    }
    // Las devoluciones neteadas no cuentan como ingreso; restan gasto real de su pilar (ya reflejado en breakdown)
    const balance = ingresos - gastos;
    const tasaAhorro = ingresos > 0 ? balance / ingresos : 0;
    return { ingresos, gastos, balance, tasaAhorro };
  }

  function computePillarBreakdown(transactions) {
    const eff = effectiveTransactions(transactions);
    const byPillar = {};
    for (const p of DB.PILLARS) byPillar[p.id] = 0;
    for (const t of eff) {
      if (!t.pillar) continue;
      const net = pillarNetAmount(t);
      if (net !== 0) byPillar[t.pillar] = (byPillar[t.pillar] || 0) + net;
    }
    return byPillar;
  }

  // Desglose por subcategoría DENTRO de un pilar (para el drill-down del donut en
  // Resumen): importe total, nº de compras, ticket medio y % sobre el total del
  // pilar, de mayor a menor importe.
  function computeSubcategoryBreakdown(transactions, pillarId) {
    const eff = effectiveTransactions(transactions).filter((t) => t.pillar === pillarId);
    const groups = new Map();
    for (const t of eff) {
      const net = pillarNetAmount(t);
      if (net === 0) continue;
      const key = t.subcategory || null;
      if (!groups.has(key)) groups.set(key, { total: 0, count: 0, transactions: [] });
      const g = groups.get(key);
      g.total += net;
      g.count++;
      g.transactions.push(t);
    }
    const pillarTotal = Array.from(groups.values()).reduce((a, g) => a + g.total, 0);
    return Array.from(groups.entries())
      .map(([name, g]) => ({
        name, total: g.total, count: g.count,
        avgTicket: g.count ? g.total / g.count : 0,
        pctOfPillar: pillarTotal > 0 ? g.total / pillarTotal : 0,
        transactions: g.transactions,
      }))
      .sort((a, b) => b.total - a.total);
  }

  function txMatchesBlock(tx, block) {
    if (block.pillars && block.pillars.length && tx.pillar && block.pillars.includes(tx.pillar)) return true;
    if (block.subcats && block.subcats.length && tx.subcategory && block.subcats.includes(tx.subcategory)) return true;
    if (block.tags && block.tags.length && tx.tags && tx.tags.some((tg) => block.tags.includes(tg))) return true;
    return false;
  }

  function txMatchesSubLimit(tx, sl) {
    if (sl.matchTags && sl.matchTags.length && tx.tags && sl.matchTags.some((tg) => tx.tags.includes(tg))) return true;
    if (sl.matchSubcategory && tx.subcategory === sl.matchSubcategory) return true;
    return false;
  }

  function computeBudget(transactions, preset, incomeForPeriod) {
    const eff = effectiveTransactions(transactions);
    const totalIncome = incomeForPeriod || 0;

    // Etiquetas/subcategorías que algún mini-sobre de CUALQUIER bloque vigila de
    // forma específica: un movimiento que encaja ahí ya se cuenta en ese mini-sobre,
    // así que no debe sumar OTRA VEZ al total de un bloque distinto que solo lo
    // cuenta porque coincide el pilar completo (evita el doble conteo).
    const earmarkedTags = new Set();
    const earmarkedSubcats = new Set();
    for (const b of preset.blocks) {
      for (const sl of (b.subLimits || [])) {
        (sl.matchTags || []).forEach((tg) => earmarkedTags.add(tg));
        if (sl.matchSubcategory) earmarkedSubcats.add(sl.matchSubcategory);
      }
    }

    const blocks = preset.blocks.map((block) => {
      const limit = totalIncome * (block.pct / 100);
      let spent = 0;
      const ownTags = new Set(block.tags || []);
      const ownSubcats = new Set(block.subcats || []);
      for (const t of eff) {
        if (!txMatchesBlock(t, block)) continue;
        // El propio bloque ya reclama este movimiento por SU etiqueta/subcategoría
        // específica (no solo por el pilar) -> no es doble conteo, es el mismo bloque.
        const matchesOwnSpecific = (t.subcategory && ownSubcats.has(t.subcategory))
          || (t.tags && t.tags.some((tg) => ownTags.has(tg)));
        const earmarkedElsewhere = !matchesOwnSpecific
          && ((t.subcategory && earmarkedSubcats.has(t.subcategory))
            || (t.tags && t.tags.some((tg) => earmarkedTags.has(tg))));
        if (earmarkedElsewhere) continue;
        const net = pillarNetAmount(t);
        if (net !== 0) spent += net;
      }
      const subLimits = (block.subLimits || []).map((sl) => {
        let used = 0;
        for (const t of eff) {
          if (txMatchesSubLimit(t, sl)) used += pillarNetAmount(t);
        }
        return { ...sl, used, remaining: sl.amount - used, over: used > sl.amount };
      });
      return {
        ...block, limit, spent, remaining: limit - spent,
        pctUsed: limit > 0 ? spent / limit : 0,
        over: spent > limit,
        subLimits,
      };
    });
    return { totalIncome, blocks };
  }

  function validatePresetSum(preset) {
    const sum = preset.blocks.reduce((acc, b) => acc + (Number(b.pct) || 0), 0);
    return Math.abs(sum - 100) < 0.01;
  }

  // Detección de gastos recurrentes (suscripciones/comercios frecuentes, >= 3 veces con importe similar)
  function detectRecurring(transactions) {
    const groups = new Map();
    for (const t of transactions) {
      if (t.type !== 'gasto') continue;
      const key = Utils.normalizeText(t.concept).replace(/[0-9]/g, '#');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const recurring = [];
    for (const [key, txs] of groups) {
      if (txs.length >= 3) {
        const amounts = txs.map((t) => Math.abs(t.amount));
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        recurring.push({
          key, label: txs[0].concept, count: txs.length, avgAmount: avg,
          totalAmount: amounts.reduce((a, b) => a + b, 0),
          transactions: txs,
        });
      }
    }
    return recurring.sort((a, b) => b.count - a.count);
  }

  // Gasto con intención vs. gasto por impulso: suma y peso de los movimientos
  // etiquetados #impulso sobre el gasto total del periodo.
  function computeImpulseStats(transactions) {
    const eff = effectiveTransactions(transactions);
    const gastos = eff.filter((t) => t.type === 'gasto');
    const impulse = gastos.filter((t) => (t.tags || []).includes('#impulso'));
    const totalGastos = gastos.reduce((a, t) => a + Math.abs(t.amount), 0);
    const totalImpulse = impulse.reduce((a, t) => a + Math.abs(t.amount), 0);
    return {
      count: impulse.length, total: totalImpulse,
      pctOfTotal: totalGastos > 0 ? totalImpulse / totalGastos : 0,
      transactions: impulse,
    };
  }

  function detectAntExpenses(transactions, threshold) {
    const eff = effectiveTransactions(transactions);
    const ants = eff.filter((t) => t.type === 'gasto' && Math.abs(t.amount) < threshold);
    const totalAll = eff.filter((t) => t.type === 'gasto').reduce((a, t) => a + Math.abs(t.amount), 0);
    const totalAnts = ants.reduce((a, t) => a + Math.abs(t.amount), 0);
    return {
      count: ants.length, total: totalAnts,
      pctOfTotal: totalAll > 0 ? totalAnts / totalAll : 0,
      transactions: ants,
    };
  }

  function dateDiffDays(d1, d2) {
    const [y1, m1, day1] = d1.split('-').map(Number);
    const [y2, m2, day2] = d2.split('-').map(Number);
    const t1 = Date.UTC(y1, m1 - 1, day1);
    const t2 = Date.UTC(y2, m2 - 1, day2);
    return Math.round((t2 - t1) / 86400000);
  }

  // Detecta pares de movimientos con importes exactamente opuestos (±X €) en la misma
  // cuenta, separados por 0-3 días: el patrón típico de una retención/preautorización
  // (gasolineras, hoteles, Uber, máquinas expendedoras) que el comercio devuelve antes
  // de cobrar el importe real. Devuelve las referencias reales a los objetos de
  // "items" (no copias), para que el que llama pueda mutar directamente tx.type.
  function detectRetentionPairs(items) {
    const pairs = [];
    const used = new Set();
    for (let i = 0; i < items.length; i++) {
      if (used.has(i)) continue;
      const a = items[i];
      if (a.type && a.type !== 'gasto' && a.type !== 'ingreso') continue;
      if (Math.abs(a.amount) < 0.01) continue;
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(j)) continue;
        const b = items[j];
        if (b.type && b.type !== 'gasto' && b.type !== 'ingreso') continue;
        if (a.accountId !== undefined && b.accountId !== undefined && a.accountId !== b.accountId) continue;
        if (Math.abs(a.amount + b.amount) > 0.01) continue;
        const daysDiff = Math.abs(dateDiffDays(a.date, b.date));
        if (daysDiff > 3) continue;
        const text = Utils.normalizeText(a.concept) + ' ' + Utils.normalizeText(b.concept);
        const looksLikeReversal = /DEVOLUCION|REVERSAL|ANULA/.test(text);
        pairs.push({ a, b, daysDiff, looksLikeReversal, amount: Math.abs(a.amount) });
        used.add(i); used.add(j);
        break;
      }
    }
    return pairs;
  }

  return {
    effectiveTransactions, pillarNetAmount, computeKPIs, computePillarBreakdown,
    computeSubcategoryBreakdown,
    computeBudget, validatePresetSum, detectRecurring, detectAntExpenses, txMatchesBlock,
    detectRetentionPairs, computeImpulseStats,
  };
})();
