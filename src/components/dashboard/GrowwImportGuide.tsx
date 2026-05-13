"use client"

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ExternalLink, Download, FileText, Calendar, ArrowLeft, Check } from 'lucide-react';

const steps = [
  {
    title: "Navigate to Reports",
    description: "First, go to the Groww Reports page to access your official statements.",
    image: "/Groww Holdings Fetch Guide/1-Groww Reports Page.jpg",
    icon: ExternalLink,
    action: "https://groww.in/user/profile/report"
  },
  {
    title: "Select Holdings Statement",
    description: "Scroll to the 'Stocks' section and find the 'Holdings Statement' option.",
    image: "/Groww Holdings Fetch Guide/2-Go To Stock Holdings Statement.jpg",
    icon: FileText
  },
  {
    title: "Pick Latest Date",
    description: "Ensure you select the most recent available date for accurate data.",
    image: "/Groww Holdings Fetch Guide/3-Select Latest Available Date.jpg",
    icon: Calendar
  },
  {
    title: "Download Excel",
    description: "Click the download button. The terminal expects the Excel (.xlsx) version.",
    image: "/Groww Holdings Fetch Guide/4-Click on Download.jpg",
    icon: Download
  }
];

interface GuideProps {
  onClose: () => void;
  embedded?: boolean;
}

export const GrowwImportGuide: React.FC<GuideProps> = ({ onClose, embedded = false }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const isLastStep = currentStep === steps.length - 1;

  const next = () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };
  const prev = () => setCurrentStep((s) => (s - 1 + steps.length) % steps.length);

  const content = (
    <div className="flex flex-col lg:flex-row gap-8 p-10 bg-zinc-950">
      {/* Left: Content */}
      <div className="flex-1 flex flex-col justify-between gap-10">
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                {React.createElement(steps[currentStep].icon, { className: "w-6 h-6 text-emerald-400" })}
              </div>
              <h3 className="text-3xl font-headline font-black text-white tracking-tighter leading-none">
                {steps[currentStep].title}
              </h3>
              <p className="text-[14px] text-zinc-400 font-medium leading-relaxed max-w-sm">
                {steps[currentStep].description}
              </p>

              {steps[currentStep].action && (
                <div className="pt-2">
                  <a 
                    href={steps[currentStep].action}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-black font-terminal-label font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all group"
                  >
                    Open Groww Reports
                    <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <button 
              onClick={prev}
              className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={next}
              className={cn(
                "flex-1 h-12 rounded-xl border flex items-center justify-between px-6 font-terminal-label font-bold text-[10px] uppercase tracking-[0.2em] transition-all",
                isLastStep 
                  ? "bg-emerald-500 text-black border-emerald-500 hover:bg-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.3)]" 
                  : "bg-white/5 text-white border-white/10 hover:bg-white/10"
              )}
            >
              {isLastStep ? "Finish & Sync" : "Next Step"}
              {isLastStep ? <Check className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
          
          {embedded && (
            <button 
              onClick={onClose}
              className="w-full py-3.5 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-center gap-2 text-[9px] font-terminal-label font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white hover:bg-white/5 transition-all group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to Sync
            </button>
          )}
        </div>
      </div>

      {/* Right: Preview Container */}
      <div className="flex-[1.6] flex items-center justify-center bg-black/40 rounded-[28px] border border-white/5 p-8 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full flex items-center justify-center"
          >
            <img 
              src={steps[currentStep].image} 
              alt={steps[currentStep].title}
              className="max-h-[480px] w-auto object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          </motion.div>
        </AnimatePresence>
        
        {/* Subtle Backdrop Glow */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0,transparent_70%)]" />
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-12 bg-black/80 backdrop-blur-2xl"
    >
      <div className="relative w-full max-w-6xl bg-zinc-950 border border-white/10 rounded-[32px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col">
        {/* Header (Solo Mode) */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Download className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-xl font-headline font-bold text-white tracking-tight">Import Guide</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-zinc-400 hover:text-white">
            <X className="w-8 h-8" />
          </button>
        </div>
        {content}
      </div>
    </motion.div>
  );
};

// Helper function for conditional classes
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
