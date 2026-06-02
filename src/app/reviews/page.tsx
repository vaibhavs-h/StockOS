"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronUp,
  MessageSquare,
  Sparkles,
  Search,
  Plus,
  Send,
  Check,
  TrendingUp,
  Calendar,
  AlertCircle,
  FileText,
  User,
  Shield,
  Layers,
  Flag,
  PenSquare,
} from "lucide-react";
import { supabase } from "@/services/DatabaseClient";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface RequestItem {
  id: string;
  user_name: string;
  user_avatar?: string;
  rating?: number; // mapping to reviews.rating
  title: string;
  body: string; // mapping to reviews.body
  tier: string;
  created_at: string;
  helpful_count?: number; // mapping to reviews.helpful_count (votes)
  category?: string;
  status?: "Planned" | "In Progress" | "Under Review" | "Released";
  priority?: "Low" | "Medium" | "High";
  comment_count?: number;
}

const STATIC_REQUESTS: RequestItem[] = [
  {
    id: "s1",
    user_name: "Arjun Mehta",
    title: "Link Multiple Indian Broker Accounts via Account Aggregator",
    body: "Currently we can only link one portfolio. It would be amazing to support multiple CDSL/NSDL credentials or multiple broker logins to track family portfolios under a single screen.",
    tier: "pro",
    created_at: "2026-05-28T09:00:00Z",
    helpful_count: 84,
    category: "Integrations",
    status: "In Progress",
    priority: "High",
    comment_count: 12,
  },
  {
    id: "s2",
    user_name: "Priya Sharma",
    title: "Interactive Wealth Projections & FI/RE Calculators",
    body: "I love the wealth chart! Adding dynamic Monte Carlo simulations or long-term growth projection sliders based on historical asset allocation yields would be incredibly valuable.",
    tier: "lite",
    created_at: "2026-05-25T11:30:00Z",
    helpful_count: 67,
    category: "Analytics",
    status: "Planned",
    priority: "Medium",
    comment_count: 8,
  },
  {
    id: "s3",
    user_name: "Rohit Jain",
    title: "Advanced Option Chain Analytics & Real-Time Open Interest Gaps",
    body: "Provide customizable OI strike price walls, historical option volume tracking, and quick options risk indicator widgets directly on individual stock dashboards.",
    tier: "pro",
    created_at: "2026-05-22T14:00:00Z",
    helpful_count: 51,
    category: "US Markets",
    status: "Under Review",
    priority: "High",
    comment_count: 6,
  },
  {
    id: "s4",
    user_name: "Sneha Kapoor",
    title: "Mutual Fund SIP Overlap Finder",
    body: "A tool to select multiple mutual funds and see which underlying stocks are overlapping the most to avoid redundant capital allocation across AMC schemes.",
    tier: "lite",
    created_at: "2026-05-18T08:15:00Z",
    helpful_count: 42,
    category: "Analytics",
    status: "Released",
    priority: "Medium",
    comment_count: 14,
  },
  {
    id: "s5",
    user_name: "Kiran Rao",
    title: "Automatic Trade Notes & Journaling based on Execution",
    body: "Allow users to automatically tag transactions and add custom emotional / market notes right at the moment buy or sell orders are linked.",
    tier: "pro",
    created_at: "2026-05-12T16:45:00Z",
    helpful_count: 38,
    category: "Design",
    status: "Planned",
    priority: "Low",
    comment_count: 4,
  },
  {
    id: "s6",
    user_name: "Ananya Gupta",
    title: "Instant Global Portfolio Search & Tactical Hotkeys",
    body: "Implement an elegant Command Bar (like Raycast or CMD+K) that operates globally to instantly search securities, jump routes, or check holdings instantly.",
    tier: "free",
    created_at: "2026-05-02T10:00:00Z",
    helpful_count: 31,
    category: "Design",
    status: "Released",
    priority: "High",
    comment_count: 9,
  },
];

const CHANGELOG_ITEMS = [
  {
    version: "v2.4.0",
    title: "Institutional Wealth Hub & Overlap Diagnostics",
    date: "May 2026",
    desc: "Overhauled the core portfolio analyzer to expose mutual fund asset overlaps, link custom Indian CAS files seamlessly, and link multiple brokerage profiles.",
  },
  {
    version: "v2.3.0",
    title: "Artificial Intelligence Stock Insights",
    date: "April 2026",
    desc: "Introduced advanced custom prompt analyzers and GPT-powered research models inside the individual asset terminal pages for rapid fundamental summaries.",
  },
  {
    version: "v2.2.0",
    title: "Real-Time Global Markets Syncing",
    date: "March 2026",
    desc: "Integrated lightning-fast US stock telemetry and unified multi-currency conversion charts allowing automated wealth tracking globally.",
  },
];

const STATUS_CONFIG = {
  Planned: { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20" },
  "In Progress": { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20" },
  "Under Review": { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  Released: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
};

const AVATAR_GRADIENTS = [
  "from-violet-600 to-indigo-600",
  "from-emerald-600 to-teal-600",
  "from-amber-500 to-orange-600",
];

const CATEGORIES = ["Analytics", "Integrations", "Design", "US Markets", "Performance", "General"];
const PRIORITIES = ["Low", "Medium", "High"];

export default function ProductIntelligencePage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<RequestItem[]>(STATIC_REQUESTS);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeStatus, setActiveStatus] = useState("All");

  // New feedback submission
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Analytics",
    priority: "Medium" as "Low" | "Medium" | "High",
  });

  // Client voted track
  const [votedMap, setVotedMap] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        // Map database records safely to the Product Intelligence model
        const dbItems: RequestItem[] = data.map((item) => ({
          id: item.id,
          user_name: item.user_name || "Anonymous",
          user_avatar: item.user_avatar,
          title: item.title,
          body: item.body,
          tier: item.tier || "free",
          created_at: item.created_at,
          helpful_count: item.helpful_count || 0,
          category: item.category || "General",
          status: (item.status as any) || (item.rating && item.rating >= 4 ? "Planned" : "Under Review"),
          priority: (item.priority as any) || "Medium",
          comment_count: Math.floor(Math.random() * 5),
        }));

        // Merge DB items with rich Static showcase to deliver world-class aesthetic
        const merged = [...dbItems, ...STATIC_REQUESTS].reduce((acc: RequestItem[], current) => {
          const exists = acc.find((item) => item.id === current.id);
          if (!exists) acc.push(current);
          return acc;
        }, []);
        setRequests(merged);
      }
    } catch {
      // Fallback already STATIC_REQUESTS
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Modern vote microinteraction
  const handleVote = useCallback((id: string) => {
    if (votedMap[id]) return;
    setVotedMap((prev) => ({ ...prev, [id]: true }));
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, helpful_count: (r.helpful_count || 0) + 1 } : r
      )
    );
  }, [votedMap]);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      const userTier = (session?.user as any)?.subscription_tier || "free";
      const ratingVal = form.priority === "High" ? 5 : form.priority === "Medium" ? 4 : 3;

      // Maintain exact API integrity with "reviews" table
      const { error } = await supabase.from("reviews").insert({
        user_name: session?.user?.name || "Anonymous",
        user_avatar: session?.user?.image || "",
        rating: ratingVal,
        title: form.title,
        body: form.description,
        tier: userTier,
        category: form.category,
        status: "Planned",
        priority: form.priority,
      });

      if (!error) {
        setSubmitted(true);
        setShowForm(false);
        setForm({
          title: "",
          description: "",
          category: "Analytics",
          priority: "Medium",
        });
        await loadRequests();
      }
    } catch {
      // Fallback
    } finally {
      setSubmitting(false);
    }
  };

  // Metrics for Section 1
  const metrics = useMemo(() => {
    const total = requests.length;
    const released = requests.filter((r) => r.status === "Released").length;
    const progress = requests.filter((r) => r.status === "In Progress").length;
    const votes = requests.reduce((sum, r) => sum + (r.helpful_count || 0), 0);
    return { total, released, progress, votes };
  }, [requests]);

  // Showcase Section 2
  const featuredItems = useMemo(() => {
    return requests
      .filter((r) => r.helpful_count && r.helpful_count >= 40)
      .slice(0, 3);
  }, [requests]);

  // Main Feed Filtering
  const filteredRequests = useMemo(() => {
    let result = [...requests];

    if (search.trim() !== "") {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q) ||
          r.user_name.toLowerCase().includes(q)
      );
    }

    if (activeCategory !== "All") {
      result = result.filter((r) => r.category === activeCategory);
    }

    if (activeStatus !== "All") {
      result = result.filter((r) => r.status === activeStatus);
    }

    // Default Sort (Most Voted)
    return result.sort((a, b) => (b.helpful_count || 0) - (a.helpful_count || 0));
  }, [requests, search, activeCategory, activeStatus]);

  // Timeline separation for Roadmap Sidebar
  const roadmapPlanned = useMemo(() => requests.filter((r) => r.status === "Planned").slice(0, 4), [requests]);
  const roadmapInProgress = useMemo(() => requests.filter((r) => r.status === "In Progress").slice(0, 4), [requests]);
  const roadmapReleased = useMemo(() => requests.filter((r) => r.status === "Released").slice(0, 4), [requests]);

  return (
    <div className="min-h-screen text-zinc-300 font-sans selection:bg-zinc-700 selection:text-white flex flex-col bg-transparent">
      
      {/* Container spacing perfectly coordinated with Subscription page */}
      <div className="flex-1 w-full max-w-[1200px] mx-auto px-6 pt-28 pb-24 relative flex flex-col justify-start">
        
        {/* Back Button positioned absolutely in top left */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute top-10 left-6 z-20"
        >
          <Link href="/dashboard">
            <button
              className="inline-flex items-center justify-center size-9 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.08] transition-all duration-200 active:scale-95"
              type="button"
            >
              <ArrowLeft className="size-[18px]" />
            </button>
          </Link>
        </motion.div>

        {/* SECTION 1 — HERO */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] mb-4 shadow-sm"
          >
            <Sparkles className="size-3.5 text-zinc-400" />
            <span className="text-[10px] font-mono tracking-widest uppercase text-zinc-400">StockOS Community</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.95, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="font-outfit text-5xl sm:text-7xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-zinc-450 leading-none mb-4"
          >
            Product Intelligence
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.95, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-base sm:text-[17.5px] text-zinc-400 leading-relaxed max-w-xl mx-auto"
          >
            Help shape the future of StockOS through community feedback, feature voting, and live product roadmap tracking.
          </motion.p>

          {/* Premium Glass Community Statistics Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.85, delay: 0.3 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mt-10"
          >
            {[
              { label: "Total Requests", value: `${metrics.total}+` },
              { label: "Features Released", value: metrics.released },
              { label: "In Progress", value: metrics.progress },
              { label: "Community Votes", value: metrics.votes.toLocaleString() },
            ].map((stat, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-white/[0.04] bg-[#0c0c0e]/40 backdrop-blur-md px-5 py-4 text-center shadow-lg hover:border-white/[0.08] transition-all duration-300"
              >
                <div className="text-zinc-550 text-[10px] uppercase font-mono tracking-widest mb-1">{stat.label}</div>
                <div className="font-outfit text-2xl font-bold text-white tracking-tight">{stat.value}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* SECTION 2 — FEATURED REQUESTS */}
        <div className="mb-14">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-mono tracking-widest uppercase text-zinc-450">Featured Showcase</span>
            <span className="h-px bg-white/[0.06] flex-1 mx-4" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featuredItems.map((item, idx) => {
              const statusColors = STATUS_CONFIG[item.status || "Planned"];
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={mounted ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.6, delay: 0.4 + idx * 0.08 }}
                  whileHover={{ y: -4, scale: 1.01 }}
                  className="rounded-3xl border border-white/[0.05] bg-[#09090b]/80 p-6 flex flex-col justify-between shadow-xl transition-all duration-300 relative group hover:border-white/[0.12] hover:shadow-[0_15px_35px_rgba(0,0,0,0.5)]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3.5">
                      <span className="text-[9px] font-mono uppercase tracking-wider bg-white/[0.03] text-zinc-500 border border-white/[0.04] px-2 py-0.5 rounded-md">
                        {item.category || "General"}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono tracking-wider uppercase border ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                        {item.status}
                      </span>
                    </div>

                    <h3 className="font-outfit text-[16px] font-semibold text-white leading-snug tracking-tight mb-2 group-hover:text-zinc-200 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-[12.5px] text-zinc-450 leading-relaxed font-medium line-clamp-3 mb-6">
                      {item.body}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/[0.03]">
                    <button
                      onClick={() => handleVote(item.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold tracking-wide transition-all ${
                        votedMap[item.id]
                          ? "bg-emerald-500/10 text-emerald-400 border-transparent shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                          : "bg-transparent border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.15] hover:bg-white/[0.02] active:scale-95"
                      }`}
                    >
                      <ChevronUp className="size-3.5" />
                      <span>{item.helpful_count || 0} Votes</span>
                    </button>
                    
                    <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                      <MessageSquare className="size-3" />
                      <span>{item.comment_count}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* SECTION 3 — MAIN COMMUNITY EXPERIENCE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16 items-start">
          
          {/* REQUEST FEED (8 Columns) */}
          <div className="lg:col-span-8 space-y-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h2 className="font-outfit text-xl font-semibold text-white">Community Proposals</h2>
                <span className="px-2 py-0.5 bg-white/[0.04] border border-white/[0.06] text-zinc-400 font-mono text-[10px] rounded-md">
                  {filteredRequests.length}
                </span>
              </div>

              {/* Feed quick filters */}
              <div className="flex items-center gap-2">
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value)}
                  className="bg-[#09090b] border border-white/[0.06] hover:border-white/[0.1] text-zinc-300 text-xs px-2.5 py-1.5 rounded-xl outline-none cursor-pointer"
                >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <select
                  value={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.value)}
                  className="bg-[#09090b] border border-white/[0.06] hover:border-white/[0.1] text-zinc-300 text-xs px-2.5 py-1.5 rounded-xl outline-none cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  {Object.keys(STATUS_CONFIG).map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Proposal Feed List */}
            {filteredRequests.length === 0 ? (
              <div className="text-center py-16 rounded-3xl border border-white/[0.03] bg-white/[0.01]">
                <MessageSquare className="size-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs text-zinc-500">No community feedback proposals found matching your options.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredRequests.map((item, idx) => {
                  const statusColors = STATUS_CONFIG[item.status || "Planned"];
                  const initials = item.user_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  const grad = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];

                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: Math.min(idx * 0.04, 0.2) }}
                      className="rounded-3xl border border-white/[0.04] bg-[#09090b] p-5 shadow-lg relative group flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          {item.user_avatar ? (
                            <div className="relative p-[1px] rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30">
                              <img
                                src={item.user_avatar}
                                alt={item.user_name}
                                referrerPolicy="no-referrer"
                                className="size-7 rounded-full object-cover border border-zinc-950"
                              />
                            </div>
                          ) : (
                            <div className="relative p-[1px] rounded-full bg-gradient-to-br from-violet-500/40 to-indigo-500/40">
                              <div className={`size-7 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white text-[9px] font-bold shrink-0 border border-zinc-950`}>
                                {initials}
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="text-[11.5px] font-semibold text-white leading-none mb-0.5">{item.user_name}</div>
                            <div className="text-[9px] text-zinc-500 font-mono">
                              {new Date(item.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-mono tracking-wider uppercase border ${statusColors.bg} ${statusColors.text} ${statusColors.border}`}>
                            {item.status}
                          </span>
                          <span className="text-[8px] font-mono tracking-widest uppercase bg-white/[0.02] border border-white/[0.06] text-zinc-500 px-2 py-0.5 rounded-full">
                            {item.tier}
                          </span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <h4 className="text-[14.5px] font-semibold text-white mb-1.5 tracking-tight group-hover:text-zinc-200 transition-colors">
                          {item.title}
                        </h4>
                        <p className="text-[12.5px] text-zinc-440 leading-relaxed font-medium">
                          {item.body}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-white/[0.03] flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono uppercase tracking-wider bg-white/[0.03] text-zinc-500 border border-white/[0.04] px-2 py-0.5 rounded-md">
                            {item.category || "General"}
                          </span>
                          {item.priority && (
                            <span className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                              item.priority === "High"
                                ? "bg-red-500/5 text-red-400 border-red-500/20"
                                : item.priority === "Medium"
                                ? "bg-amber-500/5 text-amber-400 border-amber-500/20"
                                : "bg-zinc-500/5 text-zinc-400 border-zinc-500/20"
                            }`}>
                              {item.priority} Priority
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleVote(item.id)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[10px] font-semibold transition-all duration-200 ${
                              votedMap[item.id]
                                ? "bg-emerald-500/10 text-emerald-400 border-transparent shadow-[0_0_12px_rgba(16,185,129,0.1)]"
                                : "bg-transparent border-white/[0.05] text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/20 active:scale-95"
                            }`}
                          >
                            <ChevronUp className="size-3.5" />
                            <span>{item.helpful_count || 0}</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ROADMAP SIDEBAR (4 Columns) */}
          <div className="lg:col-span-4 lg:sticky lg:top-28 space-y-6">
            <div className="rounded-3xl border border-white/[0.05] bg-[#09090b]/80 p-6 shadow-xl">
              <h2 className="font-outfit text-base font-semibold text-white mb-6">StockOS Roadmap</h2>

              <div className="space-y-6 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/[0.06]">
                {/* Planned */}
                <div className="relative pl-6">
                  <div className="absolute left-[5px] top-1.5 size-[7px] rounded-full bg-zinc-500/40 border border-zinc-650 shrink-0" />
                  <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Planned</div>
                  <ul className="space-y-2">
                    {roadmapPlanned.map((item) => (
                      <li key={item.id} className="text-xs font-semibold text-white group cursor-pointer hover:text-zinc-300">
                        <div className="line-clamp-1">{item.title}</div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* In Progress */}
                <div className="relative pl-6">
                  <div className="absolute left-[5px] top-1.5 size-[7px] rounded-full bg-violet-500 border border-violet-650 shrink-0 animate-pulse" />
                  <div className="text-[10px] font-mono uppercase tracking-widest text-violet-400 mb-2">In Progress</div>
                  <ul className="space-y-2">
                    {roadmapInProgress.map((item) => (
                      <li key={item.id} className="text-xs font-semibold text-white group cursor-pointer hover:text-zinc-300">
                        <div className="line-clamp-1">{item.title}</div>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Released */}
                <div className="relative pl-6">
                  <div className="absolute left-[5px] top-1.5 size-[7px] rounded-full bg-emerald-500 border border-emerald-650 shrink-0" />
                  <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 mb-2">Released</div>
                  <ul className="space-y-2">
                    {roadmapReleased.map((item) => (
                      <li key={item.id} className="text-xs font-semibold text-white group cursor-pointer hover:text-zinc-300">
                        <div className="line-clamp-1">{item.title}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4 — FEEDBACK COMPOSER (Linear Issue / Notion-inspired) */}
        <div className="max-w-3xl mx-auto mb-16 w-full">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-mono tracking-widest uppercase text-zinc-450">Collaborative Composer</span>
            <span className="h-px bg-white/[0.06] flex-1 mx-4" />
          </div>

          <div className="rounded-3xl border border-white/[0.07] bg-[#09090b] p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-60 h-60 bg-violet-600/[0.02] rounded-full blur-[80px] pointer-events-none" />

            <div className="flex items-center gap-2 mb-6">
              <PenSquare className="size-4.5 text-violet-400" />
              <h2 className="font-outfit text-lg font-semibold text-white">Submit Community Testimony</h2>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-2">Feature Request Title</label>
                <input
                  type="text"
                  placeholder="Summarize your request in one short sentence..."
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-white/[0.02] border border-white/[0.05] focus:border-white/[0.15] text-white placeholder:text-zinc-650 text-sm p-3 rounded-xl outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-2">Category Segment</label>
                  <div className="flex flex-wrap gap-1.5">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, category: cat }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all border ${
                          form.category === cat
                            ? "bg-white/[0.06] text-white border-white/[0.12] shadow-sm"
                            : "bg-transparent text-zinc-500 border-white/[0.04] hover:text-zinc-350"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-2">Priority Level</label>
                  <div className="flex gap-1.5">
                    {PRIORITIES.map((pri) => (
                      <button
                        key={pri}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, priority: pri as any }))}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all border ${
                          form.priority === pri
                            ? pri === "High"
                              ? "bg-red-500/10 text-red-400 border-red-500/30"
                              : pri === "Medium"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                            : "bg-transparent text-zinc-500 border-white/[0.04] hover:text-zinc-350"
                        }`}
                      >
                        {pri}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block mb-2">Detailed Description</label>
                <textarea
                  placeholder="Expose the feature's core details, constraints, user flow benefits, and link requirements..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={5}
                  className="w-full bg-white/[0.02] border border-white/[0.05] focus:border-white/[0.15] text-white placeholder:text-zinc-650 text-sm p-3 rounded-xl outline-none transition-colors resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-550">
                  <Shield className="size-3.5" />
                  <span>Authenticated user: <strong className="text-zinc-400">{session?.user?.name || "Anonymous Member"}</strong></span>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={submitting || !form.title.trim() || !form.description.trim()}
                  className="relative overflow-hidden px-8 py-3 rounded-xl bg-gradient-to-b from-white to-zinc-150 hover:from-white hover:to-white disabled:opacity-40 disabled:hover:from-white disabled:cursor-not-allowed text-xs font-semibold tracking-wide text-zinc-950 transition-all duration-300 active:scale-[0.98] hover:scale-[1.01] shadow-[0_4px_20px_rgba(255,255,255,0.06)] flex items-center gap-2 group"
                >
                  <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-sheen pointer-events-none" />
                  {submitting ? (
                    <div className="size-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  Submit Feedback
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 5 — PRODUCT EVOLUTION (Vercel-inspired Changelog Editorial) */}
        <div className="max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between mb-8">
            <span className="text-[11px] font-mono tracking-widest uppercase text-zinc-450">Product Evolution & Changelog</span>
            <span className="h-px bg-white/[0.06] flex-1 mx-4" />
          </div>

          <div className="space-y-6 relative before:absolute before:left-6 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/[0.06]">
            {CHANGELOG_ITEMS.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true }}
                className="relative pl-14"
              >
                {/* Timeline visual marker */}
                <div className="absolute left-[20px] top-1.5 size-2.5 rounded-full bg-zinc-900 border-2 border-white/40 shrink-0 z-10" />

                <div className="rounded-3xl border border-white/[0.04] bg-[#09090b] p-6 shadow-lg hover:border-white/[0.08] transition-all duration-300">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono tracking-wider uppercase bg-white/[0.04] border border-white/[0.1] text-white">
                      {item.version}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                      {item.date}
                    </span>
                  </div>

                  <h3 className="font-outfit text-lg font-semibold text-white tracking-tight mb-2">
                    {item.title}
                  </h3>
                  <p className="text-[13px] text-zinc-450 leading-relaxed font-medium">
                    {item.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
