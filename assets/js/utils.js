// Utilidades compartidas: fechas, números, hashing, CSV export, normalización de texto.
'use strict';

const Utils = (() => {

  function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function normalizeText(s) {
    if (s == null) return '';
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Clave de comparación insensible a mayúsculas/tildes/espacios, en minúsculas (para
  // el catálogo de subcategorías/etiquetas: "Cómics", "COMICS", " comics " deben
  // reconocerse como la misma entrada ya existente).
  function foldKey(s) {
    if (s == null) return '';
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Normaliza para comparar conceptos de forma tolerante a símbolos: los bancos
  // alternan asteriscos, guiones y espacios para el MISMO comercio ("GOOGLE
  // *Google On", "GOOGLE*GOOGLE ONE", "GOOGLE *GOOGLE*ON"). Tras pasar por
  // normalizeText (mayúsculas, sin tildes), sustituye cualquier carácter que no sea
  // letra/dígito por un espacio y colapsa los espacios, para que las tres variantes
  // anteriores den exactamente "GOOGLE GOOGLE ON" / "GOOGLE GOOGLE ONE".
  function normalizeForMatch(s) {
    return normalizeText(s).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Parsea importes en formato europeo: "-3,25EUR", "1.400,00EUR", "1.400,00", "-3,25"
  function parseEuropeanAmount(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === '') return null;
    s = s.replace(/EUR/gi, '').replace(/€/g, '').trim();
    const negative = /^-/.test(s) || /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, '');
    // Si tiene coma como separador decimal (formato europeo): quitar puntos de miles, coma -> punto
    if (/,\d{1,2}$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // formato con coma de miles y punto decimal (ej: Revolut "1,400.00")
      s = s.replace(/,/g, '');
    }
    s = s.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    return negative && n > 0 ? -n : n;
  }

  // Parsea fechas DD/MM/YYYY o YYYY-MM-DD a ISO (YYYY-MM-DD)
  function parseDateToISO(raw, hint) {
    if (!raw) return null;
    const s = String(raw).trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
      // DD/MM/YYYY (hint 'MM/DD/YYYY' para Revolut si aplica)
      if (hint === 'MM/DD/YYYY') {
        return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;
      }
      return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    }
    if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/))) {
      return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    return null;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    return `${(n * 100).toFixed(1)}%`;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // Hash simple y determinista (FNV-1a) de una cadena
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  // Si el texto contiene caracteres de escrituras que nunca aparecerían en un extracto
  // bancario en español (griego, cirílico, armenio, hebreo, árabe...), casi seguro que
  // en realidad es windows-1252/ISO-8859-1 mal interpretado como UTF-8: una letra
  // mayúscula con tilde (Á,É,Í,Ñ,Ó,Ú,Ü = bytes 0xC1-0xDC) seguida de un símbolo
  // cp1252 cualquiera (comillas, "º", "ª", guiones largos... bytes 0x80-0xBF) da la
  // casualidad de formar una secuencia de 2 bytes perfectamente válida en UTF-8, así
  // que ni siquiera un decodificador en modo "fatal" la rechaza — simplemente cae en
  // otro alfabeto. El español nunca usa esos alfabetos, así que su presencia es la
  // señal de que hubo que forzar windows-1252.
  function looksMisdecoded(text) {
    return /[ƀ-῿]/.test(text);
  }

  function detectEncodingAndDecode(buffer) {
    try {
      const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      if (!looksMisdecoded(utf8)) return utf8;
    } catch (e) {
      // No era UTF-8 válido en absoluto: seguro que es windows-1252/ISO-8859-1.
    }
    try {
      return new TextDecoder('windows-1252').decode(buffer);
    } catch (e2) {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }

  function toCSV(rows, headers) {
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [headers.join(';')];
    for (const r of rows) {
      lines.push(headers.map((h) => esc(r[h])).join(';'));
    }
    // BOM UTF-8 + separador ; para compatibilidad Excel
    return '﻿' + lines.join('\r\n');
  }

  function downloadText(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function monthKey(iso) {
    return iso ? iso.slice(0, 7) : null;
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // Días completos entre una fecha ISO (YYYY-MM-DD) y hoy. Compara solo fechas de
  // calendario (sin horas), para que "hoy" siempre dé 0 sin importar la hora del día.
  function daysSince(isoDate) {
    if (!isoDate) return null;
    const [y, m, d] = isoDate.split('-').map(Number);
    const then = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - then) / 86400000);
  }

  function maxDate(dates) {
    return dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null;
  }

  function minDate(dates) {
    return dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null;
  }

  return {
    uid, normalizeText, foldKey, normalizeForMatch, parseEuropeanAmount, parseDateToISO, pad2, daysSince, maxDate, minDate,
    fmtMoney, fmtPct, fmtDate, hashString, detectEncodingAndDecode,
    toCSV, downloadText, monthKey, debounce,
  };
})();
