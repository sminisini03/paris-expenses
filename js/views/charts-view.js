import { h, pageHeader, emptyState } from '../ui.js';

export function render(main) {
  main.append(
    pageHeader('Charts'),
    h('div', { class: 'card' }, emptyState('charts', 'Nothing to chart yet', 'Charts by month and category appear once you have expenses.')),
  );
}
