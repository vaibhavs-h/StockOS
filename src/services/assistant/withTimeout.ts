/** Races a promise against a timeout — used wherever a capability policy's `timeoutMs`
 * (or a retriever's own freshness-recovery timeout) needs to bound an otherwise-unbounded
 * call. The timeout itself is just a rejection, so callers get the same error-handling path
 * as any other failure — nothing timeout-specific for them to special-case. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}
