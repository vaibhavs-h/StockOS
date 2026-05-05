"use client"

import Link from "next/link"
import "./cta-button.css"

export function CTAButton() {
  return (
    <Link href="/dashboard" className="cta-button">
      <span>View Dashboard</span>
    </Link>
  )
}
