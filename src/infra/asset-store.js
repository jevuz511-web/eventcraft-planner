import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/**
 * In-memory static asset management with pre-compression and immutable caching.
 * Compresses files on startup into Brotli (level 11) and Gzip (level 9) buffers,
 * completely bypassing filesystem I/O and runtime compression overhead during requests.
 */

/** @type {Record<string, string>} */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPRESSION_ORDER = /** @type {const} */ (['br', 'gzip']);
const IMMUTABLE_CACHE_POLICY = 'public, max-age=31536000, immutable';

/**
 * Computes a URL-safe SHA-256 fingerprint from data.
 * @param {string | Buffer} input
 */
const digest = (input) => createHash('sha256').update(input).digest('base64url').slice(0, 16);

/**
 * @typedef {{ type: string, identity: Bytes, br: Bytes, gzip: Bytes, etag: string }} StoredAsset
 * @typedef {Buffer<ArrayBuffer>} Bytes
 */

/**
 * Injects build version queries into HTML links and JS imports for immutable cache busting.
 * @param {string} content
 * @param {string} routePath
 * @param {string} buildHash
 */
function tagVersions(content, routePath, buildHash) {
  if (routePath.endsWith('.html')) {
    return content.replace(/((?:href|src)=")(\/[^"]+\.(?:css|js|svg))"/g, `$1$2?v=${buildHash}"`);
  }
  if (routePath.endsWith('.js')) {
    return content.replace(/(from ')(\.[^']+\.js)'/g, `$1$2?v=${buildHash}'`);
  }
  return content;
}

/**
 * Pre-reads and compresses all eligible static files inside a directory.
 * @param {string} directoryRoot
 * @returns {{ version: string, files: Map<string, StoredAsset> }}
 */
export function loadAssets(directoryRoot) {
  const fileEntries = readdirSync(directoryRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && MIME_TYPES[extname(entry.name)])
    .map((entry) => {
      const fullPath = join(entry.parentPath, entry.name);
      const urlPath = `/${relative(directoryRoot, fullPath).split(sep).join('/')}`;
      return [urlPath, readFileSync(fullPath, 'utf8')];
    })
    .sort(([pathA], [pathB]) => pathA.localeCompare(pathB));

  const version = digest(JSON.stringify(fileEntries));

  /** @type {Map<string, StoredAsset>} */
  const files = new Map();

  for (const [url, rawContent] of fileEntries) {
    const identity = Buffer.from(tagVersions(rawContent, url, version));
    files.set(url, {
      type: MIME_TYPES[extname(url)],
      identity,
      br: brotliCompressSync(identity, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
      gzip: gzipSync(identity, { level: 9 }),
      etag: digest(identity),
    });
  }

  const rootIndex = files.get('/index.html');
  if (!rootIndex) {
    throw new Error(`No index.html to serve in ${directoryRoot}`);
  }
  files.set('/', rootIndex);

  return { version, files };
}

/**
 * Determines client quality preference (q-value) for a specified encoding.
 * @param {string} encodingName
 * @param {string | undefined} acceptHeader
 */
function parseEncodingQuality(encodingName, acceptHeader = '') {
  for (const segment of acceptHeader.split(',')) {
    const [name, ...params] = segment.split(';').map((p) => p.trim());
    if (name.toLowerCase() !== encodingName) continue;
    const qValue = params.find((param) => param.startsWith('q='));
    return qValue ? Number(qValue.slice(2)) : 1;
  }
  return 0;
}

/**
 * Selects optimal representation (Brotli -> Gzip -> Identity) with RFC 9110 ETag.
 * @param {StoredAsset} file
 * @param {string | undefined} acceptEncoding
 */
function negotiateRepresentation(file, acceptEncoding) {
  const chosenEncoding = COMPRESSION_ORDER.find(
    (encoding) => parseEncodingQuality(encoding, acceptEncoding) > 0,
  );
  if (!chosenEncoding) {
    return { body: file.identity, etag: `"${file.etag}"` };
  }
  return {
    body: file[chosenEncoding],
    etag: `"${file.etag}-${chosenEncoding}"`,
    encoding: chosenEncoding,
  };
}

/**
 * Validates whether cached client resource matches current ETag.
 * @param {string} etag
 * @param {string | undefined} clientIfNoneMatch
 */
const matchesETag = (etag, clientIfNoneMatch = '') =>
  clientIfNoneMatch.split(',').some((token) => token.trim() === etag || token.trim() === '*');

/**
 * Hono middleware serving memory-resident assets with content-negotiated compression.
 * @param {ReturnType<typeof loadAssets>} assetRepository
 * @returns {import('hono').MiddlewareHandler}
 */
export function serveAssets({ version, files }) {
  return async (c, next) => {
    const isGetOrHead = ['GET', 'HEAD'].includes(c.req.method);
    const asset = isGetOrHead ? files.get(c.req.path) : undefined;
    if (!asset) return next();

    const { body, etag, encoding } = negotiateRepresentation(
      asset,
      c.req.header('Accept-Encoding'),
    );

    c.header('Content-Type', asset.type);
    c.header('Cache-Control', c.req.query('v') === version ? IMMUTABLE_CACHE_POLICY : 'no-cache');
    c.header('Vary', 'Accept-Encoding');
    c.header('ETag', etag);

    if (matchesETag(etag, c.req.header('If-None-Match'))) {
      return c.body(null, 304);
    }

    if (encoding) {
      c.header('Content-Encoding', encoding);
    }
    c.header('Content-Length', String(body.length));

    return c.req.method === 'HEAD' ? c.body(null) : c.body(body);
  };
}
