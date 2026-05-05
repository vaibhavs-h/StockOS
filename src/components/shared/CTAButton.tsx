"use client"

import Link from "next/link"
import "./CTAButton.css"

export function CTAButton() {
  return (
    <Link href="/dashboard" className="cta-button">
      <span>Enter Dashboard</span>
    </Link>
  )
}
