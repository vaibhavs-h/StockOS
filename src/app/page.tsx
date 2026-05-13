"use client"

import { BackgroundShader } from "@/components/shared/BackgroundShader"
import { CTAButton } from "@/components/shared/CTAButton"
import { motion } from "framer-motion"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function Home() {
  const { status } = useSession()
  const router = useRouter()
  return (
    <main 
      className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden"
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <BackgroundShader />
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 text-center px-4 mb-32">
        <motion.h1 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
          className="text-8xl md:text-[12rem] font-bold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-amber-400"
        >
          StockOS
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.8, delay: 1.0 }}
          className="text-lg md:text-xl text-white/50 max-w-4xl mx-auto mb-16 font-medium tracking-[0.1em] uppercase"
        >
          Intelligence refined. The terminal for the modern trader.
        </motion.p>
      </div>

      {/* Bottom Action Area */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 1.5 }}
        className="absolute bottom-20 z-20"
      >
        <CTAButton />
      </motion.div>
    </main>
  )
}
