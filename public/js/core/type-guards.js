/**
 * Runtime contract guards validating API response shapes and local storage objects.
 * Prevents corrupted state from causing UI rendering exceptions.
 */

/**
 * @typedef {import('../../../src/domain/scheduler.js').FinalPlan} FinalPlan
 * @typedef {import('../ui/view-renderer.js').SavedPlan} SavedPlan
 */

const isString = (/** @type {unknown} */ val) => typeof val === 'string';
const isFiniteNumber = (/** @type {unknown} */ val) => Number.isFinite(val);
const isIsoDateString = (/** @type {unknown} */ val) =>
  isString(val) && /^\d{4}-\d{2}-\d{2}$/.test(/** @type {string} */ (val));

/**
 * Validates that an array contains items satisfying a predicate.
 * @param {unknown} list
 * @param {(item: Record<string, unknown>) => boolean} itemCheck
 */
const isArraySatisfying = (list, itemCheck) =>
  Array.isArray(list) && list.every((item) => typeof item === 'object' && item && itemCheck(item));

/**
 * Asserts whether a payload conforms to the FinalPlan contract.
 * @param {any} candidate
 * @returns {candidate is FinalPlan}
 */
export function isPlan(candidate) {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    isString(candidate.title) &&
    isString(candidate.summary) &&
    isString(candidate.currency) &&
    isFiniteNumber(candidate.total) &&
    isArraySatisfying(candidate.budget, (i) => isString(i.category) && isFiniteNumber(i.amount)) &&
    isArraySatisfying(candidate.timeline, (i) => isString(i.task) && isIsoDateString(i.due)) &&
    isArraySatisfying(candidate.vendors, (i) => isString(i.type) && isIsoDateString(i.due)) &&
    isArraySatisfying(candidate.ideas, (i) => isString(i.title) && isString(i.description))
  );
}

/**
 * Asserts whether a stored object represents a valid client SavedPlan.
 * @param {any} candidate
 * @returns {candidate is SavedPlan}
 */
export function isSavedPlan(candidate) {
  const isStringArray = (/** @type {unknown} */ arr) => Array.isArray(arr) && arr.every(isString);

  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    isPlan(candidate.plan) &&
    typeof candidate.event === 'object' &&
    candidate.event !== null &&
    isIsoDateString(candidate.event.date) &&
    isString(candidate.event.location) &&
    isStringArray(candidate.booked) &&
    (candidate.done === undefined || isStringArray(candidate.done))
  );
}
