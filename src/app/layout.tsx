import type { Metadata } from "next"
import { Inter, Outfit } from "next/font/google"
import "./globals.css"
import { TacticalHeader as Header } from "@/components/shared/TacticalHeader"
import { MarketTicker as Ticker } from "@/components/shared/MarketTicker"
import HeroWave from "@/components/shared/HeroWave"
import { Providers } from "./providers"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"


const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" })

export const metadata: Metadata = {
  title: "StockOS",
  description: "Next-generation stock portfolio management and AI assistant.",
  icons: {
    icon: "/logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${outfit.variable} font-sans bg-black text-white antialiased`}>
        <Providers>
          <Header />
          <main id="terminal-main">
            <HeroWave />
            {children}
          </main>
          <Ticker />
          <Analytics />
          <SpeedInsights />
        </Providers>
      </body>
    </html>
  )
}
