"use client"

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
	Search,
	FileUp,
	Cpu,
	Wallet,
	Globe,
	Plus,
	Trash2,
	Database,
	ChevronDown,
	ChevronUp,
	ArrowUpDown,
	RefreshCcw,
	ChevronRight,
	Clock,
	ShieldAlert,
	ShieldCheck,
	FileJson,
	X,
	Info,
	Edit2,
	Check,
	Zap,
	PieChart,
	LayoutGrid,
	Lock,
	UploadCloud,
	FileText,
	TrendingDown,
	TrendingUp,
	Activity,
	Loader2,
	CheckCircle2,
	AlertTriangle
} from "lucide-react"

import { supabase } from "@/services/DatabaseClient"
import axios from "axios"
import { WealthPerformanceChart as WealthChart } from "@/components/dashboard/WealthPerformanceChart"
import { getMarketStatus } from "@/constants/market-constants"
import { UTCTimestamp } from 'lightweight-charts'
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { getDbUserId } from "@/lib/user"
import { useSession } from "next-auth/react"
import { GrowwImportGuide } from "@/components/dashboard/GrowwImportGuide"
import { ZerodhaImportGuide } from "@/components/dashboard/ZerodhaImportGuide"
import { MFImportGuide } from "@/components/dashboard/MFImportGuide"
import { RollingNumber } from "@/components/shared/RollingNumber"
import { AssetLogo } from "@/components/shared/AssetLogo"
import { getAssetColors } from "@/utils/logo-utils"
import { PortfolioAnalyzer } from "@/components/dashboard/PortfolioAnalyzer"
import { MFPortfolioAnalyzer } from "@/components/dashboard/MFPortfolioAnalyzer"
import { WatchlistTerminal } from "@/components/dashboard/WatchlistTerminal"
import { InstitutionalNews } from "@/components/dashboard/InstitutionalNews"


const TOTAL_WEALTH = { id: 'total', name: 'Total Wealth', type: 'TOTAL' };
const EQUITY_AGGREGATE = { id: 'overall', name: 'Equity Aggregate', type: 'EQUITY' };
const MF_AGGREGATE = { id: 'mf_overall', name: 'Mutual Funds', type: 'MF' };


export default function DashboardPage() {
	const router = useRouter()
	const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3003';
	const [mounted, setMounted] = useState(false)
	const [holdings, setHoldings] = useState<any[]>([])
	const [indices, setIndices] = useState<any[]>(() => {
		if (typeof window !== 'undefined') {
			const cached = localStorage.getItem('stockos_indices_cache');
			if (cached) {
				try { return JSON.parse(cached); } catch (e) { return []; }
			}
		}
		return [];
	})
	const [history, setHistory] = useState<any[]>([])
	const [portfolios, setPortfolios] = useState<any[]>([])
	const [activePortfolio, setActivePortfolio] = useState<any | null>(null)
	const isMFActive = activePortfolio?.type === 'MF' || activePortfolio?.id?.startsWith('mf');
	const [loading, setLoading] = useState(true)

	// Mutual Funds State
	const [mfHoldings, setMfHoldings] = useState<any[]>([])
	const [mfSummary, setMfSummary] = useState<any>(null)
	const [loadingMF, setLoadingMF] = useState(false)

	// CAS Import States
	const [showCASImport, setShowCASImport] = useState(false)
	const [newMFPortfolioName, setNewMFPortfolioName] = useState("")
	const [casFile, setCasFile] = useState<File | null>(null)
	const [casPassword, setCasPassword] = useState("")
	const [casImporting, setCasImporting] = useState(false)
	const [casImportStep, setCasImportStep] = useState(0) // 0: input, 1: parsing, 2: success, 3: fail
	const [casError, setCasError] = useState("")
	const [casSuccessData, setCasSuccessData] = useState<any>(null)
	const [showCASGuide, setShowCASGuide] = useState(false)

	useEffect(() => {
		if (showCASImport) {
			const mfPortfoliosCount = portfolios.filter(p => p.type === 'MF').length;
			setNewMFPortfolioName(`CAS Folio ${mfPortfoliosCount + 1}`);
		}
	}, [showCASImport, portfolios]);

	useEffect(() => {
		if (activePortfolio && typeof window !== 'undefined') {
			localStorage.setItem('stockos_active_portfolio_id', activePortfolio.id);
		}
	}, [activePortfolio]);

	const [isRefreshing, setIsRefreshing] = useState(false)
	const [importStatus, setImportStatus] = useState<string>("")
	const [searchQuery, setSearchQuery] = useState("")
	const [mfSearchQuery, setMfSearchQuery] = useState("")
	const [timeRange, setTimeRange] = useState("ALL")
	const [searchResults, setSearchResults] = useState<any[]>([])
	const [isSearching, setIsSearching] = useState(false)
	const [isPortfolioDropdownOpen, setIsPortfolioDropdownOpen] = useState(false)
	const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null)
	const [editName, setEditName] = useState("")
	const [holdingsTab, setHoldingsTab] = useState<'EQUITY' | 'MUTUAL_FUNDS'>('EQUITY')

	const savePortfolioName = async (portfolioId: string) => {
		if (!editName.trim()) return;
		try {
			const { error } = await supabase
				.from('user_portfolios')
				.update({ name: editName.trim() })
				.eq('id', portfolioId);

			if (error) throw error;

			const updatedPortfolios = portfolios.map(p =>
				p.id === portfolioId ? { ...p, name: editName.trim() } : p
			);
			setPortfolios(updatedPortfolios);

			if (activePortfolio?.id === portfolioId) {
				setActivePortfolio({ ...activePortfolio, name: editName.trim() });
			}

			setEditingPortfolioId(null);
		} catch (err) {
			console.error("[PORTFOLIO] Error updating name:", err);
		}
	}

	const handleCASImportSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!casFile) {
			setCasError("Please upload a valid CAS PDF file.")
			return
		}
		if (!casFile.name.toLowerCase().endsWith('.pdf')) {
			setCasError("Invalid File Format: Only PDF statements are supported. Please upload a valid .pdf file.")
			return
		}
		if (!casPassword) {
			setCasError("Password is required for encrypted statements.")
			return
		}

		setCasImporting(true)
		setCasImportStep(1)
		setCasError("")

		const formData = new FormData()
		formData.append("file", casFile)
		formData.append("password", casPassword)
		formData.append("portfolioName", newMFPortfolioName.trim() || `CAS Folio ${portfolios.filter(p => p.type === 'MF').length + 1}`)
		formData.append("userId", portfolioId)

		try {
			const response = await fetch(`${engineUrl}/api/portfolio/import-cas`, {
				method: "POST",
				body: formData
			})

			// Content-type shielding to prevent "Unexpected token <" HTML parsing errors
			const contentType = response.headers.get("content-type");
			if (!contentType || !contentType.includes("application/json")) {
				const text = await response.text();
				console.error("[CAS-IMPORT] Non-JSON response:", text);
				throw new Error(`Server returned non-JSON response (Status: ${response.status}). The engine backend might have crashed or returned an error page.`);
			}

			const data = await response.json()

			if (response.ok && data.success) {
				setCasSuccessData(data)
				setCasImportStep(2)
				// Refresh portfolios and mutual funds data
				await fetchPortfolios()
				fetchMFPortfolio()
			} else {
				setCasError(data.error || "Ingestion workflow failed. Please verify credentials.")
				setCasImportStep(3)
			}
		} catch (err: any) {
			setCasError(err.message || "An unexpected network error occurred.")
			setCasImportStep(3)
		} finally {
			setCasImporting(false)
		}
	};
	const [syncLogs, setSyncLogs] = useState<any[]>([])
	const [showSyncConsole, setShowSyncConsole] = useState(false)
	const [lastSyncTime, setLastSyncTime] = useState<string>('SYNCHRONIZING...')

	// Stable daily P/L from server-side aggregate (avoids frontend partial-read race condition)
	const [dailyPLData, setDailyPLData] = useState<{ total_day_change: number; day_change_percentage: number } | null>(null);

	useEffect(() => {
		setMounted(true);
		if (typeof window !== 'undefined') {
			window.scrollTo(0, 0);
		}
	}, []);


	const { data: session, status } = useSession()
	const portfolioId = (session?.user as any)?.id || process.env.NEXT_PUBLIC_PORTFOLIO_ID || "guest";

	const formattedName = useMemo(() => {
		if (status === 'loading') return "Fetching User's Name...";

		const rawName = session?.user?.name || "GUEST";
		const parts = rawName.trim().split(/\s+/);
		if (parts.length === 0 || !parts[0]) return "GUEST";
		if (parts.length === 1) return parts[0].toUpperCase();

		const firstName = parts[0];
		const secondPart = parts[1];
		return `${firstName} ${secondPart[0]}.`.toUpperCase();
	}, [session?.user?.name, status]);

	// Portfolio Linking State
	const [addPortfolioModalOpen, setAddPortfolioModalOpen] = useState(false)
	const [isResyncMode, setIsResyncMode] = useState(false)
	const [newPortfolioType, setNewPortfolioType] = useState<'GROWW' | 'ZERODHA' | ''>('')
	const [newPortfolioName, setNewPortfolioName] = useState('')
	const [resyncPortfolioId, setResyncPortfolioId] = useState<string | null>(null)
	const [showGrowwGuide, setShowGrowwGuide] = useState(false)
	const [showZerodhaGuide, setShowZerodhaGuide] = useState(false)


	// Debounce ref: prevents partial-read flicker when revaluation job batch-upserts holdings
	const holdingsFetchTimer = useRef<NodeJS.Timeout | null>(null);


	const fetchHoldings = async () => {
		if (!activePortfolio) return;
		if (status === "loading") return;
		try {
			let query = supabase.from('holdings').select('*, user_portfolios(name)');

			if (activePortfolio.id === 'overall' || activePortfolio.id === 'total') {
				query = query.eq('user_id', portfolioId);
			} else if (isMFActive) {
				setHoldings([]);
				return;
			} else {
				query = query.eq('portfolio_id', activePortfolio.id);
			}

			const { data, error } = await query.order('market_value', { ascending: false });

			if (error) throw error;
			setHoldings(data || []);
			setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
		} catch (err) {
			console.error("[DASHBOARD] Fetch holdings failed:", err);
		} finally {
			setLoading(false);
		}
	};

	const fetchMFPortfolio = async () => {
		if (!portfolioId) return;
		if (status === "loading") return;
		setLoadingMF(true);
		try {
			let url = "/api/mutual-funds/portfolio";
			if (activePortfolio?.type === 'MF' && activePortfolio.id !== 'mf_overall') {
				url += `?portfolio_id=${activePortfolio.id}`;
			}
			const separator = url.includes('?') ? '&' : '?';
			const response = await fetch(`${url}${separator}t=${Date.now()}`, { cache: 'no-store' });
			const data = await response.json();
			if (response.ok) {
				setMfHoldings(data.holdings || []);
				if (data.summary) {
					setMfSummary({
						current_value: Number(data.summary.total_market_value) || 0,
						total_investment: Number(data.summary.total_invested) || 0,
						daily_change: Number(data.summary.total_day_change) || 0,
						daily_change_percentage: Number(data.summary.total_day_change_percentage) || 0,
						...data.summary
					});
				} else {
					setMfSummary(null);
				}
			}
		} catch (e) {
			console.error("[DASHBOARD] Failed to fetch mutual fund portfolio", e);
		} finally {
			setLoadingMF(false);
		}
	};

	// Debounced version: waits 3s for all batch upsert rows to settle before fetching
	const debouncedFetchHoldings = () => {
		if (holdingsFetchTimer.current) clearTimeout(holdingsFetchTimer.current);
		holdingsFetchTimer.current = setTimeout(() => {
			fetchHoldings();
			if (activePortfolio) fetchDailyPL(activePortfolio.id);
		}, 3000);
	};


	const fetchDailyPL = async (pId: string) => {
		try {
			const res = await axios.get(`/api/portfolio/daily-pl?portfolio_id=${pId}&user_id=${portfolioId}&t=${Date.now()}`);
			setDailyPLData(res.data);
		} catch (err) {
			console.error("[DASHBOARD] Daily P/L fetch failed:", err);
		}
	};

	const fetchHistory = async () => {
		if (!activePortfolio) return;
		if (status === "loading") return;
		try {
			let data: any[] = [];
			if (activePortfolio.id === 'total') {
				const [eqRes, mfRes] = await Promise.all([
					supabase.from('portfolio_history').select('*').eq('user_id', portfolioId).order('timestamp', { ascending: true }),
					supabase.from('mutual_fund_portfolio_history').select('*').eq('user_id', portfolioId).order('timestamp', { ascending: true })
				]);
				if (eqRes.error) throw eqRes.error;
				if (mfRes.error) throw mfRes.error;

				const eqData = (eqRes.data || []).map(h => ({ ...h, is_mf: false }));
				const mfData = (mfRes.data || []).map(h => ({ ...h, is_mf: true }));
				data = [...eqData, ...mfData].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
			} else if (isMFActive) {
				let query = supabase.from('mutual_fund_portfolio_history').select('*').eq('user_id', portfolioId);
				if (activePortfolio.id !== 'mf_overall') {
					query = query.eq('portfolio_id', activePortfolio.id);
				}
				const { data: resData, error } = await query.order('timestamp', { ascending: true });
				if (error) throw error;
				data = (resData || []).map(h => ({ ...h, is_mf: true }));
			} else {
				let query = supabase.from('portfolio_history').select('*');
				if (activePortfolio.id === 'overall') {
					query = query.eq('user_id', portfolioId);
				} else {
					query = query.eq('portfolio_id', activePortfolio.id);
				}
				const { data: resData, error } = await query.order('timestamp', { ascending: true });
				if (error) throw error;
				data = (resData || []).map(h => ({ ...h, is_mf: false }));
			}

			if ((activePortfolio.id === 'overall' || activePortfolio.id === 'mf_overall' || activePortfolio.id === 'total') && data) {
				// Aggregate multi-portfolio history by financial day using chronological carry-forward logic
				const dayPortMap = new Map<string, Map<string, any>>();

				data.forEach(h => {
					const dateObj = new Date(h.timestamp);
					// Financial day starts at 6 AM IST
					const financialDayDate = new Date(dateObj.getTime() - (6 * 60 * 60 * 1000));
					const dateKey = new Intl.DateTimeFormat('en-CA', {
						timeZone: 'Asia/Kolkata',
						year: 'numeric',
						month: '2-digit',
						day: '2-digit'
					}).format(financialDayDate);

					if (!dayPortMap.has(dateKey)) {
						dayPortMap.set(dateKey, new Map<string, any>());
					}

					const portMap = dayPortMap.get(dateKey)!;
					const portKey = `${h.is_mf ? 'mf_' : 'eq_'}${h.portfolio_id || 'default_port'}`;
					const existing = portMap.get(portKey);

					// Keep the latest snapshot for each portfolio on that day
					if (!existing || new Date(h.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
						portMap.set(portKey, h);
					}
				});

				// Sort the dates chronologically
				const sortedDates = Array.from(dayPortMap.keys()).sort();

				// Keep a running map of the latest known snapshots for each portfolio
				const latestPortSnapshots = new Map<string, any>();

				const aggregatedHistory = sortedDates.map(dateKey => {
					const daySnapshots = dayPortMap.get(dateKey)!;

					// Update running latest snapshots with today's data
					daySnapshots.forEach((snap, portKey) => {
						latestPortSnapshots.set(portKey, snap);
					});

					// Sum values of all portfolios up to this day
					let total_market_value = 0;
					let total_investment = 0;
					let firstSnapshot: any = null;

					latestPortSnapshots.forEach(snap => {
						total_market_value += Number(snap.total_market_value) || 0;
						total_investment += Number(snap.total_investment) || 0;
						if (!firstSnapshot) {
							firstSnapshot = snap;
						}
					});

					return {
						...firstSnapshot,
						timestamp: dateKey + "T12:00:00Z", // Use noon UTC for the day's record
						portfolio_id: activePortfolio.id,
						total_market_value,
						total_investment
					};
				});

				setHistory(aggregatedHistory);
			} else {
				// Keep only the latest snapshot per calendar day (financial day basis) for individual portfolios
				const dayMap = new Map<string, any>();
				(data || []).forEach(h => {
					const dateObj = new Date(h.timestamp);
					const financialDayDate = new Date(dateObj.getTime() - (6 * 60 * 60 * 1000));
					const dateKey = new Intl.DateTimeFormat('en-CA', {
						timeZone: 'Asia/Kolkata',
						year: 'numeric',
						month: '2-digit',
						day: '2-digit'
					}).format(financialDayDate);

					const existing = dayMap.get(dateKey);
					if (!existing || new Date(h.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
						dayMap.set(dateKey, h);
					}
				});

				const deduplicatedHistory = Array.from(dayMap.values()).map(h => ({
					...h,
					portfolio_id: activePortfolio.id
				})).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
				setHistory(deduplicatedHistory);
			}
		} catch (err) {
			console.error("[DASHBOARD] Fetch history failed:", err);
		}
	};



	const fetchPortfolios = async () => {
		if (!portfolioId) return;
		try {
			const { data, error } = await supabase
				.from('user_portfolios')
				.select('*')
				.eq('user_id', portfolioId)
				.order('is_primary', { ascending: false });

			if (error) throw error;
			setPortfolios(data || []);

			let restored = false;
			if (typeof window !== 'undefined') {
				const savedId = localStorage.getItem('stockos_active_portfolio_id');
				if (savedId) {
					if (savedId === 'total') {
						setActivePortfolio(TOTAL_WEALTH);
						restored = true;
					} else if (savedId === 'overall') {
						setActivePortfolio(EQUITY_AGGREGATE);
						restored = true;
					} else if (savedId === 'mf_overall') {
						setActivePortfolio(MF_AGGREGATE);
						restored = true;
					} else {
						const matched = (data || []).find(p => p.id === savedId);
						if (matched) {
							setActivePortfolio(matched);
							restored = true;
						}
					}
				}
			}

			if (!restored && data && data.length > 0 && !activePortfolio) {
				if (data.length > 1) {
					setActivePortfolio(EQUITY_AGGREGATE);
				} else {
					setActivePortfolio(data.find(p => p.is_primary) || data[0]);
				}
			}

		} catch (err) {
			console.error("[DASHBOARD] Fetch portfolios failed:", err);
		}
	}

	const portfolioMap = useMemo(() => {
		const map = new Map<string, string>();
		portfolios.forEach(p => map.set(p.id, p.name));
		return map;
	}, [portfolios]);

	const fetchIndices = async () => {

		try {
			const res = await axios.get(`${engineUrl}/api/indices`);
			setIndices(res.data);
			if (typeof window !== 'undefined') {
				localStorage.setItem('stockos_indices_cache', JSON.stringify(res.data));
			}
		} catch (err) {
			console.warn("[DASHBOARD] Fetch indices failed, using local cache:", err);
			if (typeof window !== 'undefined') {
				const cached = localStorage.getItem('stockos_indices_cache');
				if (cached) {
					try { setIndices(JSON.parse(cached)); } catch (e) { }
				}
			}
		}
	}

	const refreshAll = async () => {
		setIsRefreshing(true);
		setShowSyncConsole(true);
		setSyncLogs([{ timestamp: new Date().toISOString(), message: ">>> INITIALIZING TACTICAL SYNC SEQUENCE", type: 'info' }]);

		try {
			await axios.post(`${engineUrl}/api/sync`);
		} catch (err: any) {
			console.warn("[ERROR] Groww sync failed. Using cache.");
			setSyncLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "!!! SYNC DISPATCH FAILED: ENGINE UNREACHABLE", type: 'error' }]);
		}

		try {
			await Promise.all([
				fetchHoldings(),
				fetchMFPortfolio(),
				fetchIndices()
			]);
		} catch (err) {
			console.error("Refresh failed", err);
		} finally {
			setTimeout(() => {
				setIsRefreshing(false);
			}, 1000);
		}
	};

	const handleAnalyzerRefresh = async () => {
		setIsRefreshing(true);
		setShowSyncConsole(true);
		setSyncLogs([{ timestamp: new Date().toISOString(), message: ">>> INITIALIZING PORTFOLIO REVALUATION PROTOCOL", type: 'info' }]);

		try {
			// 1. Post to backend revaluation to ensure live asset values are fresh
			await axios.post(`${engineUrl}/api/revalue`);
		} catch (e) {
			console.warn("[ANALYZER-REFRESH] Revaluation dispatch failed:", e);
			setSyncLogs(prev => [...prev, { timestamp: new Date().toISOString(), message: "!!! REVALUATION DISPATCH FAILED: ENGINE UNREACHABLE", type: 'error' }]);
		}

		try {
			// 2. Fetch the latest holdings from Supabase
			await fetchHoldings();
		} catch (err) {
			console.error("Fetch holdings failed", err);
		} finally {
			setTimeout(() => {
				setIsRefreshing(false);
			}, 1000);
		}
	};

	const handleSearch = async (query: string) => {
		setSearchQuery(query);
		if (query.length < 2) {
			setSearchResults([]);
			return;
		}

		setIsSearching(true);
		try {
			// 1. Search Indian Market Assets
			const { data: indianAssets } = await supabase
				.from('market_assets')
				.select('symbol, name, asset_type')
				.or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
				.limit(5);

			// 2. Search US Market Assets
			const { data: usAssets } = await supabase
				.from('us_market_assets')
				.select('symbol, name')
				.or(`symbol.ilike.%${query}%,name.ilike.%${query}%`)
				.limit(5);

			const combined = [
				...(indianAssets || []).map(a => ({ ...a, market: 'IN' })),
				...(usAssets || []).map(a => ({ ...a, market: 'US', asset_type: 'EQUITY' }))
			];

			setSearchResults(combined);
		} catch (err) {
			console.error("[SEARCH] Global search failed:", err);
		} finally {
			setIsSearching(false);
		}
	}

	// LIVE HEARTBEAT: Force a re-render every second to keep the chart "ticking"
	const [heartbeat, setHeartbeat] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => setHeartbeat(h => h + 1), 1000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (isPortfolioDropdownOpen) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = 'unset';
		}
	}, [isPortfolioDropdownOpen]);

	// Polling logs during refresh
	useEffect(() => {
		let interval: any;
		if (showSyncConsole) {
			interval = setInterval(async () => {
				try {
					const res = await axios.get(`${engineUrl}/api/sync/logs`);
					setSyncLogs(res.data);
				} catch (err) {
					console.error("Failed to fetch logs");
				}
			}, 1000);

			// Auto-hide after 30 seconds or when idle
			const timer = setTimeout(() => {
				if (!isRefreshing) setShowSyncConsole(false);
			}, 30000);
			return () => {
				clearInterval(interval);
				clearTimeout(timer);
			};
		}
	}, [showSyncConsole, isRefreshing]);

	// 1. Initial mount: fetch portfolios and indices
	useEffect(() => {
		if (!mounted) return;

		fetchPortfolios();
		fetchIndices();
	}, [mounted, portfolioId]);

	// 2. Realtime Subscriptions for Holdings & History
	useEffect(() => {
		if (!mounted || !activePortfolio) return;

		if (activePortfolio.id === 'total') {
			// Total Wealth view needs subscriptions to BOTH Equities & Mutual Funds
			const eqHoldingsSub = supabase
				.channel('eq-holdings-total')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'holdings',
					filter: `user_id=eq.${portfolioId}`
				}, () => debouncedFetchHoldings())
				.subscribe();

			const eqHistorySub = supabase
				.channel('eq-history-total')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'portfolio_history',
					filter: `user_id=eq.${portfolioId}`
				}, () => setTimeout(fetchHistory, 1000))
				.subscribe();

			const mfHoldingsSub = supabase
				.channel('mf-holdings-total')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'user_mutual_fund_holdings',
					filter: `user_id=eq.${portfolioId}`
				}, () => fetchMFPortfolio())
				.subscribe();

			const mfHistorySub = supabase
				.channel('mf-history-total')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'mutual_fund_portfolio_history',
					filter: `user_id=eq.${portfolioId}`
				}, () => setTimeout(fetchHistory, 1000))
				.subscribe();

			return () => {
				supabase.removeChannel(eqHoldingsSub);
				supabase.removeChannel(eqHistorySub);
				supabase.removeChannel(mfHoldingsSub);
				supabase.removeChannel(mfHistorySub);
			};
		} else if (isMFActive) {
			// Subscribe to Mutual Funds Realtime Updates (Holdings & History)
			const mfHoldingsSubscription = supabase
				.channel('mf-holdings-changes')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'user_mutual_fund_holdings',
					filter: `user_id=eq.${portfolioId}`
				}, () => fetchMFPortfolio())
				.subscribe();

			const mfHistorySubscription = supabase
				.channel('mf-history-changes')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'mutual_fund_portfolio_history',
					filter: `user_id=eq.${portfolioId}`
				}, () => setTimeout(fetchHistory, 1000))
				.subscribe();

			return () => {
				supabase.removeChannel(mfHoldingsSubscription);
				supabase.removeChannel(mfHistorySubscription);
			};
		} else {
			// Subscribe to Equity Realtime Updates
			const holdingsFilter = (activePortfolio.id === 'overall' || activePortfolio.id === 'total')
				? { filter: `user_id=eq.${portfolioId}` }
				: { filter: `portfolio_id=eq.${activePortfolio.id}` };

			const historyFilter = (activePortfolio.id === 'overall' || activePortfolio.id === 'total')
				? { filter: `user_id=eq.${portfolioId}` }
				: { filter: `portfolio_id=eq.${activePortfolio.id}` };

			const holdingsSubscription = supabase
				.channel('holdings-changes')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'holdings',
					...holdingsFilter
				}, () => debouncedFetchHoldings())
				.subscribe();

			const historySubscription = supabase
				.channel('history-changes')
				.on('postgres_changes', {
					event: '*',
					schema: 'public',
					table: 'portfolio_history',
					...historyFilter
				}, () => setTimeout(fetchHistory, 1000))
				.subscribe();

			return () => {
				supabase.removeChannel(holdingsSubscription);
				supabase.removeChannel(historySubscription);
			};
		}
	}, [mounted, portfolioId, activePortfolio?.id, isMFActive]);

	useEffect(() => {
		if (!mounted || !activePortfolio) return;

		// INSTANT FETCH: Don't wait for heartbeat
		fetchHoldings();
		fetchMFPortfolio();
		fetchHistory();
		fetchDailyPL(activePortfolio.id);

		// Dashboard Heartbeat: Pulse all active holdings to the engine
		const sendDashboardHeartbeat = async () => {
			if (!mounted || document.hidden || holdings.length === 0) return;

			try {
				const uniqueSymbols = Array.from(new Set(holdings.map(h => h.trading_symbol.toUpperCase())));
				for (const symbol of uniqueSymbols) {
					// Heuristic for market: .NS or .BO means Indian market
					const market = (symbol.endsWith('.NS') || symbol.endsWith('.BO')) ? 'IN' : 'US';
					fetch('/api/market/heartbeat', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ symbol, market })
					}).catch(() => { });
				}
			} catch (e) { }
		};

		const interval = setInterval(fetchIndices, 10000); // 10s Indices refresh
		// Poll daily P/L via server-side aggregate every 8s — atomic SUM, no partial-read risk
		const dailyPLInterval = setInterval(() => fetchDailyPL(activePortfolio.id), 8000);
		// Holdings poll every 30s as backup; realtime subscription handles live updates
		const syncInterval = setInterval(() => { fetchHoldings(); fetchHistory(); }, 30000);

		const pulseInterval = setInterval(sendDashboardHeartbeat, 30000);
		setTimeout(sendDashboardHeartbeat, 5000);

		return () => {
			clearInterval(interval);
			clearInterval(dailyPLInterval);
			clearInterval(syncInterval);
			clearInterval(pulseInterval);
		};
	}, [mounted, activePortfolio, holdings.length, portfolioId, status]);


	// Unified Metrics Logic
	const equityTotalValue = useMemo(() => holdings.reduce((sum, h) => sum + (Number(h.market_value) || 0), 0), [holdings]);
	const equityTotalInvested = useMemo(() => holdings.reduce((sum, h) => sum + (Number(h.invested_value) || 0), 0), [holdings]);
	const equityDayChange = useMemo(() => dailyPLData?.total_day_change ?? holdings.reduce((sum, h) => sum + (Number(h.day_change) || 0), 0), [holdings, dailyPLData]);

	const mfTotalValue = useMemo(() => Number(mfSummary?.current_value || 0), [mfSummary]);
	const mfTotalInvested = useMemo(() => Number(mfSummary?.total_investment || 0), [mfSummary]);
	const mfDayChange = useMemo(() => Number(mfSummary?.daily_change || 0), [mfSummary]);

	const totalNetWorth = useMemo(() => {
		if (activePortfolio?.id === 'total') return equityTotalValue + mfTotalValue;
		if (isMFActive) return mfTotalValue;
		return equityTotalValue;
	}, [activePortfolio, isMFActive, equityTotalValue, mfTotalValue]);

	const totalInvested = useMemo(() => {
		if (activePortfolio?.id === 'total') return equityTotalInvested + mfTotalInvested;
		if (isMFActive) return mfTotalInvested;
		return equityTotalInvested;
	}, [activePortfolio, isMFActive, equityTotalInvested, mfTotalInvested]);

	const totalDayChange = useMemo(() => {
		if (activePortfolio?.id === 'total') return equityDayChange + mfDayChange;
		if (isMFActive) return mfDayChange;
		return equityDayChange;
	}, [activePortfolio, isMFActive, equityDayChange, mfDayChange]);

	// INSTITUTIONAL METRIC PERSISTENCE: Freeze the latest high-fidelity snapshot to end flickering
	const lastGoodSnapshot = useRef<any>(null);

	const latestSnapshot = useMemo(() => {
		if (!history || history.length === 0) return lastGoodSnapshot.current;

		// 1. PRIMARY: Filter by active portfolio ID for absolute symmetry
		const portfolioHistory = activePortfolio
			? history.filter(h => h.portfolio_id === activePortfolio.id)
			: [];

		let latest = portfolioHistory.length > 0
			? portfolioHistory.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[portfolioHistory.length - 1]
			: null;

		// 2. FALLBACK: If active filter is empty, use the absolute latest snapshot for this user
		if (!latest && history.length > 0) {
			latest = history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[history.length - 1];
		}

		if (latest) {
			lastGoodSnapshot.current = latest;
		}

		return latest || lastGoodSnapshot.current;
	}, [history, activePortfolio]);

	const dayChangePerc = useMemo(() => {
		if (isMFActive) {
			return Number(mfSummary?.daily_change_percentage || 0);
		}
		if (activePortfolio?.id === 'total') {
			const baseline = totalNetWorth - totalDayChange;
			return (totalNetWorth > 0 && baseline > 0) ? (totalDayChange / baseline) * 100 : 0;
		}
		if (dailyPLData && typeof dailyPLData.day_change_percentage === 'number') {
			if (dailyPLData.day_change_percentage === 0 && totalDayChange !== 0 && holdings.length === 0) {
				const baseline = totalNetWorth - totalDayChange;
				return (totalNetWorth > 0 && baseline > 0) ? (totalDayChange / baseline) * 100 : 0;
			}
			return dailyPLData.day_change_percentage;
		}
		const baseline = totalNetWorth - totalDayChange;
		return (totalNetWorth > 0 && baseline > 0) ? (totalDayChange / baseline) * 100 : 0;
	}, [isMFActive, mfSummary, activePortfolio, dailyPLData, totalNetWorth, totalDayChange, holdings.length]);

	const isDailyClosed = useMemo(() => {
		if (isMFActive) return totalDayChange === 0;
		return (timeRange === '1D' && getMarketStatus('IN') === 'CLOSED') || totalDayChange === 0;
	}, [isMFActive, timeRange, totalDayChange]);


	const totalPL = totalNetWorth - totalInvested;
	const totalPLPerc = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

	const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
		key: 'market_value',
		direction: 'desc'
	});

	const [mfSortConfig, setMfSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
		key: 'market_value',
		direction: 'desc'
	});

	const filteredHoldings = holdings.filter(h =>
		h.trading_symbol.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const filteredMfHoldings = useMemo(() => {
		return mfHoldings.filter(h =>
			(h.fund_name || '').toLowerCase().includes(mfSearchQuery.toLowerCase()) ||
			(h.category || '').toLowerCase().includes(mfSearchQuery.toLowerCase()) ||
			(h.isin || '').toLowerCase().includes(mfSearchQuery.toLowerCase())
		);
	}, [mfHoldings, mfSearchQuery]);

	const sortedHoldings = useMemo(() => {
		let sortableItems = [...filteredHoldings];
		if (sortConfig.key && sortConfig.direction) {
			sortableItems.sort((a, b) => {
				let aValue: any = a[sortConfig.key];
				let bValue: any = b[sortConfig.key];

				// Special handling for Stock Details (trading_symbol)
				if (sortConfig.key === 'trading_symbol') {
					aValue = a.trading_symbol.toLowerCase();
					bValue = b.trading_symbol.toLowerCase();
				} else if (sortConfig.key === 'weight') {
					aValue = Number(a.market_value) || 0;
					bValue = Number(b.market_value) || 0;
				} else {
					aValue = Number(aValue) || 0;
					bValue = Number(bValue) || 0;
				}

				if (aValue < bValue) {
					return sortConfig.direction === 'asc' ? -1 : 1;
				}
				if (aValue > bValue) {
					return sortConfig.direction === 'asc' ? 1 : -1;
				}
				return 0;
			});
		}
		return sortableItems;
	}, [filteredHoldings, sortConfig]);

	const sortedMfHoldings = useMemo(() => {
		let sortableItems = [...filteredMfHoldings];
		if (mfSortConfig.key && mfSortConfig.direction) {
			sortableItems.sort((a, b) => {
				let aValue: any;
				let bValue: any;

				if (mfSortConfig.key === 'fund_name') {
					aValue = (a.fund_name || '').toLowerCase();
					bValue = (b.fund_name || '').toLowerCase();
				} else if (mfSortConfig.key === 'invested_value') {
					const qtyA = Number(a.quantity) || 0;
					const avgA = Number(a.average_price) || 0;
					aValue = Number(a.invested_value) || (qtyA * avgA);

					const qtyB = Number(b.quantity) || 0;
					const avgB = Number(b.average_price) || 0;
					bValue = Number(b.invested_value) || (qtyB * avgB);
				} else if (mfSortConfig.key === 'weight') {
					aValue = Number(a.market_value) || 0;
					bValue = Number(b.market_value) || 0;
				} else if (mfSortConfig.key === 'day_change') {
					aValue = Number(a.day_change) || 0;
					bValue = Number(b.day_change) || 0;
				} else if (mfSortConfig.key === 'p_l') {
					aValue = Number(a.p_l) || 0;
					bValue = Number(b.p_l) || 0;
				} else {
					aValue = Number(a[mfSortConfig.key]) || 0;
					bValue = Number(b[mfSortConfig.key]) || 0;
				}

				if (aValue < bValue) {
					return mfSortConfig.direction === 'asc' ? -1 : 1;
				}
				if (aValue > bValue) {
					return mfSortConfig.direction === 'asc' ? 1 : -1;
				}
				return 0;
			});
		}
		return sortableItems;
	}, [filteredMfHoldings, mfSortConfig]);

	const sortedCombinedHoldings = useMemo(() => {
		if (activePortfolio?.id !== 'total') return [];

		// 1. Map Equities
		const mappedEquities = holdings.map(asset => {
			const quantity = Number(asset.quantity) || 0;
			const averagePrice = Number(asset.average_price) || 0;
			const investedValue = Number(asset.invested_value) || (quantity * averagePrice);
			const marketValue = Number(asset.market_value) || 0;
			const dayChange = Number(asset.day_change) || 0;
			const dayChangePercentage = Number(asset.day_change_percentage) || 0;
			const p_l = Number(asset.p_l) || 0;
			const p_l_percentage = Number(asset.p_l_percentage) || 0;
			const weight = totalNetWorth > 0 ? (marketValue / totalNetWorth) * 100 : 0;

			return {
				id: asset.id || asset.trading_symbol,
				type: 'STOCK' as const,
				symbol: asset.trading_symbol,
				name: asset.trading_symbol.replace('.NS', '').replace('.BO', ''),
				category: asset.trading_symbol.endsWith('.NS') ? 'NSE' : (asset.trading_symbol.endsWith('.BO') ? 'BSE' : 'EQUITY'),
				quantity,
				averagePrice,
				investedValue,
				marketValue,
				dayChange,
				dayChangePercentage,
				weight,
				p_l,
				p_l_percentage,
				link: `/stocks/${asset.trading_symbol}`,
				portfolioName: asset.user_portfolios?.name
			};
		});

		// 2. Map Mutual Funds
		const mappedMFs = mfHoldings.map((h, idx) => {
			const quantity = Number(h.quantity) || 0;
			const averagePrice = Number(h.average_price) || 0;
			const investedValue = Number(h.invested_value) || (quantity * averagePrice);
			const marketValue = Number(h.market_value) || 0;
			const dayChange = Number(h.day_change) || 0;

			const prevDayValue = marketValue - dayChange;
			const dayChangePercentage = prevDayValue > 0 ? (dayChange / prevDayValue) * 100 : 0;

			const p_l = Number(h.p_l) || 0;
			const p_l_percentage = Number(h.p_l_percentage) || 0;
			const weight = totalNetWorth > 0 ? (marketValue / totalNetWorth) * 100 : 0;

			return {
				id: h.id || `mf-${idx}`,
				type: 'MUTUAL_FUND' as const,
				symbol: h.isin || h.symbol || 'MF',
				name: h.fund_name || 'Mutual Fund',
				category: h.category || 'Mutual Fund',
				quantity,
				averagePrice,
				investedValue,
				marketValue,
				dayChange,
				dayChangePercentage,
				weight,
				p_l,
				p_l_percentage,
				link: `/mutual-funds/${h.isin || h.scheme_code}`,
				portfolioName: h.user_portfolios?.name
			};
		});

		const combined = [...mappedEquities, ...mappedMFs];

		// Filter
		const query = searchQuery.toLowerCase().trim();
		const filtered = combined.filter(item =>
			item.name.toLowerCase().includes(query) ||
			item.symbol.toLowerCase().includes(query) ||
			item.category.toLowerCase().includes(query) ||
			(item.portfolioName || '').toLowerCase().includes(query)
		);

		// Sort
		if (sortConfig.key && sortConfig.direction) {
			filtered.sort((a, b) => {
				let aValue: any;
				let bValue: any;
				const key = sortConfig.key;

				if (key === 'trading_symbol' || key === 'fund_name' || key === 'name') {
					aValue = a.name.toLowerCase();
					bValue = b.name.toLowerCase();
				} else if (key === 'average_price') {
					aValue = a.averagePrice;
					bValue = b.averagePrice;
				} else if (key === 'invested_value') {
					aValue = a.investedValue;
					bValue = b.investedValue;
				} else if (key === 'market_value') {
					aValue = a.marketValue;
					bValue = b.marketValue;
				} else if (key === 'day_change') {
					aValue = a.dayChange;
					bValue = b.dayChange;
				} else if (key === 'p_l') {
					aValue = a.p_l;
					bValue = b.p_l;
				} else if (key === 'weight') {
					aValue = a.weight;
					bValue = b.weight;
				} else if (key === 'quantity') {
					aValue = a.quantity;
					bValue = b.quantity;
				} else {
					aValue = (a as any)[key];
					bValue = (b as any)[key];
				}

				if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
				if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
				return 0;
			});
		}

		return filtered;
	}, [holdings, mfHoldings, searchQuery, sortConfig, totalNetWorth, activePortfolio]);

	const consolidatedStats = useMemo(() => {
		if (activePortfolio?.id !== 'total') return null;
		let totalInvested = 0;
		let totalMarket = 0;
		let totalDayPL = 0;
		let totalPLSum = 0;

		sortedCombinedHoldings.forEach(item => {
			totalInvested += item.investedValue;
			totalMarket += item.marketValue;
			totalDayPL += item.dayChange;
			totalPLSum += item.p_l;
		});

		const dayChangePercentage = (totalMarket - totalDayPL) > 0 ? (totalDayPL / (totalMarket - totalDayPL)) * 100 : 0;
		const totalPLPercentage = totalInvested > 0 ? (totalPLSum / totalInvested) * 100 : 0;

		return {
			totalInvested,
			totalMarket,
			totalDayPL,
			dayChangePercentage,
			totalPLSum,
			totalPLPercentage,
			stocksCount: sortedCombinedHoldings.filter(i => i.type === 'STOCK').length,
			fundsCount: sortedCombinedHoldings.filter(i => i.type === 'MUTUAL_FUND').length
		};
	}, [sortedCombinedHoldings, activePortfolio]);

	const mfStats = useMemo(() => {
		let totalInvested = 0;
		let totalMarket = 0;
		let totalDayPL = 0;
		let totalPLSum = 0;

		sortedMfHoldings.forEach(h => {
			const qty = Number(h.quantity) || 0;
			const avg = Number(h.average_price) || 0;
			const invested = Number(h.invested_value) || (qty * avg);
			const market = Number(h.market_value) || 0;
			const dayPL = Number(h.day_change) || 0;
			const p_l = Number(h.p_l) || 0;

			totalInvested += invested;
			totalMarket += market;
			totalDayPL += dayPL;
			totalPLSum += p_l;
		});

		const dayChangePercentage = (totalMarket - totalDayPL) > 0 ? (totalDayPL / (totalMarket - totalDayPL)) * 100 : 0;
		const totalPLPercentage = totalInvested > 0 ? (totalPLSum / totalInvested) * 100 : 0;

		return {
			totalInvested,
			totalMarket,
			totalDayPL,
			dayChangePercentage,
			totalPLSum,
			totalPLPercentage,
			count: sortedMfHoldings.length
		};
	}, [sortedMfHoldings]);

	const equityStats = useMemo(() => {
		let totalInvested = 0;
		let totalMarket = 0;
		let totalDayPL = 0;
		let totalPLSum = 0;

		sortedHoldings.forEach(h => {
			const invested = Number(h.invested_value) || 0;
			const market = Number(h.market_value) || 0;
			const dayPL = Number(h.day_change) || 0;
			const p_l = Number(h.p_l) || 0;

			totalInvested += invested;
			totalMarket += market;
			totalDayPL += dayPL;
			totalPLSum += p_l;
		});

		const dayChangePercentage = (totalMarket - totalDayPL) > 0 ? (totalDayPL / (totalMarket - totalDayPL)) * 100 : 0;
		const totalPLPercentage = totalInvested > 0 ? (totalPLSum / totalInvested) * 100 : 0;

		return {
			totalInvested,
			totalMarket,
			totalDayPL,
			dayChangePercentage,
			totalPLSum,
			totalPLPercentage,
			count: sortedHoldings.length
		};
	}, [sortedHoldings]);




	const requestSort = (key: string) => {
		let direction: 'asc' | 'desc' | null = 'desc';
		if (sortConfig.key === key && sortConfig.direction === 'desc') {
			direction = 'asc';
		} else if (sortConfig.key === key && sortConfig.direction === 'asc') {
			direction = null;
		}
		setSortConfig({ key, direction });
	};

	const requestMfSort = (key: string) => {
		let direction: 'asc' | 'desc' | null = 'desc';
		if (mfSortConfig.key === key && mfSortConfig.direction === 'desc') {
			direction = 'asc';
		} else if (mfSortConfig.key === key && mfSortConfig.direction === 'asc') {
			direction = null;
		}
		setMfSortConfig({ key, direction });
	};

	const filteredHistory = useMemo(() => {
		if (!history.length) {
			if (totalNetWorth > 0) {
				const now = new Date();
				const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
				const yesterdayVal = Number(totalNetWorth - totalDayChange) || 0;
				const investedVal = Number(totalNetWorth - totalPL) || 0;
				return [
					{
						timestamp: yesterday.toISOString(),
						total_market_value: yesterdayVal,
						total_investment: investedVal,
						portfolio_id: activePortfolio?.id || 'default'
					},
					{
						timestamp: now.toISOString(),
						total_market_value: totalNetWorth,
						total_investment: investedVal,
						portfolio_id: activePortfolio?.id || 'default'
					}
				];
			}
			return [];
		}

		// If it's an individual portfolio (not overall/total), strictly filter history to match active portfolio id
		const individualPortfolios = ['total', 'overall', 'mf_overall'];
		const isIndividual = activePortfolio && !individualPortfolios.includes(activePortfolio.id);
		const baseHistory = isIndividual
			? history.filter(h => h.portfolio_id === activePortfolio.id)
			: history;

		if (!baseHistory.length) {
			if (totalNetWorth > 0) {
				const now = new Date();
				const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
				const yesterdayVal = Number(totalNetWorth - totalDayChange) || 0;
				const investedVal = Number(totalNetWorth - totalPL) || 0;
				return [
					{
						timestamp: yesterday.toISOString(),
						total_market_value: yesterdayVal,
						total_investment: investedVal,
						portfolio_id: activePortfolio?.id || 'default'
					},
					{
						timestamp: now.toISOString(),
						total_market_value: totalNetWorth,
						total_investment: investedVal,
						portfolio_id: activePortfolio?.id || 'default'
					}
				];
			}
			return [];
		}

		const now = new Date();
		const istOffset = 5.5 * 60 * 60 * 1000;
		const istNow = new Date(now.getTime() + istOffset);

		let cutoff = new Date(0);
		let filtered: any[] = [];

		if (timeRange === "1D") {
			// Day starts at 6:00 AM IST
			const dayReset = new Date(istNow);
			dayReset.setHours(6, 0, 0, 0);

			// If currently before 6AM, today's "financial day" actually started yesterday at 6AM
			if (istNow < dayReset) {
				dayReset.setTime(dayReset.getTime() - 24 * 60 * 60 * 1000);
			}

			// Convert back to UTC for filtering
			cutoff = new Date(dayReset.getTime() - istOffset);
		} else if (timeRange === "1W") {
			cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		} else if (timeRange === "1M") {
			cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		} else if (timeRange === "3M") {
			cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
		} else if (timeRange === "6M") {
			cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
		} else if (timeRange === "1Y") {
			cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
		}

		// Any record before 6 AM IST is counted as previous day
		// We filter by cutoff (which is already 6 AM of the selected range start)
		filtered = baseHistory.filter(h => new Date(h.timestamp) >= cutoff);

		// Only perform date-dependent logic on client
		if (!mounted || filtered.length === 0) {
			if (totalNetWorth > 0) {
				const now = new Date();
				const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
				const yesterdayVal = Number(totalNetWorth - totalDayChange) || 0;
				const investedVal = Number(totalNetWorth - totalPL) || 0;
				return [
					{
						timestamp: yesterday.toISOString(),
						total_market_value: yesterdayVal,
						total_investment: investedVal,
						portfolio_id: activePortfolio?.id || 'default'
					},
					{
						timestamp: now.toISOString(),
						total_market_value: totalNetWorth,
						total_investment: investedVal,
						portfolio_id: activePortfolio?.id || 'default'
					}
				];
			}
			return filtered;
		}

		// Stitch live point at the end for visual consistency
		const lastPoint = filtered[filtered.length - 1];
		const nowStr = now.toISOString();

		// Only append if the last snapshot isn't already from "now"
		if (new Date(lastPoint.timestamp).getTime() < now.getTime() - 60000) {
			return [...filtered, {
				timestamp: nowStr,
				total_market_value: totalNetWorth,
				total_invested: lastPoint.total_invested, // Best guess
				user_id: lastPoint.user_id
			}];
		}

		return filtered;
	}, [history, timeRange, totalNetWorth, totalDayChange, totalPL, mounted, activePortfolio]);

	const formatCurrency = (val: number) => {
		return new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR',
			maximumFractionDigits: 0
		}).format(val);
	}

	const startValue = useMemo(() => {
		if (filteredHistory.length === 0) return Number(totalNetWorth - totalDayChange) || 0;

		// For 1D view, the "start" is the value at the 6AM reset point
		// We try to find the very last record BEFORE the current cutoff if possible
		if (timeRange === "1D") {
			const now = new Date();
			const istOffset = 5.5 * 60 * 60 * 1000;
			const istNow = new Date(now.getTime() + istOffset);
			const dayReset = new Date(istNow);
			dayReset.setHours(6, 0, 0, 0);
			if (istNow < dayReset) dayReset.setTime(dayReset.getTime() - 24 * 60 * 60 * 1000);
			const cutoff = new Date(dayReset.getTime() - istOffset);

			// Find the last record in full history that happened before our cutoff
			const previousPoint = [...history]
				.reverse()
				.find(h => new Date(h.timestamp) < cutoff);

			if (previousPoint) return Number(previousPoint.total_market_value) || 0;
		}

		// Default: Use the very first point in our filtered range as the base
		return Number(filteredHistory[0].total_market_value) || 0;
	}, [filteredHistory, history, timeRange, totalNetWorth, totalDayChange]);

	const rangeIsPositive = totalNetWorth >= startValue;
	const rangeChange = startValue > 0 ? ((totalNetWorth - startValue) / startValue) * 100 : 0;

	const chartData = useMemo(() => {
		const _ = heartbeat;
		const map = new Map<string | number, { time: string | number; value: number; ts: number }>();
		filteredHistory.forEach((h: { timestamp: string; total_market_value: number }) => {
			if (!h.timestamp) return;
			const dateObj = new Date(h.timestamp);
			const financialDayDate = new Date(dateObj.getTime() - 6 * 60 * 60 * 1000);
			const dateKey = new Intl.DateTimeFormat('en-CA', {
				timeZone: 'Asia/Kolkata',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(financialDayDate);
			const ts = Math.floor(dateObj.getTime() / 1000);
			const key = timeRange === '1D' ? ts : dateKey;
			const existing = map.get(key);
			if (!existing || ts > existing.ts) {
				map.set(key, {
					time: timeRange === '1D' ? (ts as UTCTimestamp) : dateKey,
					value: Number(h.total_market_value) || 0,
					ts: ts
				});
			}
		});
		const results = Array.from(map.values()).sort((a, b) => a.ts - b.ts);
		const now = new Date();
		const nowTs = Math.floor(now.getTime() / 1000);
		const financialDayNow = new Date(now.getTime() - 6 * 60 * 60 * 1000);
		const nowKey = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Asia/Kolkata',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(financialDayNow);
		const currentChartKey = timeRange === '1D' ? (nowTs as UTCTimestamp) : nowKey;
		if (results.length > 0) {
			const lastResult = results[results.length - 1];
			if (lastResult.time === currentChartKey) {
				lastResult.value = Number(totalNetWorth) || 0;
				lastResult.ts = nowTs;
			} else if (nowTs > lastResult.ts) {
				results.push({ time: currentChartKey, value: Number(totalNetWorth) || 0, ts: nowTs });
			}
		} else {
			results.push({ time: currentChartKey, value: Number(totalNetWorth) || 0, ts: nowTs });
		}
		return results.map(item => ({ time: item.time as any, value: item.value }));
	}, [filteredHistory, timeRange, totalNetWorth, heartbeat]);

	return (
		<div suppressHydrationWarning className={cn(
			"min-h-screen bg-transparent text-on-surface font-ui-body selection:bg-emerald-500/30 relative overflow-x-hidden transition-opacity duration-700",
			!mounted ? "opacity-0" : "opacity-100"
		)}>

			{/* Dynamic Ambient Background Atmosphere */}
			<div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
				<AnimatePresence mode="wait">
					{activePortfolio?.id === 'total' ? (
						<motion.div
							key="total-glow"
							initial={{ opacity: 0 }}
							animate={{ opacity: 0.15 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 1.2 }}
							className="absolute inset-0"
						>
							<div className="absolute top-0 right-1/4 w-[600px] h-[600px] rounded-full bg-amber-500/10 blur-[150px]" />
							<div className="absolute bottom-1/4 left-1/4 w-[700px] h-[700px] rounded-full bg-yellow-500/5 blur-[180px]" />
						</motion.div>
					) : isMFActive ? (
						<motion.div
							key="mf-glow"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 1.2 }}
							className="absolute inset-0"
						>
							<div className="absolute -top-32 right-1/4 w-[700px] h-[700px] rounded-full bg-emerald-500/[0.09] blur-[160px]" />
							<div className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-teal-500/[0.06] blur-[180px]" />
							<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[300px] rounded-full bg-emerald-600/[0.04] blur-[200px]" />
						</motion.div>
					) : (
						<motion.div
							key="equity-glow"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 1.2 }}
							className="absolute inset-0"
						>
							<div className="absolute -top-32 left-1/4 w-[700px] h-[700px] rounded-full bg-blue-500/[0.09] blur-[160px]" />
							<div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-indigo-500/[0.07] blur-[180px]" />
							<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[300px] rounded-full bg-blue-600/[0.04] blur-[200px]" />
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{/* Main Dashboard Layout Stack */}
			<div className="pt-[130px] pb-24 px-12 max-w-full mx-auto w-full flex flex-col gap-6">

				{/* ROW 1: Header + Metrics */}
				<div className="grid grid-cols-1 lg:grid-cols-[1fr_520px] gap-6">
					<motion.div

						initial="hidden"
						animate="visible"
						variants={{
							hidden: { opacity: 0 },
							visible: {
								opacity: 1,
								transition: {
									staggerChildren: 0.1,
									delayChildren: 0.6
								}
							}
						}}
						className="flex flex-col gap-6"
					>
						{/* Header Section */}
						<motion.div
							variants={{
								hidden: { opacity: 0, y: 20 },
								visible: { opacity: 1, y: 0 }
							}}
							transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
							className={cn(
								"relative group -mt-8 -mb-4 transition-all duration-300",
								isPortfolioDropdownOpen ? "z-[200]" : "z-10"
							)}
						>
							<div className="flex items-end gap-4">
								<h2 className={cn(
									"font-headline font-black tracking-tighter text-white uppercase leading-none transition-all duration-300",
									formattedName.length > 15 ? "text-4xl" :
										formattedName.length > 12 ? "text-5xl" :
											formattedName.length > 10 ? "text-6xl" : "text-7xl"
								)}>
									{formattedName}
								</h2>

								<div className="relative">
									<motion.div
										whileHover={{ y: -1, scale: 1.02 }}
										onClick={() => setIsPortfolioDropdownOpen(!isPortfolioDropdownOpen)}
										className={cn(
											"flex items-center gap-2 group/portfolio cursor-pointer px-2.5 py-1 rounded-xl bg-white/[0.03] transition-all duration-300 border border-white/5",
											activePortfolio?.id === 'overall' || activePortfolio?.type === 'EQUITY'
												? "hover:bg-blue-500/10 hover:border-blue-500/20"
												: isMFActive
													? "hover:bg-emerald-500/10 hover:border-emerald-500/20"
													: activePortfolio?.id === 'total'
														? "hover:bg-amber-500/10 hover:border-amber-500/20"
														: "hover:bg-emerald-500/10 hover:border-emerald-500/20"
										)}
									>
										<div className="flex flex-col">
											<span className={cn(
												"text-[8px] font-terminal-label uppercase tracking-widest font-bold",
												activePortfolio?.id === 'overall' || activePortfolio?.type === 'EQUITY'
													? "text-blue-500/70"
													: isMFActive
														? "text-emerald-500/70"
														: activePortfolio?.id === 'total'
															? "text-amber-500/70"
															: "text-emerald-500/70"
											)}>
												{activePortfolio ? "Active Entity" : "Quick Start"}
											</span>
											<span className="font-headline font-medium text-lg text-white tracking-tight">
												{activePortfolio ? activePortfolio.name : "Link Portfolio"}
											</span>
										</div>
										<ChevronDown className={cn(
											"w-4 h-4 transition-all duration-500 ml-1",
											activePortfolio?.id === 'overall' || activePortfolio?.type === 'EQUITY'
												? "text-blue-500"
												: isMFActive
													? "text-emerald-500"
													: activePortfolio?.id === 'total'
														? "text-amber-500"
														: "text-emerald-500",
											isPortfolioDropdownOpen ? "rotate-180" : "rotate-0"
										)} />
									</motion.div>


									<AnimatePresence>
										{isPortfolioDropdownOpen && (
											<>
												<motion.div
													initial={{ opacity: 0 }}
													animate={{ opacity: 1 }}
													exit={{ opacity: 0 }}
													onClick={() => setIsPortfolioDropdownOpen(false)}
													className="fixed inset-0 bg-black/20 z-[90]"
												/>
												<motion.div
													initial={{ opacity: 0, y: 10, scale: 0.95 }}
													animate={{ opacity: 1, y: 0, scale: 1 }}
													exit={{ opacity: 0, y: 10, scale: 0.95 }}
													transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
													className="absolute top-full left-0 mt-3 w-[640px] bg-zinc-950 border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[100] backdrop-blur-xl p-4"
												>
													<div className="flex flex-col gap-4">
														{/* TOTAL WEALTH BANNER */}
														<div
															onClick={() => {
																setActivePortfolio(TOTAL_WEALTH);
																setIsPortfolioDropdownOpen(false);
															}}
															className={cn(
																"w-full flex items-center justify-between gap-4 px-6 py-6 rounded-2xl transition-all duration-500 group/total cursor-pointer relative overflow-hidden",
																activePortfolio?.id === 'total'
																	? "bg-gradient-to-br from-amber-500/20 via-amber-500/[0.08] to-transparent border border-amber-500/30 shadow-[0_10px_40px_rgba(245,158,11,0.25)] scale-[1.01]"
																	: "bg-amber-500/[0.03] border border-amber-500/10 hover:border-amber-500/20 hover:bg-amber-500/[0.06]"
															)}
														>
															{/* Background Atmosphere */}
															<div className={cn(
																"absolute -right-10 -top-10 w-40 h-40 bg-amber-500/20 blur-[60px] pointer-events-none transition-opacity duration-700",
																activePortfolio?.id === 'total' ? "opacity-100 animate-pulse" : "opacity-0 group-hover/total:opacity-50"
															)} />

															<div className="flex items-center gap-6 relative z-10">
																<div className={cn(
																	"size-12 rounded-xl flex items-center justify-center border transition-all duration-700 relative",
																	activePortfolio?.id === 'total'
																		? "bg-amber-500 border-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] rotate-[180deg]"
																		: "bg-amber-500/10 border-amber-500/20 text-amber-500/60 group-hover/total:text-amber-500 group-hover/total:scale-110"
																)}>
																	<LayoutGrid className="w-6 h-6" />
																</div>
																<div className="flex flex-col">
																	<div className="flex items-center gap-3">
																		<span className={cn(
																			"font-headline font-black text-2xl tracking-tighter leading-tight transition-all",
																			activePortfolio?.id === 'total' ? "text-white" : "text-zinc-200"
																		)}>Total Wealth</span>
																		<div className={cn(
																			"px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all duration-500",
																			activePortfolio?.id === 'total'
																				? "bg-white text-black"
																				: "bg-amber-500/10 text-amber-500/60 border border-amber-500/20"
																		)}>
																			Net
																		</div>
																	</div>
																	<span className={cn(
																		"text-[10px] font-bold uppercase tracking-[0.2em] transition-colors",
																		activePortfolio?.id === 'total' ? "text-amber-500/80" : "text-zinc-500 group-hover/total:text-amber-500/60"
																	)}>Global Asset Overview</span>
																</div>
															</div>

															<div className={cn(
																"size-10 rounded-full flex items-center justify-center transition-all duration-500 border relative z-10",
																activePortfolio?.id === 'total'
																	? "bg-white border-white text-black shadow-[0_0_20px_rgba(255,255,255,0.2)]"
																	: "bg-amber-500/5 border-amber-500/10 text-amber-500/40 group-hover/total:text-amber-500 group-hover/total:bg-amber-500/10 group-hover/total:border-amber-500/20"
															)}>
																<ChevronRight className="size-6 transition-transform group-hover/total:translate-x-0.5" />
															</div>
														</div>

														<div className="grid grid-cols-2 gap-8 relative">
															{/* Central Bridge Line */}
															<div className="absolute top-12 bottom-4 left-1/2 -translate-x-1/2 w-px pointer-events-none">
																<div className="h-full w-full bg-gradient-to-b from-transparent via-white/10 to-transparent relative">
																	<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-1.5 rounded-full bg-zinc-900 border border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]" />
																</div>
															</div>

															{/* EQUITY COLUMN */}
															<div className="space-y-3 relative">
																<div className="flex items-center justify-between px-2">
																	<div className="flex items-center gap-2">
																		<div className="size-1.5 rounded-full bg-blue-500 animate-pulse" />
																		<span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500/80">Equities Market</span>
																	</div>
																</div>

																{/* Equity Aggregate Item */}
																<div
																	onClick={() => {
																		setActivePortfolio(EQUITY_AGGREGATE);
																		setIsPortfolioDropdownOpen(false);
																	}}
																	className={cn(
																		"w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group/item cursor-pointer relative overflow-hidden",
																		activePortfolio?.id === 'overall'
																			? "bg-blue-500/10 border border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)] scale-[1.02]"
																			: "bg-blue-500/[0.03] border border-blue-500/10 hover:border-blue-500/20 hover:bg-blue-500/[0.06]"
																	)}
																>
																	<div className={cn(
																		"size-10 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10",
																		activePortfolio?.id === 'overall' ? "bg-zinc-950 border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.2)]" : "bg-blue-500/10 border-blue-500/20"
																	)}>
																		<Globe className={cn("w-5 h-5 transition-colors", activePortfolio?.id === 'overall' ? "text-blue-400" : "text-blue-500/60 group-hover/item:text-blue-400")} />
																	</div>
																	<div className="flex flex-col overflow-hidden relative z-10">
																		<span className={cn(
																			"text-[13px] font-headline font-black truncate leading-tight transition-colors",
																			activePortfolio?.id === 'overall' ? "text-white" : "text-zinc-200 group-hover/item:text-white"
																		)}>All Stocks</span>
																		<span className={cn(
																			"text-[9px] font-bold uppercase tracking-widest transition-colors",
																			activePortfolio?.id === 'overall' ? "text-blue-400" : "text-blue-500/30 group-hover/item:text-blue-500/60"
																		)}>Consolidated Brokers</span>
																	</div>

																	{/* Active Pulse indicator */}
																	{activePortfolio?.id === 'overall' && (
																		<div className="absolute right-4 size-1.5 rounded-full bg-blue-500 animate-pulse" />
																	)}
																</div>

																<div className="h-px bg-white/5 mx-2" />

																<div className="space-y-1.5 h-[180px] overflow-y-auto pr-1 custom-scrollbar">
																	{portfolios.filter(p => !p.type || p.type === 'EQUITY').length > 0 ? (
																		portfolios.filter(p => !p.type || p.type === 'EQUITY').map((p) => (
																			<div
																				key={p.id}
																				onClick={() => {
																					setActivePortfolio(p);
																					setIsPortfolioDropdownOpen(false);
																				}}
																				className={cn(
																					"w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl transition-all duration-300 group/subitem cursor-pointer relative overflow-hidden",
																					activePortfolio?.id === p.id
																						? "bg-blue-500/[0.07] border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.05)]"
																						: "bg-transparent border border-transparent hover:bg-white/[0.04] hover:border-white/[0.05]"
																				)}
																			>
																				{/* Gloss Effect for Active */}
																				{activePortfolio?.id === p.id && (
																					<div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 via-transparent to-transparent pointer-events-none" />
																				)}

																				<div className="flex items-center gap-3.5 relative z-10 flex-1 overflow-hidden">
																					<div className={cn(
																						"size-9 rounded-lg bg-zinc-950 border p-1.5 flex-shrink-0 transition-all duration-500",
																						activePortfolio?.id === p.id ? "border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.15)]" : "border-white/10"
																					)}>
																						<img src={p.broker_name === 'GROWW' ? "/Icons/groww.svg" : "/Icons/zerodha.svg"} alt="Broker" className="w-full h-full object-contain" />
																					</div>

																					<div className="flex flex-col min-w-0">
																						<div className="flex items-center gap-1.5">
																							{editingPortfolioId === p.id ? (
																								<input
																									type="text"
																									value={editName}
																									onChange={(e) => setEditName(e.target.value)}
																									onKeyDown={async (e) => {
																										if (e.key === 'Enter') {
																											await savePortfolioName(p.id);
																										} else if (e.key === 'Escape') {
																											setEditingPortfolioId(null);
																										}
																									}}
																									onClick={(e) => e.stopPropagation()}
																									className="bg-black/80 border border-blue-500/40 text-white rounded-md px-2 py-0.5 text-[11px] font-headline w-full focus:outline-none focus:ring-1 focus:ring-blue-500/50"
																									autoFocus
																								/>
																							) : (
																								<span className={cn(
																									"text-[13px] font-headline font-bold truncate transition-colors",
																									activePortfolio?.id === p.id ? "text-white" : "text-zinc-400 group-hover/subitem:text-zinc-200"
																								)}>{p.name}</span>
																							)}
																						</div>
																						<div className="flex items-center gap-2">
																							<span className={cn(
																								"text-[8px] font-black uppercase tracking-widest transition-colors",
																								activePortfolio?.id === p.id ? "text-blue-500" : "text-blue-500/40 group-hover/subitem:text-blue-500/60"
																							)}>
																								{p.is_primary ? "PRIMARY ACCOUNT" : "CONNECTED"}
																							</span>
																							{activePortfolio?.id === p.id && (
																								<div className="size-1 rounded-full bg-blue-500 animate-pulse" />
																							)}
																						</div>
																					</div>
																				</div>

																				{/* ACTION BUTTONS (Vibrant & Always Visible) */}
																				<div className="flex items-center gap-1.5 transition-all relative z-20">
																					<button
																						onClick={(e) => {
																							e.stopPropagation();
																							if (editingPortfolioId === p.id) {
																								savePortfolioName(p.id);
																							} else {
																								setEditingPortfolioId(p.id);
																								setEditName(p.name);
																							}
																						}}
																						className="size-7 rounded-lg bg-blue-500/[0.08] border border-blue-500/20 flex items-center justify-center hover:bg-blue-500/20 hover:border-blue-500/40 transition-all duration-300 shadow-sm group/editbtn hover:scale-110 active:scale-95 hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]"
																					>
																						{editingPortfolioId === p.id ? (
																							<Check className="size-3.5 text-blue-500" />
																						) : (
																							<Edit2 className="size-3.5 text-blue-400 transition-colors" />
																						)}
																					</button>
																					<button
																						onClick={async (e) => {
																							e.stopPropagation();
																							if (confirm(`Delete \"${p.name}\"? This will unlink the portfolio.`)) {
																								try {
																									await supabase.from('user_portfolios').delete().eq('id', p.id);
																									const remaining = portfolios.filter(x => x.id !== p.id);
																									setPortfolios(remaining);
																									if (remaining.length > 0) {
																										const firstEq = remaining.find(x => !x.type || x.type === 'EQUITY');
																										setActivePortfolio(firstEq || EQUITY_AGGREGATE);
																									} else {
																										setActivePortfolio(EQUITY_AGGREGATE);
																									}
																								} catch (err) { console.error(err); }
																							}
																						}}
																						className="size-7 rounded-lg bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-300 shadow-sm group/delbtn hover:scale-110 active:scale-95 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]"
																					>
																						<Trash2 className="size-3.5 text-red-400 transition-colors" />
																					</button>
																				</div>
																			</div>
																		))
																	) : (
																		<div className="flex flex-col items-center justify-center h-full opacity-60 border border-dashed border-blue-500/10 rounded-2xl bg-blue-500/[0.02] mx-1">
																			<div className="size-10 rounded-full bg-zinc-950 border border-blue-500/10 flex items-center justify-center mb-3">
																				<Plus className="w-4.5 h-4.5 text-blue-500" />
																			</div>
																			<span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500/60">No Broker Linked</span>
																			<span className="text-[8px] text-zinc-500 mt-1 max-w-[150px] text-center font-bold">Connect your Zerodha or Groww account to track equities.</span>
																		</div>
																	)}
																</div>

																{/* EQUITY ADD ACTION */}
																<div className="px-1 pt-2">
																	<button
																		onClick={() => {
																			const eqCount = portfolios.filter(p => !p.type || p.type === 'EQUITY').length;
																			setNewPortfolioName(`Portfolio ${eqCount + 1}`);
																			setIsPortfolioDropdownOpen(false);
																			setAddPortfolioModalOpen(true);
																		}}
																		className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/[0.03] border border-dashed border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/[0.08] transition-all group/add shadow-sm"
																	>
																		<div className="size-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover/add:rotate-90 transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
																			<Plus className="w-4.5 h-4.5 text-blue-500" />
																		</div>
																		<div className="flex flex-col items-start translate-y-[-1px]">
																			<span className="text-[11px] font-headline font-black text-white/80 group-hover/add:text-white transition-colors">LINK NEW BROKER</span>
																			<span className="text-[8px] text-blue-500/50 font-bold uppercase tracking-widest group-hover/add:text-blue-500/80 transition-colors">Expand Equity Stack</span>
																		</div>
																	</button>
																</div>
															</div>

															{/* MF COLUMN */}
															<div className="space-y-3 relative">
																<div className="flex items-center justify-between px-2">
																	<div className="flex items-center gap-2">
																		<div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
																		<span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500/80">Mutual Funds</span>
																	</div>
																</div>

																{/* MF Aggregate Item */}
																<div
																	onClick={() => {
																		setActivePortfolio(MF_AGGREGATE);
																		setIsPortfolioDropdownOpen(false);
																	}}
																	className={cn(
																		"w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group/mfitem cursor-pointer relative overflow-hidden",
																		activePortfolio?.id === 'mf_overall'
																			? "bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)] scale-[1.02]"
																			: "bg-emerald-500/[0.03] border border-emerald-500/10 hover:border-emerald-500/20 hover:bg-emerald-500/[0.06]"
																	)}
																>
																	<div className={cn(
																		"size-10 rounded-xl flex items-center justify-center border transition-all duration-300 relative z-10",
																		activePortfolio?.id === 'mf_overall' ? "bg-zinc-950 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]" : "bg-emerald-500/10 border-emerald-500/20"
																	)}>
																		<PieChart className={cn("w-5 h-5 transition-colors", activePortfolio?.id === 'mf_overall' ? "text-emerald-400" : "text-emerald-500/60 group-hover/mfitem:text-emerald-400")} />
																	</div>
																	<div className="flex flex-col overflow-hidden relative z-10">
																		<span className={cn(
																			"text-[14px] font-headline font-black truncate leading-tight tracking-tight transition-colors",
																			activePortfolio?.id === 'mf_overall' ? "text-white" : "text-zinc-200 group-hover/mfitem:text-white"
																		)}>Mutual Funds</span>
																		<span className={cn(
																			"text-[9px] font-bold uppercase tracking-widest transition-colors",
																			activePortfolio?.id === 'mf_overall' ? "text-emerald-400" : "text-emerald-500/30 group-hover/mfitem:text-emerald-500/60"
																		)}>Full CAS Portfolio</span>
																	</div>

																	{/* Active Pulse indicator */}
																	{activePortfolio?.id === 'mf_overall' && (
																		<div className="absolute right-4 size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
																	)}
																</div>

																<div className="h-px bg-white/5 mx-2" />

																<div className="space-y-1.5 h-[180px] overflow-y-auto pr-1 custom-scrollbar">
																	{portfolios.filter(p => p.type === 'MF').length > 0 ? (
																		portfolios.filter(p => p.type === 'MF').map((p) => (
																			<div
																				key={p.id}
																				onClick={() => {
																					setActivePortfolio(p);
																					setIsPortfolioDropdownOpen(false);
																				}}
																				className={cn(
																					"w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl transition-all duration-300 group/mfsubitem cursor-pointer relative overflow-hidden",
																					activePortfolio?.id === p.id
																						? "bg-emerald-500/[0.07] border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.08)]"
																						: "bg-transparent border border-transparent hover:bg-white/[0.04] hover:border-white/[0.05]"
																				)}
																			>
																				{/* Gloss Effect for Active */}
																				{activePortfolio?.id === p.id && (
																					<div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
																				)}

																				<div className="flex items-center gap-3.5 relative z-10 flex-1 overflow-hidden">
																					<div className={cn(
																						"size-9 rounded-lg bg-zinc-950 border p-1.5 flex-shrink-0 transition-all duration-500",
																						activePortfolio?.id === p.id ? "border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]" : "border-white/10"
																					)}>
																						<FileText className={cn(
																							"w-full h-full transition-colors",
																							activePortfolio?.id === p.id ? "text-emerald-400" : "text-zinc-500"
																						)} />
																					</div>

																					<div className="flex flex-col min-w-0">
																						<div className="flex items-center gap-1.5">
																							{editingPortfolioId === p.id ? (
																								<input
																									type="text"
																									value={editName}
																									onChange={(e) => setEditName(e.target.value)}
																									onKeyDown={async (e) => {
																										if (e.key === 'Enter') {
																											await savePortfolioName(p.id);
																										} else if (e.key === 'Escape') {
																											setEditingPortfolioId(null);
																										}
																									}}
																									onClick={(e) => e.stopPropagation()}
																									className="bg-black/80 border border-emerald-500/40 text-white rounded-md px-2 py-0.5 text-[11px] font-headline w-full focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
																									autoFocus
																								/>
																							) : (
																								<span className={cn(
																									"text-[13px] font-headline font-bold truncate transition-colors",
																									activePortfolio?.id === p.id ? "text-white" : "text-zinc-400 group-hover/mfsubitem:text-zinc-200"
																								)}>{p.name}</span>
																							)}
																						</div>
																						<div className="flex items-center gap-2">
																							<span className={cn(
																								"text-[8px] font-black uppercase tracking-widest transition-colors",
																								activePortfolio?.id === p.id ? "text-emerald-500" : "text-emerald-500/40 group-hover/mfsubitem:text-emerald-500/60"
																							)}>
																								CONNECTED MF
																							</span>
																							{activePortfolio?.id === p.id && (
																								<div className="size-1 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse" />
																							)}
																						</div>
																					</div>
																				</div>

																				{/* ACTION BUTTONS */}
																				<div className="flex items-center gap-1.5 transition-all relative z-20">
																					<button
																						onClick={(e) => {
																							e.stopPropagation();
																							if (editingPortfolioId === p.id) {
																								savePortfolioName(p.id);
																							} else {
																								setEditingPortfolioId(p.id);
																								setEditName(p.name);
																							}
																						}}
																						className="size-7 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20 flex items-center justify-center hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 shadow-sm group/editbtn hover:scale-110 active:scale-95 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)]"
																					>
																						{editingPortfolioId === p.id ? (
																							<Check className="size-3.5 text-emerald-500" />
																						) : (
																							<Edit2 className="size-3.5 text-emerald-400 transition-colors" />
																						)}
																					</button>
																					<button
																						onClick={async (e) => {
																							e.stopPropagation();
																							if (confirm(`Delete \"${p.name}\"? This will unlink the portfolio and remove all its mutual fund holdings.`)) {
																								try {
																									await supabase.from('user_portfolios').delete().eq('id', p.id);
																									const remaining = portfolios.filter(x => x.id !== p.id);
																									setPortfolios(remaining);
																									if (activePortfolio?.id === p.id) {
																										if (remaining.length > 0) {
																											const firstMF = remaining.find(x => x.type === 'MF');
																											setActivePortfolio(firstMF || MF_AGGREGATE);
																										} else {
																											setActivePortfolio(MF_AGGREGATE);
																										}
																									}
																								} catch (err) { console.error(err); }
																							}
																						}}
																						className="size-7 rounded-lg bg-red-500/[0.08] border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/40 transition-all duration-300 shadow-sm group/delbtn hover:scale-110 active:scale-95 hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]"
																					>
																						<Trash2 className="size-3.5 text-red-400 transition-colors" />
																					</button>
																				</div>
																			</div>
																		))
																	) : (
																		<div className="flex flex-col items-center justify-center h-full opacity-60 border border-dashed border-emerald-500/10 rounded-2xl bg-emerald-500/[0.02] mx-1">
																			<div className="size-10 rounded-full bg-zinc-950 border border-emerald-500/10 flex items-center justify-center mb-3">
																				<Plus className="w-4.5 h-4.5 text-emerald-500" />
																			</div>
																			<span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500/60">No MF Portfolio</span>
																			<span className="text-[8px] text-zinc-500 mt-1 max-w-[150px] text-center font-bold">Link your MF portfolio now to start tracking.</span>
																		</div>
																	)}
																</div>

																{/* MF ADD ACTION */}
																<div className="px-1 pt-2">
																	<button
																		onClick={() => {
																			setIsPortfolioDropdownOpen(false);
																			setShowCASImport(true);
																		}}
																		className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.03] border border-dashed border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/[0.08] transition-all group/add-mf shadow-sm"
																	>
																		<div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover/add-mf:rotate-90 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
																			<Plus className="w-4.5 h-4.5 text-emerald-500" />
																		</div>
																		<div className="flex flex-col items-start translate-y-[-1px]">
																			<span className="text-[11px] font-headline font-black text-white/80 group-hover/add-mf:text-white transition-colors">LINK CAS PDF</span>
																			<span className="text-[8px] text-emerald-500/50 font-bold uppercase tracking-widest group-hover/add-mf:text-emerald-500/80 transition-colors">Refresh Mutual Funds</span>
																		</div>
																	</button>
																</div>
															</div>
														</div>
													</div>
												</motion.div>
											</>
										)}
									</AnimatePresence>
								</div>
							</div>
						</motion.div>

						{/* Metrics Section */}
						<div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.2fr] gap-6 lg:gap-10 mb-0 items-end px-2">
							{/* Metric 1: Total Net Worth */}
							<div className="flex flex-col gap-1 min-w-[240px]">
								<div className="flex items-center gap-2 mb-1">
									<span className="font-terminal-label uppercase tracking-widest text-[11px] text-zinc-400 font-bold">
										{activePortfolio?.id === 'total' ? 'Unified Net Worth' : 'Total Net Worth'}
									</span>
									{activePortfolio?.id === 'total' && (
										<span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)] leading-none">
											Global
										</span>
									)}
								</div>
								<h1 className={cn(
									"font-headline font-bold text-4xl md:text-5xl tracking-tighter text-white tabular-nums leading-none transition-all duration-500",
									activePortfolio?.id === 'total' && "text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-200 to-white drop-shadow-[0_0_30px_rgba(245,158,11,0.2)]",
									isMFActive && "text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-300 to-white drop-shadow-[0_0_30px_rgba(16,185,129,0.25)]",
									(!isMFActive && activePortfolio?.id !== 'total') && "text-transparent bg-clip-text bg-gradient-to-r from-white via-blue-300 to-white drop-shadow-[0_0_30px_rgba(99,102,241,0.25)]"
								)}>
									<RollingNumber value={totalNetWorth} currency prefix="₹" decimals={0} />
								</h1>
							</div>

							{/* Metric 2: Daily P/L */}
							<div className="flex flex-col gap-1 border-l border-white/5 pl-6 min-w-[210px]">
								<span className="font-terminal-label uppercase tracking-widest text-[11px] text-zinc-400 block mb-1 font-bold">Daily P/L</span>
								<div className="flex items-center gap-3">
									<span className={`font-headline font-bold text-2xl md:text-3xl tabular-nums whitespace-nowrap ${isDailyClosed ? 'text-zinc-500' : (totalDayChange > 0 ? 'text-emerald-500' : 'text-red-500')
										}`}>
										{isDailyClosed ? (
											<RollingNumber value={0} currency prefix="₹" decimals={0} />
										) : (
											<RollingNumber value={totalDayChange} currency prefix="₹" showSign decimals={0} />
										)}
									</span>
									<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isDailyClosed
										? 'bg-zinc-500/10 text-zinc-500'
										: (totalDayChange > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500')
										}`}>
										{isDailyClosed ? (
											<RollingNumber value={0} suffix="%" decimals={2} />
										) : (
											<RollingNumber value={dayChangePerc} suffix="%" decimals={2} showSign />
										)}
									</span>
								</div>
							</div>

							{/* Metric 3: Aggregate P/L */}
							<div className="flex flex-col gap-1 border-l border-white/5 pl-6 min-w-[210px]">
								<span className="font-terminal-label uppercase tracking-widest text-[11px] text-zinc-400 block mb-1 font-bold">Total Returns</span>
								<div className="flex items-center gap-3">
									<span className={`font-headline font-bold text-xl md:text-2xl tabular-nums whitespace-nowrap ${totalPL === 0 ? 'text-zinc-500' : (totalPL > 0 ? 'text-emerald-500' : 'text-red-500')
										}`}>
										<RollingNumber value={totalPL} currency prefix="₹" showSign decimals={0} />
									</span>
									<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${totalPL === 0 ? 'bg-zinc-500/10 text-zinc-500' : (totalPL > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500')
										}`}>
										<RollingNumber value={totalPLPerc} suffix="%" decimals={2} prefix={totalPLPerc >= 0 ? "+" : ""} />
									</span>
								</div>
							</div>
						</div>

						{/* Performance Chart Box */}
						<motion.div
							variants={{
								hidden: { opacity: 0, y: 20 },
								visible: { opacity: 1, y: 0 }
							}}
							className="flex-grow flex flex-col h-full"
						>
							<motion.section
								className="glass-panel border-white/5 bg-white/[0.02] rounded-3xl p-6 relative group overflow-hidden flex-grow flex flex-col justify-between h-full"
							>
								<div className="flex justify-between items-center mb-6">
									<div>
										<h3 className="font-terminal-label text-[10px] uppercase tracking-widest text-zinc-400 mb-1 font-bold">Historical Performance</h3>
										<div className="flex items-baseline gap-3">
											<span className="font-headline font-bold text-3xl tracking-tighter text-white tabular-nums"><RollingNumber value={totalNetWorth} currency prefix="₹" decimals={0} /></span>
											<span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${totalPLPerc >= 0 ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10'
												}`}>
												<RollingNumber value={totalPLPerc} suffix="%" decimals={2} prefix={totalPLPerc >= 0 ? "+" : ""} />
											</span>
										</div>
									</div>
									<div className="flex gap-1.5">
										{['1W', '1M', '1Y', 'ALL'].map((range) => (
											<button
												key={range}
												onClick={() => setTimeRange(range as any)}
												className={`px-3 py-1 rounded-md font-terminal-label text-[10px] font-bold tracking-widest transition-all ${timeRange === range
													? (totalPLPerc >= 0
														? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
														: 'bg-red-500/10 text-red-400 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.2)]')
													: 'text-zinc-500 hover:text-zinc-300'
													}`}
											>
												{range}
											</button>
										))}
									</div>
								</div>

								<div className="h-[420px] w-full">
									{filteredHistory.length > 0 ? (
										<WealthChart
											data={chartData}
											isProfitOverride={totalPL >= 0}
											theme="emerald"
										/>
									) : (
										<div className="h-full flex flex-col items-center justify-center gap-6">
											<div className="flex flex-col items-center gap-3 opacity-30">
												<Cpu className="w-12 h-12 animate-pulse" />
												<span className="font-terminal-label text-[10px] uppercase tracking-[0.4em]">Initializing...</span>
											</div>
										</div>
									)}
								</div>

								{/* Simplified Data Note */}
								<div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2.5 opacity-60">
									<Info className="size-3 text-blue-400 shrink-0" />
									<p className="text-[10px] font-terminal-label uppercase tracking-widest text-zinc-300">
										<span className="font-black text-white mr-1 italic">Note:</span>
										This chart is built from daily portfolio snapshots. Real-time changes are added every time after sync.
									</p>
								</div>
							</motion.section>
						</motion.div>
					</motion.div>

					{/* RIGHT COLUMN: Portfolio Analyzer - Now perfectly aligned with Header */}
					<motion.aside
						initial={{ opacity: 0, x: 20 }}
						animate={{
							opacity: isPortfolioDropdownOpen ? 0.8 : 1,
							x: 0,
							scale: isPortfolioDropdownOpen ? 0.995 : 1
						}}
						transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.8 }}
						className="glass-panel rounded-3xl border border-white/10 bg-[#0a0d14]/80 backdrop-blur-3xl shadow-[0_40px_100px_rgba(0,0,0,0.4)] group/sidebar overflow-hidden transition-all duration-500 relative flex flex-col h-[calc(100%+2rem)] -mt-8"
					>
						<AnimatePresence>
							{isPortfolioDropdownOpen && (
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
								/>
							)}
						</AnimatePresence>
						{isMFActive ? (
							<MFPortfolioAnalyzer
								activePortfolioId={activePortfolio?.id || 'mf_overall'}
								holdingsHash={mfHoldings.map(h => `${h.id}-${h.quantity}`).join(',')}
							/>
						) : (
							<PortfolioAnalyzer holdings={holdings} mfHoldings={mfHoldings} activePortfolio={activePortfolio} onRefresh={handleAnalyzerRefresh} />
						)}
					</motion.aside>
				</div>

				{/* BOTTOM ROW: Asset Allocation Console */}
				<div className="flex flex-col gap-6">

					{/* CONSOLIDATED HOLDINGS SECTION (TOTAL WEALTH ONLY) */}
					{activePortfolio?.id === 'total' && (holdings.length > 0 || mfHoldings.length > 0) && (
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
							className="w-full"
						>
							<section className="glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-gradient-to-b from-white/[0.02] to-transparent relative">
								<AnimatePresence>
									{isPortfolioDropdownOpen && (
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
										/>
									)}
								</AnimatePresence>

								<div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
									<h3 className="font-terminal-label text-[11px] uppercase tracking-wider text-zinc-300 font-bold">Consolidated Portfolio Holdings</h3>
									<div className="relative group">
										<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500/50 group-focus-within:text-emerald-400 transition-colors w-3.5 h-3.5" />
										<input
											type="text"
											placeholder="FILTER CONSOLIDATED HOLDINGS..."
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											className="bg-white/[0.02] border border-white/10 text-[10px] tracking-[0.1em] font-terminal-label pl-10 pr-4 py-2.5 w-72 rounded-full focus:ring-1 focus:ring-emerald-500/40 focus:bg-white/[0.04] focus:outline-none placeholder:text-zinc-600 transition-all uppercase"
										/>
									</div>
								</div>

								<div className="overflow-x-auto overflow-y-auto max-h-[500px] custom-scrollbar">
									<table className="w-full text-left border-collapse min-w-[1100px]">
										<thead>
											<tr className="bg-white/[0.02]">
												<th
													className="min-w-[240px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('trading_symbol')}
												>
													<div className="flex items-center gap-3">
														Asset Details
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															(sortConfig.key === 'trading_symbol' || sortConfig.key === 'fund_name') && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{(sortConfig.key === 'trading_symbol' || sortConfig.key === 'fund_name') && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : (sortConfig.key === 'trading_symbol' || sortConfig.key === 'fund_name') && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[110px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('quantity')}
												>
													<div className="flex items-center justify-end gap-3">
														Quantity
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'quantity' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'quantity'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'quantity' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'quantity' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[120px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('average_price')}
												>
													<div className="flex items-center justify-end gap-3">
														Avg. Cost
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'average_price' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'average_price'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'average_price' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'average_price' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[130px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('invested_value')}
												>
													<div className="flex items-center justify-end gap-3">
														Invested Value
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'invested_value' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'invested_value'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'invested_value' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'invested_value' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[130px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('market_value')}
												>
													<div className="flex items-center justify-end gap-3">
														Current Value
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'market_value' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'market_value'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'market_value' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'market_value' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[120px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('day_change')}
												>
													<div className="flex items-center justify-end gap-3">
														Day Change
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'day_change' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'day_change'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'day_change' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'day_change' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[100px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('weight')}
												>
													<div className="flex items-center justify-end gap-3">
														Weight
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'weight' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'weight'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'weight' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'weight' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[170px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('p_l')}
												>
													<div className="flex items-center justify-end gap-3">
														Total Returns
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'p_l' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'p_l'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'p_l' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'p_l' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-white/[0.03]">
											{sortedCombinedHoldings.length === 0 ? (
												<tr>
													<td colSpan={8} className="py-24 text-center">
														<div className="flex flex-col items-center gap-4 opacity-40">
															<div className="w-12 h-12 rounded-full border border-emerald-500/20 flex items-center justify-center animate-pulse">
																<Database className="w-5 h-5 text-emerald-500/50" />
															</div>
															<div className="flex flex-col gap-1">
																<span className="font-terminal-label text-[10px] uppercase tracking-[0.4em] text-emerald-500">
																	No Matching Assets Found
																</span>
																<span className="font-data-sm text-[11px] text-zinc-500 uppercase tracking-widest">
																	Try a different search term
																</span>
															</div>
														</div>
													</td>
												</tr>
											) : (
												<AnimatePresence>
													{sortedCombinedHoldings.map((item) => (
														<motion.tr
															layout="position"
															key={item.id}
															initial={{ opacity: 0 }}
															animate={{ opacity: 1 }}
															exit={{ opacity: 0, scale: 0.98 }}
															whileHover={{
																backgroundColor: 'rgba(255, 255, 255, 0.02)',
																transition: { duration: 0.2 }
															}}
															transition={{
																layout: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
																opacity: { duration: 0.3 }
															}}
															onClick={() => router.push(item.link)}
															className="group cursor-pointer border-b border-white/[0.02] relative overflow-hidden"
														>
															<td className="min-w-[240px] px-6 py-6 relative">
																<div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none bg-[radial-gradient(circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(16,185,129,0.05)_0%,transparent_70%)]" />
																<div className="flex items-center gap-4 relative z-10">
																	<div className={cn(
																		"w-1 h-8 rounded-full transition-all duration-500 shrink-0",
																		item.p_l >= 0 ? "bg-emerald-500/40" : "bg-red-500/40"
																	)} />
																	<AssetLogo
																		symbol={item.symbol}
																		name={item.name}
																		size="sm"
																		className="shrink-0"
																	/>
																	<div className="flex flex-col min-w-0">
																		<div className="flex items-center gap-2">
																			<span className="font-headline font-bold text-[14px] text-white tracking-tight group-hover:text-emerald-400 transition-colors leading-tight truncate max-w-[140px]">
																				{item.name}
																			</span>
																			<span className={cn(
																				"text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border leading-none transition-all shrink-0",
																				item.type === 'STOCK'
																					? "bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
																					: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
																			)}>
																				{item.type === 'STOCK' ? 'Stock' : 'Fund'}
																			</span>
																		</div>
																		<span className="font-terminal-label text-[9px] text-zinc-600 uppercase tracking-[0.1em] mt-0.5 truncate max-w-[180px]">
																			<span className="flex items-center gap-1.5">
																				{item.portfolioName && (
																					<>
																						<span className="text-zinc-400 font-black">{item.portfolioName}</span>
																						<span className="opacity-30">•</span>
																					</>
																				)}
																				<span className="text-zinc-500">{item.category}</span>
																			</span>
																		</span>
																	</div>
																</div>
															</td>
															<td className="min-w-[110px] px-6 py-6 text-right">
																<span className="font-data-md text-sm text-zinc-400 tabular-nums">
																	<RollingNumber value={item.quantity} decimals={item.type === 'STOCK' ? 0 : 3} />
																	<span className="text-[9px] ml-1 text-zinc-600 uppercase">Unit</span>
																</span>
															</td>
															<td className="min-w-[120px] px-6 py-6 text-right">
																<span className="font-data-md text-sm text-zinc-400 tabular-nums">
																	<RollingNumber value={item.averagePrice} currency prefix="₹" decimals={2} />
																</span>
															</td>
															<td className="min-w-[130px] px-6 py-6 text-right">
																<span className="font-data-md text-sm text-zinc-500/60 tabular-nums">
																	<RollingNumber value={item.investedValue} currency prefix="₹" decimals={0} />
																</span>
															</td>
															<td className="min-w-[130px] px-6 py-6 text-right">
																<span className="font-data-md text-base text-white tabular-nums drop-shadow-sm font-bold">
																	<RollingNumber value={item.marketValue} currency prefix="₹" decimals={0} />
																</span>
															</td>
															<td className="min-w-[120px] px-6 py-6 text-right">
																<div className="flex flex-col items-end">
																	<span className={cn(
																		"font-data-md text-[13px] font-bold tabular-nums",
																		item.dayChange >= 0 ? "text-emerald-400" : "text-rose-400"
																	)}>
																		<RollingNumber value={Math.abs(item.dayChange)} currency prefix={item.dayChange >= 0 ? "+₹" : "-₹"} decimals={0} />
																	</span>
																	<span className={cn(
																		"text-[10px] font-black tracking-tighter opacity-50",
																		item.dayChange >= 0 ? "text-emerald-500" : "text-rose-500"
																	)}>
																		<RollingNumber value={item.dayChangePercentage} suffix="%" decimals={2} />
																	</span>
																</div>
															</td>
															<td className="min-w-[100px] px-6 py-6 text-right">
																<div className="flex flex-col items-end gap-1.5">
																	<span className="font-terminal-label text-[11px] text-zinc-500 font-bold">
																		<RollingNumber value={item.weight} suffix="%" decimals={1} />
																	</span>
																	<div className="w-16 h-1 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
																		<motion.div
																			initial={{ width: 0 }}
																			animate={{ width: `${Math.min(item.weight, 100)}%` }}
																			transition={{ duration: 1, ease: "easeOut" }}
																			className={cn(
																				"h-full",
																				item.type === 'STOCK' ? "bg-blue-500/40" : "bg-emerald-500/40"
																			)}
																		/>
																	</div>
																</div>
															</td>
															<td className="min-w-[170px] px-6 py-6 text-right">
																<div className="flex flex-col items-end gap-1">
																	<div className={cn(
																		"px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all",
																		item.p_l >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
																	)}>
																		<span className={cn(
																			"font-data-md text-sm font-black tabular-nums",
																			item.p_l >= 0 ? "text-emerald-400" : "text-rose-400"
																		)}>
																			<RollingNumber value={Math.abs(item.p_l)} currency prefix={item.p_l >= 0 ? "+₹" : "-₹"} decimals={0} />
																		</span>
																	</div>
																	<span className={cn(
																		"font-terminal-label text-[11px] font-black tabular-nums opacity-40",
																		item.p_l >= 0 ? "text-emerald-500" : "text-rose-500"
																	)}>
																		<RollingNumber value={item.p_l_percentage} suffix="%" decimals={2} />
																	</span>
																</div>
															</td>
														</motion.tr>
													))}
												</AnimatePresence>
											)}
										</tbody>
									</table>
								</div>

								{consolidatedStats && (
									<div className="px-8 py-5 bg-black/40 flex flex-col md:flex-row justify-between items-center border-t border-white/5 gap-4 relative">
										{/* Glassmorphic Ambient Glow */}
										<div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.01] to-emerald-500/[0.01] pointer-events-none" />

										<div className="flex flex-col gap-1 z-10 shrink-0">
											<span className="font-terminal-label text-[10px] text-white/30 uppercase tracking-[0.2em]">
												Showing {sortedCombinedHoldings.length} of {holdings.length + mfHoldings.length} Assets
											</span>
											<span className="font-terminal-label text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-2 mt-0.5">
												<span className="text-blue-400/80 font-black">{consolidatedStats.stocksCount} Stocks</span>
												<span className="opacity-20">•</span>
												<span className="text-emerald-400/80 font-black">{consolidatedStats.fundsCount} Mutual Funds</span>
											</span>
										</div>

										{/* Consolidated Totals Grid */}
										<div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-3 z-10 text-right w-full md:w-auto">
											<div className="flex flex-col">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Total Invested</span>
												<span className="font-data-md text-sm text-zinc-400 tabular-nums">
													<RollingNumber value={consolidatedStats.totalInvested} currency prefix="₹" decimals={0} />
												</span>
											</div>

											<div className="flex flex-col">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Current Worth</span>
												<span className="font-data-md text-sm text-white font-black tabular-nums">
													<RollingNumber value={consolidatedStats.totalMarket} currency prefix="₹" decimals={0} />
												</span>
											</div>

											<div className="flex flex-col items-end">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Day Performance</span>
												<div className="flex items-center gap-1.5">
													<span className={cn(
														"font-data-md text-xs font-bold tabular-nums",
														consolidatedStats.totalDayPL >= 0 ? "text-emerald-400" : "text-rose-400"
													)}>
														<RollingNumber value={Math.abs(consolidatedStats.totalDayPL)} currency prefix={consolidatedStats.totalDayPL >= 0 ? "+₹" : "-₹"} decimals={0} />
													</span>
													<span className={cn(
														"text-[9px] font-black tracking-tighter px-1 rounded-sm leading-none py-0.5 border shrink-0",
														consolidatedStats.totalDayPL >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
													)}>
														<RollingNumber value={consolidatedStats.dayChangePercentage} suffix="%" decimals={2} />
													</span>
												</div>
											</div>

											<div className="flex flex-col items-end border-l border-white/5 pl-8">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Consolidated Returns</span>
												<div className="flex items-center gap-2">
													<div className={cn(
														"px-2 py-0.5 rounded-lg flex items-center transition-all",
														consolidatedStats.totalPLSum >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
													)}>
														<span className={cn(
															"font-data-md text-xs font-black tabular-nums",
															consolidatedStats.totalPLSum >= 0 ? "text-emerald-400" : "text-rose-400"
														)}>
															<RollingNumber value={Math.abs(consolidatedStats.totalPLSum)} currency prefix={consolidatedStats.totalPLSum >= 0 ? "+₹" : "-₹"} decimals={0} />
														</span>
													</div>
													<span className={cn(
														"font-terminal-label text-[10px] font-black tabular-nums opacity-55",
														consolidatedStats.totalPLSum >= 0 ? "text-emerald-500" : "text-rose-500"
													)}>
														<RollingNumber value={consolidatedStats.totalPLPercentage} suffix="%" decimals={2} />
													</span>
												</div>
											</div>
										</div>
									</div>
								)}
							</section>
						</motion.div>
					)}

					{/* MUTUAL FUNDS SECTION */}
					{/* MUTUAL FUNDS SECTION */}
					{mfHoldings.length > 0 && isMFActive && activePortfolio?.id !== 'total' && (
						<motion.div

							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
							className="w-full"
						>
							<section className="glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-gradient-to-b from-white/[0.02] to-transparent relative">
								<AnimatePresence>
									{isPortfolioDropdownOpen && (
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
										/>
									)}
								</AnimatePresence>

								<div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
									<h3 className="font-terminal-label text-[11px] uppercase tracking-wider text-zinc-300 font-bold">Current Holdings</h3>
									<div className="relative group">
										<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500/50 group-focus-within:text-emerald-400 transition-colors w-3.5 h-3.5" />
										<input
											type="text"
											placeholder="FILTER HOLDINGS..."
											value={mfSearchQuery}
											onChange={(e) => setMfSearchQuery(e.target.value)}
											className="bg-white/[0.02] border border-white/10 text-[10px] tracking-[0.1em] font-terminal-label pl-10 pr-4 py-2.5 w-72 rounded-full focus:ring-1 focus:ring-emerald-500/40 focus:bg-white/[0.04] focus:outline-none placeholder:text-zinc-600 transition-all uppercase"
										/>
									</div>
								</div>

								<div className="overflow-x-auto overflow-y-auto max-h-[440px] custom-scrollbar">
									<table className="w-full text-left border-collapse min-w-[1100px]">
										<thead>
											<tr className="bg-white/[0.02]">
												<th
													className="min-w-[220px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('fund_name')}
												>
													<div className="flex items-center gap-3">
														Scheme Details
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'fund_name' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'fund_name'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'fund_name' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'fund_name' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[100px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('quantity')}
												>
													<div className="flex items-center justify-end gap-3">
														Quantity
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'quantity' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'quantity'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'quantity' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'quantity' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[110px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('average_price')}
												>
													<div className="flex items-center justify-end gap-3">
														Avg. Cost
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'average_price' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'average_price'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'average_price' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'average_price' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[130px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('invested_value')}
												>
													<div className="flex items-center justify-end gap-3">
														Invested Value
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'invested_value' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'invested_value'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'invested_value' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'invested_value' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[130px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('market_value')}
												>
													<div className="flex items-center justify-end gap-3">
														Current Value
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'market_value' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'market_value'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'market_value' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'market_value' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[120px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('day_change')}
												>
													<div className="flex items-center justify-end gap-3">
														NAV Change
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'day_change' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'day_change'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'day_change' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'day_change' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[100px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('weight')}
												>
													<div className="flex items-center justify-end gap-3">
														Weight
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'weight' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'weight'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'weight' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'weight' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[170px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestMfSort('p_l')}
												>
													<div className="flex items-center justify-end gap-3">
														Total Returns
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															mfSortConfig.key === 'p_l' && mfSortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${mfSortConfig.key === 'p_l'}-${mfSortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{mfSortConfig.key === 'p_l' && mfSortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : mfSortConfig.key === 'p_l' && mfSortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-white/[0.03]">
											{sortedMfHoldings.length === 0 ? (
												<tr>
													<td colSpan={8} className="py-24 text-center">
														<div className="flex flex-col items-center gap-4 opacity-40">
															<div className="w-12 h-12 rounded-full border border-emerald-500/20 flex items-center justify-center animate-pulse">
																<Database className="w-5 h-5 text-emerald-500/50" />
															</div>
															<div className="flex flex-col gap-1">
																<span className="font-terminal-label text-[10px] uppercase tracking-[0.4em] text-emerald-500">
																	{mfSearchQuery ? "No Matching Funds" : "Portfolio Not Found"}
																</span>
																<span className="font-data-sm text-[11px] text-zinc-500 uppercase tracking-widest">
																	{mfSearchQuery ? "Try a different search term" : "Upload your CAS Statement to start"}
																</span>
																{!mfSearchQuery && (
																	<button
																		onClick={() => setShowCASImport(true)}
																		className="mt-4 px-6 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-terminal-label text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
																	>
																		Link CAS PDF
																	</button>
																)}
															</div>
														</div>
													</td>
												</tr>
											) : (
												<AnimatePresence>
													{sortedMfHoldings.map((h, i) => {
														const quantity = Number(h.quantity) || 0;
														const averagePrice = Number(h.average_price) || 0;
														const investedValue = Number(h.invested_value) || (quantity * averagePrice);
														const marketValue = Number(h.market_value) || 0;
														const dayPL = Number(h.day_change) || 0;

														// Calculate day change percentage based on market value & day change
														const prevDayValue = marketValue - dayPL;
														const dayPLPercentage = prevDayValue > 0 ? (dayPL / prevDayValue) * 100 : 0;

														const totalGain = Number(h.p_l) || 0;
														const totalGainPct = Number(h.p_l_percentage) || 0;
														const isPositive = totalGain >= 0;
														const weight = totalNetWorth > 0 ? (marketValue / totalNetWorth) * 100 : 0;

														const colors = getAssetColors(h.fund_name || 'Mutual Fund');
														const letter = (h.fund_name || 'M').charAt(0).toUpperCase();

														return (
															<motion.tr
																layout="position"
																key={h.id || i}
																initial={{ opacity: 0 }}
																animate={{ opacity: 1 }}
																exit={{ opacity: 0, scale: 0.98 }}
																whileHover={{
																	backgroundColor: 'rgba(255, 255, 255, 0.02)',
																	transition: { duration: 0.2 }
																}}
																transition={{
																	layout: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
																	opacity: { duration: 0.3 }
																}}
																onClick={() => router.push(`/mutual-funds/${h.isin || h.scheme_code}`)}
																className="group cursor-pointer border-b border-white/[0.02] relative overflow-hidden"
															>
																<td className="min-w-[220px] px-6 py-6 relative">
																	<div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none bg-[radial-gradient(circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(16,185,129,0.05)_0%,transparent_70%)]" />
																	<div className="flex items-center gap-4 relative z-10">
																		<div className={cn(
																			"w-1 h-8 rounded-full transition-all duration-500 shrink-0",
																			isPositive ? "bg-emerald-500/40" : "bg-red-500/40"
																		)} />

																		<AssetLogo
																			symbol={h.isin || h.symbol || 'MF'}
																			name={h.fund_name || 'Mutual Fund'}
																			size="sm"
																			className="shrink-0"
																		/>

																		<div className="flex flex-col">
																			<span className="font-headline font-bold text-[14px] text-white tracking-tight group-hover:text-emerald-400 transition-colors leading-tight">
																				{h.fund_name || 'Unknown Fund'}
																			</span>
																			<span className="font-terminal-label text-[9px] text-zinc-600 uppercase tracking-[0.1em] mt-0.5">
																				{activePortfolio?.id === 'total' && h.user_portfolios?.name ? (
																					<span className="flex items-center gap-1.5">
																						<span className="text-zinc-400 font-black">{h.user_portfolios.name}</span>
																						<span className="opacity-30">•</span>
																						<span className="text-zinc-400 font-black">{h.category || "Equity"}</span>
																						<span className="opacity-30">•</span>
																						<span>{h.isin}</span>
																					</span>
																				) : (
																					<span className="flex items-center gap-1.5">
																						<span className="text-zinc-400 font-black">{h.category || "Equity"}</span>
																						<span className="opacity-30">•</span>
																						<span>{h.isin}</span>
																					</span>
																				)}
																			</span>
																		</div>
																	</div>
																</td>
																<td className="min-w-[100px] px-6 py-6 text-right">
																	<span className="font-data-md text-sm text-zinc-400 tabular-nums">
																		<RollingNumber value={quantity} decimals={3} />
																		<span className="text-[9px] ml-1 text-zinc-600 uppercase">Unit</span>
																	</span>
																</td>
																<td className="min-w-[110px] px-6 py-6 text-right">
																	<span className="font-data-md text-sm text-zinc-400 tabular-nums">
																		<RollingNumber value={averagePrice} currency prefix="₹" decimals={2} />
																	</span>
																</td>
																<td className="min-w-[130px] px-6 py-6 text-right">
																	<span className="font-data-md text-sm text-zinc-500/60 tabular-nums">
																		<RollingNumber value={investedValue} currency prefix="₹" decimals={0} />
																	</span>
																</td>
																<td className="min-w-[130px] px-6 py-6 text-right">
																	<span className="font-data-md text-base text-white tabular-nums drop-shadow-sm font-bold">
																		<RollingNumber value={marketValue} currency prefix="₹" decimals={0} />
																	</span>
																</td>
																<td className="min-w-[120px] px-6 py-6 text-right">
																	<div className="flex flex-col items-end">
																		<span className={cn(
																			"font-data-md text-[13px] font-bold tabular-nums",
																			dayPL >= 0 ? "text-emerald-400" : "text-rose-400"
																		)}>
																			<RollingNumber value={Math.abs(dayPL)} currency prefix={dayPL >= 0 ? "+₹" : "-₹"} decimals={0} />
																		</span>
																		<span className={cn(
																			"text-[10px] font-black tracking-tighter opacity-50",
																			dayPL >= 0 ? "text-emerald-500" : "text-rose-500"
																		)}>
																			<RollingNumber value={dayPLPercentage} suffix="%" decimals={2} />
																		</span>
																	</div>
																</td>
																<td className="min-w-[100px] px-6 py-6 text-right">
																	<div className="flex flex-col items-end gap-1.5">
																		<span className="font-terminal-label text-[11px] text-zinc-500 font-bold">
																			<RollingNumber value={weight} suffix="%" decimals={1} />
																		</span>
																		<div className="w-16 h-1 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
																			<motion.div
																				initial={{ width: 0 }}
																				animate={{ width: `${Math.min(weight, 100)}%` }}
																				transition={{ duration: 1, ease: "easeOut" }}
																				className="h-full bg-indigo-500/40"
																			/>
																		</div>
																	</div>
																</td>
																<td className="min-w-[170px] px-6 py-6 text-right">
																	<div className="flex flex-col items-end gap-1">
																		<div className={cn(
																			"px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all",
																			isPositive ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
																		)}>
																			<span className={cn(
																				"font-data-md text-sm font-black tabular-nums",
																				isPositive ? "text-emerald-400" : "text-rose-400"
																			)}>
																				<RollingNumber value={Math.abs(totalGain)} currency prefix={isPositive ? "+₹" : "-₹"} decimals={0} />
																			</span>
																		</div>
																		<span className={cn(
																			"font-terminal-label text-[11px] font-black tabular-nums opacity-40",
																			isPositive ? "text-emerald-500" : "text-rose-500"
																		)}>
																			<RollingNumber value={totalGainPct} suffix="%" decimals={2} />
																		</span>
																	</div>
																</td>
															</motion.tr>
														);
													})}
												</AnimatePresence>
											)}
										</tbody>
									</table>
								</div>

								{mfStats && (
									<div className="px-8 py-5 bg-black/40 flex flex-col md:flex-row justify-between items-center border-t border-white/5 gap-4 relative">
										{/* Glassmorphic Ambient Glow */}
										<div className="absolute inset-0 bg-gradient-to-r from-emerald-500/[0.01] to-transparent pointer-events-none" />

										<div className="flex flex-col gap-1 z-10 shrink-0">
											<span className="font-terminal-label text-[10px] text-white/30 uppercase tracking-[0.2em]">
												Showing {sortedMfHoldings.length} of {mfHoldings.length} Mutual Funds
											</span>
											<span className="font-terminal-label text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-2 mt-0.5">
												<span className="text-emerald-400/80 font-black">{mfStats.count} Funds Active</span>
											</span>
										</div>

										{/* Consolidated Totals Grid */}
										<div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-3 z-10 text-right w-full md:w-auto">
											<div className="flex flex-col">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Total Invested</span>
												<span className="font-data-md text-sm text-zinc-400 tabular-nums">
													<RollingNumber value={mfStats.totalInvested} currency prefix="₹" decimals={0} />
												</span>
											</div>

											<div className="flex flex-col">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Current Worth</span>
												<span className="font-data-md text-sm text-white font-black tabular-nums">
													<RollingNumber value={mfStats.totalMarket} currency prefix="₹" decimals={0} />
												</span>
											</div>

											<div className="flex flex-col items-end">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">NAV Change</span>
												<div className="flex items-center gap-1.5">
													<span className={cn(
														"font-data-md text-xs font-bold tabular-nums",
														mfStats.totalDayPL >= 0 ? "text-emerald-400" : "text-rose-400"
													)}>
														<RollingNumber value={Math.abs(mfStats.totalDayPL)} currency prefix={mfStats.totalDayPL >= 0 ? "+₹" : "-₹"} decimals={0} />
													</span>
													<span className={cn(
														"text-[9px] font-black tracking-tighter px-1 rounded-sm leading-none py-0.5 border shrink-0",
														mfStats.totalDayPL >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
													)}>
														<RollingNumber value={mfStats.dayChangePercentage} suffix="%" decimals={2} />
													</span>
												</div>
											</div>

											<div className="flex flex-col items-end border-l border-white/5 pl-8">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Total Returns</span>
												<div className="flex items-center gap-2">
													<div className={cn(
														"px-2 py-0.5 rounded-lg flex items-center transition-all",
														mfStats.totalPLSum >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
													)}>
														<span className={cn(
															"font-data-md text-xs font-black tabular-nums",
															mfStats.totalPLSum >= 0 ? "text-emerald-400" : "text-rose-400"
														)}>
															<RollingNumber value={Math.abs(mfStats.totalPLSum)} currency prefix={mfStats.totalPLSum >= 0 ? "+₹" : "-₹"} decimals={0} />
														</span>
													</div>
													<span className={cn(
														"font-terminal-label text-[10px] font-black tabular-nums opacity-55",
														mfStats.totalPLSum >= 0 ? "text-emerald-500" : "text-rose-500"
													)}>
														<RollingNumber value={mfStats.totalPLPercentage} suffix="%" decimals={2} />
													</span>
												</div>
											</div>
										</div>
									</div>
								)}
							</section>
						</motion.div>
					)}


					{holdings.length > 0 && activePortfolio?.id !== 'total' && (activePortfolio?.id === 'overall' || !isMFActive) && (
						<motion.div
							className="w-full"
						>
							<motion.section
								variants={{
									hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
									visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
								}}
								transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
								className="glass-panel rounded-3xl overflow-hidden flex flex-col border border-white/10 shadow-2xl bg-gradient-to-b from-white/[0.02] to-transparent relative"
							>
								<AnimatePresence>
									{isPortfolioDropdownOpen && (
										<motion.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="absolute inset-0 backdrop-blur-[4px] bg-black/10 z-50 pointer-events-none rounded-3xl"
										/>
									)}
								</AnimatePresence>
								<div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
									<h3 className="font-terminal-label text-[11px] uppercase tracking-wider text-zinc-300 font-bold">Current Holdings</h3>
									<div className="relative group">
										<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500/50 group-focus-within:text-emerald-400 transition-colors w-3.5 h-3.5" />
										<input
											type="text"
											placeholder="FILTER HOLDINGS..."
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											className="bg-white/[0.02] border border-white/10 text-[10px] tracking-[0.1em] font-terminal-label pl-10 pr-4 py-2.5 w-72 rounded-full focus:ring-1 focus:ring-emerald-500/40 focus:bg-white/[0.04] focus:outline-none placeholder:text-zinc-600 transition-all uppercase"
										/>
									</div>
								</div>

								<div className="overflow-x-auto overflow-y-auto max-h-[440px] custom-scrollbar">
									<table className="w-full text-left border-collapse min-w-[1100px]">
										<thead>
											<tr className="bg-white/[0.02]">
												<th
													className="min-w-[220px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('trading_symbol')}
												>
													<div className="flex items-center gap-3">
														Stock Details
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'trading_symbol' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'trading_symbol'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'trading_symbol' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'trading_symbol' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[100px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('quantity')}
												>
													<div className="flex items-center justify-end gap-3">
														Quantity
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'quantity' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'quantity'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'quantity' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'quantity' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[110px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('average_price')}
												>
													<div className="flex items-center justify-end gap-3">
														Avg. Cost
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'average_price' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'average_price'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'average_price' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'average_price' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[130px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('invested_value')}
												>
													<div className="flex items-center justify-end gap-3">
														Invested Value
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'invested_value' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'invested_value'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'invested_value' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'invested_value' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[130px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('market_value')}
												>
													<div className="flex items-center justify-end gap-3">
														Current Value
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'market_value' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'market_value'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'market_value' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'market_value' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[120px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('day_change')}
												>
													<div className="flex items-center justify-end gap-3">
														Day Change
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'day_change' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'day_change'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'day_change' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'day_change' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[100px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('weight')}
												>
													<div className="flex items-center justify-end gap-3">
														Weight
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'weight' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'weight'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'weight' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'weight' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
												<th
													className="min-w-[170px] px-6 py-5 font-terminal-label text-[10px] uppercase tracking-[0.2em] text-zinc-500 text-right font-black cursor-pointer hover:bg-white/[0.02] transition-colors group/header"
													onClick={() => requestSort('p_l')}
												>
													<div className="flex items-center justify-end gap-3">
														Total Returns
														<div className={cn(
															"flex items-center justify-center size-5 rounded-md transition-all duration-300 relative overflow-hidden",
															sortConfig.key === 'p_l' && sortConfig.direction ? "bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "text-zinc-600 group-hover/header:text-zinc-400"
														)}>
															<AnimatePresence mode="wait">
																<motion.div
																	key={`${sortConfig.key === 'p_l'}-${sortConfig.direction}`}
																	initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
																	animate={{ opacity: 1, scale: 1, rotate: 0 }}
																	exit={{ opacity: 0, scale: 0.5, rotate: 10 }}
																	transition={{ duration: 0.15, ease: "easeOut" }}
																>
																	{sortConfig.key === 'p_l' && sortConfig.direction === 'asc' ? (
																		<ChevronUp className="size-3" />
																	) : sortConfig.key === 'p_l' && sortConfig.direction === 'desc' ? (
																		<ChevronDown className="size-3" />
																	) : (
																		<ArrowUpDown className="size-3 opacity-40" />
																	)}
																</motion.div>
															</AnimatePresence>
														</div>
													</div>
												</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-white/[0.03]">

											{sortedHoldings.length === 0 ? (
												<tr>
													<td colSpan={8} className="py-24 text-center">
														<div className="flex flex-col items-center gap-4 opacity-40">
															<div className="w-12 h-12 rounded-full border border-emerald-500/20 flex items-center justify-center animate-pulse">
																<Database className="w-5 h-5 text-emerald-500/50" />
															</div>
															<div className="flex flex-col gap-1">
																<span className="font-terminal-label text-[10px] uppercase tracking-[0.4em] text-emerald-500">
																	{searchQuery ? "No Matching Stocks" : "Portfolio Not Found"}
																</span>
																<span className="font-data-sm text-[11px] text-zinc-500 uppercase tracking-widest">
																	{searchQuery ? "Try a different search term" : "Upload your Excel statement to start"}
																</span>
																{!searchQuery && (
																	<button
																		onClick={() => setAddPortfolioModalOpen(true)}
																		className="mt-4 px-6 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-terminal-label text-[10px] uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
																	>
																		Import Excel
																	</button>
																)}
															</div>
														</div>
													</td>
												</tr>
											) : (
												<AnimatePresence>
													{sortedHoldings.map((asset, idx) => (
														<motion.tr
															layout="position"
															key={asset.id || asset.trading_symbol}
															initial={{ opacity: 0 }}
															animate={{ opacity: 1 }}
															exit={{ opacity: 0, scale: 0.98 }}
															whileHover={{
																backgroundColor: 'rgba(255, 255, 255, 0.02)',
																transition: { duration: 0.2 }
															}}
															transition={{
																layout: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
																opacity: { duration: 0.3 }
															}}
															onClick={() => router.push(`/stocks/${asset.trading_symbol}`)}
															className="group cursor-pointer border-b border-white/[0.02] relative overflow-hidden"
														>
															<td className="min-w-[220px] px-6 py-6 relative">
																{/* Radial Glow Effect on Hover */}
																<div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none bg-[radial-gradient(circle_at_var(--mouse-x,50%)_var(--mouse-y,50%),rgba(16,185,129,0.05)_0%,transparent_70%)]" />
																<div className="flex items-center gap-4 relative z-10">
																	<div className={cn(
																		"w-1 h-8 rounded-full transition-all duration-500 shrink-0",
																		Number(asset.p_l) >= 0 ? "bg-emerald-500/40" : "bg-red-500/40"
																	)} />
																	<AssetLogo
																		symbol={asset.trading_symbol}
																		size="sm"
																		className="shrink-0"
																	/>
																	<div className="flex flex-col">
																		<span className="font-headline font-bold text-[14px] text-white tracking-tight group-hover:text-emerald-400 transition-colors">
																			{asset.trading_symbol.replace('.NS', '').replace('.BO', '')}
																		</span>
																		<span className="font-terminal-label text-[9px] text-zinc-600 uppercase tracking-[0.1em] mt-0.5">
																			{activePortfolio?.id === 'overall' && asset.user_portfolios?.name ? (
																				<span className="flex items-center gap-1.5">
																					<span className="text-zinc-400 font-black">{asset.user_portfolios.name}</span>
																					<span className="opacity-30">•</span>
																					<span>{asset.trading_symbol.endsWith('.NS') ? 'NSE' : (asset.trading_symbol.endsWith('.BO') ? 'BSE' : 'EQUITY')}</span>
																				</span>
																			) : (
																				asset.trading_symbol.endsWith('.NS') ? 'NSE' : (asset.trading_symbol.endsWith('.BO') ? 'BSE' : 'EQUITY')
																			)}
																		</span>
																	</div>
																</div>
															</td>
															<td className="min-w-[100px] px-6 py-6 text-right">
																<span className="font-data-md text-sm text-zinc-400 tabular-nums">
																	<RollingNumber value={asset.quantity || 0} decimals={0} />
																	<span className="text-[9px] ml-1 text-zinc-600 uppercase">Unit</span>
																</span>
															</td>
															<td className="min-w-[110px] px-6 py-6 text-right">
																<span className="font-data-md text-sm text-zinc-400 tabular-nums">
																	<RollingNumber value={Number(asset.average_price) || 0} currency prefix="₹" decimals={2} />
																</span>
															</td>
															<td className="min-w-[130px] px-6 py-6 text-right">
																<span className="font-data-md text-sm text-zinc-500/60 tabular-nums">
																	<RollingNumber value={Number(asset.invested_value) || 0} currency prefix="₹" decimals={0} />
																</span>
															</td>
															<td className="min-w-[130px] px-6 py-6 text-right">
																<span className="font-data-md text-base text-white tabular-nums drop-shadow-sm font-bold">
																	<RollingNumber value={Number(asset.market_value) || 0} currency prefix="₹" decimals={0} />
																</span>
															</td>
															<td className="min-w-[120px] px-6 py-6 text-right">
																<div className="flex flex-col items-end">
																	<span className={cn(
																		"font-data-md text-[13px] font-bold tabular-nums",
																		Number(asset.day_change) >= 0 ? "text-emerald-400" : "text-rose-400"
																	)}>
																		<RollingNumber value={Math.abs(Number(asset.day_change)) || 0} currency prefix={Number(asset.day_change) >= 0 ? "+₹" : "-₹"} decimals={0} />
																	</span>
																	<span className={cn(
																		"text-[10px] font-black tracking-tighter opacity-50",
																		Number(asset.day_change) >= 0 ? "text-emerald-500" : "text-rose-500"
																	)}>
																		<RollingNumber value={Number(asset.day_change_percentage) || 0} suffix="%" decimals={2} />
																	</span>
																</div>
															</td>
															<td className="min-w-[100px] px-6 py-6 text-right">
																<div className="flex flex-col items-end gap-1.5">
																	<span className="font-terminal-label text-[11px] text-zinc-500 font-bold">
																		<RollingNumber value={totalNetWorth > 0 ? (Number(asset.market_value) / totalNetWorth) * 100 : 0} suffix="%" decimals={1} />
																	</span>
																	<div className="w-16 h-1 bg-white/[0.03] rounded-full overflow-hidden border border-white/5">
																		<motion.div
																			initial={{ width: 0 }}
																			animate={{ width: `${Math.min((totalNetWorth > 0 ? (Number(asset.market_value) / totalNetWorth) * 100 : 0), 100)}%` }}
																			transition={{ duration: 1, ease: "easeOut" }}
																			className="h-full bg-indigo-500/40"
																		/>
																	</div>
																</div>
															</td>
															<td className="min-w-[170px] px-6 py-6 text-right">
																<div className="flex flex-col items-end gap-1">
																	<div className={cn(
																		"px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all",
																		Number(asset.p_l) >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
																	)}>
																		<span className={cn(
																			"font-data-md text-sm font-black tabular-nums",
																			Number(asset.p_l) >= 0 ? "text-emerald-400" : "text-rose-400"
																		)}>
																			<RollingNumber value={Math.abs(Number(asset.p_l)) || 0} currency prefix={Number(asset.p_l) >= 0 ? "+₹" : "-₹"} decimals={0} />
																		</span>
																	</div>
																	<span className={cn(
																		"font-terminal-label text-[11px] font-black tabular-nums opacity-40",
																		Number(asset.p_l) >= 0 ? "text-emerald-500" : "text-rose-500"
																	)}>
																		<RollingNumber value={Number(asset.p_l_percentage) || 0} suffix="%" decimals={2} />
																	</span>
																</div>
															</td>
														</motion.tr>
													))}
												</AnimatePresence>
											)}

										</tbody>
									</table>
								</div>

								{equityStats && (
									<div className="px-8 py-5 bg-black/40 flex flex-col md:flex-row justify-between items-center border-t border-white/5 gap-4 relative">
										{/* Glassmorphic Ambient Glow */}
										<div className="absolute inset-0 bg-gradient-to-r from-indigo-500/[0.01] to-transparent pointer-events-none" />

										<div className="flex flex-col gap-1 z-10 shrink-0">
											<span className="font-terminal-label text-[10px] text-white/30 uppercase tracking-[0.2em]">
												Showing {sortedHoldings.length} of {holdings.length} holdings
											</span>
											<span className="font-terminal-label text-[9px] text-zinc-500 uppercase tracking-wider flex items-center gap-2 mt-0.5">
												<span className="text-indigo-400/80 font-black">{equityStats.count} Stocks Active</span>
											</span>
										</div>

										{/* Consolidated Totals Grid */}
										<div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-3 z-10 text-right w-full md:w-auto">
											<div className="flex flex-col">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Total Invested</span>
												<span className="font-data-md text-sm text-zinc-400 tabular-nums">
													<RollingNumber value={equityStats.totalInvested} currency prefix="₹" decimals={0} />
												</span>
											</div>

											<div className="flex flex-col">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Current Worth</span>
												<span className="font-data-md text-sm text-white font-black tabular-nums">
													<RollingNumber value={equityStats.totalMarket} currency prefix="₹" decimals={0} />
												</span>
											</div>

											<div className="flex flex-col items-end">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Day Change</span>
												<div className="flex items-center gap-1.5">
													<span className={cn(
														"font-data-md text-xs font-bold tabular-nums",
														equityStats.totalDayPL >= 0 ? "text-emerald-400" : "text-rose-400"
													)}>
														<RollingNumber value={Math.abs(equityStats.totalDayPL)} currency prefix={equityStats.totalDayPL >= 0 ? "+₹" : "-₹"} decimals={0} />
													</span>
													<span className={cn(
														"text-[9px] font-black tracking-tighter px-1 rounded-sm leading-none py-0.5 border shrink-0",
														equityStats.totalDayPL >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
													)}>
														<RollingNumber value={equityStats.dayChangePercentage} suffix="%" decimals={2} />
													</span>
												</div>
											</div>

											<div className="flex flex-col items-end border-l border-white/5 pl-8">
												<span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">Total Returns</span>
												<div className="flex items-center gap-2">
													<div className={cn(
														"px-2 py-0.5 rounded-lg flex items-center transition-all",
														equityStats.totalPLSum >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"
													)}>
														<span className={cn(
															"font-data-md text-xs font-black tabular-nums",
															equityStats.totalPLSum >= 0 ? "text-emerald-400" : "text-rose-400"
														)}>
															<RollingNumber value={Math.abs(equityStats.totalPLSum)} currency prefix={equityStats.totalPLSum >= 0 ? "+₹" : "-₹"} decimals={0} />
														</span>
													</div>
													<span className={cn(
														"font-terminal-label text-[10px] font-black tabular-nums opacity-55",
														equityStats.totalPLSum >= 0 ? "text-emerald-500" : "text-rose-500"
													)}>
														<RollingNumber value={equityStats.totalPLPercentage} suffix="%" decimals={2} />
													</span>
												</div>
											</div>
										</div>
									</div>
								)}
							</motion.section>
						</motion.div>
					)}

					{/* BOTTOM SECTION: 3/5 Terminal & 2/5 News Split */}
					<div className="grid grid-cols-1 lg:grid-cols-5 gap-6 w-full mt-0">
						{/* LEFT: Market Intelligence (3/5) */}
						<motion.div
							variants={{
								hidden: { opacity: 0, x: -20 },
								visible: { opacity: 1, x: 0 }
							}}
							initial="hidden"
							animate="visible"
							transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
							className="lg:col-span-3 h-[440px] overflow-hidden"
						>
							<WatchlistTerminal userId={portfolioId} holdings={holdings} />
						</motion.div>

						{/* RIGHT: Institutional News (2/5) */}
						<motion.div
							variants={{
								hidden: { opacity: 0, x: 20 },
								visible: { opacity: 1, x: 0 }
							}}
							initial="hidden"
							animate="visible"
							transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
							className="lg:col-span-2 h-[440px] flex flex-col glass-panel rounded-3xl border border-white/10 bg-[#0a0d14]/60 backdrop-blur-3xl shadow-2xl overflow-hidden"
						>
							<InstitutionalNews />
						</motion.div>
					</div>
				</div>
			</div>



			{/* Add Portfolio Modal - Portaled to Body to bypass transforms */}
			{mounted && addPortfolioModalOpen && createPortal(
				<AnimatePresence>
					<div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => { setAddPortfolioModalOpen(false); setNewPortfolioType(""); setShowGrowwGuide(false); setShowZerodhaGuide(false); }}
							className="absolute inset-0 bg-black/60 backdrop-blur-xl"
						/>
						<motion.div
							layout
							initial={{ opacity: 0, scale: 0.95, y: 10 }}
							animate={{
								opacity: 1,
								scale: 1,
								y: 0,
								width: (showGrowwGuide || showZerodhaGuide) ? "1100px" : "400px",
								height: "auto",
								maxWidth: "95vw"
							}}
							exit={{ opacity: 0, scale: 0.95, y: 10 }}
							transition={{
								layout: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
								opacity: { duration: 0.2 },
								scale: { duration: 0.3, ease: [0.16, 1, 0.3, 1] }
							}}
							className="relative bg-zinc-950 border border-white/10 rounded-[28px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.9)] flex flex-col"
						>
							<div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
								<div className="flex items-center gap-3">
									<div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
										<Wallet className="w-4 h-4 text-indigo-400" />
									</div>
									<div>
										<h2 className="font-sans font-bold text-lg text-white tracking-tight">
											{(showGrowwGuide || showZerodhaGuide) ? "Sync Guide" : isResyncMode ? "Differential Resync" : "Link Account"}
										</h2>
										<p className="text-[10px] font-sans uppercase tracking-[0.2em] text-zinc-500 font-black mt-0.5">
											{(showGrowwGuide || showZerodhaGuide) ? "Follow the steps below" : isResyncMode ? "Select portfolio to reconcile" : "Import your current holdings"}
										</p>
									</div>
								</div>
								<button
									onClick={() => {
										setAddPortfolioModalOpen(false);
										setIsResyncMode(false);
										setResyncPortfolioId(null);
										setNewPortfolioType("");
										setNewPortfolioName("");
										setShowGrowwGuide(false);
										setShowZerodhaGuide(false);
									}}
									className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
								>
									<X className="w-4 h-4" />
								</button>
							</div>

							<AnimatePresence mode="wait">
								{showGrowwGuide ? (
									<motion.div
										key="groww-guide"
										initial={{ opacity: 0, x: 20 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0, x: -20 }}
										className="flex-1 min-h-0"
									>
										<GrowwImportGuide
											embedded={true}
											onClose={() => setShowGrowwGuide(false)}
										/>
									</motion.div>
								) : showZerodhaGuide ? (
									<motion.div
										key="zerodha-guide"
										initial={{ opacity: 0, x: 20 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0, x: -20 }}
										className="flex-1 min-h-0"
									>
										<ZerodhaImportGuide
											embedded={true}
											onClose={() => setShowZerodhaGuide(false)}
										/>
									</motion.div>
								) : (
									<motion.div
										key="form"
										initial={{ opacity: 0, x: -20 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0, x: 20 }}
										className="p-4 space-y-4"
									>
										{isResyncMode && !resyncPortfolioId ? (
											<div className="space-y-4">
												<p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Target Portfolio</p>
												<div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
													{portfolios.filter(p => p.id !== 'overall').map(p => (
														<button
															key={p.id}
															onClick={() => {
																setResyncPortfolioId(p.id);
																setNewPortfolioType(p.broker_name as any);
															}}
															className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group"
														>
															<div className="flex items-center gap-4">
																<div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-emerald-500/20 p-2">
																	<img
																		src={p.broker_name === 'GROWW' ? '/Icons/groww.svg' : '/Icons/zerodha.svg'}
																		alt={p.broker_name}
																		className="w-full h-full object-contain opacity-50 group-hover:opacity-100 transition-opacity"
																	/>
																</div>
																<div className="text-left">
																	<p className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors">{p.name}</p>
																	<p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{p.broker_name}</p>
																</div>
															</div>
															<ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-500" />
														</button>
													))}
												</div>
											</div>
										) : (
											<>
												{!isResyncMode && (
													<>
														<div className="space-y-2">
															<label className="text-[10px] font-sans uppercase tracking-[0.3em] text-zinc-600 font-black px-1">Portfolio Name</label>
															<div className="relative group">
																<input
																	type="text"
																	value={newPortfolioName}
																	onChange={(e) => setNewPortfolioName(e.target.value)}
																	placeholder="e.g. Tactical Assets"
																	className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-[14px] font-headline font-bold text-white focus:outline-none focus:border-emerald-500/30 focus:bg-emerald-500/[0.02] transition-all duration-500 placeholder:text-zinc-700 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]"
																/>
																<div className="absolute inset-0 rounded-2xl border border-emerald-500/0 group-focus-within:border-emerald-500/20 transition-all duration-500 pointer-events-none shadow-[0_0_20px_rgba(16,185,129,0)] group-focus-within:shadow-[0_0_20px_rgba(16,185,129,0.05)]" />
															</div>
														</div>

														<div className="space-y-2">
															<div className="px-1">
																<label className="text-[10px] font-sans uppercase tracking-[0.3em] text-zinc-600 font-black">Choose your broker</label>
															</div>
															<div className="grid grid-cols-2 gap-4">
																{[
																	{ id: 'GROWW', name: 'Groww', icon: '/Icons/groww.svg' },
																	{ id: 'ZERODHA', name: 'Zerodha', icon: '/Icons/zerodha.svg' }
																].map((broker) => (
																	<button
																		key={broker.id}
																		onClick={() => setNewPortfolioType(broker.id as any)}
																		className={cn(
																			"p-3 rounded-2xl border transition-all duration-500 flex flex-col items-center gap-2 group relative overflow-hidden",
																			newPortfolioType === broker.id
																				? "bg-blue-500/10 border-blue-500/30 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_10px_30px_rgba(0,0,0,0.2)]"
																				: "bg-white/[0.01] border-white/5 hover:border-white/20 hover:bg-white/[0.03] hover:shadow-[0_10px_20px_rgba(0,0,0,0.1)]"
																		)}
																	>
																		{/* Selection Glow */}
																		{newPortfolioType === broker.id && (
																			<div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent pointer-events-none" />
																		)}

																		<div className={cn(
																			"size-11 flex items-center justify-center p-1 transition-all duration-700 relative z-10",
																			newPortfolioType === broker.id ? "scale-110" : "opacity-40 group-hover:opacity-100 group-hover:scale-110"
																		)}>
																			<img src={broker.icon} alt={broker.name} className="w-full h-full object-contain" />
																		</div>
																		<span className={cn(
																			"font-sans text-[11px] font-bold tracking-[0.2em] uppercase relative z-10 transition-colors duration-500",
																			newPortfolioType === broker.id ? "text-white" : "text-zinc-500 group-hover:text-zinc-200"
																		)}>{broker.name}</span>
																	</button>
																))}
															</div>
														</div>
													</>
												)}

												<AnimatePresence>
													{newPortfolioType && (
														<motion.div
															key="upload-form"
															initial={{ opacity: 0, y: 10 }}
															animate={{ opacity: 1, y: 0 }}
															exit={{ opacity: 0, y: -10 }}
															className="space-y-4"
														>
															<div className="p-4 bg-white/[0.02] rounded-[24px] border border-white/5 text-center space-y-3 relative overflow-hidden group/upload">
																<div className={cn(
																	"absolute inset-0 opacity-0 group-hover/upload:opacity-100 transition-opacity duration-700 bg-gradient-to-b from-transparent",
																	newPortfolioType === 'GROWW' ? "from-emerald-500/[0.02]" : "from-indigo-500/[0.02]"
																)} />

																<div className="size-10 flex items-center justify-center mx-auto transition-transform duration-500 group-hover/upload:scale-110 relative z-10">
																	<FileUp className={cn(
																		"w-6 h-6",
																		newPortfolioType === 'GROWW' ? "text-emerald-500/60" : "text-indigo-500/60"
																	)} />
																</div>
																<div className="relative z-10">
																	<h3 className="text-white font-headline font-black text-lg tracking-tight">
																		{isResyncMode ? "Resync Statement" : "Upload Statement"}
																	</h3>
																	<p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest mt-1">
																		{newPortfolioType === 'GROWW' ? "Select the .xlsx file from Groww" : "Select the holdings .csv from Zerodha Console"}
																	</p>
																</div>

																<input
																	type="file"
																	id="universal-upload"
																	className="hidden"
																	accept={newPortfolioType === 'GROWW' ? ".xlsx" : ".csv"}
																	onChange={async (e) => {
																		const file = e.target.files?.[0];
																		if (!file) return;
																		setIsRefreshing(true);
																		setImportStatus("Analyzing Statement...");
																		let targetPortfolioId = resyncPortfolioId;
																		let pData: any = null;
																		try {
																			if (!isResyncMode) {
																				setImportStatus("Registering Portfolio...");
																				const { data: createdPortfolio, error: pErr } = await supabase
																					.from('user_portfolios')
																					.insert({
																						user_id: portfolioId,
																						name: newPortfolioName || "New Portfolio",
																						broker_name: newPortfolioType,
																						is_primary: portfolios.length === 0
																					})
																					.select()
																					.single();
																				if (pErr) throw pErr;
																				pData = createdPortfolio;
																				targetPortfolioId = createdPortfolio.id;
																			} else {
																				pData = portfolios.find(p => p.id === resyncPortfolioId);
																			}
																			if (!targetPortfolioId) throw new Error("No target portfolio identified");
																			const tempPortfolioName = `SYNC_TEMP_${Date.now()}`;
																			const { data: tempPortfolio, error: tempErr } = await supabase
																				.from('user_portfolios')
																				.insert({ user_id: portfolioId, name: tempPortfolioName, broker_name: newPortfolioType, is_primary: false })
																				.select().single();
																			if (tempErr) throw tempErr;
																			setImportStatus("Ingesting Broker Data...");
																			const formData = new FormData();
																			formData.append('file', file);
																			formData.append('portfolioId', tempPortfolio.id);
																			formData.append('userId', portfolioId || "");
																			const endpoint = newPortfolioType === 'GROWW' ? 'groww/import-excel' : 'zerodha/import-csv';
																			const res = await axios.post(`${engineUrl}/api/broker/${endpoint}`, formData, {
																				headers: { 'Content-Type': 'multipart/form-data' }
																			});
																			if (res.data.success) {
																				setImportStatus("Reconciling Holdings...");
																				const [{ data: existingHoldings }, { data: newHoldings }] = await Promise.all([
																					supabase.from('holdings').select('*').eq('portfolio_id', targetPortfolioId),
																					supabase.from('holdings').select('*').eq('portfolio_id', tempPortfolio.id)
																				]);
																				const existingMap = new Map(existingHoldings?.map(h => [h.trading_symbol, h]));
																				const newMap = new Map(newHoldings?.map(h => [h.trading_symbol, h]));
																				for (const [symbol, newH] of newMap.entries()) {
																					const existingH = existingMap.get(symbol);
																					if (existingH) {
																						const { error: uErr } = await supabase.from('holdings').update({
																							quantity: newH.quantity,
																							average_price: newH.average_price,
																							invested_value: newH.invested_value,
																							market_value: newH.market_value,
																							p_l: newH.p_l,
																							p_l_percentage: newH.p_l_percentage,
																							updated_at: new Date().toISOString()
																						}).eq('id', existingH.id);
																						if (uErr) throw uErr;
																					} else {
																						const { error: iErr } = await supabase.from('holdings').insert({
																							...newH,
																							id: undefined,
																							portfolio_id: targetPortfolioId,
																							user_id: portfolioId,
																							updated_at: new Date().toISOString()
																						});
																						if (iErr) throw iErr;
																					}
																				}
																				for (const [symbol, existingH] of existingMap.entries()) {
																					if (!newMap.has(symbol)) {
																						const { error: dErr } = await supabase.from('holdings').delete().eq('id', existingH.id);
																						if (dErr) throw dErr;
																					}
																				}

																				// 1. Fetch and Migrate Rich History Snapshots from Temp Portfolio to Target Portfolio
																				setImportStatus("Finalizing Snapshots...");
																				const { data: tempHistory } = await supabase
																					.from('portfolio_history')
																					.select('*')
																					.eq('portfolio_id', tempPortfolio.id);

																				if (tempHistory && tempHistory.length > 0) {
																					const historyToUpsert = tempHistory.map(h => {
																						const { id, ...rest } = h;
																						return {
																							...rest,
																							portfolio_id: targetPortfolioId
																						};
																					});
																					const { error: hErr } = await supabase
																						.from('portfolio_history')
																						.upsert(historyToUpsert, { onConflict: 'portfolio_id,timestamp' });
																					if (hErr) throw hErr;
																				}

																				// 2. Safely Clean Up Temporary Portfolio Resources (Cascades will no longer affect the migrated history)
																				await supabase.from('holdings').delete().eq('portfolio_id', tempPortfolio.id);
																				await supabase.from('user_portfolios').delete().eq('id', tempPortfolio.id);

																				// 3. Live Market Injection with NSE/BSE Guard
																				const { data: marketData } = await supabase.from('market_assets').select('symbol, price, day_change, day_change_percentage');
																				if (marketData && marketData.length > 0) {
																					const marketMap = new Map(marketData.map(m => [m.symbol.toUpperCase(), m]));
																					for (const h of (newHoldings || [])) {
																						const symbol = h.trading_symbol.toUpperCase();
																						const statementLTP = h.quantity > 0 ? (h.market_value / h.quantity) : 0;

																						// Find variants
																						const nseVariant = marketMap.get(`${symbol}:NSE`) || marketMap.get(`NSE:${symbol}`);
																						const bseVariant = marketMap.get(`${symbol}:BSE`) || marketMap.get(`BSE:${symbol}`);
																						const directMatch = marketMap.get(symbol);

																						// Exact Match Tie-breaker: Which exchange matches the statement LTP exactly?
																						let live = directMatch;
																						if (nseVariant && nseVariant.price === statementLTP) {
																							live = nseVariant;
																						} else if (bseVariant && bseVariant.price === statementLTP) {
																							live = bseVariant;
																						} else {
																							live = nseVariant || bseVariant || directMatch;
																						}

																						if (live) {
																							const { error: lErr } = await supabase.from('holdings').update({
																								market_value: live.price * h.quantity,
																								day_change: live.day_change * h.quantity,
																								day_change_percentage: live.day_change_percentage,
																								updated_at: new Date().toISOString()
																							}).eq('portfolio_id', targetPortfolioId).eq('trading_symbol', h.trading_symbol);
																							if (lErr) throw lErr;
																						}
																					}
																				}

																				setImportStatus("Sync Complete...");
																				await fetchPortfolios();
																				await fetchHoldings();
																				await fetchHistory();
																				if (!isResyncMode) setActivePortfolio(pData);
																				setAddPortfolioModalOpen(false);
																				setIsResyncMode(false);
																				setResyncPortfolioId(null);
																			}
																		} catch (err: any) {
																			const errorMsg = err.response?.data?.error || err.message || "Unknown Error";
																			alert(`Resync Failed: ${errorMsg}`);
																		} finally {
																			setIsRefreshing(false);
																			setImportStatus("");
																		}
																	}}
																/>

																<button
																	onClick={() => document.getElementById('universal-upload')?.click()}
																	disabled={isRefreshing}
																	className={cn(
																		"w-full py-3 text-white font-headline font-black text-[11px] uppercase tracking-[0.25em] rounded-xl border transition-all duration-500 disabled:opacity-50 relative z-10",
																		newPortfolioType === 'GROWW'
																			? "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
																			: "bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20"
																	)}
																>
																	{isRefreshing ? (
																		<div className="flex items-center justify-center gap-3">
																			<motion.div
																				animate={{ rotate: 360 }}
																				transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
																				className={cn(
																					"w-4 h-4 border-2 rounded-full",
																					newPortfolioType === 'GROWW' ? "border-emerald-500/30 border-t-emerald-500" : "border-indigo-500/30 border-t-indigo-500"
																				)}
																			/>
																			<span className={newPortfolioType === 'GROWW' ? "text-emerald-400" : "text-indigo-400"}>
																				{importStatus || "Processing..."}
																			</span>
																		</div>
																	) : "Select Statement File"}
																</button>

																<div className="pt-2 border-t border-white/5 mt-2 relative z-10">
																	<button
																		onClick={() => newPortfolioType === 'GROWW' ? setShowGrowwGuide(true) : setShowZerodhaGuide(true)}
																		className="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 font-terminal-label font-bold text-[10px] uppercase tracking-[0.2em] transition-all duration-500 flex items-center justify-between group/btn"
																	>
																		<span className="flex items-center gap-2 group-hover/btn:text-zinc-200 transition-colors">
																			<Clock className="w-3.5 h-3.5 opacity-50" />
																			Need help finding the file?
																		</span>
																		<ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/btn:opacity-100 transition-all group-hover/btn:translate-x-1" />
																	</button>
																</div>
															</div>

															<div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex gap-4 items-start relative overflow-hidden">
																<div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-[40px] rounded-full -translate-y-1/2 translate-x-1/2" />
																<ShieldAlert className="w-5 h-5 text-amber-500/60 shrink-0 mt-0.5" />
																<p className="text-[10px] text-amber-500/80 leading-relaxed font-bold uppercase tracking-widest">
																	{isResyncMode
																		? "Differential Sync will merge this statement with your current data. Fully sold stocks will be purged."
																		: "For 100% settlement accuracy, we recommend uploading after 4:00 PM IST."}
																</p>
															</div>
														</motion.div>
													)}
												</AnimatePresence>
											</>
										)}
									</motion.div>
								)}
							</AnimatePresence>
						</motion.div>
					</div>
				</AnimatePresence>,
				document.body
			)}

			{/* CAS statement upload modal Dialog */}
			<AnimatePresence>
				{showCASImport && (
					<div className="fixed inset-0 z-[200] flex items-center justify-center p-4">

						{/* Backdrop overlay */}
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => {
								if (!casImporting) {
									setShowCASImport(false);
									setShowCASGuide(false);
									setCasImportStep(0);
									setCasFile(null);
									setCasPassword("");
									setCasError("");
								}
							}}
							className="absolute inset-0 bg-black/80 backdrop-blur-md"
						/>

						{/* Modal Dialog Body */}
						<motion.div
							layout
							initial={{ opacity: 0, scale: 0.95, y: 20 }}
							animate={{
								opacity: 1,
								scale: 1,
								y: 0,
								width: showCASGuide ? "1100px" : "480px",
								height: "auto",
								maxWidth: "95vw"
							}}
							exit={{ opacity: 0, scale: 0.95, y: 20 }}
							transition={{
								layout: { type: "spring", stiffness: 300, damping: 30 },
								opacity: { duration: 0.2 },
								scale: { duration: 0.3 }
							}}
							className="relative bg-zinc-950 border border-white/10 rounded-[28px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.9)] flex flex-col z-10"
						>

							{/* Premium Ambient Glow */}
							<div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

							{/* Premium Header */}
							<div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between bg-white/[0.01] z-20">
								<div className="flex items-center gap-3">
									<div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)] shrink-0">
										<Database className="w-4 h-4 text-emerald-400" />
									</div>
									<div>
										<h2 className="font-headline font-bold text-base text-white tracking-tight uppercase">
											{showCASGuide ? "Ingestion Guide" : "Link Mutual Funds"}
										</h2>
										<p className="text-[10px] font-sans uppercase tracking-[0.2em] text-zinc-500 font-black mt-0.5">
											{showCASGuide ? "Follow CAMS steps below" : "Import Consolidated Account Statement"}
										</p>
									</div>
								</div>
								<button
									disabled={casImporting}
									onClick={() => {
										setShowCASImport(false);
										setShowCASGuide(false);
										setCasImportStep(0);
										setCasFile(null);
										setCasPassword("");
										setCasError("");
									}}
									className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-white transition-all disabled:opacity-50"
								>
									<X className="w-4 h-4" />
								</button>
							</div>

							<AnimatePresence mode="wait">
								{showCASGuide ? (
									<motion.div
										key="cas-guide"
										initial={{ opacity: 0, x: 20 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0, x: -20 }}
										className="flex-1 min-h-0"
									>
										<MFImportGuide
											embedded={true}
											onClose={() => setShowCASGuide(false)}
										/>
									</motion.div>
								) : (
									<motion.div
										key="cas-form"
										initial={{ opacity: 0, x: -20 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0, x: 20 }}
										className="p-5 space-y-5"
									>
										{casImportStep === 0 && (
											<form onSubmit={handleCASImportSubmit} className="space-y-5">

												{/* Portfolio Name Input */}
												<div className="space-y-2">
													<label className="text-[10px] font-sans uppercase tracking-[0.3em] text-zinc-600 font-black px-1">Portfolio Name</label>
													<div className="relative group">
														<input
															type="text"
															value={newMFPortfolioName}
															onChange={(e) => setNewMFPortfolioName(e.target.value)}
															placeholder="e.g. CAS Folio 1"
															className="w-full bg-white/[0.02] border border-white/5 rounded-2xl px-4 py-3 text-[14px] font-headline font-bold text-white focus:outline-none focus:border-emerald-500/30 focus:bg-emerald-500/[0.02] transition-all duration-500 placeholder:text-zinc-700 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]"
														/>
														<div className="absolute inset-0 rounded-2xl border border-emerald-500/0 group-focus-within:border-emerald-500/20 transition-all duration-500 pointer-events-none shadow-[0_0_20px_rgba(16,185,129,0)] group-focus-within:shadow-[0_0_20px_rgba(16,185,129,0.05)]" />
													</div>
												</div>

												{/* File Dropzone */}
												<div
													onDragOver={(e) => e.preventDefault()}
													onDrop={(e) => {
														e.preventDefault();
														if (e.dataTransfer.files && e.dataTransfer.files[0]) {
															setCasFile(e.dataTransfer.files[0]);
															setCasError("");
														}
													}}
													className={cn(
														"border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-white/[0.01] duration-500",
														casFile
															? "border-emerald-500/40 bg-emerald-500/[0.01] shadow-[0_0_25px_rgba(16,185,129,0.05)]"
															: "border-white/10 bg-black/20 hover:border-white/20"
													)}
													onClick={() => document.getElementById("cas-file-input-dash")?.click()}
												>
													<input
														type="file"
														id="cas-file-input-dash"
														accept=".pdf"
														onChange={(e) => {
															if (e.target.files && e.target.files[0]) {
																setCasFile(e.target.files[0]);
																setCasError("");
															}
														}}
														className="hidden"
													/>
													<UploadCloud className={cn("size-10 mb-4 transition-transform duration-500 hover:scale-110", casFile ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]" : "text-zinc-600")} />

													{casFile ? (
														<div className="space-y-1">
															<span className="font-mono text-xs text-white font-bold max-w-[300px] truncate block">
																{casFile?.name}
															</span>
															<span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest block">
																{((casFile?.size ?? 0) / 1024 / 1024).toFixed(2)} MB • PDF File loaded
															</span>
														</div>
													) : (
														<div className="space-y-1">
															<span className="text-xs text-white font-bold">Drag and drop your CAS PDF statement</span>
															<span className="text-[10px] text-zinc-500 block">or click to browse local folders</span>
														</div>
													)}
												</div>

												{/* Password Decryption input */}
												<div className="space-y-2">
													<div className="flex justify-between items-center">
														<label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
															<Lock className="size-3.5 text-zinc-500" />
															PDF Opening Password
														</label>
														<span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
															Mandatory
														</span>
													</div>
													<input
														type="password"
														value={casPassword}
														onChange={(e) => setCasPassword(e.target.value)}
														placeholder="Enter CAS PDF opening password..."
														className="w-full h-11 px-4 rounded-xl bg-black border border-white/10 hover:border-white/20 focus:border-emerald-500 text-xs text-white outline-none transition-all font-mono"
													/>
												</div>

												{/* Error display */}
												{casError && (
													<div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 font-mono text-[10px] leading-normal flex gap-2">
														<AlertTriangle className="size-4 shrink-0" />
														<span>{casError}</span>
													</div>
												)}

												{/* Submit Button */}
												<button
													type="submit"
													className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] shadow-[0_0_35px_rgba(16,185,129,0.15)] hover:shadow-[0_0_35px_rgba(16,185,129,0.3)]"
												>
													Initiate Ingestion
												</button>

												{/* Help / Guide Trigger */}
												<div className="pt-2 border-t border-white/5 mt-2 relative z-10">
													<button
														type="button"
														onClick={() => setShowCASGuide(true)}
														className="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 font-terminal-label font-bold text-[10px] uppercase tracking-[0.2em] transition-all duration-500 flex items-center justify-between group/btn"
													>
														<span className="flex items-center gap-2 group-hover/btn:text-zinc-200 transition-colors">
															<Clock className="w-3.5 h-3.5 opacity-50" />
															Need help finding the file?
														</span>
														<ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover/btn:opacity-100 transition-all group-hover/btn:translate-x-1" />
													</button>
												</div>

											</form>
										)}

										{casImportStep === 1 && (
											<div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
												<Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
												<div className="space-y-2">
													<h4 className="font-headline font-bold text-sm text-white uppercase tracking-wider">Processing Statement Ingestion</h4>
													<p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
														Decrypting files, parsing transactions, matching ISINs, and bulk-seeding assets.
													</p>
												</div>
											</div>
										)}

										{casImportStep === 2 && casSuccessData && (
											<div className="py-8 flex flex-col items-center text-center space-y-6">
												<div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/5">
													<CheckCircle2 className="size-8" />
												</div>

												<div className="space-y-2">
													<h4 className="font-headline font-bold text-base text-white uppercase tracking-wider">Statement Ingested Successfully!</h4>
												</div>

												<div className="w-full bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-[10px] text-zinc-400 space-y-2">
													<div className="flex justify-between">
														<span>Statement Registry</span>
														<span className="text-white font-bold">{casSuccessData.source}</span>
													</div>
													<div className="flex justify-between">
														<span>Accounting Period</span>
														<span className="text-white font-bold">{casSuccessData.statementPeriod}</span>
													</div>
													<div className="flex justify-between">
														<span>Holdings Extracted</span>
														<span className="text-emerald-400 font-bold">{casSuccessData.count} Funds</span>
													</div>
												</div>

												<button
													onClick={() => {
														setShowCASImport(false);
														setCasImportStep(0);
														setCasFile(null);
														setCasPassword("");
													}}
													className="w-full h-11 rounded-xl bg-white hover:bg-zinc-100 text-black font-black text-xs uppercase tracking-widest transition-all"
												>
													Go back to Dashboard
												</button>
											</div>
										)}

										{casImportStep === 3 && (
											<div className="py-8 flex flex-col items-center text-center space-y-6">
												<div className="size-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shadow-lg shadow-rose-500/5">
													<AlertTriangle className="size-8" />
												</div>

												<div className="space-y-2">
													<h4 className="font-headline font-bold text-sm text-white uppercase tracking-wider">Statement Ingestion Failed</h4>
												</div>

												<div className="w-full p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 text-rose-400 font-mono text-[10px] text-left leading-normal flex gap-2">
													<span>{casError}</span>
												</div>

												<button
													onClick={() => setCasImportStep(0)}
													className="w-full h-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white font-black text-xs uppercase tracking-widest transition-all"
												>
													Try Again
												</button>
											</div>
										)}
									</motion.div>
								)}
							</AnimatePresence>

						</motion.div>
					</div>
				)}
			</AnimatePresence>

			{/* SYNC CONSOLE */}
			<AnimatePresence>
				{showSyncConsole && (
					<motion.div
						initial={{ opacity: 0, y: 100, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 100, scale: 0.95 }}
						className="fixed bottom-24 right-12 w-[450px] h-[300px] bg-zinc-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[200] overflow-hidden flex flex-col font-mono"
					>
						{/* Console Header */}
						<div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
							<div className="flex items-center gap-3">
								<div className="flex gap-1.5">
									<div className="size-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
									<div className="size-2.5 rounded-full bg-amber-500/20 border border-amber-500/40" />
									<div className="size-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
								</div>
								<span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">System Sync Console</span>
							</div>
							<button
								onClick={() => setShowSyncConsole(false)}
								className="text-zinc-500 hover:text-white transition-colors"
							>
								<X className="w-4 h-4" />
							</button>
						</div>

						{/* Console Output */}
						<div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
							{syncLogs.length === 0 ? (
								<div className="h-full flex items-center justify-center opacity-20 italic text-xs">
									Awaiting engine heartbeat...
								</div>
							) : (
								syncLogs.map((log, i) => (
									<div key={i} className="flex gap-3 text-[11px] leading-relaxed group">
										<span className="text-zinc-600 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
										<span className={cn(
											"font-medium",
											log.type === 'success' ? "text-emerald-400" :
												log.type === 'error' ? "text-red-400" :
													log.type === 'warn' ? "text-amber-400" :
														"text-zinc-300"
										)}>
											{log.message}
										</span>
									</div>
								))
							)}
							{isRefreshing && (
								<div className="flex items-center gap-2 pt-2 opacity-50">
									<div className="size-1 rounded-full bg-emerald-500 animate-pulse" />
									<span className="text-[10px] text-emerald-500 uppercase tracking-widest animate-pulse">Sync in progress...</span>
								</div>
							)}
						</div>

						{/* Console Footer */}
						<div className="px-4 py-2 bg-black/40 border-t border-white/5 flex items-center justify-between">
							<span className="text-[9px] text-zinc-600">v2.4.0-tactical-engine</span>
							<div className="flex items-center gap-2">
								<div className={cn("size-1.5 rounded-full", isRefreshing ? "bg-emerald-500 animate-pulse" : "bg-zinc-700")} />
								<span className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
									{isRefreshing ? "Active" : "Idle"}
								</span>
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>


		</div>
	)
}

function NewsItem({ tag, time, title, color }: { tag: string; time: string; title: string; color: string }) {
	return (
		<div className="flex flex-col gap-2 p-4 rounded-xl hover:bg-emerald-500/[0.05] transition-all cursor-pointer group border border-transparent hover:border-emerald-500/10">
			<div className="flex justify-between items-center">
				<span className={`text-[10px] font-black uppercase tracking-[0.2em] ${color} px-2 py-0.5 rounded bg-emerald-500/5`}>{tag}</span>
				<span className="text-[10px] text-zinc-600 font-data-sm">{time}</span>
			</div>
			<p className="text-[14px] text-zinc-300 leading-relaxed group-hover:text-white transition-colors">{title}</p>
		</div>
	)
}
