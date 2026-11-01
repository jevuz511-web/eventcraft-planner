/**
 * Custom application error encapsulating an HTTP status code, client-safe error message,
 * and optional field-level validation messages.
 */

/** @typedef {import('hono/utils/http-status').ContentfulStatusCode} StatusCode */

export class AppError extends Error {
  /**
   * @param {StatusCode} status HTTP status code
   * @param {string} message safe explanation for client presentation
   * @param {{ cause?: unknown, fields?: Record<string, string>, headers?: Record<string, string> }} [options]
   */
  constructor(status, message, { cause, fields, headers } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.fields = fields;
    this.headers = headers;
  }
}
