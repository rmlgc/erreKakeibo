// Catálogo maestro de subcategorías y etiquetas: evita duplicados por mayúsculas,
// tildes o espacios (ej. "#Comics", "#comics", " #cómics " deben ser la misma
// etiqueta) normalizando siempre al guardar y reutilizando la entrada ya conocida.
'use strict';

const Catalog = (() => {
  // Catálogo base de subcategorías sugeridas por pilar. Son solo un punto de
  // partida: el usuario puede renombrarlas, borrarlas o añadir las suyas desde
  // Ajustes — por eso se siembran una sola vez (en una base de datos nueva), no se
  // vuelven a imponer en cada carga.
  const SUGGESTED_SUBCATEGORIES = [
    ['Supermercado', 'supervivencia'], ['Vivienda y Suministros', 'supervivencia'],
    ['Transporte y Gasolina', 'supervivencia'], ['Salud y Farmacia', 'supervivencia'],
    ['Seguros y Pólizas', 'supervivencia'],
    ['Restauración y Cafés', 'ocio'], ['Comida rápida y Delivery', 'ocio'],
    ['Ropa y Estética', 'ocio'], ['Viajes y Escapadas', 'ocio'],
    ['Suscripciones Digitales', 'ocio'], ['Caprichos e Impulsos', 'ocio'],
    ['Cómics y Lectura', 'cultura'], ['Coleccionismo con intención', 'cultura'],
    ['Gaming y Entretenimiento', 'cultura'], ['Cine, Museos y Eventos', 'cultura'],
    ['Hogar y Bazares', 'extras'], ['Regalos y Detalles', 'extras'],
    ['Bizum y Varios', 'extras'], ['Pagos Aplazados', 'extras'],
  ];

  function emptyCatalog() {
    return { subcategories: [], tags: [] }; // subcategories: [{name, pillar}], tags: [{name}]
  }

  function defaultCatalog() {
    return {
      subcategories: SUGGESTED_SUBCATEGORIES.map(([name, pillar]) => ({ name, pillar })),
      tags: [],
    };
  }

  // Normaliza el texto de una etiqueta a su forma canónica de guardado: minúsculas,
  // sin tildes, espacios internos -> "_", con "#" inicial obligatorio.
  function formatTag(raw) {
    let s = Utils.foldKey(raw).replace(/^#+/, '').trim();
    s = s.replace(/\s+/g, '_');
    return s ? `#${s}` : '';
  }

  function formatSubcategory(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim();
  }

  // Busca-o-registra: si ya existe una etiqueta equivalente (ignorando tildes y
  // mayúsculas) en el catálogo, devuelve ESA, sin crear un duplicado; si no, registra
  // la nueva forma canónica y la devuelve.
  function canonicalTag(state, raw) {
    const formatted = formatTag(raw);
    if (!formatted) return '';
    const key = Utils.foldKey(formatted);
    const existing = state.catalog.tags.find((t) => Utils.foldKey(t.name) === key);
    if (existing) return existing.name;
    state.catalog.tags.push({ name: formatted });
    return formatted;
  }

  function canonicalTags(state, rawList) {
    const out = [];
    for (const raw of rawList) {
      const c = canonicalTag(state, raw);
      if (c && !out.includes(c)) out.push(c);
    }
    return out;
  }

  // Igual que canonicalTag, pero para subcategorías: compara ignorando tildes y
  // mayúsculas, y si ya existe una variante conocida, reutiliza su nombre tal cual se
  // guardó la primera vez (para no perder su capitalización "bonita").
  function canonicalSubcategory(state, raw, pillar) {
    const formatted = formatSubcategory(raw);
    if (!formatted) return null;
    const key = Utils.foldKey(formatted);
    const existing = state.catalog.subcategories.find((s) => Utils.foldKey(s.name) === key);
    if (existing) return existing.name;
    state.catalog.subcategories.push({ name: formatted, pillar: pillar || null });
    return formatted;
  }

  function allTagNames(state) {
    return state.catalog.tags.map((t) => t.name).sort();
  }

  function allSubcategoryNames(state) {
    return state.catalog.subcategories.map((s) => s.name).sort();
  }

  // Recorre reglas y movimientos ya existentes (ej. al migrar un archivo antiguo que
  // no tenía catálogo) para sembrarlo con lo que ya se venía usando, sin perder nada.
  function ensureInitialized(state) {
    if (!state.catalog) state.catalog = emptyCatalog();
    const seenTags = new Set(state.catalog.tags.map((t) => Utils.foldKey(t.name)));
    const seenSubcats = new Set(state.catalog.subcategories.map((s) => Utils.foldKey(s.name)));
    const addTag = (raw) => {
      const formatted = formatTag(raw);
      if (!formatted) return;
      const key = Utils.foldKey(formatted);
      if (seenTags.has(key)) return;
      seenTags.add(key);
      state.catalog.tags.push({ name: formatted });
    };
    const addSubcat = (raw, pillar) => {
      const formatted = formatSubcategory(raw);
      if (!formatted) return;
      const key = Utils.foldKey(formatted);
      if (seenSubcats.has(key)) return;
      seenSubcats.add(key);
      state.catalog.subcategories.push({ name: formatted, pillar: pillar || null });
    };
    for (const r of state.rules || []) {
      (r.tags || []).forEach(addTag);
      if (r.subcategory) addSubcat(r.subcategory, r.pillar);
    }
    for (const t of state.transactions || []) {
      (t.tags || []).forEach(addTag);
      if (t.subcategory) addSubcat(t.subcategory, t.pillar);
    }
  }

  // Fusiona varias etiquetas/subcategorías (variantes manuales, no solo de
  // tildes/mayúsculas) en un único nombre canónico, reescribiendo el historial y las
  // reglas. "variants" son los nombres tal como aparecen en el catálogo.
  function mergeTags(state, variants, targetName) {
    const canonicalTarget = formatTag(targetName);
    const variantKeys = new Set(variants.map(Utils.foldKey));
    for (const tx of state.transactions) {
      if (!tx.tags || !tx.tags.length) continue;
      const merged = tx.tags.map((t) => (variantKeys.has(Utils.foldKey(t)) ? canonicalTarget : t));
      tx.tags = Array.from(new Set(merged));
    }
    for (const r of state.rules) {
      if (!r.tags || !r.tags.length) continue;
      const merged = r.tags.map((t) => (variantKeys.has(Utils.foldKey(t)) ? canonicalTarget : t));
      r.tags = Array.from(new Set(merged));
    }
    state.catalog.tags = state.catalog.tags.filter((t) => !variantKeys.has(Utils.foldKey(t.name)));
    if (!state.catalog.tags.some((t) => Utils.foldKey(t.name) === Utils.foldKey(canonicalTarget))) {
      state.catalog.tags.push({ name: canonicalTarget });
    }
  }

  function mergeSubcategories(state, variants, targetName) {
    const canonicalTarget = formatSubcategory(targetName);
    const variantKeys = new Set(variants.map(Utils.foldKey));
    for (const tx of state.transactions) {
      if (tx.subcategory && variantKeys.has(Utils.foldKey(tx.subcategory))) tx.subcategory = canonicalTarget;
    }
    for (const r of state.rules) {
      if (r.subcategory && variantKeys.has(Utils.foldKey(r.subcategory))) r.subcategory = canonicalTarget;
    }
    const keptPillar = state.catalog.subcategories.find((s) => variantKeys.has(Utils.foldKey(s.name)))?.pillar || null;
    state.catalog.subcategories = state.catalog.subcategories.filter((s) => !variantKeys.has(Utils.foldKey(s.name)));
    if (!state.catalog.subcategories.some((s) => Utils.foldKey(s.name) === Utils.foldKey(canonicalTarget))) {
      state.catalog.subcategories.push({ name: canonicalTarget, pillar: keptPillar });
    }
  }

  // Cuenta cuántas veces aparece cada entrada del catálogo en reglas + movimientos,
  // para el panel de limpieza de Ajustes.
  function usageCounts(state) {
    const tagCounts = new Map(state.catalog.tags.map((t) => [Utils.foldKey(t.name), 0]));
    const subcatCounts = new Map(state.catalog.subcategories.map((s) => [Utils.foldKey(s.name), 0]));
    const bump = (map, key) => { if (map.has(key)) map.set(key, map.get(key) + 1); };
    for (const list of [state.rules, state.transactions]) {
      for (const item of list) {
        (item.tags || []).forEach((t) => bump(tagCounts, Utils.foldKey(t)));
        if (item.subcategory) bump(subcatCounts, Utils.foldKey(item.subcategory));
      }
    }
    return {
      tags: state.catalog.tags.map((t) => ({ name: t.name, count: tagCounts.get(Utils.foldKey(t.name)) || 0 })),
      subcategories: state.catalog.subcategories.map((s) => ({ name: s.name, count: subcatCounts.get(Utils.foldKey(s.name)) || 0 })),
    };
  }

  return {
    emptyCatalog, defaultCatalog, formatTag, formatSubcategory, canonicalTag, canonicalTags, canonicalSubcategory,
    allTagNames, allSubcategoryNames, ensureInitialized, mergeTags, mergeSubcategories, usageCounts,
  };
})();
