import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import axios from "axios";
import { authOptions } from "@/lib/auth";
import { getDbUserId } from "@/lib/user";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUserId = (session.user as any).id;
  const userId = getDbUserId(sessionUserId);
  const tier = (session.user as any).subscription_tier || 'free';

  let body: { message?: string; conversationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const message = (body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL;
  const secret = process.env.ASSISTANT_INTERNAL_SECRET;

  if (!engineUrl || !secret) {
    return NextResponse.json(
      { error: "Assistant is not configured — missing NEXT_PUBLIC_ENGINE_URL or ASSISTANT_INTERNAL_SECRET." },
      { status: 500 }
    );
  }

  try {
    // Bounded to comfortably exceed the engine's own worst case, not picked arbitrarily:
    // a synthesis attempt and its corrective retry are each capped at a capability's own
    // policy.timeoutMs (up to 45000ms for portfolio_analysis), and Tier 2 verification
    // (run on every request for portfolio_analysis/risk_analysis/portfolio_optimization/
    // investment_thesis, whose 'always' policy doesn't wait for Tier 1 to flag something
    // first) is capped separately at 15000ms — so 45000(synthesis) + 45000(retry) +
    // 15000(Tier 2) + a few seconds of classification/retrieval is the real ceiling. The
    // previous 45000ms here was already tighter than a single capability's own declared
    // budget before any retry or Tier 2 time is added on top, which meant a slow-but-
    // otherwise-successful engine response could get killed here and surfaced to the user
    // as "temporarily unavailable" even though the engine would have answered correctly
    // given a few more seconds.
    const { data } = await axios.post(
      `${engineUrl}/internal/assistant/query`,
      { userId, tier, message, conversationId: body.conversationId },
      { headers: { 'x-assistant-secret': secret }, timeout: 120000 }
    );
    return NextResponse.json(data);
  } catch (err: any) {
    const status = err.response?.status;
    const engineError = err.response?.data?.error;
    console.error("[API-ASSISTANT-QUERY] Engine call failed:", engineError || err.message);

    if (status === 401) {
      return NextResponse.json({ error: "Assistant auth misconfigured between frontend and engine." }, { status: 500 });
    }
    return NextResponse.json({ error: engineError || "Research Assistant is temporarily unavailable." }, { status: 502 });
  }
}
