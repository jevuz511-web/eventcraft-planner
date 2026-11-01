import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readSaved, STORAGE_KEY, writeSaved } from '../public/js/core/persistence.js';
import { isPlan, isSavedPlan } from '../public/js/core/type-guards.js';
import { finalizePlan } from '../src/domain/scheduler.js';
import { aiPlan, validEvent } from './helpers.js';

describe('type-guards (isPlan & isSavedPlan)', () => {
  const event = validEvent();
  const validPlan = finalizePlan(aiPlan(), event);

  it('validates a complete FinalPlan', () => {
    assert.equal(isPlan(validPlan), true);
  });

  it('rejects invalid plan types and missing properties', () => {
    assert.equal(isPlan(null), false);
    assert.equal(isPlan('plan'), false);
    assert.equal(isPlan({ ...validPlan, title: 123 }), false);
    assert.equal(isPlan({ ...validPlan, summary: null }), false);
    assert.equal(isPlan({ ...validPlan, currency: false }), false);
    assert.equal(isPlan({ ...validPlan, total: '100' }), false);
    assert.equal(isPlan({ ...validPlan, budget: [{ category: 'A', amount: 'bad' }] }), false);
    assert.equal(isPlan({ ...validPlan, timeline: [{ task: 'A', due: 'bad-date' }] }), false);
    assert.equal(isPlan({ ...validPlan, vendors: [{ type: 'A', due: 123 }] }), false);
    assert.equal(isPlan({ ...validPlan, ideas: [{ title: 'A', description: 99 }] }), false);
  });

  it('validates a complete SavedPlan with and without done array', () => {
    const saved = { event, plan: validPlan, booked: ['Caterer'], done: ['Task'] };
    assert.equal(isSavedPlan(saved), true);

    const savedWithoutDone = { event, plan: validPlan, booked: [] };
    assert.equal(isSavedPlan(savedWithoutDone), true);
  });

  it('rejects malformed SavedPlans', () => {
    assert.equal(isSavedPlan(null), false);
    assert.equal(isSavedPlan({}), false);
    assert.equal(isSavedPlan({ plan: 'bad', event }), false);
    assert.equal(isSavedPlan({ plan: validPlan, event: null }), false);
    assert.equal(isSavedPlan({ plan: validPlan, event: { ...event, date: 'not-a-date' } }), false);
    assert.equal(isSavedPlan({ plan: validPlan, event: { ...event, location: 123 } }), false);
    assert.equal(isSavedPlan({ plan: validPlan, event, booked: [123], done: [] }), false);
    assert.equal(isSavedPlan({ plan: validPlan, event, booked: [], done: [456] }), false);
  });
});

describe('persistence (readSaved & writeSaved)', () => {
  const event = validEvent();
  const plan = finalizePlan(aiPlan(), event);
  const sampleSaved = { event, plan, booked: ['Caterer'], done: [] };

  /** @type {Map<string, string>} */
  const storageMock = new Map();

  beforeEach(() => {
    storageMock.clear();
    Object.assign(globalThis, {
      localStorage: {
        getItem: (k) => storageMock.get(k) ?? null,
        setItem: (k, v) => storageMock.set(k, String(v)),
        removeItem: (k) => storageMock.delete(k),
      },
    });
  });

  afterEach(() => {
    storageMock.clear();
  });

  it('reads stored plan correctly', () => {
    storageMock.set(STORAGE_KEY, JSON.stringify(sampleSaved));
    const result = readSaved();
    assert.deepEqual(result, sampleSaved);
  });

  it('reads stored plan without done list and defaults to empty array', () => {
    const { done, ...withoutDone } = sampleSaved;
    storageMock.set(STORAGE_KEY, JSON.stringify(withoutDone));
    const result = readSaved();
    assert.deepEqual(result?.done, []);
  });

  it('returns null and removes invalid or corrupt JSON', () => {
    storageMock.set(STORAGE_KEY, '{ bad json');
    assert.equal(readSaved(), null);

    storageMock.set(STORAGE_KEY, JSON.stringify({ invalid: 'shape' }));
    assert.equal(readSaved(), null);
    assert.equal(storageMock.has(STORAGE_KEY), false);
  });

  it('writes and clears items in localStorage', () => {
    writeSaved(sampleSaved);
    assert.equal(storageMock.has(STORAGE_KEY), true);

    writeSaved(null);
    assert.equal(storageMock.has(STORAGE_KEY), false);
  });

  it('gracefully handles localStorage failures', () => {
    globalThis.localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    assert.doesNotThrow(() => writeSaved(sampleSaved));
  });
});
