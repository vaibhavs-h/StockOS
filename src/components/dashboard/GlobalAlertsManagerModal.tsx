"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Bell, Trash2, Loader2, AlertCircle, Search, Sparkles, CheckCircle2, History } from "lucide-react"
import axios from "axios"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface GlobalAlertsManagerModalProps {
  isOpen: boolean
  onClose: () => void
}

export function GlobalAlertsManagerModal({ isOpen, onClose }: GlobalAlertsManagerModalProps) {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active')
  const [searchQuery, setSearchQuery] = useState("")
  const [error, setError] = useState("")

  const fetchAlerts = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await axios.get('/api/alerts')
      if (res.data.success) {
        setAlerts(res.data.alerts || [])
      }
    } catch (err: any) {
      console.error("[GLOBAL-ALERTS-MODAL] Failed to fetch alerts:", err)
      setError("Failed to load alerts list.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchAlerts()
      setSearchQuery("")
      setError("")
    }
  }, [isOpen])

  const handleDelete = async (alertId: string) => {
    try {
      const res = await axios.delete(`/api/alerts?id=${alertId}`)
      if (res.data.success) {
        setAlerts(prev => prev.filter(a => a.id !== alertId))
      }
    } catch (err: any) {
      console.error("[GLOBAL-ALERTS-MODAL] Failed to delete alert:", err)
      setError("Failed to delete alert.")
    }
  }

  // Filter alerts by search query and active tab
  const filteredAlerts = alerts.filter(a => {
    const isTriggeredMatch = activeTab === 'history' ? a.is_triggered : !a.is_triggered
    if (!isTriggeredMatch) return false

    const query = searchQuery.trim().toLowerCase()
    if (!query) return true

    return (
      a.symbol.toLowerCase().includes(query) ||
      (a.name && a.name.toLowerCase().includes(query))
    )
  })

  const tabs = [
    { id: 'active', label: 'Active', count: alerts.filter(a => !a.is_triggered).length, icon: <Bell className="size-3.5" /> },
    { id: 'history', label: 'History', count: alerts.filter(a => a.is_triggered).length, icon: <History className="size-3.5" /> }
  ]

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
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative w-full max-w-2xl bg-zinc-950/80 border border-white/10 rounded-3xl p-6 shadow-[0_0_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl overflow-hidden z-10 flex flex-col max-h-[85vh]"
          >
            {/* Ambient Glow */}
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 size-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />

            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-3xl sm:text-4xl font-headline font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 tracking-tight">
                  Price Alerts Manager
                </h2>
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

            {/* Controls Row (Tabs + Search) */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-4 border-b border-white/5 pb-3">
              {/* Tab Selector with spring slide animation */}
              <div className="flex bg-white/[0.02] border border-white/5 p-1.5 rounded-2xl w-full sm:w-auto relative">
                {tabs.map((t) => {
                  const isActive = activeTab === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id as any)}
                      className={cn(
                        "relative flex-1 sm:flex-none px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-colors duration-300 flex items-center justify-center gap-2 z-10",
                        isActive
                          ? "text-black"
                          : "text-zinc-400 hover:text-zinc-200"
                      )}
                    >
                      {t.icon}
                      <span>{t.label} ({t.count})</span>
                      
                      {isActive && (
                        <motion.div
                          layoutId="manager-active-pill"
                          className="absolute inset-0 bg-gradient-to-r from-amber-400 to-yellow-500 rounded-xl -z-10 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
                          transition={{ type: "spring", stiffness: 450, damping: 30 }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Search input with focus glow effects */}
              <div className="relative w-full sm:w-64 group">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500 group-focus-within:text-amber-400 transition-colors" />
                <input
                  type="text"
                  placeholder="Filter by symbol or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 bg-white/[0.01] hover:bg-white/[0.03] border border-white/10 group-hover:border-white/20 focus:border-amber-500/50 rounded-xl text-xs font-semibold text-white focus:outline-none focus:ring-4 focus:ring-amber-500/5 transition-all duration-300 placeholder:text-zinc-600"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-rose-400 mb-4">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}

            {/* List area */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-[300px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="size-8 text-amber-400 animate-spin" />
                  <span className="text-zinc-500 text-xs font-semibold uppercase tracking-widest">Loading Alerts...</span>
                </div>
              ) : filteredAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Bell className="size-10 text-zinc-800 mb-3" />
                  <p className="text-zinc-500 text-sm font-semibold">No alerts found</p>
                  <p className="text-zinc-600 text-xs mt-1">
                    {searchQuery ? "Try searching for another symbol." : `You have no ${activeTab} alerts at this time.`}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
                  <AnimatePresence initial={false}>
                    {filteredAlerts.map((a) => (
                      <motion.div
                        key={a.id}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ type: "spring", stiffness: 400, damping: 28 }}
                        className={cn(
                          "p-4 rounded-2xl border flex flex-col justify-between transition-colors bg-white/[0.01]",
                          a.is_triggered ? "border-zinc-800/60" : "border-white/5 hover:border-white/10"
                        )}
                      >
                        <div className="flex justify-between items-start gap-4 mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white leading-none tracking-tight">
                                {a.symbol}
                              </span>
                              <span className={cn(
                                "text-[9px] font-black uppercase px-1.5 py-0.5 rounded-sm border leading-none tracking-wide",
                                a.asset_type === 'MF' 
                                  ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" 
                                  : a.asset_type === 'US_EQUITY' 
                                    ? "bg-blue-500/10 border-blue-500/20 text-blue-400" 
                                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              )}>
                                {a.asset_type === 'MF' ? 'MF' : a.asset_type === 'US_EQUITY' ? 'US' : 'IN'}
                              </span>
                            </div>
                            {a.name && (
                              <p className="text-[10px] text-zinc-500 mt-1 font-semibold truncate max-w-[180px]">
                                {a.name}
                              </p>
                            )}
                          </div>

                          {!a.is_triggered && (
                            <button
                              onClick={() => handleDelete(a.id)}
                              className="size-7 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-zinc-500 hover:text-rose-400 transition-colors shrink-0"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>

                        <div className="flex justify-between items-end border-t border-white/5 pt-3 mt-auto">
                          <div className="text-left">
                            <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-0.5">Target Value</span>
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-[9px] font-black uppercase tracking-wider",
                                a.trigger_condition === 'ABOVE' ? "text-emerald-400" : "text-rose-400"
                              )}>
                                {a.trigger_condition === 'ABOVE' ? '≥' : '≤'}
                              </span>
                              <span className="font-mono text-sm font-black text-white">
                                ₹{Number(a.target_value).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {a.is_triggered ? (
                            <div className="text-right">
                              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block mb-0.5 flex items-center gap-1 justify-end">
                                <CheckCircle2 className="size-3 text-emerald-400" /> Triggered Value
                              </span>
                              <span className="font-mono text-sm font-bold text-zinc-400">
                                ₹{Number(a.last_checked_price).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <Link 
                              href={a.asset_type === 'MF' ? `/mutual-funds/${a.symbol}` : a.asset_type === 'US_EQUITY' ? `/us-stocks/${a.symbol}` : `/stocks/${a.symbol}`}
                              onClick={onClose}
                              className="text-[10px] font-black uppercase tracking-wider text-amber-400 hover:text-amber-300 transition-colors"
                            >
                              View Detail →
                            </Link>
                          )}
                        </div>

                        {a.is_triggered && a.triggered_at && (
                          <div className="text-[9px] font-semibold text-zinc-500 mt-2.5 text-left leading-none">
                            Triggered on {new Date(a.triggered_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
