import { readFileSync } from 'node:fs';
import { z } from 'zod';

const EnvironmentContract = z.object({
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_API_KEY_FILE: z.string().min(1, 'GEMINI_API_KEY_FILE must not be empty').optional(),
  GEMINI_MODELS: z
    .string()
    .default('gemini-3.6-flash,gemini-3.5-flash-lite')
    .transform((csv) =>
      csv
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1, 'GEMINI_MODELS must name at least one model')),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  GLOBAL_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  TRUSTED_PROXIES: z.coerce.number().int().min(0).max(5).default(0),
});

/**
 * Validates printable ASCII characters excluding quotes and backslashes.
 * @param {string} char
 */
const isValidKeyCharacter = (char) => char > ' ' && char <= '~' && char !== '"' && char !== '\\';

/** Validates the structure and length of Gemini API tokens without echoing bad tokens */
const ApiKeyContract = z
  .string(
    'GEMINI_API_KEY or GEMINI_API_KEY_FILE is required: ' +
      'create a key at https://aistudio.google.com/apikey',
  )
  .trim()
  .refine(
    (key) => key.length >= 20 && key.length <= 256 && [...key].every(isValidKeyCharacter),
    'The Gemini API key must be 20-256 characters with no spaces',
  );

/**
 * Formats configuration validation failures.
 * @param {z.ZodError} error
 */
const formatConfigError = (error) => new Error(`Invalid configuration:\n${z.prettifyError(error)}`);

/**
 * Reads a secret file from filesystem or custom reader function.
 * @param {string} filePath
 * @param {(p: string) => string} reader
 */
function loadSecretFile(filePath, reader) {
  try {
    return reader(filePath);
  } catch (cause) {
    throw new Error(`Invalid configuration: cannot read GEMINI_API_KEY_FILE (${filePath})`, {
      cause,
    });
  }
}

/**
 * Parses and verifies environment configuration during bootstrap.
 * Supports mounted secret files (GEMINI_API_KEY_FILE) or direct env vars.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {(path: string) => string} [secretReader]
 */
export function loadConfig(env = process.env, secretReader = (path) => readFileSync(path, 'utf8')) {
  const envResult = EnvironmentContract.safeParse(env);
  if (!envResult.success) throw formatConfigError(envResult.error);

  const parsedEnv = envResult.data;
  const rawKey = parsedEnv.GEMINI_API_KEY_FILE
    ? loadSecretFile(parsedEnv.GEMINI_API_KEY_FILE, secretReader)
    : parsedEnv.GEMINI_API_KEY;

  const keyResult = ApiKeyContract.safeParse(rawKey);
  if (!keyResult.success) throw formatConfigError(keyResult.error);

  return {
    apiKey: keyResult.data,
    models: parsedEnv.GEMINI_MODELS,
    port: parsedEnv.PORT,
    rateLimitPerMinute: parsedEnv.RATE_LIMIT_PER_MINUTE,
    globalRateLimitPerMinute: parsedEnv.GLOBAL_RATE_LIMIT_PER_MINUTE,
    trustedProxies: parsedEnv.TRUSTED_PROXIES,
  };
}
