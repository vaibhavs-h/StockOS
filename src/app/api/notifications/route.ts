import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { getDbUserId } from "@/lib/user";

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * GET: Retrieve recent notifications (limit 25) for the authenticated user.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getDbUserId((session.user as any).id);

  try {
    const { data, error } = await supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) throw error;

    return NextResponse.json({ success: true, notifications: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to retrieve notifications" }, { status: 500 });
  }
}

/**
 * POST: Mark notifications as read.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getDbUserId((session.user as any).id);

  try {
    const body = await req.json();
    const { ids, all } = body;

    let query = supabase.from("user_notifications").update({ is_read: true }).eq("user_id", userId);

    if (all === true) {
      // Mark all unread notifications as read
      query = query.eq("is_read", false);
    } else if (Array.isArray(ids) && ids.length > 0) {
      // Mark specific notifications as read
      query = query.in("id", ids);
    } else {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to mark notifications as read" }, { status: 500 });
  }
}
