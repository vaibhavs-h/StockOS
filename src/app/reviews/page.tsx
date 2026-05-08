"use client";

import { useState, useEffect, useCallback } from "react";
import { Footer } from "@/components/shared/Footer";
import { motion, AnimatePresence } from "framer-motion";
import { Star, MessageSquare, Filter, Send, Check, X, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** 
 * API Configuration
 */
const API_URL = (process.env.NEXT_PUBLIC_FEEDBACK_URL || "http://localhost:5001").replace(/\/$/, "");

interface Review {
  _id: string;
  userName: string;
  rating: number;
  liked: string;
  feedback: string;
  createdAt: string;
}

/** Star display component */
function Stars({
  rating,
  size = "md",
  interactive = false,
  onRate,
}: {
  rating: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRate?: (r: number) => void;
}) {
  const [hover, setHover] = useState(0);

  const sizes = {
    sm: "size-4",
    md: "size-5",
    lg: "size-8"
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          className={cn(
            "transition-all duration-200",
            interactive ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default"
          )}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => onRate && onRate(star)}
        >
          <Star
            className={cn(
              sizes[size],
              "transition-colors duration-150",
              (hover || rating) >= star
                ? "fill-emerald-500 text-emerald-500"
                : "fill-transparent text-zinc-700"
            )}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}

/** Format date to readable string */
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sortBy, setSortBy] = useState("latest");
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Form state
  const [form, setForm] = useState({
    userName: "",
    rating: 0,
    liked: "",
    feedback: "",
  });

  /** Fetch reviews from API */
  const fetchReviews = useCallback(async () => {
    setLoadingReviews(true);
    const targetUrl = `${API_URL}/api/reviews?sort=${sortBy}`;

    try {
      console.log(`🌐 Fetching: ${targetUrl}`);
      const res = await fetch(targetUrl);

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      if (data.success) {
        setReviews(data.data);
      }
    } catch (err: any) {
      console.error("❌ Failed to fetch reviews:", err);
      // Don't show toast for initial fetch if empty, maybe just a console warning
    } finally {
      setLoadingReviews(false);
    }
  }, [sortBy]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  /** Submit a new review */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.rating === 0) {
      setToast({ message: "Please select a star rating", type: "error" });
      return;
    }

    setSubmitting(true);
    setToast(null);

    const targetUrl = `${API_URL}/api/reviews`;

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        let errorData;
        try {
          errorData = await res.json();
        } catch (e) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        throw new Error(errorData.error || errorData.errors?.[0]?.msg || `Submission failed (${res.status})`);
      }

      const data = await res.json();

      if (data.success) {
        setToast({ message: "Review submitted successfully!", type: "success" });
        setForm({ userName: "", rating: 0, liked: "", feedback: "" });
        fetchReviews();
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err: any) {
      console.error("❌ Submit error:", err);
      setToast({
        message: err.message === "Failed to fetch"
          ? `Network Error: Could not reach backend.`
          : (err.message || "Something went wrong"),
        type: "error",
      });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  /** Average rating across all reviews */
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : "0.0";

  return (
    <div className="relative min-h-screen w-full flex flex-col overflow-x-hidden bg-transparent">

      <main className="relative z-10 flex-1 py-32 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-20">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-8"
            >
              <Star className="size-3 fill-emerald-500" /> Community Feedback
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl sm:text-7xl font-black tracking-tighter text-white mb-6 uppercase"
            >
              Trader{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600">
                Insights
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-zinc-400 max-w-xl mx-auto font-medium"
            >
              Real feedback from the front lines of retail trading. Share your terminal experience.
            </motion.p>

            {/* Aggregate stats */}
            {reviews.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col items-center gap-3 mt-10"
              >
                <div className="flex items-center gap-4 bg-zinc-950/60 border border-white/5 px-6 py-3 rounded-2xl backdrop-blur-xl">
                  <span className="text-4xl font-black tracking-tighter text-white tabular-nums">{avgRating}</span>
                  <div className="flex flex-col items-start">
                    <Stars rating={Math.round(parseFloat(avgRating))} size="sm" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-1">
                      Based on {reviews.length} Research Reports
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Review Form Container */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass-panel rounded-3xl p-8 mb-20 bg-zinc-950/40 border-white/5"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <MessageSquare className="size-5 text-emerald-500" />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-tight">Submit Feedback</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="userName" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Terminal User ID
                  </label>
                  <input
                    type="text"
                    id="userName"
                    required
                    value={form.userName}
                    onChange={(e) => setForm({ ...form, userName: e.target.value })}
                    placeholder="Enter your handle..."
                    className="w-full px-5 py-4 rounded-2xl bg-black/60 border border-white/5 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    Execution Rating
                  </label>
                  <div className="py-2.5 px-5 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-center">
                    <Stars
                      rating={form.rating}
                      size="lg"
                      interactive
                      onRate={(r) => setForm({ ...form, rating: r })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="liked" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Top Performance Feature
                </label>
                <input
                  type="text"
                  id="liked"
                  value={form.liked}
                  onChange={(e) => setForm({ ...form, liked: e.target.value })}
                  placeholder="What worked best for you? (e.g., AI Research, Risk Engine)"
                  className="w-full px-5 py-4 rounded-2xl bg-black/60 border border-white/5 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all font-medium"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="feedback" className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  Full Analysis
                </label>
                <textarea
                  id="feedback"
                  required
                  rows={4}
                  value={form.feedback}
                  onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                  placeholder="Detailed breakdown of your experience..."
                  className="w-full px-5 py-4 rounded-2xl bg-black/60 border border-white/5 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all font-medium resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full md:w-auto px-10 py-4 rounded-2xl bg-emerald-500 text-black font-black uppercase tracking-widest text-[11px] shadow-[0_10px_30px_rgba(16,185,129,0.2)] hover:shadow-[0_15px_40px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {submitting ? (
                  <div className="size-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    Deploy Review <Send className="size-3" />
                  </>
                )}
              </button>
            </form>
          </motion.div>

          {/* Sort Controls */}
          <div className="flex items-center justify-between mb-10 px-4">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">
              Terminal Logs <span className="text-zinc-700 font-bold ml-2">({reviews.length})</span>
            </h2>

            <div className="flex items-center gap-3">
              <Filter className="size-3.5 text-zinc-600" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-zinc-950 border border-white/10 text-zinc-400 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500/40 cursor-pointer transition-all"
              >
                <option value="latest">Latest Feed</option>
                <option value="rating">Top Rated</option>
              </select>
            </div>
          </div>

          {/* Review Cards Feed */}
          {loadingReviews ? (
            <div className="grid grid-cols-1 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-40 rounded-3xl bg-white/[0.02] border border-white/5 animate-pulse" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="glass-panel rounded-3xl p-24 text-center border-white/5 flex flex-col items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center">
                <MessageSquare className="size-8 text-emerald-500/20" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white uppercase tracking-tight mb-2">No Logs Detected</h3>
                <p className="text-zinc-500 text-sm font-medium">Be the first to establish a presence in the logs.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              <AnimatePresence mode="popLayout">
                {reviews.map((review, index) => (
                  <motion.div
                    key={review._id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.05 }}
                    className="glass-panel rounded-3xl p-8 border-white/5 hover:border-emerald-500/20 transition-all duration-500 relative group"
                  >
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-50" />
                          <span className="text-xl font-black text-emerald-500 relative z-10">
                            {review.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-white tracking-tight uppercase">{review.userName}</h4>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mt-0.5">
                            Snapshot: {formatDate(review.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Stars rating={review.rating} size="sm" />
                    </div>

                    {review.liked && (
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-4">
                        <Check className="size-3" /> {review.liked}
                      </div>
                    )}

                    <p className="text-[14px] text-zinc-400 leading-relaxed font-medium">
                      {review.feedback}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
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
                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{toast.type === "success" ? "Transmission Successful" : "Uplink Error"}</span>
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
