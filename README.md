# 📈 StockOS

**An Institutional-Grade Wealth Terminal** — An AI-powered stock portfolio management system featuring a self-healing data pipeline, multi-source failover architecture, and a high-fidelity tactical interface.

---

## ✨ Features

### 🛡️ Resilient Data Pipeline
- **Always-Online Architecture**: Automated failover between **Groww API** and **Yahoo Finance**.
- **Sync Engine**: The core `SyncEngine.ts` service handles 5-minute automated pulses for holdings, history, and market assets.
- **Self-Healing Indices**: Real-time market data for **NIFTY 50**, **SENSEX**, and global benchmarks, served via an internal high-performance proxy.

### 🎨 Institutional Terminal UI
- **Market Intelligence Hub**: A high-density tactical feed with AI-distilled sector analysis, actionable recommendations, and risk assessments.
- **AI Research Assistant**: A dedicated terminal sidebar for real-time stock analysis and portfolio insights, locked vertically to your holdings data.
- **Stale-While-Revalidate Persistence**: Instant-on dashboard loading via `localStorage` caching—new data fetches in the background while you stay productive.
- **Geometric Harmonization**: A unified `rounded-3xl` design language across all consoles, creating a premium, cohesive aesthetic.
- **Pulse Indicators**: Visual confirmation of background data refreshes and "Last Updated" timestamps in **IST**.

### 🏛️ Insight Desk (Journal)
- **High-Fidelity Dossiers**: Redesigned news feed featuring cinematic glassmorphism and institutional typography.
- **Dynamic Performance Hovers**: News items react to stock performance—hovering triggers **Neon Emerald** for gains and **Vibrant Rose** for losses.

---

## 🚀 Getting Started

StockOS runs as a dual-service architecture for maximum performance and reliability.

### 1. Environment Setup
Create a `.env` file in the root directory with the following tactical keys:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GROWW_API_KEY=your_groww_api_key
GROWW_TOTP_SECRET=your_totp_secret
NEXT_PUBLIC_N8N_WEBHOOK_URL=your_n8n_intelligence_endpoint
```

### 2. Launch the Terminal
Launch both the **Frontend** and the **Sync Engine** concurrently:
```bash
npm run dev
```
*The Sync Engine will warm-start on port 3003, while the Next.js dashboard launches on port 3000.*

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) |
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
│   │   └── stocks/         # Deep Stock Research views
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
