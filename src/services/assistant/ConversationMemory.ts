import { supabase } from '../../lib/supabase';
import { Capability, ConversationFocus } from './types';

const EMPTY_FOCUS: ConversationFocus = {
  last_symbols: [],
  last_portfolio_id: null,
  last_sector: null,
  last_capability: null,
  updated_at: new Date(0).toISOString(),
};

const PRONOUN_RE = /\b(it|its|that stock|this stock|that one|this one)\b/gi;
const SECTOR_PRONOUN_RE = /\b(that sector|this sector|the sector)\b/gi;

export class ConversationMemory {
  /** Loads (or creates) a conversation and returns its id + focus stack. */
  static async resolve(userId: string, conversationId?: string): Promise<{ conversationId: string; focus: ConversationFocus }> {
    if (conversationId) {
      const { data } = await supabase
        .from('assistant_conversations')
        .select('id, context_state')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        return { conversationId: data.id, focus: { ...EMPTY_FOCUS, ...(data.context_state || {}) } };
      }
    }

    const { data: created, error } = await supabase
      .from('assistant_conversations')
      .insert({ user_id: userId, context_state: EMPTY_FOCUS })
      .select('id')
      .single();

    if (error || !created) {
      throw new Error(`Failed to create conversation: ${error?.message}`);
    }

    return { conversationId: created.id, focus: EMPTY_FOCUS };
  }

  /**
   * Deterministic pronoun resolution — substitutes "it"/"that stock" etc. with the
   * most recently discussed symbol before the message ever reaches the classifier.
   * See §08 — this is a lookup, not a model guess.
   */
  static substitutePronouns(message: string, focus: ConversationFocus): string {
    let result = message;

    if (focus.last_symbols.length > 0 && PRONOUN_RE.test(result)) {
      PRONOUN_RE.lastIndex = 0;
      result = result.replace(PRONOUN_RE, focus.last_symbols[0]);
    }

    // Same lookup-not-guess substitution as symbols above, for a sector-scoped follow-up
    // ("what's the average PE there?" doesn't repeat "IT sector" — sector_analysis/
    // news_analysis would otherwise have no way to know what "there" refers to, since
    // entities.sector is re-derived fresh per message with no carryover of its own).
    if (focus.last_sector && SECTOR_PRONOUN_RE.test(result)) {
      SECTOR_PRONOUN_RE.lastIndex = 0;
      result = result.replace(SECTOR_PRONOUN_RE, `the ${focus.last_sector} sector`);
    }

    return result;
  }

  static async updateFocus(
    conversationId: string,
    updates: { symbols?: string[]; portfolioId?: string | null; sector?: string | null; capability?: Capability }
  ): Promise<void> {
    const next: ConversationFocus = {
      last_symbols: updates.symbols ?? [],
      last_portfolio_id: updates.portfolioId ?? null,
      last_sector: updates.sector ?? null,
      last_capability: updates.capability ?? null,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('assistant_conversations')
      .update({ context_state: next, updated_at: next.updated_at })
      .eq('id', conversationId);
  }
}
