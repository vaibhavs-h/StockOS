import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/services/DatabaseClient";
import { NextResponse } from "next/server";
import Razorpay from "razorpay";

// Tier Pricing Matrix (in INR ₹ - 17% Off Annual Offer)
const PRICING: Record<string, Record<string, number>> = {
  lite: {
    monthly: 149,
    yearly: 1499,
  },
  pro: {
    monthly: 499,
    yearly: 4999,
  },
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tier, cycle = 'monthly' } = await req.json();

    if (!['lite', 'pro'].includes(tier)) {
      return NextResponse.json({ error: "Invalid subscription tier" }, { status: 400 });
    }

    if (!['monthly', 'yearly'].includes(cycle)) {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }

    const userId = (session.user as any).id;
    const amountInRupees = PRICING[tier][cycle];
    const amountInPaise = amountInRupees * 100; // Razorpay expects amount in paise

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';

    let orderId = `order_mock_${Date.now()}`;

    // If active Razorpay key secret is present, create order via Razorpay SDK
    if (razorpayKeySecret && razorpayKeySecret !== 'rzp_test_key_secret') {
      const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
      });

      const orderOptions = {
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${userId.slice(0, 8)}_${Date.now().toString().slice(-6)}`,
        notes: {
          userId,
          tier,
          cycle,
          userEmail: session.user.email || '',
        },
      };

      const razorpayOrder = await razorpay.orders.create(orderOptions);
      orderId = razorpayOrder.id;
    }

    // Insert order record into database
    const { error: dbError } = await supabase.from('payments').insert([
      {
        user_id: userId,
        razorpay_order_id: orderId,
        tier,
        billing_cycle: cycle,
        amount: amountInRupees,
        currency: 'INR',
        status: 'created',
      },
    ]);

    if (dbError) {
      console.warn("[API/Payment] Supabase insert warning (non-fatal):", dbError.message);
    }

    return NextResponse.json({
      success: true,
      orderId,
      amount: amountInPaise,
      currency: "INR",
      keyId: razorpayKeyId,
      tier,
      cycle,
    });
  } catch (error: any) {
    console.error("[API/Payment] Order creation error:", error);
    return NextResponse.json({ error: error.message || "Failed to create payment order" }, { status: 500 });
  }
}
