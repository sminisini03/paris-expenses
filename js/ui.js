// Shared UI helpers: element builder, icons, toasts.

/**
 * Tiny element builder.
 * h('button', { class: 'btn', onclick: fn }, 'Save')
 * Attributes starting with "on" become listeners; `false`/`null` are skipped.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') {
      // setProperty also handles custom properties (--x), which Object.assign ignores.
      for (const [prop, val] of Object.entries(v)) {
        el.style.setProperty(prop.startsWith('--') ? prop : prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), val);
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Stroke icons, 24×24, inherit currentColor.
const ICONS = {
  overview: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v4h-6zM4 20h6v-4H4z"/>',
  transactions: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".5"/><circle cx="4" cy="12" r=".5"/><circle cx="4" cy="18" r=".5"/>',
  charts: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  inbox: '<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M18 13l-6 6-6-6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
};

export function icon(name, label) {
  const span = document.createElement('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${ICONS[name]}</svg>`;
  return span.firstElementChild;
}

/** Non-blocking message at the bottom; optional single action button. */
export function toast(message, { action, onAction, duration = 4000 } = {}) {
  const region = document.getElementById('toast-region');
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', { class: 'toast__msg' }, message),
    action && h('button', {
      class: 'btn btn--ghost', type: 'button',
      onclick: () => { onAction?.(); el.remove(); },
    }, action),
  );
  region.append(el);
  if (duration) setTimeout(() => el.remove(), duration);
  return el;
}

export function emptyState(iconName, title, text) {
  return h('div', { class: 'empty' }, icon(iconName), h('p', { class: 'empty__title' }, title), h('p', { class: 'small' }, text));
}

export function pageHeader(title, subtitle, ...actions) {
  return h('header', { class: 'page-header' },
    h('div', {}, h('h1', { class: 'page-title', tabindex: '-1' }, title), subtitle && h('p', { class: 'page-subtitle' }, subtitle)),
    actions.length ? h('div', {}, ...actions) : null,
  );
}

/** Row that navigates somewhere: title, optional hint and value, chevron. */
export function linkRow(href, title, hint, value) {
  return h('li', {}, h('a', { class: 'row row--link', href, 'data-key': href },
    h('div', { class: 'row__main' }, h('div', { class: 'row__title' }, title), hint && h('div', { class: 'row__hint' }, hint)),
    value != null && h('span', { class: 'row__value muted' }, value),
    icon('chevronRight'),
  ));
}

export function backLink(href, text) {
  return h('a', { class: 'back-link', href }, icon('chevronLeft'), text);
}

/** Radio group styled as a segmented control. options: [[value, label], ...] */
export function segmented(name, legend, options, value, onChange) {
  return h('fieldset', { class: 'segmented' },
    h('legend', { class: 'visually-hidden' }, legend),
    options.map(([val, text]) => h('label', {},
      h('input', { type: 'radio', name, value: val, checked: val === value, onchange: () => onChange(val) }),
      h('span', {}, text),
    )),
  );
}

/**
 * Colour picker: preset swatches (radios) + a custom colour input.
 * Returns the fieldset; onChange(hex) fires on every pick.
 */
export function colorPicker(name, legend, palette, value, onChange) {
  const current = (value ?? '').toUpperCase();
  const isPreset = palette.includes(current);
  const customDot = h('span', { style: isPreset ? {} : { background: current } });
  const customLabel = h('label', { class: 'swatch swatch--custom', style: isPreset ? {} : { '--swatch': current } },
    h('input', {
      type: 'color', value: current || '#888888', 'aria-label': `${legend}: custom`,
      onchange: (e) => {
        const hex = e.target.value.toUpperCase();
        set.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = false; });
        customDot.style.background = hex;
        customLabel.style.setProperty('--swatch', hex);
        onChange(hex);
      },
    }),
    customDot,
  );
  const set = h('fieldset', { class: 'swatches' },
    h('legend', { class: 'visually-hidden' }, legend),
    palette.map((hex) => h('label', { class: 'swatch', style: { '--swatch': hex } },
      h('input', {
        type: 'radio', name, value: hex, 'aria-label': `${legend} ${hex}`, checked: hex === current,
        onchange: () => { customDot.style.background = ''; onChange(hex); },
      }),
      h('span'),
    )),
    customLabel,
  );
  return set;
}

/** Labelled form field. */
export function field(id, labelText, control, hint) {
  control.id = id;
  return h('div', { class: 'field' },
    h('label', { class: 'label', for: id }, labelText),
    control,
    hint && h('p', { class: 'small muted' }, hint),
  );
}

/**
 * Modal dialog (bottom sheet on phones). Built on <dialog>, so focus
 * trapping, Esc to close and focus return come from the browser.
 * actions: [{ label, variant: 'primary'|'danger'|undefined, onClick }]
 * onClick may return false (or a promise of false) to keep the dialog open.
 */
export function openDialog({ title, content, actions = [], onClose }) {
  const titleId = `dlg-${Math.random().toString(36).slice(2)}`;
  const close = () => dialog.close();
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': titleId },
    h('form', { class: 'dialog__form', method: 'dialog', novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      const primary = actions.find((a) => a.variant === 'primary');
      if (primary) run(primary);
    } },
      h('header', { class: 'dialog__header' },
        h('h2', { class: 'dialog__title', id: titleId }, title),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close')),
      ),
      h('div', { class: 'dialog__body' }, content),
      actions.length && h('footer', { class: 'dialog__footer' },
        actions.map((a) => h('button', {
          class: `btn ${a.variant === 'primary' ? 'btn--primary' : a.variant === 'danger' ? 'btn--danger' : ''}`,
          type: a.variant === 'primary' ? 'submit' : 'button',
          onclick: a.variant === 'primary' ? null : () => run(a),
        }, a.label)),
      ),
    ),
  );
  async function run(action) {
    const keepOpen = (await action.onClick?.()) === false;
    if (!keepOpen) close();
  }
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });   // backdrop
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

/** Promise<boolean> yes/no prompt. */
export function confirmDialog(title, message, confirmLabel = 'OK', { danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openDialog({
      title,
      content: h('p', {}, message),
      actions: [
        { label: 'Cancel' },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: () => { answer = true; } },
      ],
      onClose: () => resolve(answer),
    });
  });
}

/** Show an inline error under a field and focus it. */
export function fieldError(input, message) {
  const fieldEl = input.closest('.field');
  const anchor = fieldEl ?? input.parentElement;          // e.g. the big amount input
  const existing = fieldEl ? fieldEl.querySelector('.field__error') : anchor.nextElementSibling;
  if (existing?.classList.contains('field__error')) existing.remove();
  input.setAttribute('aria-invalid', 'true');
  const err = h('p', { class: 'field__error small', id: `${input.id || 'input'}-err`, role: 'alert' }, message);
  input.setAttribute('aria-describedby', err.id);
  if (fieldEl) fieldEl.append(err); else anchor.after(err);
  input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); err.remove(); }, { once: true });
  input.focus();
}
