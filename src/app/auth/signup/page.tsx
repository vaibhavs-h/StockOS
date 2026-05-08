"use client"

import { signIn } from "next-auth/react"
import { BackgroundShader } from "@/components/shared/BackgroundShader"
import { Footer } from "@/components/shared/Footer"
import { motion } from "framer-motion"
import { Chrome } from "lucide-react"

export default function SignupPage() {
  return (
    <div className="relative min-h-screen w-full flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <BackgroundShader />
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-24">
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
              <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Create Account</h1>
              <p className="text-zinc-500 text-sm tracking-wide uppercase font-medium">Join the Intelligence Network</p>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="w-full group relative flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-black font-bold py-4 px-6 rounded-xl transition-all duration-300 transform active:scale-[0.98] shadow-lg shadow-white/5"
              >
                <Chrome className="size-5" />
                <span className="tracking-tight">Sign up with Google</span>
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </button>
              
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                  <span className="bg-transparent px-4 text-zinc-600">Fast Enrollment</span>
                </div>
              </div>

              <p className="text-center text-zinc-500 text-xs leading-relaxed px-4">
                By creating an account, you agree to our Terms of Service and Privacy Policy. All data is encrypted at rest.
              </p>
            </div>
          </div>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-center text-zinc-500 text-sm"
          >
            Already have an account? <span className="text-white font-medium cursor-pointer hover:underline" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>Sign In</span>
          </motion.p>
        </motion.div>
      </main>

      <Footer />
    </div>
  )
}
