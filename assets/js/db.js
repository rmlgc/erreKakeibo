// Capa de persistencia: estado en memoria + caché de sesión (localStorage) + archivo JSON portable.
//
// Nota: se usa localStorage (síncrono) en vez de IndexedDB para la caché de sesión porque
// IndexedDB puede quedarse colgado indefinidamente (sin éxito ni error) bajo origen file://
// en navegadores basados en Chromium, lo cual bloquearía el arranque de la app al abrir
// index.html directamente desde disco. El JSON portable sigue siendo la fuente de verdad.
'use strict';

const DB = (() => {
  const SCHEMA_VERSION = 1;
  const LS_KEY = 'kakeibo-cache-v1';

  let state = null;
  let dirty = false;
  let fileHandle = null; // File System Access API handle, si el navegador lo soporta
  let fileName = 'contabilidad_kakeibo.json';
  const listeners = new Set();

  function defaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      accounts: [],
      transactions: [],
      rules: DefaultRules.build(),
      bankProfiles: [],
      catalog: Catalog.defaultCatalog(),
      budgetPresets: [defaultBudgetPreset()],
      activeBudgetPresetId: 'preset_50_25_25',
      reflections: {}, // { 'YYYY-MM': { wentWell, wentWrong, upcoming } }
      settings: {
        theme: 'light',
        antThreshold: 10,
        incomeBaseMonthly: 0,
        useRealIncome: true,
        staleDataThresholdDays: 7,
      },
    };
  }

  function defaultBudgetPreset() {
    return {
      id: 'preset_50_25_25',
      name: 'Regla de Cuartos (50/25/25)',
      blocks: [
        {
          id: 'block_ahorro', name: 'Ahorro', pct: 25,
          pillars: [], subcats: [], tags: [], isSavings: true,
          subLimits: [],
        },
        {
          id: 'block_propios', name: 'Gastos propios', pct: 25,
          pillars: ['ocio', 'cultura'], subcats: [], tags: [],
          subLimits: [{ id: 'sl_capricho', label: 'Capricho súper', amount: 50, matchTags: ['#capricho_super'] }],
        },
        {
          id: 'block_todo_lo_demas', name: 'Todo lo demás', pct: 50,
          pillars: ['supervivencia', 'extras'], subcats: [], tags: [],
          subLimits: [],
        },
      ],
    };
  }

  // Nombres clásicos/universales del método Kakeibo. Los IDs (supervivencia, ocio,
  // cultura, extras) NO cambian: son los que ya están guardados en archivos JSON y
  // diccionarios de reglas existentes, solo se renombra la etiqueta visible.
  const PILLARS = [
    { id: 'supervivencia', name: 'Supervivencia', color: '#5FB49C' },
    { id: 'ocio', name: 'Ocio y Vicio', color: '#f89e49' },
    { id: 'cultura', name: 'Cultura', color: '#cda3ff' },
    { id: 'extras', name: 'Extras', color: '#6B8EAE' },
  ];

  function onChange(fn) { listeners.add(fn); }
  function emitChange() { listeners.forEach((fn) => fn(state)); }

  // opts.silent: actualiza la caché de localStorage (para no resucitar estado viejo
  // al recargar la página) pero deja el aviso de "cambios sin guardar" APAGADO,
  // incluso si ya estaba encendido por un cambio previo (ej. cargar el mes de ejemplo
  // marca dirty; si luego se borra ese mismo ejemplo y no queda nada más, ya no hay
  // nada que guardar, así que el aviso debe apagarse, no solo "no volver a encenderse").
  function markDirty(opts = {}) {
    dirty = !opts.silent;
    cacheToLocalStorage();
    emitChange();
  }

  function isDirty() { return dirty; }
  function clearDirty() { dirty = false; emitChange(); }

  function get() { return state; }

  function init() {
    state = defaultState();
    const cached = readLocalStorageCache();
    if (cached) state = migrateState(cached);
    Catalog.ensureInitialized(state);
    emitChange();
    return Promise.resolve(state);
  }

  function migrateState(s) {
    const d = defaultState();
    return {
      ...d, ...s,
      settings: { ...d.settings, ...(s.settings || {}) },
      catalog: s.catalog || d.catalog,
    };
  }

  function replaceState(newState) {
    state = migrateState(newState);
    Catalog.ensureInitialized(state);
    dirty = false;
    cacheToLocalStorage();
    emitChange();
  }

  // "Limpiar navegador": vuelve a un estado completamente vacío, sin archivo
  // recordado ni caché de sesión. No toca ningún archivo en disco — solo lo que este
  // navegador tenía guardado de este origen.
  function hardReset() {
    state = defaultState();
    Catalog.ensureInitialized(state);
    dirty = false;
    fileHandle = null;
    fileName = 'contabilidad_kakeibo.json';
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* best-effort */ }
    emitChange();
  }

  // ---------- Caché de sesión (localStorage) ----------
  // localStorage tiene un límite práctico de ~5MB por origen. El archivo JSON en disco
  // (la fuente de verdad real) sí conserva rawRow de cada movimiento para trazabilidad,
  // pero la caché de sesión es solo una red de seguridad ante un cierre accidental de la
  // pestaña, así que se guarda sin rawRow para no acercarse a ese límite tras años de
  // extractos importados.
  function cacheToLocalStorage() {
    try {
      const lightState = {
        ...state,
        transactions: state.transactions.map(({ rawRow, ...rest }) => rest),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(lightState));
    } catch (e) {
      console.warn('No se pudo cachear en localStorage', e);
    }
  }

  function readLocalStorageCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- Archivo JSON portable ----------
  const supportsFSAccess = 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

  async function openFile() {
    if (supportsFSAccess) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Kakeibo JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      fileHandle = handle;
      fileName = handle.name;
      const file = await handle.getFile();
      const text = await file.text();
      replaceState(JSON.parse(text));
      return true;
    } else {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return resolve(false);
          fileName = file.name;
          const text = await file.text();
          replaceState(JSON.parse(text));
          resolve(true);
        };
        input.click();
      });
    }
  }

  async function saveFile(forcePicker = false) {
    const json = JSON.stringify(state, null, 2);
    if (supportsFSAccess) {
      try {
        if (!fileHandle || forcePicker) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'Kakeibo JSON', accept: { 'application/json': ['.json'] } }],
          });
          fileName = fileHandle.name;
        }
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        clearDirty();
        return { ok: true, mode: 'fs-access', fileName };
      } catch (e) {
        if (e.name === 'AbortError') return { ok: false, aborted: true };
        console.warn('Fallo File System Access, usando descarga', e);
      }
    }
    Utils.downloadText(fileName, json, 'application/json');
    clearDirty();
    return { ok: true, mode: 'download', fileName };
  }

  function hasFileHandle() { return !!fileHandle; }
  function getFileName() { return fileName; }

  return {
    PILLARS,
    init, get, markDirty, isDirty, clearDirty,
    onChange, emitChange,
    openFile, saveFile, hasFileHandle, getFileName, supportsFSAccess,
    replaceState, hardReset,
  };
})();
