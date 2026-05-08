"use client"

import Link from "next/link"
import "./CTAButton.css"

export function CTAButton() {
  return (
    <Link href="/auth/login" className="cta-button">
      <span>Enter Terminal</span>
    </Link>
  )
}
