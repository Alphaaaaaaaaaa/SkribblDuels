export interface TimestampPair {
  occurredAt: number;
  monotonicMs: number;
}

export function now(): TimestampPair {
  return {
    occurredAt: Date.now(),
    monotonicMs: performance.now()
  };
}
