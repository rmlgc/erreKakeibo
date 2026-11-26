// Gráficos del dashboard (Chart.js).
'use strict';

const Charts = (() => {
  const instances = {};
  let dismissBound = false;

  function bindGlobalDismiss() {
    if (dismissBound) return;
    dismissBound = true;
    document.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.tagName === 'CANVAS') return;
      for (const chart of Object.values(instances)) {
        if (!chart || !chart.tooltip) continue;
        if (chart.getActiveElements().length > 0) {
          chart.setActiveElements([]);
          chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          chart.update('none');
        }
      }
    });

    let resizeTimer = null;
    const refitCharts = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          for (const chart of Object.values(instances)) {
            if (chart && typeof chart.resize === 'function') chart.resize();
          }
        });
      }, 150);
    };
    window.addEventListener('orientationchange', refitCharts);
    window.addEventListener('resize', refitCharts);
  }

  function clearTooltipOnEmptyClick(evt, elements, chart) {
    if (!elements || elements.length === 0) {
      chart.setActiveElements([]);
      if (chart.tooltip) chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update('none');
    }
  }

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
    // months: [{ label, pillars: { supervivencia, ocio, cultura, extras }, unclassified, ahorro, topeGasto, metaAhorro }]
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const datasets = DB.PILLARS.map((p) => ({
      label: p.name,
      data: months.map((m) => Math.max(0, (m.pillars && m.pillars[p.id]) || 0)),
      backgroundColor: p.color,
      stack: 'gasto',
      order: 1,
    }));

    if (months.some((m) => (m.unclassified || 0) > 0)) {
      datasets.push({
        label: 'Sin clasificar',
        data: months.map((m) => Math.max(0, m.unclassified || 0)),
        backgroundColor: '#9aa0a6',
        stack: 'gasto',
        order: 1,
      });
    }

    datasets.push({
      label: 'Ahorro',
      data: months.map((m) => m.ahorro),
      backgroundColor: '#5FB49C',
      stack: 'ahorro',
      order: 1,
    });

    if (months.some((m) => m.topeGasto !== null && m.topeGasto !== undefined)) {
      datasets.push({
        type: 'line',
        label: 'Tope gasto',
        data: months.map((m) => m.topeGasto),
        borderColor: getLabelColor(),
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        borderWidth: 2,
        pointRadius: 2.5,
        tension: 0.2,
        spanGaps: false,
        order: 0,
      });
    }

    if (months.some((m) => m.metaAhorro !== null && m.metaAhorro !== undefined)) {
      datasets.push({
        type: 'line',
        label: 'Meta ahorro',
        data: months.map((m) => m.metaAhorro),
        borderColor: '#2f8f72',
        backgroundColor: 'transparent',
        borderDash: [3, 3],
        borderWidth: 2,
        pointRadius: 2.5,
        tension: 0.2,
        spanGaps: false,
        order: 0,
      });
    }

    bindGlobalDismiss();
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map((m) => m.label),
        datasets,
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: clearTooltipOnEmptyClick,
        scales: {
          x: { stacked: true, ticks: { color: getLabelColor() }, grid: { color: getGridColor() } },
          y: { stacked: true, ticks: { color: getLabelColor() }, grid: { color: getGridColor() } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: getLabelColor(), boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (c) => `${c.dataset.label}: ${Utils.fmtMoney(c.raw)}`,
              footer: (items) => {
                const gasto = items
                  .filter((i) => i.dataset && i.dataset.stack === 'gasto')
                  .reduce((acc, i) => acc + (Number(i.raw) || 0), 0);
                return `Total gasto: ${Utils.fmtMoney(gasto)}`;
              },
            },
          },
        },
      },
    });
  }

  function yearOverYear(canvasId, series, opts = {}) {
    // series: [{ label, data: number[12], color }]
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    bindGlobalDismiss();
    const isPct = !!opts.isPct;
    const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const datasets = series.map((s, idx) => ({
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: 'transparent',
      tension: 0.3,
      borderWidth: idx === 0 ? 2.5 : 2,
      borderDash: idx >= 2 ? [5, 4] : [],
      spanGaps: false,
    }));

    if (opts.target && Number.isFinite(opts.target.value)) {
      datasets.push({
        label: `${opts.target.label} (${isPct ? Utils.fmtPct(opts.target.value) : Utils.fmtMoney(opts.target.value)})`,
        data: Array(12).fill(opts.target.value),
        borderColor: getLabelColor(),
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHitRadius: 0,
      });
    }

    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: clearTooltipOnEmptyClick,
        scales: {
          x: { ticks: { color: getLabelColor() }, grid: { color: getGridColor() } },
          y: {
            ticks: {
              color: getLabelColor(),
              callback: isPct ? (v) => `${Math.round(v * 100)}%` : undefined,
            },
            grid: { color: getGridColor() },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: getLabelColor(), boxWidth: 14 } },
          tooltip: {
            callbacks: {
              label: (c) => c.raw === null || c.raw === undefined
                ? `${c.dataset.label}: —`
                : `${c.dataset.label}: ${isPct ? Utils.fmtPct(c.raw) : Utils.fmtMoney(c.raw)}`,
            },
          },
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
