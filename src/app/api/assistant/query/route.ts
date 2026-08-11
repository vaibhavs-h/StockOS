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
    const { data } = await axios.post(
      `${engineUrl}/internal/assistant/query`,
      { userId, tier, message, conversationId: body.conversationId },
      { headers: { 'x-assistant-secret': secret }, timeout: 45000 }
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
