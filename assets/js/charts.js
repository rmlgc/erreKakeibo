// Gráficos del dashboard (Chart.js).
'use strict';

const Charts = (() => {
  const instances = {};

  function destroy(key) {
    if (instances[key]) { instances[key].destroy(); delete instances[key]; }
  }

  // onSliceClick(pillarId): opcional, se llama al hacer clic en una porción del
  // donut (para el desglose por subcategorías / drill-down de Resumen).
  function pillarDonut(canvasId, breakdown, onSliceClick) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const labels = DB.PILLARS.map((p) => p.name);
    const data = DB.PILLARS.map((p) => Math.max(0, breakdown[p.id] || 0));
    const colors = DB.PILLARS.map((p) => p.color);
    instances[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: onSliceClick ? (evt, elements) => {
          if (elements.length) onSliceClick(DB.PILLARS[elements[0].index].id);
        } : undefined,
        onHover: onSliceClick ? (evt, elements) => {
          evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        } : undefined,
        plugins: {
          legend: { position: 'bottom', labels: { color: getLabelColor() } },
          tooltip: { callbacks: { label: (c) => `${c.label}: ${Utils.fmtMoney(c.raw)}` } },
        },
      },
    });
  }

  function monthOverMonth(canvasId, months) {
    // months: [{ label, gasto, ahorro }]
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map((m) => m.label),
        datasets: [
          { label: 'Gasto', data: months.map((m) => m.gasto), backgroundColor: '#f89e49' },
          { label: 'Ahorro', data: months.map((m) => m.ahorro), backgroundColor: '#5FB49C' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: getLabelColor() }, grid: { color: getGridColor() } },
          y: { ticks: { color: getLabelColor() }, grid: { color: getGridColor() } },
        },
        plugins: {
          legend: { labels: { color: getLabelColor() } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${Utils.fmtMoney(c.raw)}` } },
        },
      },
    });
  }

  function yearOverYear(canvasId, current, previous) {
    // current/previous: arrays of 12 numbers (gasto mensual)
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Año actual', data: current, borderColor: '#f89e49', backgroundColor: 'transparent', tension: 0.3 },
          { label: 'Año anterior', data: previous, borderColor: '#cda3ff', backgroundColor: 'transparent', tension: 0.3, borderDash: [5, 5] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: getLabelColor() }, grid: { color: getGridColor() } },
          y: { ticks: { color: getLabelColor() }, grid: { color: getGridColor() } },
        },
        plugins: {
          legend: { labels: { color: getLabelColor() } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${Utils.fmtMoney(c.raw)}` } },
        },
      },
    });
  }

  function getLabelColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1F2421';
  }
  function getGridColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#e5e1d8';
  }

  return { pillarDonut, monthOverMonth, yearOverYear, destroy };
})();
