import crypto from 'crypto';
import { Capability, Citation, Intent, ProvenancedField, ResolvedEntities, StructuredContext, ToolResult } from './types';

export class ContextBuilder {
  static build(intent: Intent, capability: Capability, entities: ResolvedEntities, toolResult: ToolResult): StructuredContext {
    return {
      intent,
      capability,
      entities,
      fields: [...toolResult.fields, ...toolResult.computedFields],
      missingRequiredFields: toolResult.missingRequiredFields,
      missingOptionalFields: toolResult.missingOptionalFields,
      cacheKeys: toolResult.cacheKeys,
    };
  }

  /** SHA-256 over the fields the model actually saw — reconstructible while cacheKeys are still live (§10). */
  static hash(context: StructuredContext): string {
    const canonical = JSON.stringify({
      capability: context.capability,
      entities: context.entities,
      fields: context.fields.map(f => ({ field: f.field, value: f.value, source: f.source, asOf: f.asOf })),
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  /** Light citation list — no values, just source + freshness. Stored on every message (§10/§07). */
  static citations(context: StructuredContext): Citation[] {
    return context.fields.map(f => ({
      field: f.field,
      label: humanizeFieldName(f.field),
      source: f.source,
      kind: f.kind,
      asOf: f.asOf,
    }));
  }

  /** Formats fields as delimited text for the synthesis prompt — treated as data, never instructions (§15). */
  static toPromptBlock(context: StructuredContext): string {
    if (context.fields.length === 0) {
      return '{"note": "No StockOS data was retrieved for this question."}';
    }
    const payload = context.fields.map(f => ({
      field: f.field,
      value: f.value,
      source: f.source,
      kind: f.kind,
      as_of: formatAsOf(f.asOf),
    }));
    return JSON.stringify(payload, null, 2);
  }
}

/**
 * Pre-formats a timestamp into a short, human-readable form ("3m ago") before it ever
 * reaches the model — same principle as currency formatting (ContextBuilder is the source
 * of truth, not the model's judgment): a raw ISO string like "2026-08-11T10:31:49.41+00:00"
 * is exactly the kind of thing a less-capable model tends to echo verbatim into a citation
 * instead of paraphrasing, which reads badly and can trip the numeric verifier on the
 * fractional-seconds digits. Nothing raw is given, so there's nothing raw to echo.
 */
function formatAsOf(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(ageMs / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function humanizeFieldName(field: string): string {
  return field
    .replace(/^[A-Z0-9.]+\./, '') // strip "SYMBOL." prefix used by CompareStocksTool
    .replace(/_\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
