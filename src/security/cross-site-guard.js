import { AppError } from '../infra/http-error.js';

/**
 * Determines whether the request originated from an external third-party site.
 * Inspects Fetch Metadata (Sec-Fetch-Site) and Origin headers.
 * @param {import('hono').Context} c
 */
function isForeignOriginRequest(c) {
  const fetchSite = c.req.header('Sec-Fetch-Site');
  const originHeader = c.req.header('Origin');
  const isCrossOrigin =
    originHeader !== undefined && URL.parse(originHeader)?.host !== new URL(c.req.url).host;

  return fetchSite === 'cross-site' || fetchSite === 'same-site' || isCrossOrigin;
}

/**
 * Middleware ensuring API requests come strictly from same-origin pages and preventing response caching.
 * @type {import('hono').MiddlewareHandler}
 */
export async function crossSiteGuard(c, next) {
  c.header('Cache-Control', 'no-store');
  if (isForeignOriginRequest(c)) {
    throw new AppError(403, 'Requests from other sites are not allowed.');
  }
  await next();
}
