import { isPlan } from '../core/type-guards.js';

/**
 * HTTP client communicating with backend planning endpoints.
 */

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * @typedef {import('../../../src/domain/scheduler.js').FinalPlan} FinalPlan
 * @typedef {{ plan: FinalPlan } | { plan?: undefined, error: string, fields?: Record<string, string> }} PlanResult
 */

/**
 * Submits an event creation or refinement request to the server API.
 *
 * @param {{ event: import('../../../src/domain/contracts.js').EventDetails, refine?: object }} payload
 * @returns {Promise<PlanResult>}
 */
export async function requestPlan(payload) {
  const httpResponse = await fetch('/api/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  /** @type {{ plan?: FinalPlan, error?: string, fields?: Record<string, string> }} */
  const responseData = await httpResponse.json().catch(() => ({}));

  if (httpResponse.ok && isPlan(responseData.plan)) {
    return { plan: responseData.plan };
  }

  return {
    error: responseData.error ?? GENERIC_ERROR_MESSAGE,
    fields: responseData.fields,
  };
}
