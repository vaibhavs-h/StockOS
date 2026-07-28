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
      const userId = entity.notes?.userId;
      const tier = entity.notes?.tier;

      if (orderId) {
        await supabase
          .from("payments")
          .update({
            status: "paid",
            razorpay_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          })
          .eq("razorpay_order_id", orderId);
      }

      if (userId && tier) {
        await supabase
          .from("profiles")
          .update({
            subscription_tier: tier,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
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
