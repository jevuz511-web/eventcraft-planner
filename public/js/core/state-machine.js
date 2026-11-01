/**
 * Pure state machine transitions for event plan interactions.
 * Every state transition is a side-effect-free function, enabling deterministic
 * testing of progress retention, rollbacks, and undo workflows.
 */

/**
 * @typedef {import('../ui/view-renderer.js').SavedPlan} SavedPlan
 * @typedef {{ current: SavedPlan | null, previous: SavedPlan | null }} PlanState
 * @typedef {'booked' | 'done'} ProgressCategory
 */

/** @type {PlanState} */
export const EMPTY = Object.freeze({ current: null, previous: null });

/**
 * Commits a newly created or refined plan to state, retaining historical progress if requested.
 *
 * @param {PlanState} currentState
 * @param {Pick<SavedPlan, 'event' | 'plan'>} nextPayload
 * @param {{ keepProgress: boolean }} options
 * @returns {PlanState}
 */
export function replacePlan(currentState, { event, plan }, { keepProgress }) {
  const previousRecord =
    keepProgress && currentState.current ? currentState.current : { booked: [], done: [] };

  const validVendors = new Set(plan.vendors.map((vendor) => vendor.type));
  const validTasks = new Set(plan.timeline.map((taskItem) => taskItem.task));

  return {
    current: {
      event,
      plan,
      booked: previousRecord.booked.filter((v) => validVendors.has(v)),
      done: previousRecord.done.filter((t) => validTasks.has(t)),
    },
    previous: currentState.current,
  };
}

/**
 * Restores the previous plan state (single-level undo).
 * @param {PlanState} currentState
 * @returns {PlanState}
 */
export const undo = (currentState) => ({
  current: currentState.previous,
  previous: null,
});

/**
 * Toggles progress tracking for an individual vendor booking or task milestone.
 *
 * @param {SavedPlan} planSnapshot
 * @param {ProgressCategory} category
 * @param {string} identifier
 * @param {boolean} isCompleted
 * @returns {SavedPlan}
 */
export function setProgress(planSnapshot, category, identifier, isCompleted) {
  const remaining = planSnapshot[category].filter((item) => item !== identifier);
  return {
    ...planSnapshot,
    [category]: isCompleted ? [...remaining, identifier] : remaining,
  };
}
