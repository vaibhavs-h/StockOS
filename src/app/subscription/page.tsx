"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { loadRazorpayScript } from "@/lib/useRazorpay";

const FREE_FEATURES = [
  "1 Portfolio Linking Only",
  "No Holdings Limit",
  "Real-Time Indian Market Data",
  "US Stocks & Global Markets Data Access",
  "Basic P&L and XIRR Analytics",
  "Journal & Investment Notes",
];

const LITE_FEATURES = [
  "Everything in Free, Plus:",
  "Up to 5 Portfolios",
  "Live Price Alert for Any Stock [Unlimited]",
  "Watchlist Assets [Limited To 6 Assets]",
  "AI Chat Assistant [Limited Usage]",
  "Mutual Fund & SIP Tracking",
];

const PRO_FEATURES = [
  "Everything in Lite, Plus:",
  "Unlimited Portfolios",
  "Unlimited Watchlist Assets",
  "AI Chat Assistant [Much Higher Limits]",
  "Priority Support",
  "Early Access to New Features",
];

interface PlanCardProps {
  planKey: string;
  delay: number;
  name: string;
  subtitle: string;
  price: React.ReactNode;
  cta: React.ReactNode;
  features: string[];
  cardClass: string;
  topLine?: boolean;
  badge?: string;
  iconSvg: React.ReactNode;
  checkColor: string;
  firstFeatureColor: string;
}

function PlanCard({
  planKey,
  delay,
  name,
  subtitle,
  price,
  cta,
  features,
  cardClass,
  topLine,
  badge,
  iconSvg,
  checkColor,
  firstFeatureColor,
}: PlanCardProps) {
  return (
    <motion.div
      key={planKey}
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -6, scale: 1.01 }}
      className={`relative flex-1 rounded-3xl p-8 flex flex-col shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${cardClass}`}
    >
      {/* Subtle Glow Overlay */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/[0.01] via-transparent to-white/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      {topLine && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      )}
      {badge && (
        <span className="absolute top-5 right-5 text-[9px] font-mono tracking-widest uppercase text-zinc-300 bg-white/[0.06] border border-white/[0.12] rounded-full px-2.5 py-0.5 shadow-md">
          {badge}
        </span>
      )}

      {/* Row 1 – Icon */}
      <div className="h-[52px] flex items-center mb-3">{iconSvg}</div>

      {/* Row 2 – Name */}
      <h3 className="text-[23px] font-semibold text-white mb-0.5 tracking-tight">{name}</h3>

      {/* Row 3 – Subtitle */}
      <p className="h-[18px] text-[13.5px] text-zinc-500 mb-3.5 tracking-wide">{subtitle}</p>

      {/* Row 4 – Price */}
      <div className="h-[48px] flex items-center mb-4">{price}</div>

      {/* Row 5 – CTA */}
      {cta}

      {/* Row 6 – Features */}
      <div className="mt-5 border-t border-white/[0.06] pt-5 flex-1">
        <ul className="flex flex-col gap-2.5">
          {features.map((item, i) => (
            <motion.li
              key={item}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: delay + 0.15 + i * 0.04 }}
              className={`flex gap-2.5 items-start text-[13px] leading-normal ${i === 0 ? `${firstFeatureColor} font-semibold` : "text-zinc-400"
                }`}
            >
              {i !== 0 && (
                <Check className={`size-4 mt-0.5 shrink-0 transition-transform duration-300 group-hover:scale-110 ${checkColor}`} />
              )}
              <span>{item}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

export default function SubscriptionPage() {
  const { data: session, update } = useSession();
  const [mounted, setMounted] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [paymentNotification, setPaymentNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const currentTier = ((session?.user as any)?.subscription_tier || "free").toLowerCase();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleUpgrade = async (targetTier: "lite" | "pro") => {
    if (loadingTier) return;
    setLoadingTier(targetTier);
    setPaymentNotification(null);

    try {
      // 1. Create order on server
      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: targetTier, cycle }),
      });

      const orderData = await res.json();
      if (!res.ok || !orderData.success) {
        throw new Error(orderData.error || "Failed to initialize payment order");
      }

      // 2. Load Razorpay script
      const isLoaded = await loadRazorpayScript();
      
      const keyId = orderData.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      // If Razorpay SDK is available and key is valid (not default placeholder), open Razorpay modal
      if (isLoaded && typeof window !== "undefined" && (window as any).Razorpay && keyId && keyId !== "rzp_test_key_id") {
        const options = {
          key: keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "StockOS",
          description: `${targetTier.toUpperCase()} Subscription (${cycle})`,
          order_id: orderData.orderId,
          prefill: {
            name: session?.user?.name || "",
            email: session?.user?.email || "",
          },
          theme: {
            color: "#18181b",
          },
          handler: async function (response: any) {
            try {
              const verifyRes = await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  tier: targetTier,
                }),
              });

              const verifyData = await verifyRes.json();
              if (verifyRes.ok && verifyData.success) {
                await update({ subscription_tier: targetTier });
                setPaymentNotification({
                  type: "success",
                  message: `🎉 Successfully upgraded to StockOS ${targetTier.toUpperCase()}!`,
                });
              } else {
                throw new Error(verifyData.error || "Payment verification failed");
              }
            } catch (err: any) {
              setPaymentNotification({
                type: "error",
                message: err.message || "Payment verification error",
              });
            } finally {
              setLoadingTier(null);
            }
          },
          modal: {
            ondismiss: function () {
              setLoadingTier(null);
            },
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        // Fallback / Development Simulation mode if using test keys without active live keys
        const verifyRes = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: orderData.orderId,
            razorpay_payment_id: `pay_mock_${Date.now()}`,
            razorpay_signature: `sig_mock_${Date.now()}`,
            tier: targetTier,
          }),
        });

        const verifyData = await verifyRes.json();
        if (verifyRes.ok && verifyData.success) {
          await update({ subscription_tier: targetTier });
          setPaymentNotification({
            type: "success",
            message: `🎉 Demo Payment Verified! Successfully upgraded to ${targetTier.toUpperCase()} plan.`,
          });
        } else {
          throw new Error(verifyData.error || "Verification failed");
        }
        setLoadingTier(null);
      }
    } catch (err: any) {
      console.error("[Checkout Error]", err);
      setPaymentNotification({
        type: "error",
        message: err.message || "Something went wrong initiating checkout.",
      });
      setLoadingTier(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] overflow-y-auto text-zinc-300 font-sans selection:bg-zinc-700 selection:text-white flex flex-col">
      <div className="flex flex-col h-full px-6 pt-12 pb-16 w-full max-w-[1200px] mx-auto justify-center relative">

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="absolute top-6 left-6 z-10 shrink-0"
        >
          <Link href="/dashboard">
            <button
              className="inline-flex items-center justify-center size-8 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] transition-all duration-200 active:scale-95"
              type="button"
              aria-label="Back"
            >
              <ArrowLeft className="size-[18px]" />
            </button>
          </Link>
        </motion.div>

        {/* Heading */}
        <div className="text-center mb-8 shrink-0 pt-4">
          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 25 }}
            transition={{ duration: 0.95, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="font-outfit text-[46px] sm:text-[64px] font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-zinc-400 leading-none mb-3.5"
          >
            Plans That Grow With Your Portfolio
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
            transition={{ duration: 0.95, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="text-[19px] text-zinc-400/90 leading-relaxed max-w-3xl mx-auto"
          >
            Built For Serious Investors in India. Start Free, Scale When You're Ready.
          </motion.p>

          {/* Billing Cycle Toggle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="inline-flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-900/90 border border-white/[0.08] mt-6 shadow-inner"
          >
            <button
              onClick={() => setCycle("monthly")}
              className={`px-5 py-2 rounded-xl text-[13px] font-medium transition-all duration-300 ${cycle === "monthly"
                ? "bg-zinc-800 text-white shadow-md border border-white/10"
                : "text-zinc-400 hover:text-zinc-200"
                }`}
              type="button"
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-5 py-2 rounded-xl text-[13px] font-medium transition-all duration-300 flex items-center gap-2 ${cycle === "yearly"
                ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30 shadow-md"
                : "text-zinc-400 hover:text-zinc-200"
                }`}
              type="button"
            >
              <span>Annual Billing</span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/40">
                Save 20%
              </span>
            </button>
          </motion.div>
        </div>

        {/* Toast / Notification Banner */}
        <AnimatePresence>
          {paymentNotification && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`max-w-xl mx-auto mb-6 p-4 rounded-2xl border text-[13.5px] font-medium flex items-center justify-between shadow-lg ${paymentNotification.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-200"
                : "bg-rose-950/60 border-rose-500/30 text-rose-200"
                }`}
            >
              <div className="flex items-center gap-3">
                {paymentNotification.type === "success" ? (
                  <ShieldCheck className="size-5 text-emerald-400 shrink-0" />
                ) : (
                  <Sparkles className="size-5 text-rose-400 shrink-0" />
                )}
                <span>{paymentNotification.message}</span>
              </div>
              <button
                onClick={() => setPaymentNotification(null)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cards Grid */}
        <div className="flex flex-col lg:flex-row gap-5 items-stretch justify-center shrink-0">
          {mounted ? (
            <AnimatePresence mode="wait">

              {/* Free Card */}
              <PlanCard
                planKey="free"
                delay={0.25}
                name="Free"
                subtitle="Start Tracking Your Wealth"
                badge="Starter"
                cardClass="border border-white/[0.04] bg-gradient-to-b from-[#111113] to-[#09090b] hover:border-white/[0.08]"
                iconSvg={
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-zinc-500 text-zinc-500 transition-transform duration-500 group-hover:scale-105">
                    <rect x="3" y="14" width="3" height="6" rx="1" strokeWidth="2" strokeLinejoin="round" />
                    <rect x="10" y="8" width="3" height="12" rx="1" strokeWidth="2" strokeLinejoin="round" />
                    <rect x="17" y="3" width="3" height="17" rx="1" strokeWidth="2" strokeLinejoin="round" />
                    <circle cx="18.5" cy="4" r="1.5" fill="currentColor" />
                  </svg>
                }
                price={
                  <div>
                    <span className="text-[38px] font-semibold text-white tracking-tight">₹0</span>
                    <span className="text-[13px] text-zinc-500 ml-2 font-mono">/ Forever</span>
                  </div>
                }
                cta={
                  <button
                    disabled={currentTier === "free"}
                    className={`w-full h-11 rounded-xl border text-[13px] font-semibold transition-all duration-300 ${currentTier === "free"
                      ? "border-zinc-800 bg-zinc-900/40 text-zinc-500 cursor-default"
                      : "border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 active:scale-[0.98]"
                      }`}
                    type="button"
                  >
                    {currentTier === "free" ? "Current Plan" : "Downgrade to Free"}
                  </button>
                }
                features={FREE_FEATURES}
                checkColor="text-zinc-600"
                firstFeatureColor="text-zinc-300"
              />

              {/* Lite Card */}
              <PlanCard
                planKey="lite"
                delay={0.31}
                name="Lite"
                subtitle="For The Growing Investor"
                topLine
                badge="Most Popular"
                cardClass="border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#09090b] hover:border-white/[0.12]"
                iconSvg={
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-zinc-400 text-zinc-400 transition-all duration-500 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]">
                    <path d="M3 18L9 12L15 16L21 6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="3" cy="18" r="2" fill="#131313" strokeWidth="2" />
                    <circle cx="9" cy="12" r="2" fill="#131313" strokeWidth="2" />
                    <circle cx="15" cy="16" r="2" fill="#131313" strokeWidth="2" />
                    <circle cx="21" cy="6" r="2.5" fill="currentColor" />
                  </svg>
                }
                price={
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[38px] font-semibold text-white tracking-tight">
                      ₹{cycle === "monthly" ? "499" : "4,999"}
                    </span>
                    <span className="text-[13px] text-zinc-500 font-mono">
                      / {cycle === "monthly" ? "Month" : "Year"}
                    </span>
                  </div>
                }
                cta={
                  <button
                    disabled={currentTier === "lite" || loadingTier === "lite"}
                    onClick={() => handleUpgrade("lite")}
                    className={`w-full h-11 rounded-xl border text-[13px] font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${currentTier === "lite"
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-400 cursor-default"
                      : "border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.12] hover:border-white/[0.25] text-white active:scale-[0.98]"
                      }`}
                    type="button"
                  >
                    {loadingTier === "lite" ? (
                      <Loader2 className="size-4 animate-spin text-zinc-300" />
                    ) : currentTier === "lite" ? (
                      "Current Plan"
                    ) : (
                      "Upgrade to Lite (UPI / Cards)"
                    )}
                  </button>
                }
                features={LITE_FEATURES}
                checkColor="text-blue-400"
                firstFeatureColor="text-zinc-200"
              />

              {/* Pro Card */}
              <PlanCard
                planKey="pro"
                delay={0.37}
                name="Pro"
                subtitle="Unlimited, Global, Intelligent"
                topLine
                badge="Most Powerful"
                cardClass="border border-emerald-500/20 bg-gradient-to-b from-[#18181b] to-[#09090b] hover:border-emerald-500/40"
                iconSvg={
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-emerald-400 text-emerald-400 transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-[30deg]">
                    <circle cx="12" cy="12" r="9" strokeWidth="1.5" strokeDasharray="3 3" />
                    <circle cx="12" cy="12" r="5" strokeWidth="2" />
                    <path d="M12 12L18 6M18 6H14 M18 6V10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  </svg>
                }
                price={
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[38px] font-semibold text-white tracking-tight">
                      ₹{cycle === "monthly" ? "999" : "9,999"}
                    </span>
                    <span className="text-[13px] text-zinc-500 font-mono">
                      / {cycle === "monthly" ? "Month" : "Year"}
                    </span>
                  </div>
                }
                cta={
                  <button
                    disabled={currentTier === "pro" || loadingTier === "pro"}
                    onClick={() => handleUpgrade("pro")}
                    className={`w-full h-11 rounded-xl text-[13px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-2 ${currentTier === "pro"
                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default"
                      : "bg-gradient-to-b from-white to-zinc-200 hover:from-white hover:to-white text-black active:scale-[0.98] shadow-[0_4px_20px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.2)]"
                      }`}
                    type="button"
                  >
                    {loadingTier === "pro" ? (
                      <Loader2 className="size-4 animate-spin text-black" />
                    ) : currentTier === "pro" ? (
                      "Current Plan"
                    ) : (
                      "Upgrade to Pro (UPI / Cards)"
                    )}
                  </button>
                }
                features={PRO_FEATURES}
                checkColor="text-emerald-400"
                firstFeatureColor="text-emerald-200"
              />

            </AnimatePresence>
          ) : (
            <div className="w-full flex items-center justify-center text-zinc-600 text-[11px] font-mono animate-pulse">
              Loading plans...
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
