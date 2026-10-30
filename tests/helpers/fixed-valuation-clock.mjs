import { after, mock } from 'node:test';

// Adapted from the reviewed test-only clock helper in f0e7ff0fdb6883abdddeabb7b3c477224a69b3ef.
// Pin historical fixtures before module-level model/cache construction.
// Financial inputs and production freshness gates remain unchanged.
export function fixedValuationClock(iso) {
  const now = Date.parse(iso);
  if (!Number.isFinite(now)) throw new Error('INVALID_FIXTURE_OBSERVATION_DATE');
  mock.timers.enable({ apis: ['Date'], now });
  after(() => mock.timers.reset());
}
