"use client"

import React, { useRef, useState, useEffect } from "react";
import { MenuIcon, SearchIcon, User, LogOut, CreditCard, MessageSquare, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetFooter } from '@/components/shared/Sheet';
import { Button } from '@/components/shared/Button';
import { cn } from '@/lib/utils';
import { MarketSearch } from '@/components/shared/MarketSearch';
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export function TacticalHeader() {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
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

            {/* Flexible Search Area */}
            <div className="flex-1 max-w-4xl hidden md:block">
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
                            
                            <Link href="/reviews">
                              <Button
                                variant="ghost"
                                className="w-full justify-start gap-2.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/5 transition-all duration-200 py-1.5 px-2.5 group h-auto"
                                onClick={() => setProfileOpen(false)}
                              >
                                <div className="size-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center transition-transform group-hover:scale-105 duration-200 shrink-0">
                                  <MessageSquare className="size-3.5 text-blue-400" />
                                </div>
                                <div className="flex flex-col items-start min-w-0">
                                  <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-200 group-hover:text-white truncate w-full text-left">Reviews</span>
                                  <span className="text-[9px] text-zinc-500 group-hover:text-zinc-400 font-medium normal-case tracking-normal truncate w-full text-left mt-[-2px] transition-colors">See user testimonials</span>
                                </div>
                              </Button>
                            </Link>
                            
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
    </AnimatePresence>
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
