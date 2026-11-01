import { GoogleGenAI } from '@google/genai';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config/environment.js';
import { createLogger } from './infra/structured-logger.js';
import { createPlanner } from './services/planner-service.js';

// Read, validate and normalize environment configurations
const configuration = loadConfig();

// Purge the API secret from environment variables to prevent accidental exfiltration
delete process.env.GEMINI_API_KEY;

// Structured logger configured with automatic secret redacting
const applicationLogger = createLogger({ secrets: [configuration.apiKey] });

// Initialize official Google GenAI SDK client with 30s deadline
const genAiClient = new GoogleGenAI({
  apiKey: configuration.apiKey,
  httpOptions: { timeout: 30_000 },
});

// Build the Hono application pipeline
const app = createApp({
  planner: createPlanner({ ai: genAiClient, models: configuration.models }),
  rateLimitPerMinute: configuration.rateLimitPerMinute,
  globalRateLimitPerMinute: configuration.globalRateLimitPerMinute,
  trustedProxies: configuration.trustedProxies,
  log: applicationLogger,
});

// Configure connection timeouts to mitigate slowloris attacks
const connectionOptions = { headersTimeout: 15_000, requestTimeout: 30_000 };

const serverInstance = serve(
  { fetch: app.fetch, port: configuration.port, serverOptions: connectionOptions },
  ({ port }) => {
    applicationLogger({
      severity: 'INFO',
      message: `EventCraft is listening on http://localhost:${port}`,
    });
  },
);

// Register process signal handlers for zero-downtime graceful shutdown
for (const terminationSignal of ['SIGTERM', 'SIGINT']) {
  process.once(terminationSignal, () => {
    serverInstance.close(() => process.exit(0));
  });
}
