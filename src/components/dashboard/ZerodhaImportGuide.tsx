"use client"

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ExternalLink, Download, FileText, Calendar, ArrowLeft, Check, Info } from 'lucide-react';

const steps = [
  {
    title: "Open Zerodha Console",
    description: "Start by navigating to your Zerodha Console dashboard to access your portfolio reports.",
    image: "/Zerodha Holdings Fetch Guide/1-ZerodhaDashboardPage.webp",
    icon: ExternalLink,
    action: "https://console.zerodha.com/"
  },
  {
    title: "Navigate to Holdings",
    description: "Click on 'Portfolio' in the top navigation bar, then select 'Holdings' from the dropdown.",
    image: "/Zerodha Holdings Fetch Guide/2-GoToHoldings.webp",
    icon: FileText
  },
  {
    title: "Configure Equity View",
    description: "Select 'Equity' as the asset class and ensure the filter is set to 'All Equity' to capture all your assets.",
    image: "/Zerodha Holdings Fetch Guide/3-SelectEquityAndSetItToAllEquityIfNotAlready.webp",
    icon: Info
  },
  {
    title: "Download Statement",
    description: "Click the download icon to export your holdings. The terminal prefers the CSV version for the most accurate sync.",
    image: "/Zerodha Holdings Fetch Guide/4-ClickDownload.webp",
    icon: Download
  }
];

interface GuideProps {
  onClose: () => void;
  embedded?: boolean;
}

export const ZerodhaImportGuide: React.FC<GuideProps> = ({ onClose, embedded = false }) => {
  const [[currentStep, direction], setStep] = useState([0, 0]);

  const isLastStep = currentStep === steps.length - 1;

  const next = () => {
    if (isLastStep) {
      onClose();
    } else {
      setStep([currentStep + 1, 1]);
    }
  };

  const prev = () => {
    if (currentStep > 0) {
      setStep([currentStep - 1, -1]);
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 40 : direction < 0 ? -40 : 0,
      opacity: 0,
      filter: 'blur(8px)',
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      filter: 'blur(0px)',
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 40 : direction > 0 ? -40 : 0,
      opacity: 0,
      filter: 'blur(8px)',
    })
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  };

  const staggerItem = {
    hidden: { opacity: 0, y: 10 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.4,
        ease: [0.23, 1, 0.32, 1]
      }
    }
  };

  const content = (
    <div className="flex flex-col lg:flex-row gap-8 p-10 bg-zinc-950 h-[640px]">
      {/* Left: Content */}
      <div className="flex-1 flex flex-col justify-between gap-10 h-full">
        <div className="relative overflow-hidden flex-1">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 }
              }}
              className="space-y-6 h-full"
            >
              <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
                <motion.div 
                  variants={staggerItem}
                  className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20"
                >
                  {React.createElement(steps[currentStep].icon, { className: "w-6 h-6 text-indigo-400" })}
                </motion.div>
                
                <div className="space-y-3">
                  <motion.h3 
                    variants={staggerItem}
                    className="text-3xl font-headline font-black text-white tracking-tighter leading-none"
                  >
                    {steps[currentStep].title}
                  </motion.h3>
                  
                  <motion.p 
                    variants={staggerItem}
                    className="text-[14px] text-zinc-400 font-medium leading-relaxed max-w-sm"
                  >
                    {steps[currentStep].description}
                  </motion.p>
                </div>

                {steps[currentStep].action && (
                  <motion.div variants={staggerItem} className="pt-2">
                    <a 
                      href={steps[currentStep].action}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-white text-black font-terminal-label font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-400 active:scale-95 transition-all group"
                    >
                      Open Zerodha Console
                      <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </a>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-6 pt-4 border-t border-white/5">
          {/* Progress Indicator */}
          <div className="flex gap-1.5 h-1">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={cn(
                  "flex-1 rounded-full transition-all duration-500",
                  i === currentStep ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : i < currentStep ? "bg-indigo-500/40" : "bg-white/10"
                )} 
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={prev}
              disabled={currentStep === 0}
              className={cn(
                "w-12 h-12 rounded-full border border-white/10 flex items-center justify-center transition-all active:scale-90",
                currentStep === 0 ? "opacity-30 cursor-not-allowed" : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button 
              onClick={next}
              className={cn(
                "flex-1 h-12 rounded-xl border flex items-center justify-between px-6 font-terminal-label font-bold text-[10px] uppercase tracking-[0.2em] transition-all active:scale-[0.98] group overflow-hidden relative",
                isLastStep 
                  ? "bg-indigo-500 text-black border-indigo-500 hover:bg-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.2)]" 
                  : "bg-white/5 text-white border-white/10 hover:bg-white/10"
              )}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isLastStep ? 'finish' : 'next'}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between w-full"
                >
                  {isLastStep ? "Finish & Sync" : "Next Step"}
                  {isLastStep ? <Check className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
          
          {embedded && (
            <button 
              onClick={onClose}
              className="w-full py-3.5 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-center gap-2 text-[9px] font-terminal-label font-black uppercase tracking-[0.2em] text-zinc-500 hover:text-white hover:bg-white/5 transition-all group active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to Sync
            </button>
          )}
        </div>
      </div>

      {/* Right: Preview Container */}
      <div className="flex-[1.6] h-full flex items-center justify-center bg-black/40 rounded-[28px] border border-white/5 p-8 relative overflow-hidden group/preview">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 200, damping: 25 },
              opacity: { duration: 0.3 }
            }}
            className="w-full h-full flex items-center justify-center"
          >
            <motion.img 
              src={steps[currentStep].image} 
              alt={steps[currentStep].title}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="max-h-full w-auto object-contain rounded-2xl shadow-2xl border border-white/10"
            />
          </motion.div>
        </AnimatePresence>
        
        {/* Subtle Backdrop Glow */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0,transparent_70%)] opacity-0 group-hover/preview:opacity-100 transition-opacity duration-1000" />
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
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Download className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-xl font-headline font-bold text-white tracking-tight">Zerodha Import Guide</h2>
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
