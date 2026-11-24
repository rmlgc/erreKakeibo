// Registro de adaptadores de banco. Cada adaptador normaliza filas CSV al esquema interno común:
// { accountId, date, concept, amount, balance, type, rawRow }
'use strict';

const Adapters = (() => {
  const registry = new Map();

  function register(adapter) {
    registry.set(adapter.id, adapter);
  }

  function get(id) {
    return registry.get(id);
  }

  function all() {
    return Array.from(registry.values());
  }

  // Intenta detectar qué adaptador preconfigurado encaja con el texto crudo del CSV.
  function detect(rawText) {
    for (const adapter of registry.values()) {
      if (adapter.detect && adapter.detect(rawText)) return adapter;
    }
    return null;
  }

  return { register, get, all, detect };
})();
