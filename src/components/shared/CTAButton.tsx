"use client"

import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import "./CTAButton.css"

export function CTAButton() {
  const { status } = useSession()
  const router = useRouter()

  const handleEnter = () => {
    if (status === 'authenticated') {
      router.push('/dashboard')
    } else {
      router.push('/auth/login')
    }
  }

  return (
    <button onClick={handleEnter} className="cta-button">
      <span>Enter Terminal</span>
    </button>
  )
}
