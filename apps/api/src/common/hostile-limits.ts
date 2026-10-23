import assert from "node:assert/strict";

/**
 * The one place hostile-input time limits live (NFR-4, QA 0.5). Every test of a matcher, parser or normaliser imports these;
 * no test hard-codes its own limit. A constant may be raised only with a written reason in the change that raises it.
 */

/** Milliseconds allowed for an input of at most 2,000 characters. */
export const HOSTILE_MS_SMALL = 500;
/** Milliseconds allowed for an input of 20,000 characters or more. */
export const HOSTILE_MS_LARGE = 1500;

const SMALL_SIZE = 2_000;
const LARGE_SIZE = 20_000;
const RUNS = 3;

function bestOfThree(fn: (input: string) => unknown, input: string): number {
  let best = Infinity;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    fn(input);
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

/**
 * Fails unless `fn` grows about linearly: it times `fn` on a 2,000- and a 20,000-character input made by `make(n)` (best of
 * 3 runs each) and requires `t(20k) <= 30 * max(t(2k), 5 ms)`. Linear growth is about 10 times, quadratic about 100 times.
 * Returns both times (milliseconds) for diagnostics.
 */
export function assertLinear(fn: (input: string) => unknown, make: (length: number) => string): { small: number; large: number } {
  fn(make(SMALL_SIZE)); // warm up, so the first run does not pay for compilation
  const small = bestOfThree(fn, make(SMALL_SIZE));
  const large = bestOfThree(fn, make(LARGE_SIZE));
  assert.ok(large <= 30 * Math.max(small, 5), `not linear: ${LARGE_SIZE} characters took ${large.toFixed(1)} ms, ${SMALL_SIZE} took ${small.toFixed(1)} ms`);
  return { small, large };
}
