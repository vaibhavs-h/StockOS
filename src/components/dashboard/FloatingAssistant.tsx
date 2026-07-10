"use client"

import React, { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Send,
  RefreshCcw,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

export function FloatingAssistant() {
  const [mounted, setMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<any[]>([
    {
      role: 'assistant',
      content: 'Hello! I am your research assistant. Ask me about any stock or portfolio risk.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      hideFeedback: true
    }
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
  }, [messages, isOpen])

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages(prev => [...prev, userMsg])
    setInputValue("")
    setIsLoading(true)

    // Simulate backend call
    setTimeout(() => {
      const assistantMsg = {
        role: 'assistant',
        content: `I've analyzed ${text}. The sentiment is cautiously optimistic, but there are technical resistance levels ahead. Should I run a deep risk scan?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
      setMessages(prev => [...prev, assistantMsg])
      setIsLoading(false)
    }, 1500)
  }

  return (
    <div className="relative">
      {/* Chat Window - Still a Portal */}
      {mounted && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 50, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.8, y: 50, filter: 'blur(10px)' }}
              className="fixed bottom-24 right-10 w-[420px] h-[600px] bg-[#0a0d14]/95 backdrop-blur-3xl border border-white/10 rounded-[32px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden z-[2000]"
            >
              {/* Header */}
              <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-zinc-600" />
                  <span className="font-headline text-[13px] uppercase tracking-[0.2em] text-white font-bold">Research Assistant</span>
                  <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-500 border border-zinc-800">
                    OFFLINE
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMessages([messages[0]])}
                    className="p-2 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-emerald-500 transition-colors"
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

              {/* Messages Container */}
              <div
                ref={chatContainerRef}
                className="flex-grow p-6 overflow-y-auto no-scrollbar flex flex-col gap-6"
              >
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex flex-col gap-2 max-w-[85%]",
                      msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div className={cn(
                      "p-4 rounded-2xl text-[14px] leading-relaxed",
                      msg.role === 'user'
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-50 rounded-tr-sm"
                        : "bg-white/[0.03] border border-white/10 text-zinc-300 rounded-tl-sm shadow-xl"
                    )}>
                      {msg.content}
                    </div>
                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{msg.timestamp}</span>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex gap-2 items-center text-emerald-500/60 ml-2">
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-current" />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-current" />
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="p-6 border-t border-white/5 bg-black/40">
                <form
                  onSubmit={(e) => e.preventDefault()}
                  className="relative group opacity-55"
                >
                  <input
                    type="text"
                    disabled
                    value=""
                    onChange={() => {}}
                    placeholder="Assistant is currently offline..."
                    className="w-full bg-white/[0.01] border border-white/5 rounded-2xl px-6 py-4 text-[14px] text-zinc-500 placeholder:text-zinc-700 cursor-not-allowed focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-zinc-600 cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Institutional Assistant Trigger - Stable dimensions, High-Fidelity Pill */}
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
          <div className={cn(
            "size-1.5 rounded-full transition-colors duration-500 bg-zinc-500",
            isOpen ? "bg-black" : ""
          )} />
          <span className="font-terminal-label text-[11px] font-black uppercase tracking-[0.1em] leading-none">
            AI Assistant
          </span>
          <span className={cn(
            "text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md leading-none border shrink-0 scale-90 transition-all duration-300",
            isOpen 
              ? "bg-zinc-800/40 border-zinc-800/40 text-zinc-500" 
              : "bg-zinc-500/10 border-zinc-500/20 text-zinc-500"
          )}>
            OFFLINE
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
