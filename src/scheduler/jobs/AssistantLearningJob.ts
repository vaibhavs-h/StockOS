import { BaseJob } from '../core/BaseJob';
import { JobMetadata, MarketRegion, QueuePriority, RefreshTier } from '../core/types';
import { SupabaseProvider } from '../providers/SupabaseProvider';

// Feedback → Learning Pipeline (§ V2 plan, Phase 5). Runs nightly (cron in
// scheduler/index.ts), following PortfolioRevaluationJob's precedent for a
// non-symbol-scoped job (symbols: [], region: GLOBAL) — BaseJob/syncOrchestrator is
// exactly the batch/cron shape this kind of job needs, unlike the live chat request path.
//
// Deliberately does NOT touch prompt wording — only ever adjusts optional-field retrieval
// *priority* in assistant_retrieval_field_priority, gradually (±1 per run), clamped to each
// row's own min/max, gated by the same distinct-user + minimum-sample thresholds the
// architecture doc already fixed (≥20% of ≥30 ratings from ≥10 distinct users) applied at
// both the reason-code level and again at the specific-field level, so one vocal user's
// comment can't move a priority on its own even inside an otherwise-qualifying pool.

const TRAILING_WINDOW_DAYS = 30;
const MIN_SAMPLE = 30;
const MIN_SHARE = 0.2;
const MIN_DISTINCT_USERS = 10;
const PRIORITY_STEP = 1;

// Which reason codes are actionable here at all — the others (wrong_data, wrong_reasoning,
// didnt_answer, too_generic, other) describe a correctness/reasoning problem, not "field
// present or absent," so no retrieval-spec adjustment could sensibly address them.
const UP_SIGNAL_CODES = new Set(['missing_metrics', 'missing_news']);
const DOWN_SIGNAL_CODE = 'too_much_data';

// Deterministic keyword → field(s) dictionary, not an LLM call — a keyword can resolve to
// more than one field for group complaints ("too much technical analysis").
// promoter_holding, ev_ebitda, roce, recommendation_mean have no keyword entry — neither
// market_assets nor us_market_assets has a column for any of them (see
// StockFundamentalsRetriever.ts), so no retrieval-priority adjustment could ever surface
// them; a comment mentioning "promoter holding" is acknowledged (logged, no field matched)
// rather than silently mapped to a field that can never be retrieved.
const KEYWORD_TO_FIELDS: { keyword: RegExp; fields: string[] }[] = [
  { keyword: /\bdebt\b/i, fields: ['debt_to_equity'] },
  { keyword: /\banalyst (rating|recommendation)s?\b/i, fields: ['recommendation_key'] },
  { keyword: /\bpeg ratio\b/i, fields: ['peg_ratio'] },
  { keyword: /\b(roe|return on equity)\b/i, fields: ['return_on_equity'] },
  { keyword: /\btechnical analysis\b/i, fields: ['fifty_day_average', 'two_hundred_day_average', 'fifty_two_week_high', 'fifty_two_week_low'] },
  { keyword: /\bvaluation\b/i, fields: ['peg_ratio', 'pe_ratio', 'forward_pe'] },
  { keyword: /\bnews\b/i, fields: ['recent_news_1', 'recent_news_2', 'recent_news_3'] },
];

interface FeedbackEntry {
  userId: string;
  comment: string | null;
}

interface PriorityRow {
  capability: string;
  field: string;
  priority: number;
  min_priority: number;
  max_priority: number;
}

export class AssistantLearningJob extends BaseJob {
  public readonly id = 'AssistantLearningJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_5_STATIC,
    symbols: [],
    region: MarketRegion.GLOBAL,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-assistant-learning',
    retryCount: 0,
    maxRetries: 1,
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    const since = new Date(Date.now() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from('assistant_feedback')
      .select('user_id, rating, reason_codes, comment, assistant_messages(capability)')
      .eq('rating', 'down') // reason codes only ever exist on down-ratings (see FloatingAssistant.tsx)
      .gte('created_at', since);

    if (error) {
      this.log(`Failed to load feedback: ${error.message}`, 'error');
      throw error;
    }
    if (!rows || rows.length === 0) {
      this.log('No down-feedback in the trailing window — nothing to learn from.', 'info');
      return 0;
    }

    // Group by capability + reason code, and separately track total down-ratings per
    // capability (the denominator for the ≥20%-of-ratings share requirement).
    const totalDownByCapability = new Map<string, number>();
    const byKey = new Map<string, FeedbackEntry[]>();

    for (const row of rows as any[]) {
      const capability: string | undefined = Array.isArray(row.assistant_messages)
        ? row.assistant_messages[0]?.capability
        : row.assistant_messages?.capability;
      if (!capability) continue;

      totalDownByCapability.set(capability, (totalDownByCapability.get(capability) || 0) + 1);

      for (const code of (row.reason_codes as string[]) || []) {
        const key = `${capability}|${code}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push({ userId: row.user_id, comment: row.comment });
      }
    }

    let adjustments = 0;

    for (const [key, entries] of byKey) {
      const [capability, reasonCode] = key.split('|');
      const isUpSignal = UP_SIGNAL_CODES.has(reasonCode);
      const isDownSignal = reasonCode === DOWN_SIGNAL_CODE;
      if (!isUpSignal && !isDownSignal) continue; // not an actionable code (§ scoping above)

      const totalForCapability = totalDownByCapability.get(capability) || 0;
      const distinctUsers = new Set(entries.map(e => e.userId)).size;
      const share = totalForCapability > 0 ? entries.length / totalForCapability : 0;

      if (totalForCapability < MIN_SAMPLE || share < MIN_SHARE || distinctUsers < MIN_DISTINCT_USERS) {
        continue; // reason-code-level threshold not cleared — logged implicitly by being skipped
      }

      // Within a qualifying (capability, reason_code) pool, resolve which specific fields
      // are actually being talked about, and re-check the distinct-user threshold at the
      // field level too — a pool can qualify overall while one field inside it is only
      // mentioned by a couple of users, which shouldn't be enough to move that field alone.
      const fieldUsers = new Map<string, Set<string>>();
      for (const entry of entries) {
        if (!entry.comment) continue;
        for (const { keyword, fields } of KEYWORD_TO_FIELDS) {
          if (!keyword.test(entry.comment)) continue;
          for (const field of fields) {
            if (!fieldUsers.has(field)) fieldUsers.set(field, new Set());
            fieldUsers.get(field)!.add(entry.userId);
          }
        }
      }

      const mappedAnyField = fieldUsers.size > 0;
      if (!mappedAnyField) {
        this.log(`${capability}/${reasonCode}: qualifying pool (${entries.length} ratings, ${distinctUsers} users) but no comment matched a known field — acknowledged, no action taken.`, 'info');
        continue;
      }

      for (const [field, users] of fieldUsers) {
        if (users.size < MIN_DISTINCT_USERS) continue;

        const applied = await this.adjustPriority(supabase, capability, field, isUpSignal ? PRIORITY_STEP : -PRIORITY_STEP, reasonCode, users.size, entries.length);
        if (applied) adjustments++;
      }
    }

    this.log(`Applied ${adjustments} retrieval-priority adjustment(s) this run.`, adjustments > 0 ? 'success' : 'info');
    return adjustments;
  }

  private async adjustPriority(
    supabase: ReturnType<typeof SupabaseProvider.getClient>,
    capability: string,
    field: string,
    delta: number,
    reasonCode: string,
    distinctUsers: number,
    sampleSize: number
  ): Promise<boolean> {
    const { data: existing } = await supabase
      .from('assistant_retrieval_field_priority')
      .select('capability, field, priority, min_priority, max_priority')
      .eq('capability', capability)
      .eq('field', field)
      .maybeSingle();

    const row: PriorityRow = existing || { capability, field, priority: 5, min_priority: 0, max_priority: 20 };
    const nextPriority = Math.max(row.min_priority, Math.min(row.max_priority, row.priority + delta));
    if (nextPriority === row.priority) return false; // already clamped at the limit — nothing to do

    const { error: upsertError } = await supabase
      .from('assistant_retrieval_field_priority')
      .upsert({ capability, field, priority: nextPriority, min_priority: row.min_priority, max_priority: row.max_priority, updated_at: new Date().toISOString() }, { onConflict: 'capability,field' });

    if (upsertError) {
      this.log(`Failed to adjust priority for ${capability}/${field}: ${upsertError.message}`, 'error');
      return false;
    }

    await supabase.from('assistant_retrieval_spec_audit').insert({
      capability,
      change: { field, priority_from: row.priority, priority_to: nextPriority },
      reason: `${reasonCode}: ${sampleSize} ratings, ${distinctUsers} distinct users mentioning "${field}" in the trailing ${TRAILING_WINDOW_DAYS} days`,
      triggered_by: 'AssistantLearningJob',
    });

    this.log(`${capability}/${field}: priority ${row.priority} → ${nextPriority} (${reasonCode}, ${distinctUsers} users)`, 'success');
    return true;
  }
}
