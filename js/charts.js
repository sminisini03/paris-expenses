// Chart.js setup: lazy loading, theme from design tokens, shared options.
// Charts never hard-code colours: neutrals come from tokens.css and series
// colours from each category, so themes and new categories just work.

import { money } from './format.js';

let loading;
/** Load the vendored Chart.js once (cached offline by the service worker). */
export function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = () => { loading = null; reject(new Error('Could not load the chart library.')); };
    document.head.append(s);
  });
  return loading;
}

/** Resolve token colours (they use light-dark(), so read them through a probe). */
export function themeColors() {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.append(probe);
  const read = (token) => { probe.style.color = `var(${token})`; return getComputedStyle(probe).color; };
  const t = {
    text: read('--text'), muted: read('--text-muted'), border: read('--border'),
    surface: read('--surface'), accent: read('--accent'), negative: read('--negative'),
  };
  probe.remove();
  return t;
}

export function applyDefaults(Chart, t) {
  const d = Chart.defaults;
  d.font.family = getComputedStyle(document.body).fontFamily;
  d.font.size = 12;
  d.color = t.muted;                       // axis labels: muted ink, never series colour
  d.borderColor = t.border;
  d.maintainAspectRatio = false;
  // Only change the duration: replacing the whole object drops Chart.js's easing function.
  d.animation.duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
  d.plugins.legend.display = false;        // HTML legends instead (accessible, themable)
  Object.assign(d.plugins.tooltip, {
    backgroundColor: t.surface, borderColor: t.border, borderWidth: 1,
    titleColor: t.text, bodyColor: t.text, footerColor: t.muted,
    padding: 10, cornerRadius: 8, boxPadding: 4, usePointStyle: true,
    titleFont: { weight: '600' },
  });
}

/** Value axis: recessive grid, euro ticks without cents. */
export function moneyScale(t, extra = {}) {
  return {
    beginAtZero: true,
    border: { display: false },
    grid: { color: t.border, drawTicks: false },
    ticks: { padding: 8, maxTicksLimit: 5, callback: (v) => money(Number(v), { whole: true }) },
    ...extra,
  };
}

/** Category axis: no grid lines. */
export function categoryScale(extra = {}) {
  return { border: { display: false }, grid: { display: false }, ticks: { padding: 6 }, ...extra };
}

/**
 * Plugin: thin vertical budget marker on horizontal bars.
 * options.plugins.budgetMarkers = { values: [cents|null per row], color }
 */
export const budgetMarkers = {
  id: 'budgetMarkers',
  afterDatasetsDraw(chart, _args, opts) {
    const values = opts?.values;
    if (!values) return;
    const { ctx, scales: { x, y } } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.strokeStyle = opts.color;
    ctx.lineWidth = 2;
    values.forEach((v, i) => {
      if (!v || !meta.data[i]) return;
      const px = x.getPixelForValue(v);
      const h = meta.data[i].height ?? 16;
      const cy = y.getPixelForValue(i);
      ctx.beginPath();
      ctx.moveTo(px, cy - h / 2 - 4);
      ctx.lineTo(px, cy + h / 2 + 4);
      ctx.stroke();
    });
    ctx.restore();
  },
};

/** Tooltip label "Groceries: € 123,45". */
export const moneyLabel = (ctx) => `${ctx.dataset.label}: ${money(ctx.parsed[ctx.chart.options.indexAxis === 'y' ? 'x' : 'y'] ?? 0)}`;
