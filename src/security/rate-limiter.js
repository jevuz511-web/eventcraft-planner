import { AppError } from '../infra/http-error.js';

/**
 * Fixed-window rate limiter middleware with bounded memory capacity.
 * Automatically evicts expired or least-recently-seen client buckets.
 *
 * @param {object} options
 * @param {number} options.limit maximum allowable requests per window
 * @param {number} options.windowMs duration of the sliding window in milliseconds
 * @param {(c: import('hono').Context) => string} options.key client identifier extractor
 * @param {number} [options.maxClients] maximum concurrent client records stored in memory
 * @param {() => number} [options.now] clock function
 * @returns {import('hono').MiddlewareHandler}
 */
export function rateLimiter({ limit, windowMs, key, maxClients = 10_000, now = Date.now }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const trackingBuckets = new Map();

  return async (c, next) => {
    const clientId = key(c);
    const currentTime = now();
    let clientBucket = trackingBuckets.get(clientId);

    if (!clientBucket || clientBucket.resetAt <= currentTime) {
      trackingBuckets.delete(clientId);
      if (trackingBuckets.size >= maxClients) {
        const [oldestId] = trackingBuckets.keys();
        trackingBuckets.delete(oldestId);
      }
      clientBucket = { count: 0, resetAt: currentTime + windowMs };
      trackingBuckets.set(clientId, clientBucket);
    }

    clientBucket.count += 1;

    if (clientBucket.count > limit) {
      const waitSeconds = String(Math.ceil((clientBucket.resetAt - currentTime) / 1000));
      throw new AppError(
        429,
        'Too many plans in a short time. Please wait a minute and try again.',
        {
          headers: { 'Retry-After': waitSeconds },
        },
      );
    }

    await next();
  };
}

/**
 * Resolves client IP address based on configured trusted proxy hops.
 * @param {number} proxyHopCount Number of reverse proxies/load balancers in front
 * @returns {(c: import('hono').Context) => string}
 */
export const clientKey = (proxyHopCount) => (c) => {
  const forwardedHeader = c.req.header('x-forwarded-for') ?? '';
  const hops = forwardedHeader
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);

  const trustedForwardedIp = proxyHopCount > 0 ? hops.at(-proxyHopCount) : undefined;
  return trustedForwardedIp || c.env?.incoming?.socket?.remoteAddress || 'unknown';
};
