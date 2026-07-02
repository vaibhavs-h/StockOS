"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Send, PartyPopper } from "lucide-react";
import { supabase } from "@/services/DatabaseClient";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = ["Analytics", "Integrations", "Design", "US Markets", "Performance", "General"];
const PRIORITIES = ["Low", "Medium", "High"];

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const { data: session } = useSession();
  
  const [rating, setRating] = useState(5);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "General",
    priority: "Medium" as "Low" | "Medium" | "High",
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Reset form states when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setForm({
        title: "",
        description: "",
        category: "General",
        priority: "Medium",
      });
      setRating(5);
      setSubmitted(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Dynamic theme mapping based on selected rating (Amber, Indigo, Emerald)
  const ratingTheme = useMemo(() => {
    if (rating === 5) {
      return {
        text: "text-amber-400",
        borderActive: "focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/30 focus:shadow-[0_0_20px_rgba(251,191,36,0.12)] focus:bg-white/[0.04]",
        btnClass: "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-450 hover:to-orange-450 text-zinc-955 font-bold shadow-[0_4px_20px_rgba(251,191,36,0.25)]",
        starColor: "text-amber-400 fill-amber-400",
        starGlow: "drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]",
        glow1: "bg-amber-500/[0.06]",
        glow2: "bg-orange-500/[0.04]",
      };
    } else if (rating === 4) {
      return {
        text: "text-indigo-400",
        borderActive: "focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/30 focus:shadow-[0_0_20px_rgba(99,102,241,0.12)] focus:bg-white/[0.04]",
        btnClass: "bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-450 hover:to-violet-450 text-white font-bold shadow-[0_4px_20px_rgba(99,102,241,0.25)]",
        starColor: "text-indigo-400 fill-indigo-400",
        starGlow: "drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]",
        glow1: "bg-indigo-500/[0.06]",
        glow2: "bg-violet-500/[0.04]",
      };
    } else {
      return {
        text: "text-emerald-400",
        borderActive: "focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/30 focus:shadow-[0_0_20px_rgba(16,185,129,0.12)] focus:bg-white/[0.04]",
        btnClass: "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-450 hover:to-teal-450 text-zinc-955 font-bold shadow-[0_4px_20px_rgba(16,185,129,0.25)]",
        starColor: "text-emerald-400 fill-emerald-400",
        starGlow: "drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]",
        glow1: "bg-emerald-500/[0.06]",
        glow2: "bg-teal-500/[0.04]",
      };
    }
  }, [rating]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        user_name: session?.user?.name || "Anonymous User",
        rating: rating,
        title: form.title,
        body: form.description,
      });

      if (!error) {
        setSubmitted(true);
        // Automatically close after a short delay
        setTimeout(() => {
          onClose();
        }, 2200);
      } else {
        console.error("Feedback submit database error:", error.message, error.details);
      }
    } catch (err) {
      console.error("Feedback submit exception:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          {/* Backdrop blur overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Modal Panel Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md bg-gradient-to-b from-zinc-900/75 via-zinc-950/80 to-black/90 border border-white/10 backdrop-blur-2xl rounded-2xl p-5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.85)] z-10 flex flex-col overflow-hidden animate-moving-gradient"
          >
            {/* Ambient background glows */}
            <div className={cn("absolute top-[-30%] left-[-30%] w-[220px] h-[220px] rounded-full blur-[50px] pointer-events-none -z-10 animate-[pulse_6s_ease-in-out_infinite] transition-colors duration-500", ratingTheme.glow1)} />
            <div className={cn("absolute bottom-[-30%] right-[-30%] w-[220px] h-[220px] rounded-full blur-[50px] pointer-events-none -z-10 animate-[pulse_8s_ease-in-out_infinite_1s] transition-colors duration-500", ratingTheme.glow2)} />

            {/* Elegant header background shine */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5 z-20"
            >
              <X className="size-4" />
            </button>

            <AnimatePresence mode="wait">
              {!submitted ? (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Title Header */}
                  <div className="mb-5 flex flex-col items-center text-center">
                    <h3 className="font-headline font-black text-4xl text-white tracking-tighter leading-none mb-2">
                      Shape <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent font-black">StockOS</span>
                    </h3>
                    <p className="text-[13px] text-zinc-400 font-ui-body leading-relaxed max-w-sm">
                      Your feedback directly guides our sprint priorities and roadmap release cycle.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                    {/* Rating Selector */}
                    <div className="flex flex-col items-center justify-center mb-1">
                      <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase font-ui-body mb-2">
                        Overall Rating
                      </span>
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <motion.button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoveredStar(star)}
                            onMouseLeave={() => setHoveredStar(null)}
                            whileHover={{ scale: 1.15, rotate: 5 }}
                            whileTap={{ scale: 0.9 }}
                            className="focus:outline-none"
                          >
                            <Star
                              className={cn(
                                "size-7 transition-all duration-200 cursor-pointer",
                                (hoveredStar !== null ? star <= hoveredStar : star <= rating)
                                  ? cn(ratingTheme.starColor, ratingTheme.starGlow)
                                  : "text-zinc-700 fill-transparent hover:text-zinc-550"
                              )}
                            />
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Summary */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-zinc-450 text-xs font-semibold font-ui-body">Summary</label>
                        {form.title.length > 0 && (
                          <span className="text-[10px] font-mono text-zinc-500 select-none">
                            {form.title.length}/80
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        maxLength={80}
                        placeholder="e.g. Integrate multi-broker APIs for Indian markets"
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        className={cn(
                          "w-full bg-[#030305]/40 border border-white/5 focus:border-zinc-700 text-xs px-3.5 py-2.5 rounded-xl outline-none text-zinc-200 placeholder:text-zinc-750 transition-all font-ui-body",
                          ratingTheme.borderActive
                        )}
                      />
                    </div>

                    {/* Details Description */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-zinc-450 text-xs font-semibold font-ui-body">Details</label>
                        {form.description.length > 0 && (
                          <span className="text-[10px] font-mono text-zinc-500 select-none">
                            {form.description.length} chars
                          </span>
                        )}
                      </div>
                      <textarea
                        required
                        placeholder="Provide details on features or modifications you want..."
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        className={cn(
                          "w-full h-24 bg-[#030305]/40 border border-white/5 text-xs px-3.5 py-2.5 rounded-xl outline-none resize-none text-zinc-200 placeholder:text-zinc-750 transition-all font-ui-body",
                          ratingTheme.borderActive
                        )}
                      />
                    </div>

                    {/* Action Submit Button */}
                    <div className="mt-1">
                      <button
                        type="submit"
                        disabled={submitting || !form.title.trim() || !form.description.trim()}
                        className={cn(
                          "w-full py-3.5 disabled:opacity-40 font-headline font-bold text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5",
                          ratingTheme.btnClass
                        )}
                      >
                        {submitting ? (
                          <div className="size-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Send className="size-3.5" />
                            <span>Submit Feedback</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-10 text-center"
                >
                  <div className="size-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
                    <PartyPopper className="size-7 text-emerald-400 animate-bounce" />
                  </div>
                  <h3 className="font-headline font-semibold text-lg text-white">Feedback received!</h3>
                  <p className="text-[12px] text-zinc-400 leading-relaxed max-w-[240px] mt-2 font-ui-body">
                    Thank you. Your feedback has been logged to help guide our sprint development priorities.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
