"use client"

import { signIn, useSession } from "next-auth/react"
import { motion } from "framer-motion"
import { Chrome, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function LoginPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    }
  }, [status, router])

  if (status === 'authenticated') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <div className="text-emerald-500 font-black tracking-[0.6em] uppercase text-xs animate-pulse">Session Active. Entering Terminal...</div>
        </div>
      </div>
    )
  }
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-transparent">

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="bg-zinc-950/50 backdrop-blur-3xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl shadow-black/50">
            <div className="text-center mb-10">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-block mb-6"
              >
                <span className="text-4xl font-normal tracking-[-0.05em] opacity-90 text-white">Stock</span>
                <span className="text-4xl font-bold tracking-tighter text-white">OS</span>
              </motion.div>
              <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Welcome Back</h1>
              <p className="text-zinc-500 text-sm tracking-wide uppercase font-medium">Institutional Terminal Access</p>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="w-full group relative flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-black font-bold py-4 px-6 rounded-xl transition-all duration-300 transform active:scale-[0.98] shadow-lg shadow-white/5"
              >
                <Chrome className="size-5" />
                <span className="tracking-tight">Continue with Google</span>
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </button>
              
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                  <span className="bg-transparent px-4 text-zinc-600">Secure Authentication</span>
                </div>
              </div>

              <p className="text-center text-zinc-500 text-xs leading-relaxed px-4">
                By signing in, you agree to our Terms of Service and Privacy Policy. Institutional grade encryption is active.
              </p>
            </div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center gap-4 text-center max-w-md mx-auto"
          >
            <div className="flex items-center gap-2 text-emerald-500 font-black uppercase tracking-[0.3em] text-[10.5px]">
              <ShieldCheck className="size-4" />
              Security Protocol
            </div>
            <p className="text-zinc-500 text-sm leading-relaxed font-medium">
              Your broker credentials <span className="text-white font-bold tracking-tight">never touch StockOS</span>. 
              Portfolio imports are <span className="text-emerald-400/90 font-bold">fully manual, secure, and user-controlled</span>.
            </p>
          </motion.div>
        </motion.div>
      </main>

    </div>
  )
}
