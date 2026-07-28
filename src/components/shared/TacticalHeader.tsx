"use client"

import React, { useRef, useState, useEffect } from "react";
import { 
  MenuIcon, 
  SearchIcon, 
  User, 
  LogOut, 
  CreditCard, 
  MessageSquare, 
  Sparkles, 
  Bell, 
  CheckCheck, 
  TrendingUp, 
  Layers, 
  Briefcase, 
  X 
} from 'lucide-react';
import { Sheet, SheetContent, SheetFooter } from '@/components/shared/Sheet';
import { Button } from '@/components/shared/Button';
import { cn } from '@/lib/utils';
import { MarketSearch } from '@/components/shared/MarketSearch';
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { FeedbackModal } from "./FeedbackModal";
import { GlobalAlertsManagerModal } from "@/components/dashboard/GlobalAlertsManagerModal";
import { supabase } from "@/services/DatabaseClient";
import { getDbUserId } from "@/lib/user";
import axios from "axios";

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  type: 'ALERT_PRICE' | 'ALERT_MIDDAY' | 'ALERT_EOD' | 'ALERT_MF_NIGHTLY';
  link?: string;
  created_at: string;
  metadata?: any;
}

export function TacticalHeader() {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [alertsManagerOpen, setAlertsManagerOpen] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen]);

  // Hide header on landing page
  if (pathname === '/') return null;

  const links = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Journal', href: '/journal' },
    { label: 'Stocks', href: '/stocks' },
  ];

  return (
    <AnimatePresence>
      {pathname !== '/' && (
        <motion.header
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'fixed top-0 z-[160] w-full border-b border-white/5 backdrop-blur-xl bg-zinc-950/40'
          )}
        >
          <nav className="mx-auto flex h-20 w-full max-w-[1700px] items-center gap-8 px-8">
            <div className="flex shrink-0 items-center">
              <Link href="/dashboard" className="group">
                <p className="font-sans text-white leading-none select-none flex items-baseline transition-opacity group-hover:opacity-80">
                  <span className="text-4xl font-normal tracking-[-0.05em] opacity-90">Stock</span>
                  <span className="text-4xl font-bold tracking-tighter">OS</span>
                </p>
              </Link>
            </div>

            {/* Shortened Search Area */}
            <div className="flex-1 max-w-5xl hidden md:block">
              {session ? (
                <MarketSearch>
                  <Button
                    className="w-full h-11 justify-start px-6 bg-white border-2 border-black rounded-[100px] hover:bg-zinc-100 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.1)]"
                  >
                    <div className="flex items-center gap-3">
                      <SearchIcon className="size-4 text-black" />
                      <span className="text-xs font-bold tracking-tight text-black">Search Stocks, Mutual Funds & ETFs...</span>
                    </div>
                  </Button>
                </MarketSearch>
              ) : (
                <Link href="/auth/login">
                  <Button
                    className="w-full h-11 justify-start px-6 bg-white border-2 border-black rounded-[100px] hover:bg-zinc-100 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.1)]"
                  >
                    <div className="flex items-center gap-3">
                      <SearchIcon className="size-4 text-black" />
                      <span className="text-xs font-bold tracking-tight text-black">Login to Search...</span>
                    </div>
                  </Button>
                </Link>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Desktop Navigation Pill */}
              <div className="hidden lg:flex items-center">
                <AnimatedTabs links={links} />
              </div>

              {/* Notification Bell */}
              {session && (
                <NotificationBell userId={getDbUserId((session.user as any).id)} />
              )}

              <div className="relative">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="h-11 w-11 rounded-2xl border-2 border-black bg-black text-white hover:bg-zinc-900 shadow-[0_4px_15px_rgba(0,0,0,0.1)] group relative p-0"
                >
                  <ProfileImage src={session?.user?.image} name={session?.user?.name} />
                  {/* Tier Indicator on icon */}
                  {(session?.user as any)?.subscription_tier && (session?.user as any)?.subscription_tier !== 'free' && (
                    <div className={cn(
                      "absolute -top-1 -right-1 size-4 rounded-full border-2 border-white flex items-center justify-center shadow-sm",
                      (session?.user as any).subscription_tier === 'pro' ? "bg-emerald-500" : "bg-blue-500"
                    )}>
                      <div className="size-1.5 rounded-full bg-white animate-pulse" />
                    </div>
                  )}
                </Button>

                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      ref={profileRef}
                      initial={{ opacity: 0, scale: 0.95, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 8 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      className="absolute right-0 mt-2 w-64 bg-zinc-950 border-2 border-white/20 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] z-20 overflow-hidden"
                    >
                      <div className="pt-2.5 pb-2.5 px-4 border-b border-white/10 bg-zinc-900/30 relative">
                        {/* Tier Badge in Menu */}
                        {session && (
                          <div className={cn(
                            "absolute top-2.5 right-4 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.12em] border shadow-sm",
                            (session?.user as any)?.subscription_tier === 'pro' ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30" :
                            (session?.user as any)?.subscription_tier === 'lite' ? "bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-400 border-blue-500/30" :
                            "bg-zinc-800 text-zinc-400 border-zinc-700"
                          )}>
                            {(session?.user as any)?.subscription_tier || 'FREE'}
                          </div>
                        )}
                        
                        <p className="text-[8px] font-bold uppercase tracking-[0.25em] text-zinc-500 mb-0.5">{session ? "SIGNED IN AS" : "STATUS"}</p>
                        <p className="font-sans font-bold text-[13px] text-white truncate pr-14 tracking-tight">
                          {session?.user?.name || (session ? session.user?.email : "Guest")}
                        </p>
                        <p className="text-[10px] text-zinc-400 font-normal truncate tracking-tight mt-[-1px]">
                          {session?.user?.email || "Login to get access"}
                        </p>
                      </div>
                      
                      <div className="p-1.5 space-y-0.5">
                        {session ? (
                          <>
                            <Link href="/subscription">
                              <Button
                                variant="ghost"
                                className="w-full justify-start gap-2.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all duration-200 py-1.5 px-2.5 group h-auto"
                                onClick={() => setProfileOpen(false)}
                              >
                                <div className="size-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center transition-transform group-hover:scale-105 duration-200 shrink-0">
                                  <CreditCard className="size-3.5 text-emerald-400" />
                                </div>
                                <div className="flex flex-col items-start min-w-0">
                                  <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-200 group-hover:text-white truncate w-full text-left">Subscription</span>
                                  <span className="text-[9px] text-zinc-500 group-hover:text-zinc-400 font-medium normal-case tracking-normal truncate w-full text-left mt-[-2px] transition-colors">Manage plans & billing</span>
                                </div>
                              </Button>
                            </Link>

                            <Button
                              variant="ghost"
                              className="w-full justify-start gap-2.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all duration-200 py-1.5 px-2.5 group h-auto"
                              onClick={() => {
                                setProfileOpen(false);
                                setAlertsManagerOpen(true);
                              }}
                            >
                              <div className="size-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center transition-transform group-hover:scale-105 duration-200 shrink-0">
                                <Bell className="size-3.5 text-amber-400" />
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-200 group-hover:text-white truncate w-full text-left">Price Alerts</span>
                                <span className="text-[9px] text-zinc-500 group-hover:text-zinc-400 font-medium normal-case tracking-normal truncate w-full text-left mt-[-2px] transition-colors">Manage active price triggers</span>
                              </div>
                            </Button>
                            
                            <Button
                              variant="ghost"
                              className="w-full justify-start gap-2.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all duration-200 py-1.5 px-2.5 group h-auto"
                              onClick={() => {
                                setProfileOpen(false);
                                setFeedbackOpen(true);
                              }}
                            >
                              <div className="size-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center transition-transform group-hover:scale-105 duration-200 shrink-0">
                                <MessageSquare className="size-3.5 text-blue-400" />
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-200 group-hover:text-white truncate w-full text-left">Reviews</span>
                                <span className="text-[9px] text-zinc-500 group-hover:text-zinc-400 font-medium normal-case tracking-normal truncate w-full text-left mt-[-2px] transition-colors">See user testimonials</span>
                              </div>
                            </Button>
                            
                            <div className="h-px bg-white/5 my-1 mx-1.5" />
                            
                            <Button
                              variant="ghost"
                              className="w-full justify-start gap-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all duration-200 py-1.5 px-2.5 group h-auto"
                              onClick={() => signOut({ callbackUrl: '/auth/login' })}
                            >
                              <div className="size-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center transition-transform group-hover:scale-105 duration-200 shrink-0">
                                <LogOut className="size-3.5 text-rose-400" />
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <span className="font-bold text-[11px] uppercase tracking-wider text-rose-400 text-left">Logout System</span>
                                <span className="text-[9px] text-rose-500/70 group-hover:text-rose-400 font-medium normal-case tracking-normal truncate w-full text-left mt-[-2px] transition-colors">Sign out of active session</span>
                              </div>
                            </Button>
                          </>
                        ) : (
                          <Link href="/auth/login">
                            <Button
                              variant="ghost"
                              className="w-full justify-start gap-2.5 rounded-xl text-emerald-400 hover:bg-white/5 transition-all duration-200 py-1.5 px-2.5 group h-auto"
                              onClick={() => setProfileOpen(false)}
                            >
                              <div className="size-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center transition-transform group-hover:scale-105 duration-200 shrink-0">
                                <User className="size-3.5 text-emerald-400" />
                              </div>
                              <div className="flex flex-col items-start min-w-0">
                                <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-400 text-left">Log in Now~</span>
                                <span className="text-[9px] text-zinc-500 group-hover:text-zinc-400 font-medium normal-case tracking-normal truncate w-full text-left mt-[-2px] transition-colors">Access dashboard & assets</span>
                              </div>
                            </Button>
                          </Link>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Sheet open={open} onOpenChange={setOpen}>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setOpen(!open)}
                  className="lg:hidden text-zinc-400"
                >
                  <MenuIcon className="size-6" />
                </Button>
                <SheetContent
                  className="bg-zinc-950/95 backdrop-blur-2xl border-l border-white/10"
                  side="right"
                >
                  <div className="flex flex-col gap-6 pt-12">
                    {links.map((link) => (
                      <Link
                        key={link.label}
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="text-2xl font-black uppercase tracking-widest text-zinc-500 hover:text-emerald-400 transition-colors"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                  <SheetFooter className="mt-12 pt-8 border-t border-white/5">
                    <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>Settings</Button>
                    <Button 
                      className="w-full bg-red-500 hover:bg-red-600 border-none"
                      onClick={() => signOut({ callbackUrl: '/auth/login' })}
                    >
                      Logout
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>
          </nav>
        </motion.header>
      )}
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <GlobalAlertsManagerModal isOpen={alertsManagerOpen} onClose={() => setAlertsManagerOpen(false)} />
    </AnimatePresence>
  );
}

function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<Notification | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const router = useRouter();

  // Fetch initial notifications
  const fetchNotifications = async () => {
    try {
      const res = await axios.get('/api/notifications');
      if (res.data.success) {
        setNotifications(res.data.notifications);
      }
    } catch (e) {
      console.error('[NOTIF-BELL] Failed to fetch notifications:', e);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // 1. Setup AudioContext initialization on first interaction to unlock browsers autoplay policies
    const initAudio = () => {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);
    window.addEventListener('touchstart', initAudio);

    // 2. Real-time PostgreSQL subscription filtered strictly for the authenticated user
    const channel = supabase
      .channel(`public:user_notifications:user_id=eq.${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          
          // Play programmatic chime
          try {
            const ctx = audioContextRef.current;
            if (ctx) {
              if (ctx.state === 'suspended') ctx.resume();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(880, ctx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.6);
            }
          } catch (e) {
            console.warn('[AUDIO] Playback error:', e);
          }

          // Update state & show toast
          setNotifications(prev => [newNotif, ...prev]);
          setToast(newNotif);
        }
      )
      .subscribe();

    // 3. Click outside listener to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    // Custom event listener for instant client notification updates
    const handleNotifRefresh = () => {
      fetchNotifications();
    };
    window.addEventListener('stockos-notification-refresh', handleNotifRefresh);

    return () => {
      channel.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('touchstart', initAudio);
      window.removeEventListener('stockos-notification-refresh', handleNotifRefresh);
    };
  }, [userId]);

  // Dismiss toast after 5s
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkAllRead = async () => {
    try {
      await axios.post('/api/notifications', { all: true });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await axios.post('/api/notifications', { ids: [n.id] });
        setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, is_read: true } : item));
      } catch (e) {
        console.error(e);
      }
    }
    setIsOpen(false);
    if (n.link) {
      router.push(n.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'ALERT_PRICE': return <Bell className="size-3.5 text-emerald-400" />;
      case 'ALERT_MIDDAY': return <TrendingUp className="size-3.5 text-amber-400" />;
      case 'ALERT_EOD': return <Briefcase className="size-3.5 text-blue-400" />;
      case 'ALERT_MF_NIGHTLY': return <Layers className="size-3.5 text-indigo-400" />;
      default: return <Bell className="size-3.5 text-zinc-400" />;
    }
  };

  const formatTime = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="h-11 w-11 rounded-2xl border-2 border-black bg-black text-white hover:bg-zinc-900 shadow-[0_4px_15px_rgba(0,0,0,0.1)] relative p-0 flex items-center justify-center shrink-0"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-black text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-black animate-bounce shadow-md">
            {unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="absolute right-0 mt-2 w-80 bg-zinc-950 border border-white/10 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] z-20 overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center py-3 px-4 border-b border-white/10 bg-zinc-900/30">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[9px] font-black uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                >
                  <CheckCheck className="size-3" /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[300px] overflow-y-auto divide-y divide-white/5">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-zinc-600 text-xs font-semibold">
                  All quiet here! No new notifications.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      "p-3.5 flex gap-3 cursor-pointer transition-colors text-left",
                      n.is_read ? "hover:bg-white/[0.02]" : "bg-white/[0.03] hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="size-7 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      {getIcon(n.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start gap-2 mb-0.5">
                        <span className="font-bold text-[11px] text-white tracking-tight leading-none truncate">
                          {n.title}
                        </span>
                        <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tight shrink-0">
                          {formatTime(n.created_at)}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-normal line-clamp-2">
                        {n.message}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, x: 100, y: 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed top-24 right-8 z-[200] max-w-sm bg-zinc-950 border border-emerald-500/30 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl flex gap-3 cursor-pointer"
            onClick={() => {
              if (toast.link) router.push(toast.link);
              setToast(null);
            }}
          >
            <div className="size-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              {getIcon(toast.type)}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <h4 className="font-bold text-xs text-white tracking-tight leading-none mb-1">{toast.title}</h4>
              <p className="text-[10px] text-zinc-400 font-medium leading-relaxed line-clamp-2">{toast.message}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToast(null);
              }}
              className="size-5 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileImage({ src, name }: { src?: string | null; name?: string | null }) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white rounded-xl">
        <User className="size-5 text-black transition-transform group-hover:scale-110" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || "User"}
      referrerPolicy="no-referrer"
      className="w-full h-full object-cover rounded-xl"
      onError={() => setError(true)}
    />
  );
}

function AnimatedTabs({ links }: { links: { label: string; href: string }[] }) {
  const pathname = usePathname();

  return (
    <ul className="relative flex h-12 items-center w-fit rounded-[100px] border-2 border-black bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
      {links.map((link) => {
        const isActive = pathname === link.href;
        return (
          <li key={link.label} className="relative z-10">
            <Link
              href={link.href}
              className={cn(
                "relative z-10 block cursor-pointer px-6 py-2 text-[14px] font-bold tracking-tight transition-colors duration-300 rounded-[100px] font-headline",
                isActive ? "text-white" : "text-black hover:text-black/60"
              )}
            >
              {link.label}
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 bg-black rounded-[100px] -z-10"
                  transition={{ type: "spring", stiffness: 400, damping: 33 }}
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
