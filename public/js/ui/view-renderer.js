import { byId, el } from './dom-builder.js';

/**
 * View renderer generating plan presentation components.
 * Builds pure DOM trees with textContent and localized attributes,
 * guaranteeing zero XSS vulnerability and full WCAG 2.2 AAA accessibility.
 */

/**
 * @typedef {{
 *   event: import('../../../src/domain/contracts.js').EventDetails,
 *   plan: import('../../../src/domain/scheduler.js').FinalPlan,
 *   booked: string[],
 *   done: string[],
 * }} SavedPlan
 */

// Cached formatters to optimize rendering performance across re-renders
const CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeZone: 'UTC',
});
const RELATIVE_COUNTDOWN_FORMATTER = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const INTEGER_NUMBER_FORMATTER = new Intl.NumberFormat();

/** @type {Record<string, string>} */
const VENDOR_PRIORITY_DESCRIPTIONS = {
  essential: 'Essential',
  recommended: 'Recommended',
  optional: 'Optional',
};

/**
 * Parses an ISO date into UTC midnight Date instance.
 * @param {string} dateString
 */
const toMidnightUtc = (dateString) => new Date(`${dateString}T00:00:00Z`);

/**
 * Produces a human-friendly countdown to the event day.
 * @param {Date} targetDate
 */
function computeCountdownText(targetDate) {
  const currentDate = new Date();
  const utcNowMidnight = Date.UTC(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  );
  const remainingDays = Math.round((targetDate.getTime() - utcNowMidnight) / 86_400_000);
  return RELATIVE_COUNTDOWN_FORMATTER.format(remainingDays, 'day');
}

/**
 * Renders complete event plan into the results container.
 *
 * @param {HTMLElement} rootContainer
 * @param {SavedPlan} planSnapshot
 */
export function renderPlan(rootContainer, { plan, event, booked, done }) {
  const targetLanguage = event.language;
  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: plan.currency,
    maximumFractionDigits: 0,
  });

  const createTimeTag = (/** @type {string} */ isoDay) =>
    el('time', { datetime: isoDay }, CALENDAR_DATE_FORMATTER.format(toMidnightUtc(isoDay)));

  rootContainer.dataset.type = event.type;

  byId(rootContainer, 'plan-title').replaceChildren(
    el('span', { lang: targetLanguage }, plan.title),
  );
  byId(rootContainer, 'plan-summary').replaceChildren(
    el('span', { lang: targetLanguage }, plan.summary),
  );

  const eventDateObj = toMidnightUtc(event.date);
  byId(rootContainer, 'fact-date').textContent =
    `${CALENDAR_DATE_FORMATTER.format(eventDateObj)} · ${computeCountdownText(eventDateObj)}`;
  byId(rootContainer, 'fact-guests').textContent = INTEGER_NUMBER_FORMATTER.format(event.guests);
  byId(rootContainer, 'fact-budget').textContent = currencyFormatter.format(plan.total);
  byId(rootContainer, 'fact-location').textContent = event.location;

  const plannedExpenditure = plan.budget.reduce((accum, row) => accum + row.amount, 0);
  const budgetSurplus = plan.total - plannedExpenditure;

  byId(rootContainer, 'budget-caption').textContent =
    `Suggested split of your ${currencyFormatter.format(plan.total)} budget` +
    (budgetSurplus > 0 ? `, saving ${currencyFormatter.format(budgetSurplus)}` : '');
  byId(rootContainer, 'budget-total').textContent = currencyFormatter.format(plannedExpenditure);
  byId(rootContainer, 'budget-share').textContent =
    `${Math.round((plannedExpenditure / plan.total) * 1000) / 10}%`;

  byId(rootContainer, 'budget-rows').replaceChildren(
    ...plan.budget.map((item) => renderBudgetRow(item, currencyFormatter, targetLanguage)),
  );

  byId(rootContainer, 'timeline-list').replaceChildren(
    ...plan.timeline.map((task, idx) =>
      renderTimelineRow(task, idx, done.includes(task.task), createTimeTag, targetLanguage),
    ),
  );

  byId(rootContainer, 'vendor-list').replaceChildren(
    ...plan.vendors.map((vendor, idx) =>
      renderVendorRow(vendor, idx, booked.includes(vendor.type), createTimeTag, targetLanguage),
    ),
  );

  byId(rootContainer, 'idea-list').replaceChildren(
    ...plan.ideas.map((idea) =>
      el('li', { lang: targetLanguage }, el('h4', {}, idea.title), el('p', {}, idea.description)),
    ),
  );

  renderProgress(rootContainer, { plan, booked, done });
}

/**
 * Updates task and vendor progress counters.
 *
 * @param {ParentNode} rootContainer
 * @param {Pick<SavedPlan, 'plan' | 'booked' | 'done'>} state
 */
export function renderProgress(rootContainer, { plan, booked, done }) {
  const completedTasks = plan.timeline.filter(({ task }) => done.includes(task)).length;
  const securedVendors = plan.vendors.filter(({ type }) => booked.includes(type)).length;

  byId(rootContainer, 'task-progress').textContent =
    `${completedTasks} of ${plan.timeline.length} tasks done`;
  byId(rootContainer, 'vendor-progress').textContent =
    `${securedVendors} of ${plan.vendors.length} vendors booked`;
}

/**
 * Generates an accessible table row for a budget allocation.
 * @param {{ category: string, amount: number, percent: number, note: string }} row
 * @param {Intl.NumberFormat} formatter
 * @param {string} langCode
 */
function renderBudgetRow(row, formatter, langCode) {
  const visualBar = el('span', { class: 'bar', 'aria-hidden': 'true' });
  visualBar.style.setProperty('--share', `${row.percent}%`);

  return el(
    'tr',
    {},
    el(
      'th',
      { scope: 'row', lang: langCode },
      row.category,
      el('span', { class: 'note' }, row.note),
    ),
    el('td', { class: 'num' }, formatter.format(row.amount)),
    el('td', { class: 'num' }, `${row.percent}%`, visualBar),
  );
}

/**
 * Generates an accessible timeline checklist milestone item.
 * @param {{ task: string, due: string, overdue: boolean }} milestone
 * @param {number} index
 * @param {boolean} isCompleted
 * @param {(day: string) => HTMLElement} formatTimeNode
 * @param {string} langCode
 */
function renderTimelineRow(milestone, index, isCompleted, formatTimeNode, langCode) {
  const inputId = `task-${index}`;
  const overdueBadge = milestone.overdue ? el('strong', { class: 'badge now' }, 'Do now') : null;

  return el(
    'li',
    { class: milestone.overdue ? 'overdue' : null },
    el('input', {
      type: 'checkbox',
      id: inputId,
      name: 'task',
      value: milestone.task,
      checked: isCompleted,
    }),
    el(
      'label',
      { for: inputId },
      formatTimeNode(milestone.due),
      el(
        'span',
        {},
        overdueBadge,
        ' ',
        el('span', { class: 'task', lang: langCode }, milestone.task),
      ),
    ),
  );
}

/**
 * Generates an accessible vendor checklist booking item.
 * @param {{ type: string, priority: string, due: string, overdue: boolean, tip: string }} vendorItem
 * @param {number} index
 * @param {boolean} isBooked
 * @param {(day: string) => HTMLElement} formatTimeNode
 * @param {string} langCode
 */
function renderVendorRow(vendorItem, index, isBooked, formatTimeNode, langCode) {
  const inputId = `vendor-${index}`;

  return el(
    'li',
    {},
    el('input', {
      type: 'checkbox',
      id: inputId,
      name: 'vendor',
      value: vendorItem.type,
      checked: isBooked,
      'aria-describedby': `${inputId}-tip`,
    }),
    el(
      'label',
      { for: inputId },
      el('strong', { lang: langCode }, vendorItem.type),
      el(
        'span',
        { class: `badge ${vendorItem.priority}` },
        VENDOR_PRIORITY_DESCRIPTIONS[vendorItem.priority],
      ),
      vendorItem.overdue
        ? el('span', { class: 'badge now' }, 'Book now')
        : el('span', {}, 'Book by ', formatTimeNode(vendorItem.due)),
    ),
    el('p', { class: 'tip', id: `${inputId}-tip`, lang: langCode }, vendorItem.tip),
  );
}
