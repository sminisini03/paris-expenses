// Charts: month × category, budget vs actual, trends, small multiples,
// cumulative vs plan. Everything reads the category list at runtime, so a new
// category appears in every chart with no code change. Tapping a bar or point
// opens the matching filtered transaction list.

import { h, pageHeader, emptyState, segmented } from '../ui.js';
import { settings, setSetting } from '../settings.js';
import { listTransactions } from '../transactions.js';
import { listCategories } from '../categories.js';
import { money, month as monthName, todayIso, date as fmtDate } from '../format.js';
import { periodMonths, monthlyByCategory, cumulative, budgetFor } from '../budget.js';
import { loadChartJs, themeColors, applyDefaults, moneyScale, categoryScale, budgetMarkers } from '../charts.js';
import { navigate } from '../app.js';

let instances = [];
let trendPick = null;   // categories chosen for the trend chart (kept while the app is open)

const shortMonth = (ym) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'short' });

function legend(items) {
  return h('ul', { class: 'legend' }, items.map(({ color, label, dashed }) =>
    h('li', {}, h('span', { class: `legend__swatch${dashed ? ' legend__swatch--dashed' : ''}`, style: { '--dot': color } }), label)));
}

function tableDetails(caption, head, rows) {
  return h('details', { class: 'details chart-table' },
    h('summary', {}, 'Show as table'),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('caption', { class: 'visually-hidden' }, caption),
      h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, c)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => (i ? h('td', { class: 'num amount' }, c) : h('th', { scope: 'row' }, c)))))),
    )),
  );
}

function chartSection(id, title, subtitle, box, ...rest) {
  return h('section', { class: 'card stack chart-card', 'aria-labelledby': id },
    h('div', {}, h('h2', { class: 'chart-title', id }, title), subtitle && h('p', { class: 'small muted' }, subtitle)),
    box, ...rest);
}

function canvasBox(height, label) {
  const canvas = h('canvas', { role: 'img', 'aria-label': label });
  return { box: h('div', { class: 'chart-box', style: { height: `${height}px` } }, canvas), canvas };
}

const pointer = (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; };

/** Called by the router when leaving the screen: free the charts. */
export function cleanup() {
  instances.forEach((c) => c.destroy());
  instances = [];
}

export async function render(main, params = {}) {
  cleanup();

  const s = settings();
  const view = s.amountView;
  const includeFixed = s.chartsIncludeFixed;
  const period = { start: s.periodStart, end: s.periodEnd };
  const today = todayIso();
  const months = periodMonths(period);
  const [allTxs, categories] = await Promise.all([listTransactions(), listCategories({ includeArchived: true })]);
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  let Chart;
  try { Chart = await loadChartJs(); } catch (err) {
    main.append(pageHeader('Charts'), h('div', { class: 'card' }, emptyState('charts', 'Charts could not load', err.message)));
    return;
  }
  const t = themeColors();
  applyDefaults(Chart, t);

  const isFixed = (id) => catById[id]?.type === 'fixed';
  const txs = allTxs.filter((x) => includeFixed || !isFixed(x.categoryId));
  const cats = categories.filter((c) => includeFixed || c.type !== 'fixed');
  const byCat = monthlyByCategory(txs, months, period, view);
  const series = cats.filter((c) => byCat[c.id]?.some((v) => v));
  const hasNone = byCat.none?.some((v) => v);
  const focusMonth = months.includes(params.month) ? params.month
    : months.find((m) => today.startsWith(m)) ?? (today < period.start ? months[0] : months.at(-1));
  const mi = months.indexOf(focusMonth);
  const go = (cat, m) => navigate('transactions', { ...(cat ? { cat } : {}), ...(m ? { month: m } : {}) });

  // ---- Controls (one row, above all charts) --------------------------------
  const monthSelect = h('select', { class: 'select select--sm', id: 'chart-month', 'data-key': 'chart-month',
    onchange: (e) => navigate('charts', { month: e.target.value }) },
    months.map((m) => h('option', { value: m, selected: m === focusMonth }, monthName(m))));
  const fixedToggle = h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: includeFixed, 'data-key': 'chart-fixed', onchange: (e) => setSetting('chartsIncludeFixed', e.target.checked) }),
    h('span', {}, 'Include fixed costs'));
  const controls = h('div', { class: 'chart-controls' },
    h('div', { class: 'field' }, h('label', { class: 'visually-hidden', for: 'chart-month' }, 'Month'), monthSelect),
    segmented('chart-view', 'Amounts shown', [['mine', 'My share'], ['total', 'Total']], view, (v) => setSetting('amountView', v)),
    fixedToggle,
  );

  main.append(pageHeader('Charts', `${months.map(shortMonth).join(' · ')} · ${view === 'mine' ? 'your share' : 'total paid'}${includeFixed ? '' : ' · variable only'}`), controls);

  if (!series.length && !hasNone) {
    main.append(h('div', { class: 'card' }, emptyState('charts', 'Nothing to chart yet', 'Charts appear once you have expenses in the exchange period.')));
    return;
  }

  const stackSeries = [...series.map((c) => ({ id: c.id, label: c.name, color: c.color, data: byCat[c.id] })),
    ...(hasNone ? [{ id: 'inbox', label: 'Uncategorised', color: t.muted, data: byCat.none }] : [])];

  // ---- 1. Month × category stacked bars -----------------------------------
  {
    const topIdx = months.map((_, i) => stackSeries.reduce((top, sr, k) => (sr.data[i] ? k : top), -1));
    const { box, canvas } = canvasBox(300, 'Stacked bar chart of spending per month by category');
    const totals = months.map((_, i) => stackSeries.reduce((sum, sr) => sum + sr.data[i], 0));
    main.append(chartSection('ch-stack', 'Spending by month', 'Each bar is a month, split by category. Tap a segment for its transactions.', box,
      legend(stackSeries),
      tableDetails('Spending by month and category', ['Category', ...months.map(shortMonth)],
        [...stackSeries.map((sr) => [sr.label, ...sr.data.map((v) => money(v))]), ['Total', ...totals.map((v) => money(v))]]),
    ));
    instances.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(shortMonth),
        datasets: stackSeries.map((sr, k) => ({
          label: sr.label, data: sr.data, backgroundColor: sr.color,
          borderColor: t.surface, borderWidth: { top: 2 }, borderSkipped: 'bottom',   // 2px surface gap between segments
          borderRadius: (ctx) => (topIdx[ctx.dataIndex] === k ? { topLeft: 4, topRight: 4 } : 0),
          maxBarThickness: 64, categoryPercentage: 0.7,
        })),
      },
      options: {
        scales: { x: categoryScale({ stacked: true }), y: moneyScale(t, { stacked: true }) },
        interaction: { mode: 'nearest', intersect: true },
        plugins: { tooltip: { callbacks: {
          label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}`,
          footer: (items) => `Month total: ${money(totals[items[0].dataIndex])}`,
        } } },
        onHover: pointer,
        onClick: (_e, els) => { if (els[0]) { const sr = stackSeries[els[0].datasetIndex]; go(sr.id, months[els[0].index]); } },
      },
    }));
  }

  // ---- 2. Budget vs actual for the selected month ---------------------------
  {
    // Fixed costs without a budget have nothing to compare against and would
    // only squash the scale, so they're left out here (they're in every other chart).
    const rows = cats.filter((c) => !c.archived && !(c.type === 'fixed' && !(c.budget > 0)))
      .map((c) => ({ c, spent: byCat[c.id]?.[mi] ?? 0, budget: c.budget > 0 ? budgetFor(c, focusMonth, period) : 0 }))
      .filter((r) => r.spent || r.budget);
    const leftOut = cats.filter((c) => !c.archived && c.type === 'fixed' && !(c.budget > 0) && byCat[c.id]?.[mi]).map((c) => c.name);
    if (rows.length) {
      const showBudget = view === 'mine';
      const { box, canvas } = canvasBox(rows.length * 40 + 48, `Horizontal bars of spending against budget per category for ${monthName(focusMonth)}`);
      main.append(chartSection('ch-budget', `Budget vs actual · ${monthName(focusMonth)}`,
        (showBudget ? 'Bar = spent, line = budget (pro-rated for partial months), red = over budget.' : 'Total paid. Budgets compare against your share; switch to My share to see them.')
          + (leftOut.length ? ` Fixed costs without a budget (${leftOut.join(', ')}) are not shown.` : ''),
        box,
        tableDetails(`Budget vs actual, ${monthName(focusMonth)}`, ['Category', 'Spent', 'Budget', 'Left'],
          rows.map((r) => [r.c.name, money(r.spent), r.budget ? money(r.budget) : '—', r.budget ? money(r.budget - r.spent) : '—'])),
      ));
      const within = rows.map((r) => (showBudget && r.budget ? Math.min(r.spent, r.budget) : r.spent));
      const over = rows.map((r) => (showBudget && r.budget ? Math.max(0, r.spent - r.budget) : 0));
      instances.push(new Chart(canvas, {
        type: 'bar',
        plugins: [budgetMarkers],
        data: {
          labels: rows.map((r) => `${r.c.emoji} ${r.c.name}`),
          datasets: [
            { label: 'Spent', data: within, backgroundColor: rows.map((r) => r.c.color), borderRadius: 4, borderSkipped: 'start', barThickness: 18 },
            { label: 'Over budget', data: over, backgroundColor: t.negative, borderRadius: 4, borderSkipped: 'start', barThickness: 18 },
          ],
        },
        options: {
          indexAxis: 'y',
          scales: {
            x: moneyScale(t, { stacked: true, suggestedMax: Math.max(...rows.map((r) => Math.max(r.spent, showBudget ? r.budget : 0))) * 1.05 }),
            y: categoryScale({ stacked: true, ticks: { color: t.text, padding: 6 } }),
          },
          interaction: { mode: 'index', axis: 'y', intersect: false },
          plugins: {
            budgetMarkers: { values: showBudget ? rows.map((r) => r.budget || null) : null, color: t.text },
            tooltip: { callbacks: {
              title: (items) => rows[items[0].dataIndex].c.name,
              label: () => null,
              afterBody: (items) => {
                const r = rows[items[0].dataIndex];
                if (!showBudget || !r.budget) return [`Spent: ${money(r.spent)}`];
                const left = r.budget - r.spent;
                return [`Spent: ${money(r.spent)}`, `Budget: ${money(r.budget)}`, left >= 0 ? `Left: ${money(left)}` : `Over by ${money(-left)}`];
              },
            } },
          },
          onHover: pointer,
          onClick: (_e, els) => { if (els[0]) go(rows[els[0].index].c.id, focusMonth); },
        },
      }));
    }
  }

  // ---- 3. Category trend ----------------------------------------------------
  {
    const ranked = [...series].sort((a, b) => byCat[b.id].reduce((x, y) => x + y, 0) - byCat[a.id].reduce((x, y) => x + y, 0));
    trendPick = new Set([...(trendPick ?? [])].filter((id) => series.some((c) => c.id === id)));
    // Start with the 3 biggest *variable* categories: fixed ones (rent) would flatten the rest.
    if (!trendPick.size) [...ranked.filter((c) => c.type !== 'fixed'), ...ranked].slice(0, 3).forEach((c) => trendPick.add(c.id));
    const { box, canvas } = canvasBox(260, 'Line chart of monthly spending for the selected categories');
    const chips = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Categories to compare' },
      series.map((c) => h('button', {
        class: 'toggle-chip', type: 'button', style: { '--dot': c.color }, 'aria-pressed': String(trendPick.has(c.id)), 'data-key': `trend-${c.id}`,
        onclick: (e) => {
          const on = !trendPick.has(c.id);
          if (on && trendPick.size >= 6) return;            // keep it readable
          on ? trendPick.add(c.id) : trendPick.delete(c.id);
          e.currentTarget.setAttribute('aria-pressed', String(on));
          chart.data.datasets = datasets();
          chart.update();
        },
      }, h('span', { class: 'legend__swatch', style: { '--dot': c.color } }), c.name)));
    const datasets = () => series.filter((c) => trendPick.has(c.id)).map((c) => ({
      label: c.name, data: byCat[c.id], borderColor: c.color, backgroundColor: c.color,
      borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: t.surface, pointBorderWidth: 2, tension: 0, catId: c.id,
    }));
    main.append(chartSection('ch-trend', 'Category trend', 'Choose up to 6 categories to compare month by month.', h('div', { class: 'stack' }, chips, box),
      tableDetails('Monthly spending per category', ['Category', ...months.map(shortMonth)], ranked.map((c) => [c.name, ...byCat[c.id].map((v) => money(v))]))));
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels: months.map(shortMonth), datasets: datasets() },
      options: {
        scales: { x: categoryScale(), y: moneyScale(t) },
        interaction: { mode: 'nearest', intersect: false, axis: 'x' },
        plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y)}` } } },
        onHover: pointer,
        onClick: (_e, els) => { if (els[0]) go(chart.data.datasets[els[0].datasetIndex].catId, months[els[0].index]); },
      },
    });
    instances.push(chart);
  }

  // ---- 4. Small multiples ---------------------------------------------------
  {
    const multiples = cats.filter((c) => !c.archived && (byCat[c.id]?.some((v) => v) || c.budget > 0));
    const grid = h('div', { class: 'multiples' });
    main.append(chartSection('ch-multi', 'Every category', 'Monthly spending; dashed line = budget. Each mini chart has its own scale.', grid));
    for (const c of multiples) {
      const data = byCat[c.id] ?? months.map(() => 0);
      const budgets = months.map((m) => (view === 'mine' && c.budget > 0 ? budgetFor(c, m, period) : null));
      const total = data.reduce((a, b) => a + b, 0);
      const canvas = h('canvas', { role: 'img', 'aria-label': `${c.name}: ${months.map((m, i) => `${shortMonth(m)} ${money(data[i])}`).join(', ')}` });
      grid.append(h('a', { class: 'multiple', href: `#/transactions?cat=${c.id}`, 'data-key': `multi-${c.id}` },
        h('div', { class: 'multiple__head' },
          h('span', { class: 'multiple__name' }, h('span', { 'aria-hidden': 'true' }, c.emoji), ' ', c.name),
          h('span', { class: 'amount small muted' }, money(total))),
        h('div', { class: 'chart-box', style: { height: '96px' } }, canvas)));
      instances.push(new Chart(canvas, {
        data: {
          labels: months.map(shortMonth),
          datasets: [
            { type: 'bar', label: 'Spent', data, backgroundColor: c.color, borderRadius: 3, borderSkipped: 'bottom', maxBarThickness: 22, order: 2 },
            ...(budgets.some(Boolean) ? [{ type: 'line', label: 'Budget', data: budgets, borderColor: t.muted, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, stepped: 'middle', order: 1 }] : []),
          ],
        },
        options: {
          events: ['mousemove', 'mouseout', 'touchstart', 'touchmove'],      // the card itself is the link
          scales: {
            x: categoryScale({ ticks: { font: { size: 10 }, padding: 2 } }),
            y: { display: false, beginAtZero: true, suggestedMax: Math.max(...data, ...budgets.map((b) => b ?? 0)) * 1.1 || 1 },
          },
          plugins: { tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${money(x.parsed.y)}` } } },
        },
      }));
    }
  }

  // ---- 5. Cumulative spend vs plan --------------------------------------------
  {
    const cum = cumulative(txs, cats, period, today, view);
    const hasPlan = cum.plan.at(-1) > 0;
    const lastActual = cum.actual.filter((v) => v != null).at(-1) ?? 0;
    const todayIdx = cum.actual.findLastIndex((v) => v != null);
    const planToday = todayIdx >= 0 ? cum.plan[todayIdx] : 0;
    const { box, canvas } = canvasBox(260, 'Line chart of cumulative spending against the planned budget over the exchange');
    main.append(chartSection('ch-cum', 'Cumulative spending vs plan',
      todayIdx < 0
        ? `The exchange starts on ${fmtDate(period.start)}; your spending line fills in day by day.${hasPlan ? ' Plan = your budgets plus fixed costs.' : ''}`
        : hasPlan ? `So far ${money(lastActual)} against ${money(planToday)} planned by today. Plan = your budgets plus fixed costs.` : 'Set budgets in Settings → Categories to see a plan line.',
      box,
      legend([{ color: t.accent, label: 'Spent (cumulative)' }, ...(hasPlan ? [{ color: t.muted, label: 'Plan', dashed: true }] : [])]),
      tableDetails('Cumulative spending by month end', ['Month end', 'Spent', 'Plan'],
        months.map((m) => {
          const i = cum.days.findLastIndex((d) => d.startsWith(m));
          return [fmtDate(cum.days[i]), cum.actual[i] == null ? '—' : money(cum.actual[i]), money(cum.plan[i])];
        }))));
    instances.push(new Chart(canvas, {
      type: 'line',
      data: {
        labels: cum.days,
        datasets: [
          { label: 'Spent', data: cum.actual, borderColor: t.accent, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: false },
          ...(hasPlan ? [{ label: 'Plan', data: cum.plan, borderColor: t.muted, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 4 }] : []),
        ],
      },
      options: {
        scales: {
          x: categoryScale({ ticks: { maxTicksLimit: 6, autoSkip: true, maxRotation: 0, callback(v) { return fmtDate(this.getLabelForValue(v)).replace(/ \d{4}$/, ''); } } }),
          y: moneyScale(t),
        },
        interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: {
          title: (items) => fmtDate(items[0].label),
          label: (c) => (c.parsed.y == null ? null : `${c.dataset.label}: ${money(c.parsed.y)}`),
        } } },
      },
    }));
  }
}

// Redraw charts when the OS switches light/dark (tokens change colour).
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (location.hash.startsWith('#/charts')) window.dispatchEvent(new Event('datachange'));
});

