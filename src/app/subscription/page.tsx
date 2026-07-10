"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";

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
  "Up to 3 Portfolios",
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

      {/* Row 1 – Icon (fixed height) */}
      <div className="h-[52px] flex items-center mb-3">{iconSvg}</div>

      {/* Row 2 – Name */}
      <h3 className="text-[23px] font-semibold text-white mb-0.5 tracking-tight">{name}</h3>

      {/* Row 3 – Subtitle (fixed height keeps cards in sync) */}
      <p className="h-[18px] text-[13.5px] text-zinc-500 mb-3.5 tracking-wide">{subtitle}</p>

      {/* Row 4 – Price (fixed height) */}
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    // header = h-20 (80px), fill exactly the remaining viewport
    <div className="h-[calc(100vh-80px)] overflow-hidden text-zinc-300 font-sans selection:bg-zinc-700 selection:text-white flex flex-col">
      <div className="flex flex-col h-full px-6 pt-24 pb-8 w-full max-w-[1200px] mx-auto justify-center relative">

        {/* Back Button positioned absolutely to not interfere with vertical centering */}
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
        <div className="text-center mb-10 shrink-0">
          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 25 }}
            transition={{ duration: 0.95, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="font-outfit text-[54px] sm:text-[72px] font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-zinc-400 leading-none mb-3.5"
          >
            Plans That Grow With Your Portfolio
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
            transition={{ duration: 0.95, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="text-[21px] text-zinc-400/90 leading-relaxed max-w-3xl mx-auto"
          >
            Built For Serious Investors. Start Free, Scale When You're Ready.
          </motion.p>
        </div>

        {/* Cards — perfectly fit their content height and vertically centered */}
        <div className="flex flex-col lg:flex-row gap-5 items-stretch justify-center shrink-0">
          {mounted ? (
            <AnimatePresence mode="wait">

              {/* Free */}
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
                    <span className="text-[13px] text-zinc-650 ml-2 font-mono">/ Month</span>
                  </div>
                }
                cta={
                  <button
                    className="w-full h-11 rounded-xl border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 tracking-wide text-[13px] font-semibold transition-all duration-300 active:scale-[0.98] hover:scale-[1.01] shadow-inner"
                    type="button"
                  >
                    Get Started Free
                  </button>
                }
                features={FREE_FEATURES}
                checkColor="text-zinc-600"
                firstFeatureColor="text-zinc-300"
              />

              {/* Lite */}
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
                  <div className="flex items-baseline gap-2">
                    <span className="text-[30px] font-semibold text-zinc-500 tracking-tight italic">TBD</span>
                    <span className="text-[11px] text-zinc-600 font-mono">Pricing Coming Soon</span>
                  </div>
                }
                cta={
                  <button
                    className="w-full h-11 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/[0.2] text-zinc-300 hover:text-white tracking-wide text-[13px] font-semibold transition-all duration-300 active:scale-[0.98] hover:scale-[1.01]"
                    type="button"
                  >
                    Join Waitlist
                  </button>
                }
                features={LITE_FEATURES}
                checkColor="text-zinc-500"
                firstFeatureColor="text-zinc-300"
              />

              {/* Pro */}
              <PlanCard
                planKey="pro"
                delay={0.37}
                name="Pro"
                subtitle="Unlimited, Global, Intelligent"
                topLine
                badge="Most Powerful"
                cardClass="border border-white/[0.1] bg-gradient-to-b from-[#18181b] to-[#09090b] hover:border-white/[0.2]"
                iconSvg={
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-zinc-300 text-zinc-300 transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:rotate-[30deg]">
                    <circle cx="12" cy="12" r="9" strokeWidth="1.5" strokeDasharray="3 3" />
                    <circle cx="12" cy="12" r="5" strokeWidth="2" />
                    <path d="M12 12L18 6M18 6H14 M18 6V10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  </svg>
                }
                price={
                  <div className="flex items-baseline gap-2">
                    <span className="text-[30px] font-semibold text-zinc-500 tracking-tight italic">TBD</span>
                    <span className="text-[11px] text-zinc-600 font-mono">Pricing Coming Soon</span>
                  </div>
                }
                cta={
                  <button
                    className="w-full h-11 rounded-xl bg-gradient-to-b from-white to-zinc-100 hover:from-white hover:to-white text-[13px] font-semibold tracking-wide text-black transition-all duration-300 active:scale-[0.98] hover:scale-[1.01] shadow-[0_4px_20px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.18)]"
                    type="button"
                  >
                    Join Waitlist
                  </button>
                }
                features={PRO_FEATURES}
                checkColor="text-zinc-400"
                firstFeatureColor="text-zinc-200"
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
