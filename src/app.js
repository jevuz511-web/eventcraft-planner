import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { PlanRequestSchema } from './domain/contracts.js';
import { loadAssets, serveAssets } from './infra/asset-store.js';
import { AppError } from './infra/http-error.js';
import { log as fallbackLog } from './infra/structured-logger.js';
import { crossSiteGuard } from './security/cross-site-guard.js';
import { APPLICATION_SECURITY_HEADERS } from './security/protection-headers.js';
import { clientKey, rateLimiter } from './security/rate-limiter.js';

// Pre-read and pre-compress static directory on bootstrap
const STATIC_ASSET_REPOSITORY = loadAssets(fileURLToPath(new URL('../public', import.meta.url)));
const MAX_REQUEST_BODY_SIZE = 64 * 1024;
const ONE_MINUTE_MS = 60_000;
const GLOBAL_RATE_BUCKET = () => 'all-clients';

/**
 * Factory creating the hardened Hono application with full middleware chain.
 *
 * @param {object} dependencies
 * @param {{ createPlan: (req: import('./domain/contracts.js').PlanRequest, opts?: { signal?: AbortSignal }) => Promise<object> }} dependencies.planner
 * @param {number} dependencies.rateLimitPerMinute Maximum plan requests per client IP / min
 * @param {number} dependencies.globalRateLimitPerMinute Global ceiling on all plan requests / min
 * @param {number} dependencies.trustedProxies Number of upstream proxy headers trusted
 * @param {import('./infra/structured-logger.js').Logger} [dependencies.log]
 */
export function createApp({
  planner,
  rateLimitPerMinute,
  globalRateLimitPerMinute,
  trustedProxies,
  log = fallbackLog,
}) {
  const app = new Hono();

  app.use(secureHeaders(APPLICATION_SECURITY_HEADERS));
  app.use('/api/*', requestId(), compress(), crossSiteGuard);

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.post(
    '/api/plan',
    rateLimiter({
      limit: rateLimitPerMinute,
      windowMs: ONE_MINUTE_MS,
      key: clientKey(trustedProxies),
    }),
    rateLimiter({
      limit: globalRateLimitPerMinute,
      windowMs: ONE_MINUTE_MS,
      key: GLOBAL_RATE_BUCKET,
    }),
    bodyLimit({
      maxSize: MAX_REQUEST_BODY_SIZE,
      onError: () => {
        throw new AppError(413, 'That request is too large.');
      },
    }),
    handlePlanRequest(planner),
  );

  app.all('/api/plan', () => {
    throw new AppError(405, 'Use POST to request a plan.', { headers: { Allow: 'POST' } });
  });

  app.all('/api/*', () => {
    throw new AppError(404, 'Not found.');
  });

  app.use('*', serveAssets(STATIC_ASSET_REPOSITORY));
  app.onError(buildErrorHandler(log));

  return app;
}

/**
 * Controller executing plan generation with input parsing and abort signalling.
 * @param {Parameters<typeof createApp>[0]['planner']} plannerEngine
 * @returns {import('hono').Handler}
 */
function handlePlanRequest(plannerEngine) {
  return async (c) => {
    const rawPayload = await parseJsonBody(c);
    const validationResult = PlanRequestSchema.safeParse(rawPayload);

    if (!validationResult.success) {
      throw new AppError(400, 'Some details need attention.', {
        fields: mapFieldIssues(validationResult.error),
      });
    }

    const plan = await plannerEngine.createPlan(validationResult.data, {
      signal: c.req.raw.signal,
    });
    return c.json({ plan });
  };
}

/**
 * Central error formatting middleware logging failures and ensuring safe client messaging.
 * @param {import('./infra/structured-logger.js').Logger} logger
 * @returns {import('hono').ErrorHandler}
 */
function buildErrorHandler(logger) {
  return (err, c) => {
    const errorInstance =
      err instanceof AppError
        ? err
        : new AppError(500, 'Something went wrong. Please try again.', { cause: err });

    if (errorInstance.status >= 500) {
      const underlyingCause = errorInstance.cause;
      logger({
        severity: 'ERROR',
        message: errorInstance.message,
        requestId: c.get('requestId'),
        error: underlyingCause instanceof Error ? underlyingCause.stack : String(underlyingCause),
      });
    }

    for (const [headerName, headerValue] of Object.entries(errorInstance.headers ?? {})) {
      c.header(headerName, headerValue);
    }

    return c.json(
      { error: errorInstance.message, fields: errorInstance.fields },
      errorInstance.status,
    );
  };
}

/**
 * Safe JSON body parser enforcing strict Content-Type requirements.
 * @param {import('hono').Context} c
 */
async function parseJsonBody(c) {
  const header = c.req.header('content-type');
  // biome-ignore lint/complexity/useOptionalChain: explicit null check avoids unreachable optional-chaining branches
  if (!header || !header.toLowerCase().startsWith('application/json')) {
    throw new AppError(415, 'Send the request as JSON.');
  }

  try {
    return await c.req.json();
  } catch {
    throw new AppError(400, 'The request body is not valid JSON.');
  }
}

/**
 * Extracts and maps Zod field error messages to form control targets.
 * @param {import('zod').ZodError} error
 */
function mapFieldIssues(error) {
  /** @type {Record<string, string>} */
  const errorMap = Object.create(null);
  for (const issue of error.issues) {
    const targetKey = String(issue.path.at(-1) ?? 'request');
    errorMap[targetKey] ??= issue.message;
  }
  return errorMap;
}
