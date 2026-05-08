"use client";

import { useState } from "react";
import { Footer } from "@/components/shared/Footer";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Zap, Star, Shield, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import axios from "axios";

/** Plan configuration — single source of truth */
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "/month",
    description: "Perfect for beginners exploring the market",
    cta: "Get Started",
    popular: false,
    icon: Star,
    features: [
      { text: "10 AI Chat Requests", included: true },
      { text: "Basic market data", included: true },
      { text: "Portfolio tracking (1 portfolio)", included: true },
      { text: "Advanced analytics", included: false },
      { text: "Custom alerts", included: false },
    ],
  },
  {
    id: "lite",
    name: "Lite",
    price: 199,
    period: "/month",
    description: "For active traders who need more insights",
    cta: "Upgrade",
    popular: false,
    icon: Zap,
    features: [
      { text: "20 AI Chat Requests/Per Day", included: true },
      { text: "Real-time market data", included: true },
      { text: "Portfolio tracking (5 portfolios)", included: true },
      { text: "Email support", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Priority support", included: false },
      { text: "Custom alerts", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 499,
    period: "/month",
    description: "Maximum power for serious investors",
    cta: "Upgrade",
    popular: true,
    icon: Award,
    features: [
      { text: "50 AI Chat Requests/Per day", included: true },
      { text: "Real-time market data", included: true },
      { text: "Unlimited portfolio tracking", included: true },
      { text: "Priority 24/7 support", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Custom alerts & webhooks", included: true },
      { text: "API access", included: true },
    ],
  },
];

export default function PricingPage() {
  const { data: session, update } = useSession();
  const currentTier = (session?.user as any)?.subscription_tier || 'free';

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  /** Subscribe to a plan */
  const handleSubscribe = async (planId: string) => {
    if (!session) {
      setToast({ message: "Please sign in to upgrade", type: "error" });
      return;
    }

    if (planId === currentTier) {
      setToast({ message: "You are already on this plan", type: "success" });
      return;
    }

    setIsUpdating(planId);
    setToast(null);

    try {
      const res = await axios.post('/api/user/subscription', { tier: planId });

      if (res.data.success) {
        setToast({
          message: `Successfully activated ${planId.toUpperCase()} plan!`,
          type: "success",
        });
        // Update the session to reflect new tier
        await update();
      }
    } catch (err: any) {
      setToast({
        message: err.response?.data?.error || "Failed to update subscription",
        type: "error"
      });
    } finally {
      setIsUpdating(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col overflow-x-hidden bg-transparent">

      <main className="relative z-10 flex-1 py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-20">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8"
            >
              Institutional Pricing
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl sm:text-7xl font-black tracking-tighter text-white mb-6 uppercase"
            >
              Choose Your{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600">
                Plan
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-zinc-400 max-w-2xl mx-auto font-medium"
            >
              Start free and scale as you grow. All plans include core features.
              Upgrade anytime for institutional grade insights.
            </motion.p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {PLANS.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "relative group",
                  plan.popular && "md:-mt-4 md:mb-4"
                )}
              >
                {/* Glow Effect for Popular */}
                {plan.popular && (
                  <div className="absolute -inset-1 bg-gradient-to-b from-emerald-500/20 to-transparent blur-2xl rounded-[2rem] opacity-50" />
                )}

                <div className={cn(
                  "relative h-full glass-panel rounded-3xl p-8 flex flex-col border transition-all duration-500",
                  plan.popular
                    ? "bg-zinc-950/60 border-emerald-500/30 shadow-[0_20px_50px_rgba(16,185,129,0.15)]"
                    : "bg-zinc-950/40 border-white/5 hover:border-white/10"
                )}>
                  {/* Plan Icon & Name */}
                  <div className="mb-8">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center mb-6 border transition-transform duration-500 group-hover:scale-110",
                      plan.popular
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-white/5 border-white/10 text-zinc-400"
                    )}>
                      <plan.icon className="size-6" />
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                        {plan.name}
                      </h3>
                      {plan.popular && (
                        <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500 text-black">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 font-medium leading-relaxed">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-8 flex items-baseline gap-1">
                    <span className="text-xl text-zinc-500 font-bold">₹</span>
                    <span className="text-5xl font-black tracking-tighter text-white">
                      {plan.price}
                    </span>
                    <span className="text-zinc-500 text-sm font-bold ml-1">{plan.period}</span>
                  </div>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={isUpdating !== null || currentTier === plan.id}
                    className={cn(
                      "w-full py-4 px-6 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all duration-300 mb-8 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
                      plan.id === currentTier
                        ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        : plan.popular
                          ? "bg-emerald-500 text-black hover:bg-emerald-400 shadow-[0_10px_20px_rgba(16,185,129,0.2)] hover:shadow-[0_15px_30px_rgba(16,185,129,0.3)]"
                          : "bg-white/5 border border-white/10 text-white hover:bg-white/10"
                    )}
                  >
                    {isUpdating === plan.id ? (
                      <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto" />
                    ) : plan.id === currentTier ? (
                      "Current Plan"
                    ) : (
                      plan.cta
                    )}
                  </button>

                  {/* Features */}
                  <div className="space-y-4 flex-1">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6">
                      Institutional Features
                    </p>
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className={cn(
                          "mt-0.5 rounded-full p-0.5 flex-shrink-0",
                          feature.included ? "text-emerald-500" : "text-zinc-700"
                        )}>
                          {feature.included ? <Check className="size-4" /> : <X className="size-4" />}
                        </div>
                        <span className={cn(
                          "text-xs font-medium tracking-tight leading-relaxed",
                          feature.included ? "text-zinc-300" : "text-zinc-600 line-through"
                        )}>
                          {feature.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Footer Note */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-center mt-20"
          >
            <p className="text-sm text-zinc-500 font-medium">
              All plans include a 14-day free trial. No credit card required. <br />
              Institutional grade encryption is active for all transactions.
            </p>
          </motion.div>
        </div>
      </main>

      <Footer />

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-12 right-12 z-[200]"
          >
            <div className={cn(
              "px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-4",
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center",
                toast.type === "success" ? "bg-emerald-500 text-black" : "bg-red-500 text-white"
              )}>
                {toast.type === "success" ? <Check className="size-4 font-bold" /> : <X className="size-4 font-bold" />}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{toast.type === "success" ? "Operation Successful" : "System Error"}</span>
                <span className="font-bold tracking-tight">{toast.message}</span>
              </div>
              <button
                onClick={() => setToast(null)}
                className="ml-4 p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="size-4 opacity-40 hover:opacity-100" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
