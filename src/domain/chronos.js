/**
 * Date and calendar arithmetic helpers operating strictly on UTC calendar days.
 * Formatting uses ISO 'YYYY-MM-DD' timestamps to prevent timezone or DST drift.
 */

const MILLISECONDS_IN_DAY = 86_400_000;

/**
 * Parses an ISO date string as UTC epoch timestamp.
 * @param {string} isoDate YYYY-MM-DD representation
 * @returns {number} epoch milliseconds
 */
const parseUtcDate = (isoDate) => Date.parse(`${isoDate}T00:00:00Z`);

/**
 * Converts an epoch timestamp to an ISO date string (YYYY-MM-DD).
 * @param {number} timestampMs epoch milliseconds
 * @returns {string} YYYY-MM-DD
 */
const formatIsoDate = (timestampMs) => new Date(timestampMs).toISOString().slice(0, 10);

/**
 * Retrieves the current calendar day in UTC format.
 * @param {Date} [clock] reference date instance
 * @returns {string} current UTC date as YYYY-MM-DD
 */
export const today = (clock = new Date()) => formatIsoDate(clock.getTime());

/**
 * Shifts an ISO calendar date by a specified number of whole days.
 * @param {string} isoDate base date (YYYY-MM-DD)
 * @param {number} dayDelta days to shift (can be negative)
 * @returns {string} shifted ISO date
 */
export const addDays = (isoDate, dayDelta) =>
  formatIsoDate(parseUtcDate(isoDate) + dayDelta * MILLISECONDS_IN_DAY);

/**
 * Calculates whole days elapsed between two calendar dates.
 * @param {string} startDate starting ISO date
 * @param {string} targetDate destination ISO date
 * @returns {number} whole integer day difference
 */
export const daysBetween = (startDate, targetDate) =>
  Math.round((parseUtcDate(targetDate) - parseUtcDate(startDate)) / MILLISECONDS_IN_DAY);
