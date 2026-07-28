"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, Sparkles, ShieldCheck, Crown, Zap, ArrowRight, X, Clock, AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { loadRazorpayScript } from "@/lib/useRazorpay";
import { useRouter } from "next/navigation";

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
      className={`relative flex-1 rounded-3xl p-[30px] flex flex-col shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${cardClass}`}
    >
      {/* Subtle Glow Overlay */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/[0.01] via-transparent to-white/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

      {topLine && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      )}
      {badge && (
        <span className="absolute top-[24px] right-[24px] text-[9px] font-mono tracking-widest uppercase text-zinc-300 bg-white/[0.06] border border-white/[0.12] rounded-full px-2.5 py-0.5 shadow-md">
          {badge}
        </span>
      )}

      {/* Row 1 – Icon */}
      <div className="h-[50px] flex items-center mb-2.5">{iconSvg}</div>

      {/* Row 2 – Name */}
      <h3 className="text-[23px] font-semibold text-white mb-0.5 tracking-tight">{name}</h3>

      {/* Row 3 – Subtitle */}
      <p className="h-[18px] text-[13.5px] text-zinc-500 mb-3 tracking-wide">{subtitle}</p>

      {/* Row 4 – Price */}
      <div className="h-[46px] flex items-center mb-3.5">{price}</div>

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
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successModalData, setSuccessModalData] = useState<{
    tier: "lite" | "pro";
    cycle: "monthly" | "yearly";
    isExtension: boolean;
  } | null>(null);

  // Subscription Expiry & Countdown State
  const [subDetails, setSubDetails] = useState<{
    tier: string;
    expiresAt: string | null;
    wasJustExpired: boolean;
    isExpiringSoon: boolean;
    formattedRemaining: string;
    daysRemaining: number;
  } | null>(null);

  const currentTier = ((session?.user as any)?.subscription_tier || subDetails?.tier || "free").toLowerCase();

  const fetchSubDetails = async () => {
    try {
      const res = await fetch("/api/user/subscription");
      if (res.ok) {
        const data = await res.json();
        setSubDetails(data);
        if (data.wasJustExpired) {
          await update({ subscription_tier: "free" });
        }
      }
    } catch (err) {
      console.error("Failed to fetch subscription status:", err);
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchSubDetails();
  }, []);

  const handleUpgrade = async (targetTier: "lite" | "pro") => {
    if (loadingTier) return;
    setLoadingTier(targetTier);
    setErrorMessage(null);
    const isExtension = currentTier === targetTier;

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

      // If Razorpay SDK is available and key is valid, open Razorpay modal
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
                await fetchSubDetails();
                setSuccessModalData({ tier: targetTier, cycle, isExtension });
                if (typeof window !== "undefined") {
                  window.dispatchEvent(new CustomEvent("stockos-notification-refresh"));
                }
              } else {
                throw new Error(verifyData.error || "Payment verification failed");
              }
            } catch (err: any) {
              setErrorMessage(err.message || "Payment verification error");
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
        // Fallback / Development Test Mode
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
          await fetchSubDetails();
          setSuccessModalData({ tier: targetTier, cycle, isExtension });
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("stockos-notification-refresh"));
          }
        } else {
          throw new Error(verifyData.error || "Verification failed");
        }
        setLoadingTier(null);
      }
    } catch (err: any) {
      console.error("[Checkout Error]", err);
      setErrorMessage(err.message || "Something went wrong initiating checkout.");
      setLoadingTier(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] overflow-y-auto text-zinc-300 font-sans selection:bg-zinc-700 selection:text-white flex flex-col relative">

      {/* Heavy Blur Backdrop Overlay when Payment Window is Active */}
      <AnimatePresence>
        {loadingTier && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-40 bg-black/85 backdrop-blur-3xl pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* CELEBRATION SUCCESS MODAL */}
      {/* ================================================================ */}
      <AnimatePresence>
        {successModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop blur overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSuccessModalData(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-2xl"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 25 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#18181c] via-[#111115] to-[#09090b] p-8 shadow-[0_25px_80px_rgba(0,0,0,0.8)] z-10"
            >
              {/* Ambient Glows */}
              <div className="absolute -top-24 -left-24 size-64 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 size-64 rounded-full bg-teal-500/15 blur-3xl pointer-events-none" />

              {/* Close Button */}
              <button
                onClick={() => setSuccessModalData(null)}
                className="absolute top-5 right-5 text-zinc-500 hover:text-white transition-colors p-2 rounded-full hover:bg-white/5"
              >
                <X className="size-5" />
              </button>

              {/* Icon Badge */}
              <div className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.1 }}
                  className={`size-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl relative ${
                    successModalData.tier === "pro"
                      ? "bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-700 shadow-emerald-500/30"
                      : "bg-gradient-to-br from-blue-400 via-indigo-500 to-blue-700 shadow-blue-500/30"
                  }`}
                >
                  {successModalData.tier === "pro" ? (
                    <Crown className="size-10 text-white drop-shadow-md" />
                  ) : (
                    <Zap className="size-10 text-white drop-shadow-md" />
                  )}
                  {/* Floating sparkles badge */}
                  <span className="absolute -top-1.5 -right-1.5 size-7 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <Sparkles className="size-4 text-emerald-600" />
                  </span>
                </motion.div>

                {/* Subtitle Badge */}
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-mono tracking-widest uppercase text-emerald-400 mb-3">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  <span>
                    {successModalData.isExtension ? "Plan Extended" : "Payment Verified"} • Razorpay Secured
                  </span>
                </div>

                {/* Main Heading */}
                <h2 className="text-3xl sm:text-4xl font-outfit font-bold text-white tracking-tight mb-2">
                  {successModalData.isExtension
                    ? `Thank You for Staying with StockOS ${successModalData.tier.toUpperCase()}!`
                    : `Welcome to StockOS ${successModalData.tier.toUpperCase()}!`}
                </h2>

                <p className="text-zinc-400 text-[14.5px] leading-relaxed max-w-sm mb-6">
                  {successModalData.isExtension
                    ? `Your subscription has been successfully extended by +${
                        successModalData.cycle === "monthly" ? "1 Month" : "1 Year"
                      }. We are deeply grateful for your continued trust in building your wealth with us!`
                    : "Your account has been upgraded. All high-performance analytics, alerts, and unlimited capabilities are unlocked."}
                </p>

                {/* Unlocked Features Summary */}
                <div className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 text-left">
                  <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2.5 font-semibold">
                    {successModalData.isExtension
                      ? `EXTENDED ${successModalData.tier.toUpperCase()} BENEFITS (+${
                          successModalData.cycle === "monthly" ? "1 MONTH" : "1 YEAR"
                        })`
                      : `UNLOCKED CAPABILITIES (${successModalData.tier.toUpperCase()})`}
                  </div>
                  <div className="space-y-2">
                    {(successModalData.tier === "pro" ? PRO_FEATURES : LITE_FEATURES).slice(1, 5).map((feature) => (
                      <div key={feature} className="flex items-center gap-2.5 text-[13px] text-zinc-200">
                        <div className="size-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <Check className="size-2.5 stroke-[3]" />
                        </div>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col h-full px-6 pt-[86px] pb-10 w-full max-w-[1200px] mx-auto justify-center relative">

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
        <div className="text-center mb-5 shrink-0 pt-0">
          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 25 }}
            transition={{ duration: 0.95, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="font-outfit text-[46px] sm:text-[64px] font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-zinc-400 leading-none mb-2.5"
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
          <div className="relative inline-flex items-center mt-4">
            {/* Ambient Background Glow */}
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20 blur-lg opacity-70 animate-pulse pointer-events-none" />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="relative inline-flex items-center p-1.5 rounded-full bg-[#111115]/95 border border-white/15 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl z-10 ring-1 ring-white/5"
            >
              <button
                onClick={() => setCycle("monthly")}
                className={`relative px-5 py-2 rounded-full text-[13.5px] font-semibold transition-colors duration-300 z-10 ${cycle === "monthly" ? "text-black font-bold" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                type="button"
              >
                {cycle === "monthly" && (
                  <motion.div
                    layoutId="activeBillingPill"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 border border-emerald-200/50 shadow-[0_0_25px_rgba(16,185,129,0.55)] -z-10"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                Monthly Billing
              </button>

              <button
                onClick={() => setCycle("yearly")}
                className={`relative px-5 py-2 rounded-full text-[13.5px] font-semibold transition-colors duration-300 flex items-center gap-2 z-10 ${cycle === "yearly" ? "text-black font-bold" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                type="button"
              >
                {cycle === "yearly" && (
                  <motion.div
                    layoutId="activeBillingPill"
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400 border border-emerald-200/50 shadow-[0_0_25px_rgba(16,185,129,0.55)] -z-10"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                <span>Annual Billing</span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full transition-all duration-300 ${cycle === "yearly"
                    ? "bg-black/30 text-white border border-black/20 shadow-sm"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    }`}
                >
                  <Sparkles className="size-2.5 shrink-0" />
                  <span>Save 17%</span>
                </span>
              </button>
            </motion.div>
          </div>
        </div>

        {/* Expiry / Status Notification Banners */}
        <AnimatePresence>
          {subDetails?.wasJustExpired && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-xl mx-auto mb-5 p-4 rounded-2xl border text-[13.5px] font-medium flex items-center justify-between shadow-lg bg-amber-950/70 border-amber-500/40 text-amber-200"
            >
              <div className="flex items-center gap-3">
                <Info className="size-5 text-amber-400 shrink-0" />
                <span>Your subscription has expired. You have been automatically shifted back to the Free plan.</span>
              </div>
            </motion.div>
          )}

          {subDetails?.isExpiringSoon && subDetails?.expiresAt && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-xl mx-auto mb-5 p-4 rounded-2xl border text-[13.5px] font-medium flex items-center justify-between shadow-lg bg-yellow-950/70 border-yellow-500/40 text-yellow-200"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="size-5 text-yellow-400 shrink-0" />
                <span>
                  Your <strong>{subDetails.tier.toUpperCase()}</strong> plan expires in{" "}
                  <strong>{subDetails.formattedRemaining}</strong>. Extend now to keep premium features active!
                </span>
              </div>
            </motion.div>
          )}

          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-xl mx-auto mb-6 p-4 rounded-2xl border text-[13.5px] font-medium flex items-center justify-between shadow-lg bg-rose-950/60 border-rose-500/30 text-rose-200"
            >
              <div className="flex items-center gap-3">
                <Sparkles className="size-5 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
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
                    disabled={true}
                    className="w-full h-11 rounded-xl border border-zinc-800 bg-zinc-900/40 text-zinc-500 cursor-default font-semibold text-[13px]"
                    type="button"
                  >
                    {currentTier === "free" ? "Current Plan" : "Included with Paid Plan"}
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
                  <div className="h-[48px] flex items-center overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={cycle}
                        initial={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="flex items-baseline gap-1.5"
                      >
                        <span className="text-[38px] font-semibold text-white tracking-tight">
                          ₹{cycle === "monthly" ? "149" : "1,499"}
                        </span>
                        <span className="text-[13px] text-zinc-500 font-mono">
                          / {cycle === "monthly" ? "Month" : "Year"}
                        </span>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                }
                cta={
                  <div className="w-full">
                    <button
                      disabled={currentTier === "pro" || loadingTier === "lite"}
                      onClick={() => handleUpgrade("lite")}
                      className={`w-full h-11 rounded-xl border text-[13px] font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                        currentTier === "pro"
                          ? "border-zinc-800 bg-zinc-900/40 text-zinc-500 cursor-not-allowed"
                          : currentTier === "lite"
                          ? "border-blue-500/40 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 hover:border-blue-400 active:scale-[0.98] shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                          : "border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.12] hover:border-white/[0.25] text-white active:scale-[0.98]"
                      }`}
                      type="button"
                    >
                      {loadingTier === "lite" ? (
                        <Loader2 className="size-4 animate-spin text-zinc-300" />
                      ) : currentTier === "pro" ? (
                        "Locked (Active Pro Plan)"
                      ) : currentTier === "lite" ? (
                        `Extend Plan • ${subDetails?.formattedRemaining ? `${subDetails.formattedRemaining} Remaining` : "Active"}`
                      ) : (
                        "Upgrade to Lite"
                      )}
                    </button>
                    {currentTier === "pro" && (
                      <div className="mt-2 text-[10.5px] font-mono text-center text-zinc-500">
                        Locked until current plan expires
                      </div>
                    )}
                  </div>
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
                  <div className="h-[48px] flex items-center overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={cycle}
                        initial={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="flex items-baseline gap-1.5"
                      >
                        <span className="text-[38px] font-semibold text-white tracking-tight">
                          ₹{cycle === "monthly" ? "499" : "4,999"}
                        </span>
                        <span className="text-[13px] text-zinc-500 font-mono">
                          / {cycle === "monthly" ? "Month" : "Year"}
                        </span>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                }
                cta={
                  <div className="w-full">
                    <button
                      disabled={currentTier === "lite" || loadingTier === "pro"}
                      onClick={() => handleUpgrade("pro")}
                      className={`w-full h-11 rounded-xl text-[13px] font-semibold tracking-wide transition-all duration-300 flex items-center justify-center gap-2 ${
                        currentTier === "lite"
                          ? "border border-zinc-800 bg-zinc-900/40 text-zinc-500 cursor-not-allowed"
                          : currentTier === "pro"
                          ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 hover:border-emerald-400 active:scale-[0.98] shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                          : "bg-gradient-to-b from-white to-zinc-200 hover:from-white hover:to-white text-black active:scale-[0.98] shadow-[0_4px_20px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.2)]"
                      }`}
                      type="button"
                    >
                      {loadingTier === "pro" ? (
                        <Loader2 className="size-4 animate-spin text-black" />
                      ) : currentTier === "lite" ? (
                        "Locked (Active Lite Plan)"
                      ) : currentTier === "pro" ? (
                        `Extend Plan • ${subDetails?.formattedRemaining ? `${subDetails.formattedRemaining} Remaining` : "Active"}`
                      ) : (
                        "Upgrade to Pro"
                      )}
                    </button>
                    {currentTier === "lite" && (
                      <div className="mt-2 text-[10.5px] font-mono text-center text-zinc-500">
                        Locked until current plan expires
                      </div>
                    )}
                  </div>
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
