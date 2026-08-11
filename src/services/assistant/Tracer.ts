// Internal observability (§ V2 plan, Phase 6). One `RequestTracer` per request — deliberately
// NOT a singleton like AssistantCache/ModelRegistry, since a shared instance would leak state
// across concurrent requests. No dashboard, no new UI: this only ever produces one structured
// console.log line plus the same JSON as a value for the `assistant_messages.trace` column.

export interface TraceSummary {
  requestId: string;
  startedAt: string;
  totalMs: number;
  stages: { stage: string; elapsedMs: number }[];
  meta: Record<string, unknown>;
  error?: string;
}

export class RequestTracer {
  private readonly requestId: string;
  private readonly startedAt: number;
  private lastMark: number;
  private readonly stages: { stage: string; elapsedMs: number }[] = [];
  private readonly meta: Record<string, unknown> = {};

  constructor(requestId: string) {
    this.requestId = requestId;
    this.startedAt = Date.now();
    this.lastMark = this.startedAt;
  }

  /** Records elapsed ms since the previous mark (or construction) under `stage`. */
  mark(stage: string): void {
    const now = Date.now();
    this.stages.push({ stage, elapsedMs: now - this.lastMark });
    this.lastMark = now;
  }

  /** Records a piece of request metadata (model used, cache hits, confidence, ...). */
  set(key: string, value: unknown): void {
    this.meta[key] = value;
  }

  /** Emits the structured trace line and returns the summary for persistence. */
  finish(error?: string): TraceSummary {
    const summary: TraceSummary = {
      requestId: this.requestId,
      startedAt: new Date(this.startedAt).toISOString(),
      totalMs: Date.now() - this.startedAt,
      stages: this.stages,
      meta: this.meta,
      ...(error ? { error } : {}),
    };
    console.log('[ASSISTANT-TRACE]', JSON.stringify(summary));
    return summary;
  }
}
