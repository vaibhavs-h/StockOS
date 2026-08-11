import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getDbUserId } from "@/lib/user";

export const dynamic = 'force-dynamic';

const VALID_REASON_CODES = new Set([
  'wrong_data', 'outdated', 'didnt_answer', 'too_generic',
  'missing_metrics', 'wrong_reasoning', 'missing_news', 'other',
  // Down-signal for weighted retrieval learning (§ V2 plan, Phase 5) — the up-signal codes
  // above already tell the learning job what's missing; this is the only code that tells it
  // something is present but unwanted, which is what lets a field's priority actually go down.
  'too_much_data',
]);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getDbUserId((session.user as any).id);

  let body: { messageId?: string; rating?: 'up' | 'down'; reasonCodes?: string[]; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.messageId || (body.rating !== 'up' && body.rating !== 'down')) {
    return NextResponse.json({ error: "messageId and a valid rating ('up' | 'down') are required" }, { status: 400 });
  }

  const reasonCodes = (body.reasonCodes || []).filter(code => VALID_REASON_CODES.has(code));

  try {
    const { error } = await supabase.from('assistant_feedback').insert({
      message_id: body.messageId,
      user_id: userId,
      rating: body.rating,
      reason_codes: reasonCodes,
      comment: body.comment?.slice(0, 1000) || null,
    });

    if (error) throw error;

    // Append the real-world outcome to the message's trace (§ V2 plan, Phase 6) — so a
    // trace record eventually shows what actually happened, not just the pipeline's
    // self-assessment. Best-effort: a failure here shouldn't fail the feedback submission.
    try {
      const { data: existing } = await supabase
        .from('assistant_messages')
        .select('trace')
        .eq('id', body.messageId)
        .maybeSingle();
      const trace = (existing?.trace as Record<string, unknown> | null) || {};
      await supabase
        .from('assistant_messages')
        .update({ trace: { ...trace, feedback: { rating: body.rating, reasonCodes, ratedAt: new Date().toISOString() } } })
        .eq('id', body.messageId);
    } catch (traceErr: any) {
      console.error('[API-ASSISTANT-FEEDBACK] Failed to append feedback to trace:', traceErr.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[API-ASSISTANT-FEEDBACK] Insert failed:", err.message);
    return NextResponse.json({ error: "Failed to record feedback" }, { status: 500 });
  }
}
