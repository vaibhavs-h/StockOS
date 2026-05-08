"use client"

import React, { useRef, useState } from "react";
import { MenuIcon, SearchIcon, User, LogOut } from 'lucide-react';
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

  // Hide header on landing page
  if (pathname === '/') return null;

  const links = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Journal', href: '/journal' },
    { label: 'Subscription', href: '/subscription' },
    { label: 'Reviews', href: '/reviews' },
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
            <div className="flex-1 max-w-2xl mx-auto hidden md:block">
              <MarketSearch>
                <Button
                  className="w-full h-11 justify-start px-6 bg-white border-2 border-black rounded-[100px] hover:bg-zinc-100 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.1)]"
                >
                  <div className="flex items-center gap-3">
                    <SearchIcon className="size-4 text-black" />
                    <span className="text-xs font-bold tracking-tight text-black">Search Stocks...</span>
                  </div>
                </Button>
              </MarketSearch>
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
                  className="h-11 w-11 rounded-full border-2 border-black bg-white text-black hover:bg-zinc-100 shadow-[0_4px_15px_rgba(0,0,0,0.1)] group relative overflow-hidden p-0"
                >
                  <ProfileImage src={session?.user?.image} name={session?.user?.name} />
                </Button>

                <AnimatePresence>
                  {profileOpen && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setProfileOpen(false)}
                        className="fixed inset-0 z-10"
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 mt-3 w-64 bg-white border-2 border-black rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] z-20 overflow-hidden"
                      >
                        <div className="p-5 border-b-2 border-black/5 bg-zinc-50">
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Signed in as</p>
                          <p className="font-headline font-bold text-black truncate">{session?.user?.name || session?.user?.email || "Agent Guest"}</p>
                          <p className="text-[11px] text-zinc-500 font-medium truncate">{session?.user?.email || "vaibhav@stockos.internal"}</p>
                        </div>
                        <div className="p-2">
                          <Button
                            variant="ghost"
                            className="w-full justify-start gap-3 rounded-2xl text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                            onClick={() => signOut({ callbackUrl: '/' })}
                          >
                            <LogOut className="size-4" />
                            <span className="font-bold text-xs uppercase tracking-widest">Logout System</span>
                          </Button>
                        </div>
                      </motion.div>
                    </>
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
                      onClick={() => signOut({ callbackUrl: '/' })}
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
      <div className="w-full h-full flex items-center justify-center bg-zinc-50">
        <User className="size-5 text-black transition-transform group-hover:scale-110" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name || "User"}
      className="w-full h-full object-cover"
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
