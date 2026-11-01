/**
 * Structured JSON logger formatted for observability platforms (Cloud Logging, Azure Monitor).
 * Masks sensitive credentials and API keys in string fields.
 */

/**
 * @typedef {{ severity: 'INFO' | 'ERROR', message: string } & Record<string, unknown>} LogEntry
 * @typedef {(entry: LogEntry) => void} Logger
 */

const GOOGLE_API_KEY_REGEX = /AIza[\w-]{35}/g;
const REDACTION_STRING = '[redacted]';

/**
 * Initializes a structured logger with automated token redacting.
 *
 * @param {{ secrets?: string[] }} [options] tokens to mask from logs
 * @returns {Logger}
 */
export function createLogger({ secrets = [] } = {}) {
  const activeSecrets = secrets.filter(Boolean);

  /**
   * Redacts sensitive secrets and key patterns from text.
   * @param {string} text
   */
  const sanitize = (text) =>
    activeSecrets
      .reduce((accum, secret) => accum.replaceAll(secret, REDACTION_STRING), text)
      .replace(GOOGLE_API_KEY_REGEX, REDACTION_STRING);

  return (entry) => {
    const payload = JSON.stringify(entry, (_, value) =>
      typeof value === 'string' ? sanitize(value) : value,
    );

    if (entry.severity === 'ERROR') {
      console.error(payload);
    } else {
      console.log(payload);
    }
  };
}

/** Default unconfigured logger instance */
export const log = createLogger();
