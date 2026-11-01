import { createHash } from 'node:crypto';
import {
  ApiError,
  FinishReason,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
} from '@google/genai';
import { z } from 'zod';
import { PLAN_JSON_SCHEMA, PlanSchema } from '../domain/contracts.js';
import { finalizePlan } from '../domain/scheduler.js';
import { AppError } from '../infra/http-error.js';
import { createCache } from './lru-cache.js';
import { buildPrompt, SYSTEM_INSTRUCTION } from './prompt-synthesizer.js';

/** Explicit safety filters across key harm vectors */
const HARMFUL_CONTENT_POLICIES = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }));

/** Gemini finish reasons that signify deliberate output suppression */
const SUPPRESSED_FINISH_REASONS = new Set([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
]);

/**
 * Instantiates the AI orchestration engine for generating structured celebration plans.
 * Supports model cascade fallback, prompt caching, and resilience handling.
 *
 * @param {object} options
 * @param {{ models: Pick<import('@google/genai').Models, 'generateContent'> }} options.ai GenAI client
 * @param {string[]} options.models Model IDs arranged in failover priority
 * @param {import('./lru-cache.js').Cache<import('../domain/contracts.js').Plan>} [options.cache]
 * @param {() => Date} [options.now]
 */
export function createPlanner({ ai, models, cache = createCache(), now = () => new Date() }) {
  /**
   * Dispatches a single structured request to a designated Gemini model.
   * @param {string} modelName
   * @param {string} promptPayload
   * @param {AbortSignal} [signal]
   * @returns {Promise<import('../domain/contracts.js').Plan>}
   */
  async function queryModel(modelName, promptPayload, signal) {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: promptPayload,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseJsonSchema: PLAN_JSON_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        safetySettings: HARMFUL_CONTENT_POLICIES,
        abortSignal: signal,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    if (
      response.promptFeedback?.blockReason ||
      (finishReason && SUPPRESSED_FINISH_REASONS.has(finishReason))
    ) {
      throw new AppError(
        422,
        'This request could not be planned. Please rephrase your event details.',
      );
    }

    return PlanSchema.parse(JSON.parse(response.text ?? ''));
  }

  /**
   * Executes prompt execution with cascade fallback to subsequent models.
   * @param {string} promptPayload
   * @param {AbortSignal} [signal]
   */
  async function generateWithFallback(promptPayload, signal) {
    let lastError;
    for (const model of models) {
      try {
        return await queryModel(model, promptPayload, signal);
      } catch (err) {
        lastError = err;
        if (signal?.aborted || !isEligibleForFailover(err)) {
          break;
        }
      }
    }
    throw normalizePlanError(lastError);
  }

  return {
    /**
     * Synthesizes and finalizes an event plan.
     * @param {import('../domain/contracts.js').PlanRequest} planRequest
     * @param {{ signal?: AbortSignal }} [options]
     */
    async createPlan(planRequest, { signal } = {}) {
      const prompt = buildPrompt(planRequest, now());
      const cacheHash = createHash('sha256').update(prompt).digest('base64url');

      let plan = cache.get(cacheHash);
      if (!plan) {
        plan = await generateWithFallback(prompt, signal);
        cache.set(cacheHash, plan);
      }

      return finalizePlan(plan, planRequest.event, now());
    },
  };
}

/**
 * Determines whether a model failure warrants attempting subsequent models.
 * @param {unknown} err
 */
function isEligibleForFailover(err) {
  if (err instanceof AppError) return false;
  if (err instanceof ApiError) return err.status >= 500 || [408, 429].includes(err.status);
  return true;
}

/**
 * Converts network, SDK, and validation errors into user-safe AppErrors.
 * @param {unknown} err
 */
function normalizePlanError(err) {
  if (err instanceof AppError) return err;

  /** @type {(status: import('../infra/http-error.js').StatusCode, msg: string) => AppError} */
  const buildError = (status, msg) => new AppError(status, msg, { cause: err });
  const httpStatus = err instanceof ApiError ? err.status : undefined;

  if (err instanceof SyntaxError || err instanceof z.ZodError) {
    return buildError(502, 'The AI returned an incomplete plan. Please try again.');
  }
  if ((err instanceof Error && err.name === 'AbortError') || httpStatus === 504) {
    return buildError(504, 'The AI took too long to respond. Please try again.');
  }
  if (httpStatus === 429 || httpStatus === 503) {
    return buildError(503, 'The planner is busy right now. Please try again in a minute.');
  }

  return buildError(502, 'The AI planner is unavailable right now. Please try again shortly.');
}
