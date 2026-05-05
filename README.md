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
- **Real-time Heartbeat**: 30-second background polling ensures the dashboard reflects live market moves without manual refreshes.
- **High-Fidelity Visuals**: Dark-themed, glassmorphic design with neon accents and institutional typography.

### 📊 Market Intelligence
- **Live Index Tracking**: Real-time ticker for **NIFTY 50**, **SENSEX**, and **BANK NIFTY**.
- **Portfolio Snapshots**: Automated daily history recording to track long-term growth and performance metrics.
- **Deep Research**: Comprehensive stock-specific views with analyst consensus, market metrics, and technical indicators.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript |
| **Styling** | Vanilla CSS + Tailwind |
| **Database** | Supabase (PostgreSQL) |
| **Sync Engine** | Node.js + Express (Internal Pulse) |
| **Charts** | Lightweight Charts (TradingView) |
| **APIs** | Groww, Yahoo Finance 2, Supabase Realtime |

---

## 📁 Project Structure

```
StockOS/
├── src/
│   ├── app/
│   │   ├── dashboard/      # Main Wealth Terminal
│   │   ├── stocks/         # Deep Stock Research views
│   │   └── api/            # Serverless route handlers
│   ├── components/
│   │   └── wealth-chart/   # Sentiment-aware charting engine
│   ├── lib/
│   │   └── supabase.ts     # Realtime DB connection
│   └── server/
│       └── engine.ts       # CORE: Sync, Auth & Failover Engine
├── public/                 # Static assets & icons
└── tailwind.config.ts      # Premium design system tokens
```

---

## 🌐 APIs & Integrations

| Provider | Purpose | Key Required |
|---|---|---|
| [Groww](https://groww.in) | Primary Portfolio & Holdings Source | ✅ Yes |
| [Yahoo Finance](https://github.com/gadicc/yahoo-finance2) | Backup Pricing & Market Indices | ❌ No |
| [Supabase](https://supabase.com) | Database & Realtime Subscription | ✅ Yes |

---

## 📜 License

MIT — free to use, modify, and distribute.

---

⭐ **Star this repo if you find it helpful for your Fintech/Trading projects!**

Built with ❤️ by [Vaibhav](https://github.com/vaibhavs-h)
