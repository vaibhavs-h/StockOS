"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Sparkles,
  Shield,
  Zap,
  BarChart2,
  Brain,
  Globe,
  Lock,
  ChevronRight,
  Star,
  CreditCard,
  TrendingUp,
  Activity,
  Layers,
  ArrowRight,
  Clock,
} from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "Start tracking your portfolio",
    accent: "zinc",
    features: [
      { text: "1 portfolio", ok: true },
      { text: "Up to 20 holdings", ok: true },
      { text: "Basic P&L tracking", ok: true },
      { text: "Market search", ok: true },
      { text: "AI Portfolio Analyzer", ok: false },
      { text: "Mutual Fund tracking", ok: false },
      { text: "US Stocks", ok: false },
      { text: "Journal & notes", ok: false },
      { text: "Priority support", ok: false },
    ],
  },
  {
    id: "lite",
    name: "Lite",
    priceMonthly: 199,
    tagline: "For active retail investors",
    accent: "blue",
    badge: "POPULAR",
    features: [
      { text: "3 portfolios", ok: true },
      { text: "Unlimited holdings", ok: true },
      { text: "Advanced P&L analytics", ok: true },
      { text: "Market search", ok: true },
      { text: "AI Portfolio Analyzer", ok: true },
      { text: "Mutual Fund tracking", ok: true },
      { text: "US Stocks", ok: false },
      { text: "Journal & notes", ok: true },
      { text: "Priority support", ok: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 499,
    tagline: "For serious investors & traders",
    accent: "emerald",
    badge: "BEST VALUE",
    features: [
      { text: "Unlimited portfolios", ok: true },
      { text: "Unlimited holdings", ok: true },
      { text: "Advanced P&L analytics", ok: true },
      { text: "Market search", ok: true },
      { text: "AI Portfolio Analyzer", ok: true },
      { text: "Mutual Fund tracking", ok: true },
      { text: "US Stocks", ok: true },
      { text: "Journal & notes", ok: true },
      { text: "Priority support", ok: true },
    ],
  },
];

const ACCENT = {
  zinc: {
    border: "border-white/10",
    glow: "",
    text: "text-zinc-400",
    bg: "bg-zinc-400",
    ring: "",
    btn: "bg-white/8 hover:bg-white/12 text-white border border-white/10",
    check: "text-zinc-300 bg-white/8",
    badge: "",
  },
  blue: {
    border: "border-blue-500/40",
    glow: "shadow-[0_0_80px_rgba(59,130,246,0.12),0_0_30px_rgba(59,130,246,0.08)] hover:shadow-[0_0_100px_rgba(59,130,246,0.18)]",
    text: "text-blue-400",
    bg: "bg-blue-500",
    ring: "ring-1 ring-blue-500/20",
    btn: "bg-blue-500 hover:bg-blue-400 text-white hover:shadow-[0_4px_24px_rgba(59,130,246,0.4)]",
    check: "text-blue-400 bg-blue-500/15",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  },
  emerald: {
    border: "border-emerald-500/40",
    glow: "shadow-[0_0_80px_rgba(16,185,129,0.12),0_0_30px_rgba(16,185,129,0.08)] hover:shadow-[0_0_100px_rgba(16,185,129,0.18)]",
    text: "text-emerald-400",
    bg: "bg-emerald-500",
    ring: "ring-1 ring-emerald-500/20",
    btn: "bg-emerald-500 hover:bg-emerald-400 text-black hover:shadow-[0_4px_24px_rgba(16,185,129,0.4)]",
    check: "text-emerald-400 bg-emerald-500/15",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  },
};

const STATS = [
  { v: "12,400+", l: "Active Users", icon: Activity },
  { v: "38,000+", l: "Portfolios", icon: Layers },
  { v: "₹480 Cr+", l: "Assets Tracked", icon: TrendingUp },
  { v: "99.9%", l: "Uptime SLA", icon: Clock },
];

const FEATURES = [
  { icon: Brain, title: "AI Portfolio Intelligence", desc: "Deep holdings analysis, sector concentration, return attribution.", color: "emerald" },
  { icon: Globe, title: "Global Markets", desc: "Indian equities, mutual funds, US stocks & ETFs — unified.", color: "blue" },
  { icon: BarChart2, title: "Wealth Performance", desc: "Interactive wealth charts with XIRR & benchmark comparison.", color: "violet" },
  { icon: Shield, title: "Bank-Grade Security", desc: "Encrypted at rest & transit. No brokerage credentials stored.", color: "amber" },
];

const FAQS = [
  { q: "Can I switch plans anytime?", a: "Yes. Upgrade or downgrade at any time. Changes apply from the next billing cycle." },
  { q: "Is my financial data safe?", a: "All data is encrypted at rest and in transit. We never store brokerage credentials or have write access to your accounts." },
  { q: "Do you support mutual funds and US stocks?", a: "Lite includes Indian equities and mutual funds. Pro adds US stocks, ETFs, and global markets." },
  { q: "What is the AI Portfolio Analyzer?", a: "An AI engine that analyzes your portfolio for sector concentration, risk, return attribution, and gives institutional-grade insights." },
];

export default function SubscriptionPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const tier: string = (session?.user as any)?.subscription_tier || "free";

  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="min-h-screen">
      {/* Edge fades */}
      <div className="fixed inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent z-[5] pointer-events-none" />
      <div className="fixed inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent z-[5] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-28 pb-20">

        {/* ── HERO ── */}
        <div className="text-center mb-14">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 mb-6 backdrop-blur-sm"
          >
            <Sparkles className="size-3 text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">Plans & Pricing</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-outfit text-[52px] md:text-[72px] font-bold tracking-[-0.03em] text-white leading-[1.0] mb-5"
          >
            Invest with{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
                precision
              </span>
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-gradient-to-r from-emerald-400/0 via-teal-300/60 to-blue-400/0" />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-zinc-400 text-lg max-w-xl mx-auto leading-relaxed mb-8"
          >
            One platform. Every market. Unlimited intelligence.
          </motion.p>

          {/* Billing toggle */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-sm"
          >
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${!annual ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${annual ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
            >
              Annual
              <span className={`text-[10px] font-black uppercase tracking-wider ${annual ? "text-emerald-600" : "text-emerald-400"}`}>−25%</span>
            </button>
          </motion.div>

          {/* Current plan pill */}
          {mounted && session && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]"
            >
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              <span className="text-[11px] text-zinc-500">
                Current:{" "}
                <span className={`font-bold uppercase ${tier === "pro" ? "text-emerald-400" : tier === "lite" ? "text-blue-400" : "text-zinc-400"}`}>
                  {tier}
                </span>
              </span>
            </motion.div>
          )}
        </div>

        {/* ── PRICING CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
          {PLANS.map((plan, i) => {
            const a = ACCENT[plan.accent as keyof typeof ACCENT];
            const isCurrent = mounted && tier === plan.id;
            const price = plan.priceMonthly === 0 ? 0 : annual ? Math.round(plan.priceMonthly * 0.75) : plan.priceMonthly;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: i * 0.08 + 0.15, ease: [0.16, 1, 0.3, 1] }}
                className={`relative rounded-2xl border ${a.border} ${a.glow} ${a.ring} backdrop-blur-xl transition-all duration-500 cursor-default overflow-hidden ${
                  plan.accent === "pro" || plan.id === "pro"
                    ? "bg-gradient-to-b from-[#0c130f] to-[#070a08]"
                    : plan.id === "lite"
                    ? "bg-gradient-to-b from-[#090d14] to-[#060709]"
                    : "bg-[#080808]"
                }`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className={`absolute top-0 inset-x-0 flex justify-center`}>
                    <div className={`px-4 py-1 text-[10px] font-black uppercase tracking-[0.2em] border-b border-x rounded-b-lg ${a.badge}`}>
                      {plan.badge}
                    </div>
                  </div>
                )}

                <div className="p-7 pt-8">
                  {/* Plan name */}
                  <div className="flex items-center justify-between mb-5">
                    <span className={`text-[11px] font-black uppercase tracking-[0.28em] ${a.text}`}>
                      {plan.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 border border-white/15 rounded-full px-2 py-0.5">
                        Active
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mb-1 flex items-baseline gap-1.5">
                    <span className="font-outfit text-[42px] font-bold text-white leading-none">
                      {plan.priceMonthly === 0 ? "₹0" : `₹${price}`}
                    </span>
                    <span className="text-xs text-zinc-600 font-medium">
                      {plan.priceMonthly === 0 ? "forever" : annual ? "/mo, billed yearly" : "/month"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 mb-6">{plan.tagline}</p>

                  {/* Divider */}
                  <div className={`h-px mb-5 ${plan.accent === "zinc" ? "bg-white/5" : plan.accent === "blue" ? "bg-blue-500/15" : "bg-emerald-500/15"}`} />

                  {/* Features */}
                  <ul className="space-y-2.5 mb-7">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-center gap-2.5">
                        <span className={`shrink-0 size-[18px] rounded-md flex items-center justify-center text-[10px] ${f.ok ? a.check : "bg-transparent text-zinc-700"}`}>
                          {f.ok ? <Check className="size-2.5" strokeWidth={3} /> : <span className="size-1 rounded-full bg-zinc-800 inline-block" />}
                        </span>
                        <span className={`text-[13px] ${f.ok ? "text-zinc-200" : "text-zinc-700"}`}>
                          {f.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    disabled={isCurrent}
                    className={`w-full py-2.5 rounded-xl text-[13px] font-bold tracking-wide transition-all duration-200 active:scale-[0.98] ${
                      isCurrent ? "bg-white/4 text-zinc-600 cursor-default" : a.btn
                    }`}
                  >
                    {isCurrent ? "Current Plan" : plan.priceMonthly === 0 ? "Get Started Free" : `Upgrade to ${plan.name}`}
                  </button>
                </div>

                {/* Inner top glow */}
                {plan.accent !== "zinc" && (
                  <div className={`absolute top-0 inset-x-0 h-[1px] ${plan.accent === "blue" ? "bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" : "bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"}`} />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* ── STATS ROW ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-14"
        >
          {STATS.map(({ v, l, icon: Icon }) => (
            <div key={l} className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-5 text-center">
              <Icon className="size-4 text-zinc-600 mx-auto mb-2" />
              <div className="font-outfit text-xl font-bold text-white mb-0.5">{v}</div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest">{l}</div>
            </div>
          ))}
        </motion.div>

        {/* ── FEATURE GRID ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mb-14"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 text-center mb-6">
            What's inside
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              const map: Record<string, string> = {
                emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
                amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
              };
              const cls = map[f.color];
              return (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i + 0.5 }}
                  className="flex gap-4 p-5 rounded-xl bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.035] transition-all duration-300"
                >
                  <div className={`shrink-0 size-9 rounded-lg border flex items-center justify-center ${cls}`}>
                    <Icon className={`size-4 ${cls.split(" ")[0]}`} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white mb-0.5">{f.title}</div>
                    <div className="text-xs text-zinc-500 leading-relaxed">{f.desc}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ── TRUST BAR ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-wrap justify-center gap-6 py-6 px-6 rounded-xl bg-white/[0.02] border border-white/[0.05] mb-14"
        >
          {[
            { icon: Lock, t: "256-bit encryption" },
            { icon: Shield, t: "No brokerage credentials" },
            { icon: Zap, t: "99.9% uptime SLA" },
            { icon: CreditCard, t: "Cancel anytime" },
            { icon: Star, t: "Backed by real investors" },
          ].map(({ icon: Icon, t }) => (
            <div key={t} className="flex items-center gap-2 text-zinc-600">
              <Icon className="size-3.5" />
              <span className="text-xs font-medium">{t}</span>
            </div>
          ))}
        </motion.div>

        {/* ── FAQ ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="mb-14"
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-600 text-center mb-6">
            FAQ
          </p>
          <div className="max-w-2xl mx-auto space-y-2">
            {FAQS.map((item, i) => (
              <div
                key={i}
                className={`rounded-xl border transition-all duration-200 cursor-pointer ${openFaq === i ? "border-white/12 bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.09]"}`}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm font-medium text-white">{item.q}</span>
                  <motion.div animate={{ rotate: openFaq === i ? 90 : 0 }} transition={{ duration: 0.18 }}>
                    <ChevronRight className={`size-3.5 transition-colors ${openFaq === i ? "text-emerald-400" : "text-zinc-600"}`} />
                  </motion.div>
                </div>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-sm text-zinc-500 leading-relaxed">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── BOTTOM CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <h2 className="font-outfit text-3xl md:text-[44px] font-bold tracking-[-0.02em] text-white mb-3">
            Start free. Scale when ready.
          </h2>
          <p className="text-zinc-500 text-sm mb-8 max-w-md mx-auto">
            No credit card required. Upgrade when your portfolio demands it.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard">
              <button className="px-7 py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-100 transition-all active:scale-[0.98] flex items-center gap-2">
                Open Dashboard <ArrowRight className="size-3.5" />
              </button>
            </Link>
            <Link href="/reviews">
              <button className="px-7 py-3 rounded-xl bg-white/[0.05] text-zinc-300 font-semibold text-sm border border-white/10 hover:bg-white/[0.08] hover:text-white transition-all">
                Read Reviews
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
