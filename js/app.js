// Entry point: boot, hash routing, navigation, service worker.

import { h, icon, toast } from './ui.js';
import { loadSettings } from './settings.js';
import { ensureSeeded } from './seed.js';
import { openTransactionForm } from './views/tx-form.js';
import { listTransactions, inInbox } from './transactions.js';

export const APP_VERSION = '1.0.0';

// Hash routes keep deep links (e.g. #/transactions?cat=x&month=2026-11)
// working on GitHub Pages without any server configuration.
const ROUTES = {
  overview:     { title: 'Overview',     icon: 'overview',     load: () => import('./views/overview-view.js') },
  transactions: { title: 'Transactions', icon: 'transactions', load: () => import('./views/transactions-view.js') },
  charts:       { title: 'Charts',       icon: 'charts',       load: () => import('./views/charts-view.js') },
  settings:     { title: 'Settings',     icon: 'settings',     load: () => import('./views/settings-view.js') },
  inbox:        { title: 'Inbox', nav: false, parent: 'transactions', load: () => import('./views/inbox-view.js') },
  balance:      { title: 'Balance', nav: false, parent: 'overview', load: () => import('./views/balance-view.js') },
};
const DEFAULT_ROUTE = 'overview';

export function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const name = ROUTES[path] ? path : DEFAULT_ROUTE;
  return { name, params: Object.fromEntries(new URLSearchParams(query)) };
}

export function navigate(name, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = `#/${name}${q ? `?${q}` : ''}`;
}

function buildNav() {
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    h('div', { class: 'nav__brand' }, h('img', { src: 'assets/icons/icon-192.png', alt: '' }), 'Paris Expenses'),
    h('button', { class: 'btn btn--primary nav__add', type: 'button', onclick: openQuickAdd }, icon('plus'), 'Add expense'),
    h('ul', { class: 'nav__list' },
      Object.entries(ROUTES).filter(([, r]) => r.nav !== false).map(([name, r]) => h('li', {},
        h('a', { class: 'nav__link', href: `#/${name}`, 'data-route': name },
          icon(r.icon), h('span', {}, r.title),
          h('span', { class: 'nav__badge', 'data-badge': name, 'aria-hidden': 'true' }),
          h('span', { class: 'visually-hidden', 'data-badge-label': name }),
        ),
      )),
    ),
  );
  const fab = h('button', { class: 'fab', type: 'button', 'aria-label': 'Add expense', onclick: openQuickAdd }, icon('plus'));
  // Navigation first in the DOM (matches the visual order on desktop; the skip link jumps over it).
  const shell = document.querySelector('.shell');
  shell.prepend(nav);
  shell.append(fab);
}

async function openQuickAdd() {
  const opener = document.activeElement;
  // iOS only opens the keyboard for focus that happens inside the tap. Focus a
  // hidden input now; the dialog's autofocus field then takes over focus and
  // the keyboard stays up even though the form opens a moment later.
  const proxy = h('input', { class: 'kb-proxy', type: 'text', inputmode: 'decimal', 'aria-hidden': 'true', tabindex: '-1' });
  document.body.append(proxy);
  proxy.focus();
  try {
    const dlg = await openTransactionForm();
    // The browser would return focus to the (removed) proxy; send it back to the + button.
    dlg?.dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); });
  } finally {
    proxy.remove();
  }
}

let renderToken = 0;
let currentView = null;
async function render({ focus = true } = {}) {
  const { name, params } = parseHash();
  const token = ++renderToken;
  const view = await ROUTES[name].load();
  if (token !== renderToken) return;           // a newer navigation won the race
  if (currentView !== view) currentView?.cleanup?.();
  currentView = view;

  const main = document.getElementById('main');
  document.body.classList.remove('is-selecting');
  const next = document.createElement('div');
  await view.render(next, params);
  if (token !== renderToken) return;
  // Redraws replace the DOM; keep keyboard focus on the equivalent control.
  const focusKey = document.activeElement?.closest?.('[data-key]')?.dataset.key;
  main.replaceChildren(...next.childNodes);
  if (!focus && focusKey) {
    let target = main.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    // e.g. "Move up" becomes disabled at the top: fall back to a usable neighbour.
    if (target?.disabled) target = target.parentElement.querySelector('button:not(:disabled)') ?? target.closest('li')?.querySelector('.row__btn');
    target?.focus({ preventScroll: true });
  }

  document.title = `${main.querySelector('.page-title')?.textContent ?? ROUTES[name].title} · Paris Expenses`;
  updateBadges();
  for (const a of document.querySelectorAll('.nav__link')) {
    if (a.dataset.route === (ROUTES[name].parent ?? name)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (focus) main.querySelector('.page-title')?.focus({ preventScroll: true });
}

/** Ask once data exists; installed (home-screen) apps are usually granted. */
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist || await navigator.storage.persisted()) return;
    if ((await listTransactions()).length) await navigator.storage.persist();
  } catch { /* not supported: the backup reminder covers it */ }
}

async function updateBadges() {
  const inbox = (await listTransactions()).filter(inInbox).length;
  const badge = document.querySelector('[data-badge="transactions"]');
  const label = document.querySelector('[data-badge-label="transactions"]');
  if (badge) badge.textContent = inbox ? String(inbox) : '';
  if (label) label.textContent = inbox ? `, ${inbox} to categorise` : '';
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offerUpdate = (worker) => toast('A new version is ready.', {
      action: 'Reload', duration: 0,
      onAction: () => worker.postMessage('skipWaiting'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) { reloading = true; location.reload(); }
  });
}

async function boot() {
  await ensureSeeded();
  await loadSettings();
  buildNav();
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  // Screens other than Settings depend on settings (period, number format):
  // redraw them in place; Settings updates itself so focus isn't lost.
  window.addEventListener('settingschange', () => {
    if (parseHash().name !== 'settings') render({ focus: false });
  });
  window.addEventListener('datachange', () => render({ focus: false }));
  await render({ focus: false });
  registerServiceWorker();
  requestPersistentStorage();
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('main').textContent = `Something went wrong while starting: ${err.message}`;
});
