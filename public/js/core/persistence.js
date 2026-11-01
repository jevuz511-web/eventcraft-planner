import { isSavedPlan } from './type-guards.js';

/**
 * Local storage manager providing browser-level plan persistence across sessions.
 * Gracefully handles quotas, disabled storage, and corrupted historical payloads.
 */

export const STORAGE_KEY = 'eventcraft.plan.v1';

/** @typedef {import('../ui/view-renderer.js').SavedPlan} SavedPlan */

/**
 * Retrieves the persisted plan from localStorage.
 * Automatically purges malformed or incompatible historical entries.
 *
 * @returns {SavedPlan | null}
 */
export function readSaved() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY) ?? 'null';
    const parsedData = JSON.parse(rawData);

    if (isSavedPlan(parsedData)) {
      return { ...parsedData, done: parsedData.done ?? [] };
    }

    if (parsedData !== null) {
      localStorage.removeItem(STORAGE_KEY);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes or clears the current plan in browser storage.
 * @param {SavedPlan | null} planPayload
 */
export function writeSaved(planPayload) {
  try {
    if (planPayload) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(planPayload));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Failsafe for restricted contexts (e.g. strict private browsing or quota limits)
  }
}
