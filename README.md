# StockOS

> **A Premium Financial Operating System for Serious Investors.**

StockOS unifies Indian Equities (NSE/BSE), US Stocks, Mutual Funds, and AI-driven market intelligence into a single high-performance dashboard. Powered by a split-engine architecture, RAM-first real-time price synchronization, automated portfolio statement parsing, Razorpay subscription management, and an AI research assistant.

---

## ⚡ Key Capabilities

* **Multi-Asset Portfolio Intelligence**: Track Indian stocks (NSE/BSE), US equities, and Mutual Fund CAS statements with real-time P&L revaluation.
* **Automated Broker Imports**: Zero-effort import engine supporting **Zerodha CSV**, **Groww Excel**, and **CAMS/KFintech CAS PDF** statements.
* **Adaptive Pulse Sync Engine**: Express background engine running RAM-first dirty-write caching to update prices with up to 80% reduced database load.
* **AI Research Assistant**: Embedded dashboard assistant backed by an **n8n RAG pipeline** for contextual financial analysis.
* **Razorpay Subscription & Extensions**: Complete billing tiering (Free, Lite ₹149/mo, Pro ₹499/mo) featuring real-time countdown tickers, 7-day expiration warnings, plan locking, and duration extension stacking.
* **Real-time Notifications**: Automated alerts for price targets, subscription updates, plan renewals, and market summaries.

---

## 🏗️ Architecture Overview

StockOS runs two concurrent processes communicating via a shared Supabase PostgreSQL database:

```
                      ┌────────────────────────────────────────┐
                      │          Next.js App Router            │
                      │         (Port 3000 - Frontend)         │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
┌───────────────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
│     Razorpay SDK      │ ◄───┤   Supabase PostgreSQL │ ───►│    AI Assistant (n8n)  │
│  Payment Verification │     │   Database & Auth     │     │   RAG Vector Engine   │
└───────────────────────┘     └───────────▲───────────┘     └───────────────────────┘
                                          │
                      ┌───────────────────┴────────────────────┐
                      │          Pulse Sync Engine             │
                      │     (Port 3003 - Express / Cron)       │
                      └────────────────────────────────────────┘
```

* **Frontend**: Next.js 14 App Router, NextAuth (Google OAuth), Framer Motion, TailwindCSS.
* **Pulse Sync Engine**: Standalone TypeScript Express worker running continuous market heartbeats, AMFI NAV fetches, and priority queues.

---

## 💳 Subscriptions & Billing Flow

StockOS provides a complete monetization flow integrated with Razorpay:

| Tier | Monthly | Annual (Save 17%) | Key Access |
|---|---|---|---|
| **Free** | ₹0 | ₹0 | 1 Portfolio, Watchlists, Basic Market Summaries |
| **Lite** | ₹149 / mo | ₹1,499 / yr | Multi-Portfolio, CAS Statement Import, Extended History |
| **Pro** | ₹499 / mo | ₹4,999 / yr | Unlimited Portfolios, AI Chat Assistant, Priority Real-time Alerts |

### Subscription Logic & Protection:
* **Time Stacking Extensions**: Renewing an active plan adds duration (+1 Month or +1 Year) directly onto the existing expiration timestamp.
* **Active Plan Protection**: Prevents accidental tier downgrades/upgrades while a plan is active.
* **Automatic Expiration Revert**: Automatically reverts expired accounts back to the Free plan.

---

## 🛠️ Tech Stack

* **Frontend & Framework**: [Next.js 14](https://nextjs.org/) (App Router), React 18, TypeScript, NextAuth.js (Google OAuth), Base UI (`@base-ui/react`).
* **Styling, Animations & Shaders**: TailwindCSS, Framer Motion (Micro-animations & Gestures), Three.js (WebGL Shaders), Lucide React Icons, Class Variance Authority (`cva`), `clsx`, `tailwind-merge`.
* **Financial Charting & Visuals**: TradingView Lightweight Charts (`lightweight-charts`), Recharts.
* **Backend Sync Engine**: Express.js, Node.js, `node-cron` (Job Orchestrator), `tsx` (TypeScript Execution), `concurrently`.
* **Database & Caching**: [Supabase](https://supabase.com/) (PostgreSQL), `@supabase/supabase-js`, RAM-first `MarketStateCache` (Dirty-Write In-Memory Cache).
* **Statement Parsing & File Processing**: `xlsx` (Groww Statements), `csv-parse` (Zerodha Reports), `pdf-parse` (CAMS/KFintech CAS Statements), `multer` (File Upload Middleware).
* **Market Data Feeds**: `yahoo-finance2` (NSE/BSE & US Stocks), AMFI India NAV Feed, Alpha Vantage Sentiment & News API, RSS Ingestion.
* **Payments & Billing**: [Razorpay API & Webhooks](https://razorpay.com/) (`razorpay`), HMAC-SHA256 Verification.
* **AI & RAG Pipeline**: [n8n Workflow Automation](https://n8n.io/) (Pinecone / Supabase `pgvector`, OpenAI GPT-4 & Gemini Embeddings).
* **Infrastructure & Monitoring**: Vercel Analytics (`@vercel/analytics`), Vercel Speed Insights (`@vercel/speed-insights`), `dotenv`, `otplib`.

---

## 📁 Repository Structure

```text
├── src/
│   ├── app/                    # Next.js App Router pages & API routes
│   │   ├── api/                # Payments, Subscriptions, Notifications, Auth APIs
│   │   ├── subscription/       # Pricing & Plan Management UI
│   │   ├── dashboard/          # Financial Command Center
│   │   ├── stocks/             # Stock Analysis Pages
│   │   └── journal/            # News Intelligence & Journal
│   ├── components/             # Reusable UI components & Tactical Header
│   ├── lib/                    # Auth configuration & utilities
│   ├── services/               # Database client, Alert service, Statement parsers
│   └── server.ts               # Pulse Sync Engine & Background Scheduler
├── scratch/                    # SQL migrations & verification scripts
└── README.md
```

---

## 🛡️ License

StockOS is proprietary software. All rights reserved.