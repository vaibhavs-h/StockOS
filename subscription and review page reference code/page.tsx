"use client";

import { useState, useEffect, useCallback } from "react";

/** 
 * API Configuration
 * IMPORTANT: In Vercel, you MUST set NEXT_PUBLIC_API_URL in the dashboard.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001").replace(/\/$/, "");


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

  const sizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-8 h-8" };

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          className={`star-btn ${interactive ? "cursor-pointer" : "cursor-default"}`}
          onMouseEnter={() => interactive && setHover(star)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => onRate && onRate(star)}
        >
          <svg
            className={`${sizes[size]} transition-colors duration-150`}
            fill={(hover || rating) >= star ? "var(--star)" : "none"}
            stroke={(hover || rating) >= star ? "var(--star)" : "var(--muted)"}
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
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
      setToast({ 
        message: `Network error: ${err.message}. Check console for details.`, 
        type: "error" 
      });
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
    console.log(`🚀 Submitting review to: ${targetUrl}`);

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        // Try to get error message from JSON, otherwise use status
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
      }
    } catch (err: any) {
      console.error("❌ Submit error:", err);
      setToast({
        message: err.message === "Failed to fetch" 
          ? `Network Error: Could not reach backend at ${API_URL}. Verify NEXT_PUBLIC_API_URL in Vercel settings.`
          : (err.message || "Something went wrong"),
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /** Average rating across all reviews */
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(
          1
        )
      : "0.0";

  return (
    <div className="relative py-16 sm:py-24">
      {/* Background accents */}
      <div className="absolute top-10 right-1/4 w-72 h-72 bg-star/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-star/10 border border-star/20 text-star text-sm font-medium mb-6">
            ★ Customer Reviews
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            What Our Users{" "}
            <span className="bg-gradient-to-r from-star to-warning bg-clip-text text-transparent">
              Say
            </span>
          </h1>
          <p className="text-lg text-muted max-w-xl mx-auto">
            Real feedback from real traders. Share your experience with StockOS.
          </p>

          {/* Aggregate stats */}
          {reviews.length > 0 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-extrabold">{avgRating}</span>
                <Stars rating={Math.round(parseFloat(avgRating))} size="md" />
              </div>
              <span className="text-muted text-sm">
                Based on {reviews.length} review{reviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Review Form */}
        <div className="glass-card rounded-2xl p-8 mb-12 hover:transform-none">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm">
              ✍
            </span>
            Write a Review
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name + Rating row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="userName"
                  className="block text-sm font-medium text-muted mb-2"
                >
                  Your Name
                </label>
                <input
                  type="text"
                  id="userName"
                  required
                  value={form.userName}
                  onChange={(e) =>
                    setForm({ ...form, userName: e.target.value })
                  }
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Rating
                </label>
                <div className="pt-1">
                  <Stars
                    rating={form.rating}
                    size="lg"
                    interactive
                    onRate={(r) => setForm({ ...form, rating: r })}
                  />
                </div>
              </div>
            </div>

            {/* What did you like */}
            <div>
              <label
                htmlFor="liked"
                className="block text-sm font-medium text-muted mb-2"
              >
                What did you like?{" "}
                <span className="text-muted/50">(optional)</span>
              </label>
              <input
                type="text"
                id="liked"
                value={form.liked}
                onChange={(e) => setForm({ ...form, liked: e.target.value })}
                placeholder="e.g., AI analysis accuracy, portfolio tracking..."
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              />
            </div>

            {/* Feedback */}
            <div>
              <label
                htmlFor="feedback"
                className="block text-sm font-medium text-muted mb-2"
              >
                Your Feedback
              </label>
              <textarea
                id="feedback"
                required
                rows={4}
                value={form.feedback}
                onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                placeholder="Share your experience with StockOS..."
                className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none"
              />
            </div>

            <button
              type="submit"
              id="submit-review"
              disabled={submitting}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-white font-semibold text-sm shadow-lg shadow-primary-glow hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Submitting...
                </span>
              ) : (
                "Submit Review"
              )}
            </button>
          </form>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold">
            All Reviews{" "}
            <span className="text-muted text-base font-normal">
              ({reviews.length})
            </span>
          </h2>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Sort by:</span>
            <select
              id="sort-reviews"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 rounded-lg bg-card border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <option value="latest">Latest</option>
              <option value="rating">Highest Rating</option>
            </select>
          </div>
        </div>

        {/* Review Cards */}
        {loadingReviews ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl p-6 shimmer h-36" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="glass-card rounded-2xl p-16 text-center hover:transform-none">
            <div className="text-5xl mb-4">💬</div>
            <h3 className="text-lg font-semibold mb-2">No Reviews Yet</h3>
            <p className="text-muted text-sm">
              Be the first to share your experience with StockOS!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review, index) => (
              <div
                key={review._id}
                className="glass-card rounded-2xl p-6 animate-fade-in-up"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {review.userName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm">
                        {review.userName}
                      </h4>
                      <p className="text-xs text-muted">
                        {formatDate(review.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Stars rating={review.rating} size="sm" />
                </div>

                {/* Liked badge */}
                {review.liked && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 border border-success/15 text-success text-xs font-medium mb-3">
                    <span>👍</span> {review.liked}
                  </div>
                )}

                <p className="text-sm text-muted leading-relaxed">
                  {review.feedback}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 toast">
          <div
            className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-3 ${
              toast.type === "success"
                ? "bg-success/10 border border-success/20 text-success"
                : "bg-danger/10 border border-danger/20 text-danger"
            }`}
          >
            {toast.type === "success" ? "✅" : "❌"} {toast.message}
            <button
              onClick={() => setToast(null)}
              className="ml-2 text-current opacity-60 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
