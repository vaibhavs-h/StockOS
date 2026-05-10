# 📈 StockOS

**An Institutional-Grade Wealth Terminal** — An AI-powered stock portfolio management system featuring a self-healing data pipeline, multi-source failover architecture, and a high-fidelity tactical interface.

[![Live Terminal](https://img.shields.io/badge/Live_Terminal-stock--os--kappa.vercel.app-10b981?style=for-the-badge&logo=vercel)](https://stock-os-kappa.vercel.app)

---

## ✨ Features

### 🛡️ Resilient Data Pipeline
- **Always-Online Architecture**: Automated failover between **Groww API** and **Yahoo Finance**.
- **Sync Engine**: The core `SyncEngine.ts` service handles automated pulses for holdings, history, and market assets.
- **Self-Healing Indices**: Real-time market data for **NIFTY 50**, **SENSEX**, and global benchmarks, served via an internal high-performance proxy.

### 🎨 Institutional Terminal UI
- **Market Intelligence Hub**: A high-density tactical feed with AI-distilled sector analysis, actionable recommendations, and risk assessments.
- **Smart Market Routing**: Intelligent asset detection that jumps from AI insights directly into specialized **US** or **Indian** research terminals.
- **Personalized Profile Header**: Custom-tailored dashboard with user-specific profile branding and interactive multi-portfolio switching.
- **High-Density Dashboard**: Ultra-compact vertical layout optimized for data-heavy institutional monitoring.
- **Stale-While-Revalidate Persistence**: Instant-on dashboard loading via `localStorage` caching—new data fetches in the background while you stay productive.
- **Geometric Harmonization**: A unified `rounded-3xl` design language across all consoles, creating a premium, cohesive aesthetic.

### 🏛️ Insight Desk (Journal)
- **High-Fidelity Dossiers**: Redesigned news feed featuring cinematic glassmorphism and institutional typography.
- **Dynamic Performance Hovers**: News items react to stock performance—hovering triggers **Neon Emerald** for gains and **Vibrant Rose** for losses.

### 🛠️ Recent Terminal Refinements
- **Universal Price Intel**: Fixed chart tooltips to handle all timeframes (1M, 1Y, ALL) by adding format-aware parsing for date strings and timestamps.
- **Institutional Market Labels**: Corrected market session terminology to professional standards: **PRE-MARKET**, **AFTER-HOURS**, and **MARKET LIVE**.
- **Refined Asset Discovery**: Simplified the holdings filter to prevent "Global Asset Discovery" overlap, keeping the portfolio view focused and tactical.
- **AI Assistant UX**: Perfected the Research Assistant interface with overflow-aware rounding and intuitive "Good/Bad" Lucide feedback triggers.
- **Stabilized Dev Environment**: Optimized local development porting (3003) to eliminate indices synchronization errors.

---

## 🚀 Getting Started

Access the production terminal directly at:
👉 **[stock-os-kappa.vercel.app](https://stock-os-kappa.vercel.app)**

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Deployment** | Vercel (Frontend) + Render (SyncEngine) |
| **Backend Engine** | Node.js + Express + `tsx` (SyncEngine.ts) |
| **Styling** | Tailwind CSS + Framer Motion |
| **Database** | Supabase (PostgreSQL) |
| **AI Insights** | n8n Webhook Proxy + OpenAI |
| **Charts** | Lightweight Charts + Recharts |

---

## 📁 Project Structure

```
StockOS/
├── src/
│   ├── app/
│   │   ├── dashboard/      # Main Wealth Terminal & Intelligence Hub
│   │   ├── api/            # Internal Intelligence Proxy
│   │   ├── stocks/         # Deep Stock Research (India)
│   │   └── us-stocks/      # Deep Stock Research (US)
│   ├── services/
│   │   ├── SyncEngine.ts   # CORE: Automated Portfolio & Market Heartbeat
│   │   └── DatabaseClient.ts # Centralized Realtime Data Interface
│   └── components/
│       └── dashboard/      # Tactical Data Visualizations
└── tailwind.config.ts      # Premium design system tokens
```

---

## 📜 License

MIT — Built with ❤️ by [Vaibhav](https://github.com/vaibhavs-h)
