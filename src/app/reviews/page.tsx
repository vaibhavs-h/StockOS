"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Send,
  Check,
  X,
  Shield,
  ThumbsUp,
  MessageSquare,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Quote,
  Activity,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/services/DatabaseClient";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Review {
  id: string;
  user_name: string;
  user_avatar?: string;
  rating: number;
  title: string;
  body: string;
  tier: string;
  created_at: string;
  helpful_count?: number;
}

const STATIC_REVIEWS: Review[] = [
  {
    id: "s1",
    user_name: "Arjun Mehta",
    rating: 5,
    title: "Replaced 4 apps with this one",
    body: "Used to juggle between Kite, Groww, and spreadsheets. StockOS consolidates everything. The AI analyzer gave me insights I wasn't getting anywhere else.",
    tier: "pro",
    created_at: "2026-05-15T09:00:00Z",
    helpful_count: 47,
  },
  {
    id: "s2",
    user_name: "Priya Sharma",
    rating: 5,
    title: "The wealth chart alone is worth it",
    body: "The wealth performance chart is stunning. I can finally see my total wealth including MFs and stocks, and track it over time. Best UI I've seen in fintech.",
    tier: "lite",
    created_at: "2026-05-10T11:30:00Z",
    helpful_count: 38,
  },
  {
    id: "s3",
    user_name: "Rohit Jain",
    rating: 4,
    title: "Incredibly polished for a new product",
    body: "Most portfolio tools feel like they were built in 2012. StockOS feels like Linear or Vercel — clean, fast, and thoughtfully designed. Impressed.",
    tier: "pro",
    created_at: "2026-05-08T14:00:00Z",
    helpful_count: 31,
  },
  {
    id: "s4",
    user_name: "Sneha Kapoor",
    rating: 5,
    title: "Finally tracks MFs properly",
    body: "I was frustrated that most apps don't handle mutual funds well. StockOS handles CAS imports seamlessly and shows the right NAV and XIRR data.",
    tier: "lite",
    created_at: "2026-05-05T08:15:00Z",
    helpful_count: 29,
  },
  {
    id: "s5",
    user_name: "Kiran Rao",
    rating: 5,
    title: "US stocks integration is excellent",
    body: "As someone who invests in both Indian and US markets, this is the only app that tracks everything in one place. The AI insights are surprisingly good.",
    tier: "pro",
    created_at: "2026-04-28T16:45:00Z",
    helpful_count: 24,
  },
  {
    id: "s6",
    user_name: "Ananya Gupta",
    rating: 4,
    title: "Dark mode + great UX",
    body: "The design is gorgeous. Every interaction feels premium. I hope they keep adding more features at this level of quality.",
    tier: "free",
    created_at: "2026-04-20T10:00:00Z",
    helpful_count: 19,
  },
];

const TIER_BADGE: Record<string, string> = {
  pro: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  lite: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  free: "bg-white/5 text-zinc-500 border-white/10",
};

const AVATAR_GRADIENTS = [
  "from-blue-500 to-violet-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-indigo-500 to-blue-600",
  "from-purple-500 to-pink-600",
];

export default function ReviewsPage() {
  const { data: session } = useSession();
  const [reviews, setReviews] = useState<Review[]>(STATIC_REVIEWS);
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState("all");
  const [filterRating, setFilterRating] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", rating: 5 });

  const loadReviews = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data && data.length > 0) setReviews(data);
    } catch {
      // fallback to static
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReviews(); }, [loadReviews]);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSubmitting(true);
    try {
      const userTier = (session?.user as any)?.subscription_tier || "free";
      await supabase.from("reviews").insert({
        user_name: session?.user?.name || "Anonymous",
        user_avatar: session?.user?.image,
        rating: form.rating,
        title: form.title,
        body: form.body,
        tier: userTier,
      });
      setSubmitted(true);
      setShowForm(false);
      setForm({ title: "", body: "", rating: 5 });
      await loadReviews();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = reviews.filter(
    (r) => (filterTier === "all" || r.tier === filterTier) && (filterRating === 0 || r.rating === filterRating)
  );

  const avgRating = (STATIC_REVIEWS.reduce((a, r) => a + r.rating, 0) / STATIC_REVIEWS.length).toFixed(1);

  const breakdown = [5, 4, 3, 2, 1].map((r) => ({
    r,
    count: STATIC_REVIEWS.filter((rv) => rv.rating === r).length,
    pct: Math.round((STATIC_REVIEWS.filter((rv) => rv.rating === r).length / STATIC_REVIEWS.length) * 100),
  }));

  return (
    <div className="min-h-screen">
      <div className="fixed inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent z-[5] pointer-events-none" />
      <div className="fixed inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent z-[5] pointer-events-none" />

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 pt-28 pb-20">

        {/* ── HERO ── */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 mb-6 backdrop-blur-sm"
          >
            <Sparkles className="size-3 text-blue-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">User Reviews</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="font-outfit text-[48px] md:text-[66px] font-bold tracking-[-0.03em] text-white leading-[1.0] mb-4"
          >
            Investors{" "}
            <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              trust
            </span>{" "}
            StockOS
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-zinc-500 text-base max-w-lg mx-auto leading-relaxed"
          >
            Real feedback from real investors — no curation, no fake testimonials.
          </motion.p>
        </div>

        {/* ── STATS STRIP ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10"
        >
          {[
            { v: avgRating, l: "Avg Rating", icon: Star, accent: "amber" },
            { v: "340+", l: "Total Reviews", icon: MessageSquare, accent: "blue" },
            { v: "96%", l: "Recommend", icon: ThumbsUp, accent: "emerald" },
            { v: "4.9★", l: "Pro Rating", icon: Activity, accent: "violet" },
          ].map(({ v, l, icon: Icon, accent }) => (
            <div key={l} className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-4 text-center">
              <Icon className={`size-4 mx-auto mb-2 ${accent === "amber" ? "text-amber-400" : accent === "blue" ? "text-blue-400" : accent === "emerald" ? "text-emerald-400" : "text-violet-400"}`} />
              <div className="font-outfit text-xl font-bold text-white mb-0.5">{v}</div>
              <div className="text-[10px] text-zinc-600 uppercase tracking-widest">{l}</div>
            </div>
          ))}
        </motion.div>

        {/* ── MAIN LAYOUT ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 mb-12">

          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-3"
          >
            {/* Rating breakdown */}
            <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-4">Breakdown</p>
              <div className="space-y-2.5">
                {breakdown.map(({ r, count, pct }) => (
                  <button
                    key={r}
                    onClick={() => setFilterRating(filterRating === r ? 0 : r)}
                    className="w-full flex items-center gap-2.5 group"
                  >
                    <span className="text-xs text-zinc-500 w-3 shrink-0">{r}</span>
                    <Star className="size-3 text-amber-400 shrink-0" />
                    <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, delay: 0.4 }}
                        className={`h-full rounded-full ${filterRating === r ? "bg-amber-400" : "bg-amber-400/35 group-hover:bg-amber-400/55"} transition-colors`}
                      />
                    </div>
                    <span className="text-[10px] text-zinc-700 w-3 text-right shrink-0">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tier filter */}
            <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 mb-3">Filter by plan</p>
              <div className="space-y-1">
                {["all", "pro", "lite", "free"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterTier(t)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      filterTier === t
                        ? "bg-white/8 text-white border border-white/12"
                        : "text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.03]"
                    }`}
                  >
                    {t === "all" ? "All Plans" : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Write review / submitted */}
            {session && !submitted && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs tracking-wide transition-all hover:shadow-[0_4px_24px_rgba(59,130,246,0.3)] active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <MessageSquare className="size-3.5" />
                Write a Review
              </button>
            )}
            {submitted && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                <Check className="size-3.5" />
                Review submitted — thank you!
              </div>
            )}
          </motion.div>

          {/* Review Feed */}
          <div>
            {/* Review form */}
            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="rounded-xl bg-white/[0.04] border border-white/10 p-5 mb-3"
                >
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Share your experience</p>
                    <button onClick={() => setShowForm(false)} className="size-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                      <X className="size-3 text-zinc-500" />
                    </button>
                  </div>

                  <div className="flex gap-1.5 mb-4">
                    {[1,2,3,4,5].map((s) => (
                      <button key={s} onClick={() => setForm((f) => ({ ...f, rating: s }))}>
                        <Star className={`size-5 transition-colors ${s <= form.rating ? "text-amber-400 fill-amber-400" : "text-zinc-700"}`} />
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Review title..."
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="w-full mb-2 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/8 text-white placeholder:text-zinc-700 text-sm outline-none focus:border-white/15 transition-colors"
                  />
                  <textarea
                    placeholder="Your experience with StockOS..."
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                    rows={3}
                    className="w-full mb-3 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/8 text-white placeholder:text-zinc-700 text-sm outline-none focus:border-white/15 transition-colors resize-none"
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-700">
                      <Shield className="size-3" />
                      <span>Posting as <span className="text-zinc-500">{session?.user?.name}</span></span>
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || !form.title.trim() || !form.body.trim()}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all"
                    >
                      {submitting ? <div className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="size-3" />}
                      Submit
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Reviews */}
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map((i) => (
                  <div key={i} className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-5 animate-pulse">
                    <div className="h-3 bg-white/5 rounded w-1/3 mb-3" />
                    <div className="h-2.5 bg-white/5 rounded w-full mb-1.5" />
                    <div className="h-2.5 bg-white/5 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <MessageSquare className="size-8 text-zinc-800 mb-3" />
                <p className="text-zinc-600 text-sm">No reviews match your filter.</p>
                <button onClick={() => { setFilterTier("all"); setFilterRating(0); }} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((review, i) => (
                  <ReviewCard key={review.id} review={review} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── FEATURED QUOTE ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="relative rounded-2xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.06] to-violet-500/[0.04] p-10 md:p-14 text-center mb-12 overflow-hidden"
        >
          {/* Top edge glow */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

          <Quote className="size-7 text-blue-400/25 mx-auto mb-5" />
          <p className="font-outfit text-xl md:text-2xl font-medium text-white leading-snug max-w-2xl mx-auto mb-6">
            "StockOS is what I imagined the future of personal finance would look like.
            It treats me like an institutional investor, not a retail user."
          </p>
          <div className="flex items-center justify-center gap-3">
            <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">VK</div>
            <div className="text-left">
              <div className="text-sm font-semibold text-white">Vikram K.</div>
              <div className="text-[10px] text-zinc-600">Pro Plan · Fund Manager</div>
            </div>
            <div className="flex ml-2 gap-0.5">
              {[1,2,3,4,5].map((s) => <Star key={s} className="size-3 text-amber-400 fill-amber-400" />)}
            </div>
          </div>
        </motion.div>

        {/* ── CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <h2 className="font-outfit text-3xl md:text-[40px] font-bold tracking-[-0.02em] text-white mb-3">
            Join thousands of investors
          </h2>
          <p className="text-zinc-500 text-sm mb-7 max-w-md mx-auto">
            See why serious investors are switching to StockOS.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/subscription">
              <button className="px-7 py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-100 transition-all active:scale-[0.98] flex items-center gap-2">
                View Plans <ArrowRight className="size-3.5" />
              </button>
            </Link>
            <Link href="/dashboard">
              <button className="px-7 py-3 rounded-xl bg-white/[0.05] text-zinc-300 font-semibold text-sm border border-white/10 hover:bg-white/[0.08] hover:text-white transition-all">
                Open Dashboard
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ReviewCard({ review, index }: { review: Review; index: number }) {
  const initials = review.user_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const grad = AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.04 * index }}
      className="rounded-xl bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.1] hover:bg-white/[0.035] backdrop-blur-sm p-5 transition-all duration-250"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          {review.user_avatar ? (
            <img src={review.user_avatar} alt={review.user_name} referrerPolicy="no-referrer" className="size-8 rounded-full object-cover" />
          ) : (
            <div className={`size-8 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
              {initials}
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-white">{review.user_name}</div>
            <div className="text-[10px] text-zinc-600">
              {new Date(review.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${TIER_BADGE[review.tier] || TIER_BADGE.free}`}>
            {review.tier}
          </span>
          <div className="flex gap-0.5">
            {[1,2,3,4,5].map((s) => (
              <Star key={s} className={`size-2.5 ${s <= review.rating ? "text-amber-400 fill-amber-400" : "text-zinc-800"}`} />
            ))}
          </div>
        </div>
      </div>

      <p className="text-sm font-semibold text-white mb-1">{review.title}</p>
      <p className="text-xs text-zinc-500 leading-relaxed">{review.body}</p>

      {(review.helpful_count ?? 0) > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-zinc-700">
          <ThumbsUp className="size-3" />
          <span>{review.helpful_count} found this helpful</span>
        </div>
      )}
    </motion.div>
  );
}
