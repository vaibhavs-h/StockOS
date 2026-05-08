import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full border-t border-white/5 bg-zinc-950/40 backdrop-blur-xl py-12">
      <div className="mx-auto max-w-[1700px] px-8 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex flex-col gap-2">
          <Link href="/" className="group">
            <p className="font-sans text-white leading-none select-none flex items-baseline transition-opacity group-hover:opacity-80">
              <span className="text-2xl font-normal tracking-[-0.05em] opacity-90">Stock</span>
              <span className="text-2xl font-bold tracking-tighter">OS</span>
            </p>
          </Link>
          <p className="text-zinc-500 text-sm tracking-tight">
            © {new Date().getFullYear()} StockOS. Institutional Intelligence.
          </p>
        </div>

        <div className="flex gap-8">
          <Link href="#" className="text-zinc-400 hover:text-white transition-colors text-sm uppercase tracking-widest font-medium">Privacy</Link>
          <Link href="#" className="text-zinc-400 hover:text-white transition-colors text-sm uppercase tracking-widest font-medium">Terms</Link>
          <Link href="#" className="text-zinc-400 hover:text-white transition-colors text-sm uppercase tracking-widest font-medium">Support</Link>
        </div>
      </div>
    </footer>
  );
}
