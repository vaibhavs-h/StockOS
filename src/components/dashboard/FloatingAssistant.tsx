"use client"

import React, { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Send,
  RefreshCcw,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  ChevronDown,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

type ConfidenceLevel = "high" | "medium" | "low"

interface Citation {
  field: string
  label: string
  source: string
  kind: "retrieved" | "computed"
  asOf: string
}

interface FeedbackState {
  rating?: "up" | "down"
  submitted?: boolean
  showReasons?: boolean
  selectedReasons: string[]
  comment: string
}

interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  hideFeedback?: boolean
  isError?: boolean
  messageId?: string
  confidence?: { score: number; level: ConfidenceLevel }
  citations?: Citation[]
  showCitations?: boolean
  feedback?: FeedbackState
}

const REASON_OPTIONS: { code: string; label: string }[] = [
  { code: "wrong_data", label: "Wrong data" },
  { code: "outdated", label: "Outdated" },
  { code: "didnt_answer", label: "Didn't answer" },
  { code: "too_generic", label: "Too generic" },
  { code: "missing_metrics", label: "Missing metrics" },
  { code: "wrong_reasoning", label: "Wrong reasoning" },
  { code: "missing_news", label: "Missing news" },
  { code: "too_much_data", label: "Too much data" },
  { code: "other", label: "Other" },
]

const CONFIDENCE_STYLES: Record<ConfidenceLevel, { dot: string; text: string; bg: string; border: string; label: string }> = {
  high: { dot: "bg-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "High Confidence" },
  medium: { dot: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "Medium Confidence" },
  low: { dot: "bg-rose-500", text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20", label: "Low Confidence" },
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const s = Math.max(0, Math.floor(diffMs / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function inlineFormat(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
}

function parseTableRow(line: string): string[] {
  let cells = line.trim()
  if (cells.startsWith("|")) cells = cells.slice(1)
  if (cells.endsWith("|")) cells = cells.slice(0, -1)
  return cells.split("|").map(c => c.trim())
}

const TABLE_SEPARATOR_RE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/

/** Minimal, safe markdown-ish formatting — escapes HTML first, then only re-introduces
 * tags this component generates itself (headings, bold, lists, tables). Model responses
 * regularly come back with GFM-style tables and "## " headers (comparisons, portfolio
 * breakdowns) — this needs to render as an actual table/heading, not literal pipe characters. */
function formatContent(raw: string): string {
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  const lines = escaped.split("\n")
  const html: string[] = []
  let listTag: "ul" | "ol" | null = null
  let i = 0

  const closeList = () => {
    if (listTag) { html.push(`</${listTag}>`); listTag = null }
  }

  while (i < lines.length) {
    const trimmed = lines[i].trim()

    // Table: a "| ... |" row immediately followed by a "|---|---|" separator row
    if (trimmed.startsWith("|") && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1].trim())) {
      closeList()
      const headerCells = parseTableRow(trimmed).map(inlineFormat)
      const bodyRows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        bodyRows.push(parseTableRow(lines[i].trim()).map(inlineFormat))
        i++
      }
      html.push(
        '<div class="msg-table-wrap"><table><thead><tr>' +
        headerCells.map(c => `<th>${c}</th>`).join("") +
        "</tr></thead><tbody>" +
        bodyRows.map(row => `<tr>${row.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") +
        "</tbody></table></div>"
      )
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)/)
    if (heading) {
      closeList()
      html.push(`<div class="msg-heading">${inlineFormat(heading[2])}</div>`)
      i++
      continue
    }

    const bulletMatch = trimmed.match(/^[-•]\s+(.*)/)
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)/)

    if (bulletMatch || numberedMatch) {
      const wantTag = bulletMatch ? "ul" : "ol"
      if (listTag !== wantTag) { closeList(); html.push(`<${wantTag}>`); listTag = wantTag }
      html.push(`<li>${inlineFormat((bulletMatch || numberedMatch)![1])}</li>`)
      i++
      continue
    }

    closeList()
    if (trimmed.length > 0) html.push(`<p>${inlineFormat(trimmed)}</p>`)
    i++
  }
  closeList()

  return html.join("")
}

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export function FloatingAssistant() {
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello. I'm the StockOS Research Assistant — ask me about a stock, your portfolio, or the market. Every figure I give you is pulled and verified from StockOS's own data.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      hideFeedback: true,
    },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages, isOpen, isLoading])

  const updateMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)))
  }

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue("")
    setIsLoading(true)

    try {
      const data = await postJSON("/api/assistant/query", { message: text, conversationId })
      setConversationId(data.conversationId)

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.content,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        messageId: data.messageId,
        confidence: data.confidence ? { score: data.confidence.score, level: data.confidence.level } : undefined,
        citations: data.citations || [],
        feedback: { selectedReasons: [], comment: "" },
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: err?.message || "The Research Assistant is temporarily unavailable. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true,
        hideFeedback: true,
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const submitFeedback = async (msg: ChatMessage, rating: "up" | "down") => {
    if (!msg.messageId) return
    if (rating === "up") {
      updateMessage(msg.id, { feedback: { ...msg.feedback, selectedReasons: [], comment: "", rating: "up", submitted: true } })
      postJSON("/api/assistant/feedback", { messageId: msg.messageId, rating: "up" }).catch(() => {})
      return
    }
    updateMessage(msg.id, { feedback: { ...msg.feedback, selectedReasons: msg.feedback?.selectedReasons || [], comment: msg.feedback?.comment || "", rating: "down", showReasons: true } })
  }

  const toggleReason = (msg: ChatMessage, code: string) => {
    const current = msg.feedback?.selectedReasons || []
    const next = current.includes(code) ? current.filter(c => c !== code) : [...current, code]
    updateMessage(msg.id, { feedback: { ...msg.feedback, selectedReasons: next, comment: msg.feedback?.comment || "" } })
  }

  const submitDownReasons = async (msg: ChatMessage) => {
    if (!msg.messageId) return
    updateMessage(msg.id, { feedback: { ...msg.feedback, selectedReasons: msg.feedback?.selectedReasons || [], comment: msg.feedback?.comment || "", showReasons: false, submitted: true } })
    try {
      await postJSON("/api/assistant/feedback", {
        messageId: msg.messageId,
        rating: "down",
        reasonCodes: msg.feedback?.selectedReasons || [],
        comment: msg.feedback?.comment || undefined,
      })
    } catch { /* feedback is best-effort */ }
  }

  return (
    <div className="relative">
      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 50, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.8, y: 50, filter: 'blur(10px)' }}
              className="fixed bottom-24 right-10 w-[440px] h-[640px] bg-[#0a0d14]/95 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden z-[2000]"
            >
              {/* Ambient accent line */}
              <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />

              {/* Header */}
              <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-60" />
                  </div>
                  <span className="font-headline text-[13px] uppercase tracking-[0.2em] text-white font-bold">Research Assistant</span>
                  <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setMessages([messages[0]]); setConversationId(undefined) }}
                    className="p-2 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-emerald-500 transition-colors"
                    title="New conversation"
                  >
                    <RefreshCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-2 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={chatContainerRef}
                className="flex-grow p-6 overflow-y-auto no-scrollbar flex flex-col gap-6"
              >
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex flex-col gap-1.5 max-w-[88%]",
                      msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div className={cn(
                      "p-4 rounded-2xl text-[14px] leading-relaxed",
                      "[&_p]:mb-2 [&_p:last-child]:mb-0",
                      "[&_ul]:my-2 [&_ul]:pl-4 [&_ul_li]:list-disc [&_ol]:my-2 [&_ol]:pl-4 [&_ol_li]:list-decimal [&_li]:mb-1",
                      "[&_strong]:text-white [&_strong]:font-bold",
                      "[&_.msg-heading]:font-bold [&_.msg-heading]:text-white [&_.msg-heading]:mt-3 [&_.msg-heading]:mb-1.5 [&_.msg-heading:first-child]:mt-0",
                      "[&_.msg-table-wrap]:my-2 [&_.msg-table-wrap]:overflow-x-auto [&_.msg-table-wrap]:rounded-lg [&_.msg-table-wrap]:border [&_.msg-table-wrap]:border-white/10",
                      "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px]",
                      "[&_th]:bg-white/[0.04] [&_th]:text-zinc-400 [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-[9px] [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:whitespace-nowrap",
                      "[&_td]:px-2.5 [&_td]:py-2 [&_td]:border-t [&_td]:border-white/5 [&_td]:whitespace-nowrap",
                      msg.role === 'user'
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-50 rounded-tr-sm"
                        : msg.isError
                          ? "bg-rose-500/[0.06] border border-rose-500/20 text-rose-200 rounded-tl-sm"
                          : "bg-white/[0.03] border border-white/10 text-zinc-300 rounded-tl-sm shadow-xl"
                    )}>
                      {msg.role === 'assistant'
                        ? <div dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }} />
                        : msg.content}
                    </div>

                    {/* Confidence badge */}
                    {msg.confidence && (
                      <div className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest",
                        CONFIDENCE_STYLES[msg.confidence.level].bg,
                        CONFIDENCE_STYLES[msg.confidence.level].border,
                        CONFIDENCE_STYLES[msg.confidence.level].text
                      )}>
                        <ShieldCheck className="w-3 h-3" />
                        {CONFIDENCE_STYLES[msg.confidence.level].label}
                        <span className="opacity-60 font-mono normal-case tracking-normal">· {msg.confidence.score}/100</span>
                      </div>
                    )}

                    {/* Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="w-full">
                        <button
                          onClick={() => updateMessage(msg.id, { showCitations: !msg.showCitations })}
                          className="flex items-center gap-1 text-[9px] font-bold text-zinc-600 hover:text-zinc-400 uppercase tracking-widest transition-colors"
                        >
                          <ChevronDown className={cn("w-3 h-3 transition-transform", msg.showCitations && "rotate-180")} />
                          {msg.citations.length} Source{msg.citations.length > 1 ? "s" : ""}
                        </button>
                        <AnimatePresence>
                          {msg.showCitations && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-2 flex flex-col gap-1 overflow-hidden"
                            >
                              {msg.citations.map((c, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[9px]">
                                  <span className="text-zinc-400 font-bold truncate">{c.label}</span>
                                  <span className="text-zinc-600 font-mono shrink-0">{c.source} · {timeAgo(c.asOf)}</span>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Feedback */}
                    {!msg.hideFeedback && msg.role === 'assistant' && !msg.isError && (
                      <div className="flex flex-col gap-2 w-full">
                        {!msg.feedback?.submitted && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => submitFeedback(msg, "up")}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                msg.feedback?.rating === "up" ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-600 hover:text-emerald-400 hover:bg-white/5"
                              )}
                            >
                              <ThumbsUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => submitFeedback(msg, "down")}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                msg.feedback?.rating === "down" ? "bg-rose-500/10 text-rose-400" : "text-zinc-600 hover:text-rose-400 hover:bg-white/5"
                              )}
                            >
                              <ThumbsDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {msg.feedback?.submitted && (
                          <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Thanks for the feedback</span>
                        )}

                        <AnimatePresence>
                          {msg.feedback?.showReasons && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] overflow-hidden"
                            >
                              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">What went wrong?</span>
                              <div className="flex flex-wrap gap-1.5">
                                {REASON_OPTIONS.map(opt => (
                                  <button
                                    key={opt.code}
                                    onClick={() => toggleReason(msg, opt.code)}
                                    className={cn(
                                      "px-2 py-1 rounded-full text-[9px] font-bold border transition-colors",
                                      msg.feedback?.selectedReasons.includes(opt.code)
                                        ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                        : "bg-transparent border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20"
                                    )}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                              <textarea
                                value={msg.feedback?.comment || ""}
                                onChange={(e) => updateMessage(msg.id, { feedback: { ...msg.feedback!, comment: e.target.value } })}
                                placeholder="Optional: tell us more…"
                                rows={2}
                                className="w-full bg-black/30 border border-white/5 rounded-lg px-2.5 py-2 text-[11px] text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-white/20 resize-none"
                              />
                              <button
                                onClick={() => submitDownReasons(msg)}
                                className="self-end px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[9px] font-black uppercase tracking-widest transition-colors"
                              >
                                Submit
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{msg.timestamp}</span>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex gap-2 items-center text-emerald-500/60 ml-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Researching…</span>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-6 border-t border-white/5 bg-black/40">
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSend(inputValue) }}
                  className="relative group"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={isLoading}
                    placeholder="Ask about a stock, your portfolio, or the market…"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-2xl pl-6 pr-14 py-4 text-[14px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40 focus:bg-white/[0.04] transition-all disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !inputValue.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 disabled:hover:bg-emerald-500/10 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Trigger */}
      <motion.button
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-3 px-5 py-4 rounded-full transition-all duration-500 relative group border whitespace-nowrap shadow-2xl h-full min-w-[160px] justify-center",
          isOpen
            ? "bg-white border-white text-black"
            : "bg-indigo-500/10 border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/60"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className={cn("size-1.5 rounded-full transition-colors duration-500", isOpen ? "bg-black" : "bg-emerald-500")} />
            {!isOpen && <div className="absolute inset-0 size-1.5 rounded-full bg-emerald-500 animate-ping opacity-60" />}
          </div>
          <span className="font-terminal-label text-[11px] font-black uppercase tracking-[0.1em] leading-none">
            AI Assistant
          </span>
          <span className={cn(
            "text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md leading-none border shrink-0 scale-90 transition-all duration-300",
            isOpen
              ? "bg-zinc-800/40 border-zinc-800/40 text-zinc-500"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          )}>
            Live
          </span>
        </div>

        <div className="flex items-center justify-center w-5 h-5">
          <motion.div
            initial={false}
            animate={{ rotate: isOpen ? 90 : 0 }}
            className="flex items-center"
          >
            {isOpen ? <X className="w-4 h-4" /> : <Sparkles className="w-4 h-4 fill-current" />}
          </motion.div>
        </div>
      </motion.button>
    </div>
  )
}
