/**
 * Domain constants for event planning specifications.
 */

/** Supported event categories */
export const EVENT_TYPES = ['wedding', 'birthday', 'community', 'other'];

/** Supported monetary currencies */
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];

/** Priority tiers for vendor reservations */
export const PRIORITIES = ['essential', 'recommended', 'optional'];

/** Supported localization languages with BCP 47 codes */
/** @type {Record<string, string>} */
export const LANGUAGES = {
  en: 'English',
  hi: 'Hindi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
};

/** Upper limit on advance event planning timeline in days (approx 3 years) */
export const MAX_LEAD_DAYS = 3 * 365;
