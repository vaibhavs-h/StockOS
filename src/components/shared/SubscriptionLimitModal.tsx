"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Crown, AlertTriangle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import StockOSPortal from "@/components/shared/Portal"

interface SubscriptionLimitModalProps {
  isOpen: boolean
  onClose: () => void
  limitType: 'free_mf' | 'free_portfolio' | 'lite_portfolio' | 'chat_assistant'
}

export function SubscriptionLimitModal({
  isOpen,
  onClose,
  limitType
}: SubscriptionLimitModalProps) {
  
  const getModalConfig = () => {
    switch (limitType) {
      case 'free_mf':
        return {
          type: 'subscription',
          title: 'Premium Feature',
          message: 'Mutual Fund & SIP tracking requires a LITE or PRO plan. Upgrade your account to start tracking mutual funds!',
          btnText: 'Upgrade Plan'
        }
      case 'free_portfolio':
        return {
          type: 'subscription',
          title: 'Premium Feature',
          message: 'Linking more than 1 portfolio requires a LITE or PRO plan. Upgrade your account to link up to 5 portfolios on Lite or unlimited on Pro!',
          btnText: 'Upgrade Plan'
        }
      case 'lite_portfolio':
        return {
          type: 'limit',
          title: 'Limit Exceeded',
          message: 'Your plan is limited to 5 linked portfolios. Upgrade to PRO to unlock unlimited portfolio connections!',
          btnText: 'Upgrade to Pro'
        }
      case 'chat_assistant':
        return {
          type: 'limit',
          title: 'Limit Exceeded',
          message: "You've reached your plan's daily chat assistant limit. Upgrade to send more messages today!",
          btnText: 'Upgrade Plan'
        }
      default:
        return {
          type: 'subscription',
          title: 'Premium Feature',
          message: 'This feature is restricted on your current plan. Upgrade to unlock full access!',
          btnText: 'Upgrade Plan'
        }
    }
  }

  const config = getModalConfig()

  return (
    <StockOSPortal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6">
            {/* Blur Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-[12px]"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{
                scale: 1,
                y: 0,
                opacity: 1,
                borderColor: config.type === 'limit'
                  ? ["rgba(239,68,68,0.2)", "rgba(239,68,68,0.35)", "rgba(239,68,68,0.2)"]
                  : ["rgba(245,158,11,0.25)", "rgba(147,51,234,0.4)", "rgba(59,130,246,0.4)", "rgba(245,158,11,0.25)"]
              }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{
                scale: { type: "spring", damping: 20, stiffness: 300 },
                y: { type: "spring", damping: 20, stiffness: 300 },
                borderColor: { repeat: Infinity, duration: 6, ease: "linear" }
              }}
              className="w-full max-w-sm bg-white/[0.08] backdrop-blur-[40px] border border-white/[0.18] p-9 flex flex-col items-center text-center relative overflow-hidden rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] z-10"
            >
              {/* Cosmic Rotating Ambient Glow */}
              <motion.div
                animate={{
                  scale: [1, 1.25, 0.95, 1.15, 1],
                  rotate: [0, 90, 180, 270, 360],
                  opacity: [0.35, 0.55, 0.4, 0.6, 0.35]
                }}
                transition={{
                  repeat: Infinity,
                  duration: 10,
                  ease: "linear"
                }}
                className={cn(
                  "absolute -top-24 size-64 rounded-full blur-[50px] pointer-events-none",
                  config.type === 'limit'
                    ? "bg-gradient-to-br from-red-500 via-purple-500/25 to-red-600"
                    : "bg-gradient-to-br from-amber-500 via-purple-500/35 to-blue-500"
                )}
              />

              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-6 right-6 size-8 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Floating Badge */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{
                  repeat: Infinity,
                  duration: 4,
                  ease: "easeInOut"
                }}
                className={cn(
                  "relative z-10 size-18 rounded-[1.25rem] flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]",
                  config.type === 'limit'
                    ? "bg-gradient-to-b from-red-500/20 to-red-950/5 border border-red-500/30 text-red-400 shadow-red-500/10"
                    : "bg-gradient-to-b from-amber-400/25 to-amber-950/5 border border-amber-400/30 text-amber-400 shadow-amber-500/15"
                )}
              >
                {config.type === 'limit' ? (
                  <>
                    <AlertTriangle className="w-8 h-8" />
                    <motion.div
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      className="absolute -top-1 -right-1 size-5 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/30"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                    </motion.div>
                  </>
                ) : (
                  <>
                    <Crown className="w-8 h-8 text-amber-400" />
                    <motion.div
                      animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.4, 1, 0.4] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-amber-400/20 flex items-center justify-center text-amber-300 border border-amber-400/30"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                    </motion.div>
                  </>
                )}
              </motion.div>

              {/* Title */}
              <motion.h4
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.15 }}
                className={cn(
                  "text-[17px] font-black uppercase tracking-[0.25em] mb-4 relative z-10 text-center text-transparent bg-clip-text",
                  config.type === 'limit'
                    ? "bg-gradient-to-r from-red-400 via-zinc-100 to-red-400"
                    : "bg-gradient-to-r from-amber-300 via-zinc-100 to-amber-300"
                )}
              >
                {config.title}
              </motion.h4>

              {/* Description */}
              <motion.p
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 15, stiffness: 180, delay: 0.25 }}
                className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider leading-relaxed mb-8 max-w-[280px] relative z-10 text-center"
              >
                {config.message}
              </motion.p>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 w-full max-w-[280px] relative z-10">
                <motion.a
                  href="/subscription"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 150, delay: 0.35 }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "w-full py-4 rounded-2xl text-black text-[10px] font-black uppercase tracking-[0.25em] text-center transition-all duration-300",
                    config.type === 'limit'
                      ? "bg-gradient-to-r from-red-400 via-red-500 to-red-600 shadow-[0_0_30px_rgba(239,68,68,0.25)] hover:shadow-[0_0_40px_rgba(239,68,68,0.45)]"
                      : "bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 shadow-[0_0_30px_rgba(245,158,11,0.25)] hover:shadow-[0_0_40px_rgba(245,158,11,0.45)]"
                  )}
                >
                  {config.btnText}
                </motion.a>
                <motion.button
                  onClick={onClose}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 150, delay: 0.45 }}
                  whileHover={{ backgroundColor: "rgba(255,255,255,0.06)", scale: 1.01 }}
                  className="w-full py-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-zinc-400 hover:text-white text-[10px] font-black uppercase tracking-[0.25em] transition-all duration-300"
                >
                  Maybe Later
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </StockOSPortal>
  )
}
