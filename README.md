# 📈 StockOS

**An Institutional-Grade Wealth Terminal** — An AI-powered stock portfolio management system featuring a self-healing data pipeline, multi-source failover architecture, and a high-fidelity tactical interface.

[![Live Terminal](https://img.shields.io/badge/Live_Terminal-stock--os--kappa.vercel.app-10b981?style=for-the-badge&logo=vercel)](https://stock-os-kappa.vercel.app)

---

## ✨ Features

### 🛡️ Resilient Data Pipeline
- **Always-Online Architecture**: Automated failover between **Groww Partner Bridge** and **Yahoo Finance**.
- **Scheduler Engine**: The core `src/scheduler` system handles distributed jobs for live prices, deep analytics, and portfolio revaluation.
- **Self-Healing Indices**: Real-time market data for **NIFTY 50**, **SENSEX**, and global benchmarks, served via a high-performance proxy.
- **Excel Ingestion**: Institutional-grade portfolio importing via `ExcelImportService` for fast onboarding.

### 🎨 Institutional Terminal UI
- **Market Intelligence Hub**: A high-density tactical feed with AI-distilled sector analysis, actionable recommendations, and risk assessments.
- **Smart Market Routing**: Intelligent asset detection that jumps from AI insights directly into specialized **US** or **Indian** research terminals.
- **Personalized Profile Header**: Custom-tailored dashboard with user-specific profile branding and interactive multi-portfolio switching.
- **High-Density Dashboard**: Ultra-compact vertical layout optimized for data-heavy institutional monitoring.
- **Stale-While-Revalidate Persistence**: Instant-on dashboard loading via `localStorage` caching—new data fetches in the background.

### 🏛️ Insight Desk (Journal)
- **High-Fidelity Dossiers**: Redesigned news feed featuring cinematic glassmorphism and institutional typography.
- **Dynamic Performance Hovers**: News items react to stock performance—hovering triggers visual feedback for gains and losses.

---

## 🚀 Getting Started

Access the production terminal directly at:
👉 **[stock-os-kappa.vercel.app](https://stock-os-kappa.vercel.app)**

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Deployment** | Vercel (Frontend) + Render (Engine) |
| **Backend Engine** | Node.js + `tsx` (Scheduler Core) |
| **Styling** | Vanilla CSS + Tailwind CSS |
| **Database** | Supabase (PostgreSQL) |
| **AI Insights** | n8n Webhook Proxy + OpenAI |
| **Charts** | Lightweight Charts + Recharts |

---

## 📁 Project Structure

```
StockOS/
├── src/
│   ├── app/            # Next.js App Router (Dashboard, Research, Auth)
│   ├── scheduler/      # CORE: Distributed Sync Jobs & Heartbeat
│   │   ├── core/       # Engine logic & Orchestration
│   │   ├── jobs/       # Specialized sync tasks (Live, Deep, Analytics)
│   │   └── providers/  # Data connectors (Yahoo, Supabase)
│   ├── services/
│   │   ├── DatabaseClient.ts  # Centralized DB Interface
│   │   └── ExcelImportService.ts # Portfolio Ingestion Engine
│   ├── components/     # High-fidelity tactical UI components
│   └── server.ts       # Engine Entry Point
└── tailwind.config.ts  # Premium design system tokens
```

---

## 📜 License

MIT — Built with ❤️ by [Vaibhav](https://github.com/vaibhavs-h)
