# 📈 StockOS

**An Institutional-Grade Wealth Terminal** — An AI-powered stock portfolio management system featuring a self-healing data pipeline, multi-source failover architecture, and a high-fidelity terminal interface.

---

## ✨ Features

### 🛡️ Resilient Data Pipeline
- **Always-Online Architecture**: Automated failover between **Groww API** and **Yahoo Finance**.
- **Hyper-Speed Internal Matching**: Bypasses external API rate limits by utilizing a local `market_assets` source of truth.
- **Self-Healing Sync**: 5-minute automated pulses ensure your holdings and history are always synchronized, even during primary API downtime.

### 🎨 Institutional Terminal UI
- **Sentiment-Aware Charts**: Dynamic "Profit/Loss" color morphing—graphs instantly flip to **Danger Red** or **Emerald Green** based on the trend.
- **Market Intelligence Search Hub**: Compact, glassmorphic search terminal with hard-wired, real-time indices (**Nifty, Sensex, Bank Nifty**) and kinetic hover effects.
- **Real-time Heartbeat**: 30-second background polling ensures the dashboard reflects live market moves without manual refreshes.
- **High-Fidelity Visuals**: Dark-themed, 3D-shader-backed design with neon accents and institutional typography (Inter & Outfit).
- **Persistent Indices Ticker**: Live bottom-scrolling ticker for **NIFTY 50**, **SENSEX**, **S&P 500**, and more.

### 🏛️ Insight Desk (Journal)
- **High-Fidelity Intelligence Dossiers**: Redesigned news feed featuring cinematic glassmorphism and high-density typography.
- **AI-Distilled News**: Real-time market updates with AI-generated "Terminal Insight" boxes for strategic context.
- **Dynamic Performance Hovers**: News items react to stock performance—hovering triggers **Neon Emerald** for gains and **Vibrant Rose** for losses.
- **Impact Analysis**: News categorized by market impact (High, Medium, Low) with animated neon pulse indicators.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS + Framer Motion |
| **Database** | Supabase (PostgreSQL) |
| **Sync Engine** | Node.js + Express (Internal Pulse) |
| **Charts** | Lightweight Charts (TradingView) + Recharts |
| **APIs** | Groww, Yahoo Finance 2, Supabase Realtime |
| **Fonts** | Inter, Outfit |

---

## 📁 Project Structure

```
StockOS/
├── src/
│   ├── app/
│   │   ├── dashboard/      # Main Wealth Terminal
│   │   ├── journal/        # AI Market Intelligence Hub
│   │   ├── stocks/         # Deep Stock Research views
│   │   └── layout.tsx      # Global Shell (Tactical Header & Ticker)
│   ├── components/
│   │   ├── shared/         # Tactical UI primitives (Search, Header, Ticker)
│   │   └── dashboard/      # Terminal-specific data visualizations
│   ├── services/
│   │   ├── SyncEngine.ts   # CORE: Automated Portfolio & Market Sync
│   │   └── DatabaseClient.ts # Centralized Realtime Data Interface
│   └── lib/
│       └── utils.ts        # Tactical utility functions
├── public/                 # Static assets & cinematic shaders
└── tailwind.config.ts      # Premium design system tokens
```

---

## 🌐 APIs & Integrations

| Provider | Purpose | Key Required |
|---|---|---|
| [Groww](https://groww.in) | Primary Portfolio & Holdings Source | ✅ Yes |
| [Yahoo Finance](https://github.com/gadicc/yahoo-finance2) | Backup Pricing & Market Indices | ❌ No |
| [Supabase](https://supabase.com) | Database & Realtime Subscription | ✅ Yes |
| [News Engine](https://fnewsbackend.onrender.com) | AI-Distilled Market Intelligence | ❌ No |

---

## 📜 License

MIT — Free to use, modify, and distribute.

---

⭐ **Star this Repository if you find it Helpful for your Fintech/Trading Projects!**

Built with ❤️ by [Vaibhav](https://github.com/vaibhavs-h)
