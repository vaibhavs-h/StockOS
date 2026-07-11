"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Bell, Trash2, Loader2, AlertCircle, Plus, Crown } from "lucide-react"
import axios from "axios"
import { cn } from "@/lib/utils"

interface AlertConfigModalProps {
  isOpen: boolean
  onClose: () => void
  symbol: string
  currentPrice: number
  assetType: 'EQUITY' | 'US_EQUITY' | 'MF'
  userId: string
}

export function AlertConfigModal({
  isOpen,
  onClose,
  symbol,
  currentPrice,
  assetType,
  userId
}: AlertConfigModalProps) {
  const { data: session } = useSession()
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE')
  const [targetValue, setTargetValue] = useState<string>(currentPrice ? currentPrice.toString() : "")
  const [alertName, setAlertName] = useState("")
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // Fetch active alerts for this symbol
  const fetchActiveAlerts = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await axios.get('/api/alerts')
      if (res.data.success) {
        const filtered = (res.data.alerts || []).filter(
          (a: any) => a.symbol.toUpperCase() === symbol.toUpperCase() && !a.is_triggered
        )
        setAlerts(filtered)
      }
    } catch (err: any) {
      console.error("[ALERT-MODAL] Failed to fetch alerts:", err)
      setError("Failed to load existing alerts.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchActiveAlerts()
      setTargetValue(currentPrice ? currentPrice.toString() : "")
      setAlertName("")
      setError("")
      setSuccessMsg("")
    }
  }, [isOpen, symbol, currentPrice])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccessMsg("")

    const value = parseFloat(targetValue)
    if (isNaN(value) || value <= 0) {
      setError("Please enter a valid target price greater than 0.")
      return
    }

    setSubmitting(true)
    try {
      const res = await axios.post('/api/alerts', {
        symbol: symbol.toUpperCase(),
        asset_type: assetType,
        trigger_condition: condition,
        target_value: value,
        name: alertName.trim() || undefined
      })

      if (res.data.success) {
        setSuccessMsg("Price alert set successfully!")
        setAlertName("")
        fetchActiveAlerts()
        setTimeout(() => setSuccessMsg(""), 3000)
      }
    } catch (err: any) {
      console.error("[ALERT-MODAL] Failed to set alert:", err)
      setError(err.response?.data?.error || "Failed to create price alert.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (alertId: string) => {
    setError("")
    try {
      const res = await axios.delete(`/api/alerts?id=${alertId}`)
      if (res.data.success) {
        fetchActiveAlerts()
      }
    } catch (err: any) {
      console.error("[ALERT-MODAL] Failed to delete alert:", err)
      setError("Failed to delete alert.")
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative w-full max-w-md bg-zinc-950/80 border border-white/10 rounded-3xl p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden z-10"
          >
            {/* Top gradient glow overlay */}
            <div className={cn(
              "absolute -top-24 left-1/2 -translate-x-1/2 size-48 rounded-full blur-3xl pointer-events-none transition-colors duration-500",
              condition === 'ABOVE' ? "bg-emerald-500/10" : "bg-rose-500/10"
            )} />

            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Bell className={cn(
                    "size-4 transition-colors duration-300",
                    condition === 'ABOVE' ? "text-emerald-400" : "text-rose-400"
                  )} />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">Price Alerts</span>
                </div>
                <h2 className="text-xl font-headline font-bold text-white tracking-tight">{symbol}</h2>
              </div>
              <motion.button
                onClick={onClose}
                whileHover={{ rotate: 90, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="size-8 rounded-full border border-white/5 bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              >
                <X className="size-4" />
              </motion.button>
            </div>

            {/* Current Price Banner */}
            <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl mb-6 shadow-inner">
              <span className="text-xs font-bold text-zinc-400">Current Market Price</span>
              <span className="font-mono text-base font-black text-white">
                ₹{currentPrice ? currentPrice.toFixed(2) : "0.00"}
              </span>
            </div>

            {/* Content Wrapper based on Tier */}
            {((session?.user as any)?.subscription_tier || 'free').toLowerCase() === 'free' ? (
              <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl flex flex-col items-center text-center relative overflow-hidden">
                {/* Subtle radial light glow */}
                <div className="absolute -top-16 size-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="size-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                  <Crown className="size-6 text-amber-400" />
                </div>
                
                <h4 className="text-sm font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-400 mb-2">
                  Premium Feature
                </h4>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider leading-relaxed mb-6 max-w-[280px]">
                  Setting stock price alerts requires a LITE or PRO plan. Upgrade your account to unlock unlimited real-time price notifications!
                </p>
                
                <motion.a
                  href="/subscription"
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black text-[10px] font-black uppercase tracking-[0.25em] text-center shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] transition-all duration-300"
                >
                  Upgrade Plan
                </motion.a>
              </div>
            ) : (
              <>
                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-2">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setCondition('ABOVE')}
                      className={cn(
                        "py-3 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all duration-300",
                        condition === 'ABOVE'
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                          : "bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/5"
                      )}
                    >
                      Rises Above (≥)
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setCondition('BELOW')}
                      className={cn(
                        "py-3 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all duration-300",
                        condition === 'BELOW'
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.1)]"
                          : "bg-white/[0.02] border-white/5 text-zinc-400 hover:bg-white/5"
                      )}
                    >
                      Falls Below (≤)
                    </motion.button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Trigger Target Price (₹)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      placeholder="e.g. 1500.00"
                      className={cn(
                        "w-full h-12 bg-white/[0.02] border border-white/10 rounded-xl px-4 text-sm font-semibold text-white focus:outline-none focus:ring-2 transition-all duration-300",
                        condition === 'ABOVE' 
                          ? "focus:border-emerald-500/50 focus:ring-emerald-500/10" 
                          : "focus:border-rose-500/50 focus:ring-rose-500/10"
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Alert Name (Optional)</label>
                    <input
                      type="text"
                      value={alertName}
                      onChange={(e) => setAlertName(e.target.value)}
                      placeholder="e.g. TCS Target Buy Price"
                      maxLength={40}
                      className={cn(
                        "w-full h-12 bg-white/[0.02] border border-white/10 rounded-xl px-4 text-sm font-semibold text-white focus:outline-none focus:ring-2 transition-all duration-300",
                        condition === 'ABOVE' 
                          ? "focus:border-emerald-500/50 focus:ring-emerald-500/10" 
                          : "focus:border-rose-500/50 focus:ring-rose-500/10"
                      )}
                    />
                  </div>

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-rose-400"
                    >
                      <AlertCircle className="size-4 shrink-0 mt-0.5" />
                      <span className="text-xs font-medium">{error}</span>
                    </motion.div>
                  )}

                  {successMsg && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2 text-emerald-400"
                    >
                      <Bell className="size-4 shrink-0 mt-0.5" />
                      <span className="text-xs font-medium">{successMsg}</span>
                    </motion.div>
                  )}

                  <motion.button
                    type="submit"
                    disabled={submitting}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={cn(
                      "w-full h-12 text-black font-black uppercase tracking-[0.2em] text-xs rounded-xl transition-all duration-300 flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:scale-100",
                      condition === 'ABOVE'
                        ? "bg-emerald-400 hover:bg-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                        : "bg-rose-400 hover:bg-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.25)]"
                    )}
                  >
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="size-4" />
                        Set Alert
                      </>
                    )}
                  </motion.button>
                </form>

                {/* Active Alerts List */}
                <div className="border-t border-white/5 pt-5">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500 mb-3">Active Alerts</h3>

                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-5 text-zinc-600 animate-spin" />
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="text-center py-6 text-zinc-600 text-xs font-medium">
                      No active alerts configured for {symbol}.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      <AnimatePresence initial={false}>
                        {alerts.map((a) => (
                          <motion.div
                            key={a.id}
                            initial={{ opacity: 0, height: 0, y: -5 }}
                            animate={{ opacity: 1, height: "auto", y: 0 }}
                            exit={{ opacity: 0, height: 0, y: 5 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className="flex justify-between items-center p-3 bg-white/[0.01] border border-white/5 rounded-xl group/item overflow-hidden"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[9px] font-black uppercase px-1.5 py-0.5 rounded-sm border leading-none",
                                  a.trigger_condition === 'ABOVE'
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                )}>
                                  {a.trigger_condition}
                                </span>
                                <span className="font-mono text-xs font-bold text-white">
                                  ₹{Number(a.target_value).toFixed(2)}
                                </span>
                              </div>
                              {a.name && (
                                <p className="text-[9px] text-zinc-500 mt-1 font-semibold truncate max-w-[200px]">
                                  {a.name}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="size-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-zinc-500 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
