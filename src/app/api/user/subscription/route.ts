import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/services/DatabaseClient";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tier } = await req.json();

    if (!['free', 'lite', 'pro'].includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const userId = (session.user as any).id;

    const { error } = await supabase
      .from('profiles')
      .update({ 
        subscription_tier: tier,
        updated_at: new Date().toISOString() 
      })
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true, tier });
  } catch (error: any) {
    console.error("[API] Subscription update error:", error);
    return NextResponse.json({ error: error.message || "Update failed" }, { status: 500 });
  }
}
