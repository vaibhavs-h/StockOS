"use client"

import React, { useRef, useState } from "react";
import { MenuIcon, SearchIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetFooter } from '@/components/shared/Sheet';
import { Button } from '@/components/shared/Button';
import { cn } from '@/lib/utils';
import { MarketSearch } from '@/components/shared/MarketSearch';
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function TacticalHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Hide header on landing page
  if (pathname === '/') return null;

  const links = [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Journal', href: '/journal' },
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
            <div className="flex-1 hidden md:block">
              <MarketSearch>
                <Button
                  className="w-full h-12 justify-start px-6 bg-white border-2 border-black rounded-[100px] hover:bg-zinc-100 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.1)]"
                >
                  <div className="flex items-center gap-3">
                    <SearchIcon className="size-4 text-black" />
                    <span className="text-sm font-medium tracking-tight text-black">Search Stocks...</span>
                  </div>
                </Button>
              </MarketSearch>
            </div>

            <div className="flex items-center gap-6">
              {/* Desktop Navigation Pill */}
              <div className="hidden lg:flex items-center">
                <AnimatedTabs links={links} />
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
                    <Button variant="outline" className="w-full">Settings</Button>
                    <Button className="w-full">Logout</Button>
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
