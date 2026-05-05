import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL = "https://fnewsbackend.onrender.com";

const tabs = [
  { label: "Global", value: "global" },
  { label: "India", value: "india" },
  { label: "Saved", value: "saved" },
];

const impactMeta = {
  HIGH: {
    label: "High Impact",
    color: "#ef4444",
    soft: "rgba(239, 68, 68, 0.16)",
    weight: 3,
  },
  MEDIUM: {
    label: "Medium Impact",
    color: "#f97316",
    soft: "rgba(249, 115, 22, 0.16)",
    weight: 2,
  },
  LOW: {
    label: "Low Impact",
    color: "#eab308",
    soft: "rgba(234, 179, 8, 0.16)",
    weight: 1,
  },
};

function normalizeImpact(impact) {
  const normalized = String(impact || "LOW").toUpperCase();
  return impactMeta[normalized] ? normalized : "LOW";
}

function formatDateTime(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRecencyScore(publishedAt) {
  const publishedTime = new Date(publishedAt).getTime();
  if (Number.isNaN(publishedTime)) return 0;

  const ageInHours = Math.max(0, (Date.now() - publishedTime) / 36e5);
  return Math.max(0, 72 - ageInHours) / 72;
}

function getTrendingScore(item) {
  const impact = normalizeImpact(item.impact);
  const impactScore = impactMeta[impact].weight * 100;
  const recencyScore = getRecencyScore(item.publishedAt) * 100;
  const stockSignal = Math.min(Array.isArray(item.stocks) ? item.stocks.length : 0, 6) * 4;

  return impactScore + recencyScore + stockSignal;
}

function extractNewsItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.news)) return data.news;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.articles)) return data.articles;

  return [];
}

async function fetchNewsCategory(category) {
  const response = await fetch(`${API_BASE_URL}/api/news?category=${category}`);

  if (!response.ok) {
    throw new Error(`News request failed with status ${response.status}`);
  }

  return extractNewsItems(await response.json());
}

function sortNewsItems(items, sortMode, trendingMode) {
  const sorted = [...items];

  if (trendingMode) {
    return sorted.sort((a, b) => getTrendingScore(b) - getTrendingScore(a));
  }

  if (sortMode === "oldest") {
    return sorted.sort(
      (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
    );
  }

  if (sortMode === "impact") {
    return sorted.sort((a, b) => {
      const impactDiff =
        impactMeta[normalizeImpact(b.impact)].weight -
        impactMeta[normalizeImpact(a.impact)].weight;

      if (impactDiff !== 0) return impactDiff;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
  }

  return sorted.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

function NewsCard({ item, rank, trendingMode, onSave }) {
  const impact = normalizeImpact(item.impact);
  const meta = impactMeta[impact];
  const stocks = Array.isArray(item.stocks) ? item.stocks : [];

  return (
    <article className="news-card" style={{ "--impact-color": meta.color }}>
      <div className="impact-bar" />

      <div className="card-header">
        <div className="headline-block">
          <div className="impact-row">
            {trendingMode && <span className="rank-badge">#{rank}</span>}
            <span className="impact-pill" style={{ background: meta.soft, color: meta.color }}>
              <span className="impact-dot" style={{ background: meta.color }} />
              {meta.label}
            </span>
          </div>
          <h2>{item.title || "Untitled market update"}</h2>
        </div>

        <div className="source-meta">
          <strong>{item.source || "Unknown Source"}</strong>
          <span>{formatDateTime(item.publishedAt)}</span>
        </div>
      </div>

      {stocks.length > 0 && (
        <div className="stock-tags" aria-label="Related stocks">
          {stocks.map((stock) => (
            <span className="stock-tag" key={`${item._id}-${stock}`}>
              {stock}
            </span>
          ))}
        </div>
      )}

      <p className="summary">{item.summary || "No AI summary available for this story yet."}</p>

      <div className="why-box">
        <span>Why this matters</span>
        <p>{item.why || "This item may influence market positioning and sector sentiment."}</p>
      </div>

      <div className="card-actions">
        <button
          className={`save-button ${item.saved ? "is-saved" : ""}`}
          type="button"
          onClick={() => onSave(item._id)}
          disabled={!item._id}
        >
          {item.saved ? "Saved" : "Save"}
        </button>

        <a
          className="read-more"
          href={item.url}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!item.url}
          onClick={(event) => {
            if (!item.url) event.preventDefault();
          }}
        >
          Read More
        </a>
      </div>
    </article>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("global");
  const [sortMode, setSortMode] = useState("newest");
  const [trendingMode, setTrendingMode] = useState(false);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function fetchNews() {
      if (!API_BASE_URL) {
        setError("Missing REACT_APP_API_URL environment variable.");
        setNews([]);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const items = await fetchNewsCategory(activeTab);

        if (!ignore) setNews(items);
      } catch (requestError) {
        if (!ignore) {
          setError(requestError.message || "Unable to load market news.");
          setNews([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchNews();

    return () => {
      ignore = true;
    };
  }, [activeTab]);

  const visibleNews = useMemo(
    () => sortNewsItems(news, sortMode, trendingMode),
    [news, sortMode, trendingMode]
  );

  async function handleSave(id) {
    if (!id || !API_BASE_URL) return;

    const previousNews = news;
    setNews((currentNews) =>
      currentNews.map((item) => (item._id === id ? { ...item, saved: true } : item))
    );

    try {
      const response = await fetch(`${API_BASE_URL}/api/news/save/${id}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Save request failed with status ${response.status}`);
      }
    } catch (saveError) {
      setNews(previousNews);
      setError(saveError.message || "Unable to save this story.");
    }
  }

  return (
    <main className="dashboard-shell">
      <style>{styles}</style>

      <section className="dashboard-header">
        <div>
          <p className="eyebrow">AI Stock News Dashboard</p>
          <h1>StockOS</h1>
        </div>

        <div className="market-pulse">
          <span className="pulse-dot" />
          Live market intelligence
        </div>
      </section>

      <section className="controls-row" aria-label="News controls">
        <nav className="tabs" aria-label="News categories">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.value ? "active" : ""}
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="filters">
          <select
            aria-label="Sort news"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
            disabled={trendingMode}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="impact">High Impact First</option>
          </select>

          <button
            className={`trending-toggle ${trendingMode ? "active" : ""}`}
            type="button"
            onClick={() => setTrendingMode((current) => !current)}
          >
            {trendingMode ? "🔥 Trending View" : "Normal View"}
          </button>
        </div>
      </section>

      {error && <div className="state-banner error">{error}</div>}
      {loading && <div className="state-banner">Loading market-moving stories...</div>}

      {!loading && visibleNews.length === 0 && !error && (
        <div className="empty-state">
          <h2>No news found</h2>
          <p>Switch tabs or check back when fresh market updates arrive.</p>
        </div>
      )}

      <section className="news-grid" aria-label="Stock news">
        {visibleNews.map((item, index) => (
          <NewsCard
            item={item}
            key={item._id || `${item.title}-${index}`}
            rank={index + 1}
            trendingMode={trendingMode}
            onSave={handleSave}
          />
        ))}
      </section>
    </main>
  );
}

const styles = `
  :root {
    color-scheme: dark;
    background: #070a12;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background:
      radial-gradient(circle at top left, rgba(16, 185, 129, 0.13), transparent 30rem),
      linear-gradient(135deg, #070a12 0%, #0c111d 48%, #080b12 100%);
    color: #e5edf7;
    font-family:
      Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  button,
  select,
  a {
    font: inherit;
  }

  .dashboard-shell {
    min-height: 100vh;
    width: min(1440px, 100%);
    margin: 0 auto;
    padding: 28px;
  }

  .dashboard-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding: 18px 0 28px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .eyebrow {
    margin: 0 0 7px;
    color: #22d3ee;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: #f8fafc;
    font-size: clamp(2.3rem, 6vw, 4.5rem);
    font-weight: 800;
    letter-spacing: 0;
    line-height: 0.95;
  }

  .market-pulse {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    padding: 0 14px;
    border: 1px solid rgba(45, 212, 191, 0.28);
    border-radius: 6px;
    background: rgba(15, 23, 42, 0.68);
    color: #cbd5e1;
    white-space: nowrap;
  }

  .pulse-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.14);
  }

  .controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 22px 0;
  }

  .tabs,
  .filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .tabs {
    padding: 5px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.7);
  }

  .tabs button,
  .trending-toggle {
    min-height: 38px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    font-weight: 700;
    transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
  }

  .tabs button {
    min-width: 84px;
    padding: 0 16px;
  }

  .tabs button.active,
  .tabs button:hover,
  .trending-toggle.active,
  .trending-toggle:hover {
    border-color: rgba(34, 211, 238, 0.24);
    background: rgba(14, 165, 233, 0.16);
    color: #e0f2fe;
  }

  select,
  .trending-toggle {
    min-height: 42px;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.84);
    color: #dbeafe;
    padding: 0 14px;
  }

  select {
    cursor: pointer;
    outline: none;
  }

  select:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  .news-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    padding-bottom: 36px;
  }

  .news-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 330px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 8px;
    background:
      linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(8, 13, 24, 0.98)),
      #0f172a;
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.2);
    padding: 22px;
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .news-card:hover {
    transform: scale(1.012);
    border-color: color-mix(in srgb, var(--impact-color), rgba(148, 163, 184, 0.22) 55%);
    box-shadow: 0 24px 65px rgba(0, 0, 0, 0.34);
  }

  .impact-bar {
    position: absolute;
    inset: 0 auto 0 0;
    width: 4px;
    background: var(--impact-color);
  }

  .card-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
  }

  .headline-block {
    min-width: 0;
  }

  .impact-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }

  .impact-pill,
  .rank-badge {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    border-radius: 999px;
    font-size: 0.76rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .impact-pill {
    gap: 7px;
    padding: 0 10px;
  }

  .rank-badge {
    padding: 0 9px;
    background: rgba(34, 211, 238, 0.14);
    color: #67e8f9;
  }

  .impact-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
  }

  h2 {
    margin: 0;
    color: #f8fafc;
    font-size: 1.16rem;
    line-height: 1.32;
    letter-spacing: 0;
  }

  .source-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    color: #94a3b8;
    font-size: 0.78rem;
    text-align: right;
    white-space: nowrap;
  }

  .source-meta strong {
    color: #cbd5e1;
    font-size: 0.82rem;
  }

  .stock-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 18px 0 0;
  }

  .stock-tag {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    border: 1px solid rgba(125, 211, 252, 0.18);
    border-radius: 6px;
    background: rgba(8, 47, 73, 0.42);
    color: #bae6fd;
    font-size: 0.78rem;
    font-weight: 800;
    padding: 0 10px;
  }

  .summary {
    margin: 18px 0 0;
    color: #cbd5e1;
    font-size: 0.96rem;
    line-height: 1.62;
  }

  .why-box {
    margin-top: 18px;
    border-left: 3px solid #38bdf8;
    border-radius: 6px;
    background: rgba(14, 165, 233, 0.12);
    padding: 13px 15px;
  }

  .why-box span {
    display: block;
    margin-bottom: 5px;
    color: #7dd3fc;
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .why-box p {
    margin: 0;
    color: #dbeafe;
    line-height: 1.55;
  }

  .card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: auto;
    padding-top: 22px;
  }

  .save-button,
  .read-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 112px;
    min-height: 40px;
    border-radius: 6px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
  }

  .save-button {
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.7);
    color: #e2e8f0;
  }

  .save-button.is-saved {
    border-color: rgba(34, 197, 94, 0.34);
    background: rgba(22, 163, 74, 0.16);
    color: #bbf7d0;
  }

  .save-button:disabled,
  .read-more[aria-disabled="true"] {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .read-more {
    border: 1px solid rgba(34, 211, 238, 0.28);
    background: #0891b2;
    color: #ecfeff;
  }

  .save-button:hover:not(:disabled),
  .read-more:hover:not([aria-disabled="true"]) {
    transform: translateY(-1px);
  }

  .state-banner,
  .empty-state {
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.72);
    color: #cbd5e1;
  }

  .state-banner {
    margin-bottom: 18px;
    padding: 14px 16px;
  }

  .state-banner.error {
    border-color: rgba(248, 113, 113, 0.28);
    background: rgba(127, 29, 29, 0.22);
    color: #fecaca;
  }

  .empty-state {
    padding: 44px 24px;
    text-align: center;
  }

  .empty-state h2 {
    font-size: 1.35rem;
  }

  .empty-state p {
    margin: 10px 0 0;
    color: #94a3b8;
  }

  @media (max-width: 900px) {
    .dashboard-shell {
      padding: 20px;
    }

    .dashboard-header,
    .controls-row {
      align-items: stretch;
      flex-direction: column;
    }

    .market-pulse {
      width: fit-content;
    }

    .tabs,
    .filters {
      width: 100%;
    }

    .tabs button,
    select,
    .trending-toggle {
      flex: 1 1 140px;
    }

    .news-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 620px) {
    .dashboard-shell {
      padding: 16px;
    }

    .card-header {
      grid-template-columns: 1fr;
    }

    .source-meta {
      align-items: flex-start;
      text-align: left;
      white-space: normal;
    }

    .news-card {
      padding: 18px;
    }

    .card-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .save-button,
    .read-more {
      width: 100%;
    }
  }
`;

export default App;
