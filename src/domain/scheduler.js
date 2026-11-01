import { allocateBudget } from './budget-allocator.js';
import { addDays, today } from './chronos.js';

/**
 * Transforms relative lead times into absolute ISO due dates.
 * Tasks with due dates preceding current date are clamped to today and flagged overdue.
 *
 * @template T
 * @param {T[]} items collection of milestones or vendor entries
 * @param {(item: T) => number} resolveLeadDays function extracting lead days before event
 * @param {string} eventDate ISO date of the celebration
 * @param {string} referenceDate ISO date of today
 * @returns {(T & { due: string, overdue: boolean })[]} sorted chronologically (earliest first)
 */
export function schedule(items, resolveLeadDays, eventDate, referenceDate) {
  return items
    .map((item) => {
      const calculatedDue = addDays(eventDate, -Math.max(0, resolveLeadDays(item)));
      const isPastDue = calculatedDue < referenceDate;
      return {
        ...item,
        due: isPastDue ? referenceDate : calculatedDue,
        overdue: isPastDue,
      };
    })
    .sort((itemA, itemB) => itemA.due.localeCompare(itemB.due));
}

/**
 * Assembles the completed client-ready event plan with deterministic calculations applied.
 *
 * @param {import('./contracts.js').Plan} rawPlan validated model output
 * @param {import('./contracts.js').EventDetails} eventConfig submitted event parameters
 * @param {Date} [clock] reference time instance
 */
export function finalizePlan(rawPlan, eventConfig, clock = new Date()) {
  const currentDate = today(clock);
  const totalAmount = Math.round(eventConfig.budget);

  return {
    ...rawPlan,
    currency: eventConfig.currency,
    total: totalAmount,
    budget: allocateBudget(rawPlan.budget, eventConfig.budget),
    timeline: schedule(
      rawPlan.timeline,
      (entry) => entry.daysBefore,
      eventConfig.date,
      currentDate,
    ),
    vendors: schedule(
      rawPlan.vendors,
      (entry) => entry.bookDaysBefore,
      eventConfig.date,
      currentDate,
    ),
  };
}

/** @typedef {ReturnType<typeof finalizePlan>} FinalPlan */
