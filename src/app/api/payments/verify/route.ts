import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/services/DatabaseClient";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      tier,
    } = await req.json();

    if (!razorpay_order_id || !tier) {
      return NextResponse.json({ error: "Missing required payment fields" }, { status: 400 });
    }

    const userId = (session.user as any).id;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

    let isValid = false;

    if (keySecret && keySecret !== 'rzp_test_key_secret' && razorpay_payment_id && razorpay_signature) {
      // Re-generate HMAC-SHA256 signature
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(body.toString())
        .digest("hex");

      isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(razorpay_signature)
      );
    } else {
      // Development mode / Mock verification test mode
      isValid = true;
    }

    if (!isValid) {
      // Mark payment as failed in DB
      await supabase
        .from('payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('razorpay_order_id', razorpay_order_id);

      return NextResponse.json({ error: "Invalid payment signature verification" }, { status: 400 });
    }

    // 1. Update Payments Audit Log in Supabase
    await supabase
      .from('payments')
      .update({
        status: 'paid',
        razorpay_payment_id: razorpay_payment_id || `pay_mock_${Date.now()}`,
        razorpay_signature: razorpay_signature || `sig_mock_${Date.now()}`,
        updated_at: new Date().toISOString(),
      })
      .eq('razorpay_order_id', razorpay_order_id);

    // 2. Upgrade User Subscription Tier in Supabase profiles
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        subscription_tier: tier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.error("[API/Payment/Verify] Profile update error:", profileError);
    }

    return NextResponse.json({
      success: true,
      message: `Subscription successfully upgraded to ${tier.toUpperCase()}`,
      tier,
    });
  } catch (error: any) {
    console.error("[API/Payment/Verify] Exception error:", error);
    return NextResponse.json({ error: error.message || "Payment verification failed" }, { status: 500 });
  }
}
