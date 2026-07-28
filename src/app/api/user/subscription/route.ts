import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/services/DatabaseClient";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = (session.user as any).id;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_expires_at')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    let tier = profile?.subscription_tier || 'free';
    let expiresAt = profile?.subscription_expires_at || null;
    let wasJustExpired = false;

    // Check expiration logic
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      wasJustExpired = true;
      const expiredTier = tier.toUpperCase();
      tier = 'free';
      expiresAt = null;

      // Revert DB profile to free
      await supabase
        .from('profiles')
        .update({
          subscription_tier: 'free',
          subscription_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      // Insert Expired Notification in user_notifications
      try {
        const { error: nErr } = await supabase.from('user_notifications').insert({
          user_id: userId,
          title: 'Subscription Expired ⚠️',
          message: `Your StockOS ${expiredTier} plan has expired. Your account has been shifted back to the Free plan. Renew anytime on the Subscription page!`,
          type: 'SUBSCRIPTION_EXPIRED',
          link: '/subscription',
          is_read: false,
          created_at: new Date().toISOString()
        });

        if (nErr && nErr.code === '23514') {
          await supabase.from('user_notifications').insert({
            user_id: userId,
            title: 'Subscription Expired ⚠️',
            message: `Your StockOS ${expiredTier} plan has expired. Your account has been shifted back to the Free plan. Renew anytime on the Subscription page!`,
            type: 'ALERT_PRICE',
            link: '/subscription',
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      } catch (nErr) {
        console.error('[API/Subscription] Expired notification error:', nErr);
      }
    }

    let isExpiringSoon = false;
    let daysRemaining = 0;
    let hoursRemaining = 0;
    let formattedRemaining = "";

    if (expiresAt) {
      const now = new Date().getTime();
      const expTime = new Date(expiresAt).getTime();
      const diffMs = Math.max(0, expTime - now);

      daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      hoursRemaining = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      // Expiring soon if 7 days or less remaining
      isExpiringSoon = daysRemaining <= 7;

      const years = Math.floor(daysRemaining / 365);
      const remAfterYears = daysRemaining % 365;
      const months = Math.floor(remAfterYears / 30);
      const days = remAfterYears % 30;

      const parts: string[] = [];
      if (years > 0) parts.push(`${years}Y`);
      parts.push(`${months}M`);
      parts.push(`${days}D`);
      parts.push(`${hoursRemaining}H`);

      formattedRemaining = parts.join(' ');

      // Trigger Expiring Soon Notification if within 7 days (check deduplication for 3 days)
      if (isExpiringSoon) {
        try {
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
          const { data: recentNotif } = await supabase
            .from('user_notifications')
            .select('id')
            .eq('user_id', userId)
            .gt('created_at', threeDaysAgo)
            .limit(10);

          const hasExpiringNotif = recentNotif?.some((n: any) => n.title?.includes('Plan Expiring Soon'));

          if (!hasExpiringNotif) {
            const { error: expErr } = await supabase.from('user_notifications').insert({
              user_id: userId,
              title: 'Plan Expiring Soon ⏰',
              message: `Your StockOS ${tier.toUpperCase()} plan will expire in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Extend now to keep uninterrupted access to real-time analytics!`,
              type: 'SUBSCRIPTION_EXPIRING_SOON',
              link: '/subscription',
              is_read: false,
              created_at: new Date().toISOString()
            });

            if (expErr && expErr.code === '23514') {
              await supabase.from('user_notifications').insert({
                user_id: userId,
                title: 'Plan Expiring Soon ⏰',
                message: `Your StockOS ${tier.toUpperCase()} plan will expire in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}. Extend now to keep uninterrupted access to real-time analytics!`,
                type: 'ALERT_PRICE',
                link: '/subscription',
                is_read: false,
                created_at: new Date().toISOString()
              });
            }
          }
        } catch (nErr) {
          console.error('[API/Subscription] Expiring soon notification error:', nErr);
        }
      }
    }

    return NextResponse.json({
      tier,
      expiresAt,
      wasJustExpired,
      isExpiringSoon,
      daysRemaining,
      hoursRemaining,
      formattedRemaining,
    });
  } catch (error: any) {
    console.error("[API] Get subscription status error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch subscription status" }, { status: 500 });
  }
}

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
