import { supabase } from "@/services/DatabaseClient";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

    if (webhookSecret && webhookSecret !== "rzp_test_webhook_secret" && signature) {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (expectedSignature !== signature) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    if (event === "order.paid" || event === "payment.captured") {
      const entity = payload.payload.payment.entity;
      const orderId = entity.order_id;
      const paymentId = entity.id;

      if (orderId) {
        // Update payments status & fetch payment details
        const { data: paymentRecord } = await supabase
          .from("payments")
          .update({
            status: "paid",
            razorpay_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          })
          .eq("razorpay_order_id", orderId)
          .select("user_id, tier, billing_cycle")
          .single();

        const targetUserId = paymentRecord?.user_id || entity.notes?.userId;
        const targetTier = paymentRecord?.tier || entity.notes?.tier;
        const billingCycle = paymentRecord?.billing_cycle || "monthly";

        if (targetUserId && targetTier) {
          // Fetch current profile for extension logic
          const { data: profile } = await supabase
            .from("profiles")
            .select("subscription_tier, subscription_expires_at")
            .eq("id", targetUserId)
            .single();

          const currentTier = profile?.subscription_tier || "free";
          const currentExpiresAt = profile?.subscription_expires_at;
          const isExtension = currentTier === targetTier;

          let baseDate = new Date();
          if (isExtension && currentExpiresAt && new Date(currentExpiresAt) > new Date()) {
            baseDate = new Date(currentExpiresAt);
          }

          if (billingCycle === "yearly") {
            baseDate.setFullYear(baseDate.getFullYear() + 1);
          } else {
            baseDate.setMonth(baseDate.getMonth() + 1);
          }

          const newExpiresAt = baseDate.toISOString();

          await supabase
            .from("profiles")
            .update({
              subscription_tier: targetTier,
              subscription_expires_at: newExpiresAt,
              updated_at: new Date().toISOString(),
            })
            .eq("id", targetUserId);

          // Insert Notification
          try {
            const notifTitle = isExtension
              ? `Subscription Extended! 🎉`
              : `Subscription Upgraded to ${targetTier.toUpperCase()}! 🚀`;

            const notifMessage = isExtension
              ? `Your StockOS ${targetTier.toUpperCase()} plan has been extended by +${billingCycle === 'yearly' ? '1 Year' : '1 Month'}. Thank you for building your wealth with us!`
              : `Your StockOS ${targetTier.toUpperCase()} plan has been activated for ${billingCycle === 'yearly' ? '1 Year' : '1 Month'}. All premium features are unlocked!`;

            const preferredType = isExtension ? "SUBSCRIPTION_EXTENDED" : "SUBSCRIPTION_UPGRADED";

            const { error: notifErr } = await supabase.from("user_notifications").insert({
              user_id: targetUserId,
              title: notifTitle,
              message: notifMessage,
              type: preferredType,
              link: "/subscription",
              is_read: false,
              created_at: new Date().toISOString()
            });

            if (notifErr && notifErr.code === '23514') {
              await supabase.from("user_notifications").insert({
                user_id: targetUserId,
                title: notifTitle,
                message: notifMessage,
                type: "ALERT_PRICE",
                link: "/subscription",
                is_read: false,
                created_at: new Date().toISOString()
              });
            }
          } catch (nErr) {
            console.error("[Webhook] Notification error:", nErr);
          }
        }
      }
    } else if (event === "payment.failed") {
      const entity = payload.payload.payment.entity;
      const orderId = entity.order_id;

      if (orderId) {
        await supabase
          .from("payments")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("razorpay_order_id", orderId);
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error: any) {
    console.error("[API/Payment/Webhook] Webhook error:", error);
    return NextResponse.json({ error: error.message || "Webhook handler error" }, { status: 500 });
  }
}
