import fs from 'fs';
import path from 'path';
import { supabase } from '../../lib/supabase';
import { Capability } from './types';

interface ActivePromptRow {
  template_path: string;
  task_type: string;
  version: number;
}

interface FileCacheEntry {
  content: string;
  loadedAt: number;
}

const rowCache = new Map<Capability, { row: ActivePromptRow | null; loadedAt: number }>();
const fileCache = new Map<string, FileCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Static fallback so the pipeline works before assistant_prompt_versions is seeded (§07/§11).
const STATIC_TEMPLATE_PATH: Record<Capability, { path: string; taskType: string }> = {
  stock_research: { path: 'prompts/stockResearch.v1.md', taskType: 'synthesis_stock_research' },
  portfolio_analysis: { path: 'prompts/portfolioAnalysis.v1.md', taskType: 'synthesis_portfolio' },
  compare_stocks: { path: 'prompts/compareStocks.v1.md', taskType: 'synthesis_stock_research' },
  market_overview: { path: 'prompts/marketOverview.v1.md', taskType: 'synthesis_general' },
  general_finance: { path: 'prompts/generalFinance.v1.md', taskType: 'synthesis_general' },
  dividend_analysis: { path: 'prompts/dividendAnalysis.v1.md', taskType: 'synthesis_stock_research' },
  technical_analysis: { path: 'prompts/technicalAnalysis.v1.md', taskType: 'synthesis_stock_research' },
  sector_analysis: { path: 'prompts/sectorAnalysis.v1.md', taskType: 'synthesis_general' },
  etf_analysis: { path: 'prompts/etfAnalysis.v1.md', taskType: 'synthesis_stock_research' },
  news_analysis: { path: 'prompts/newsAnalysis.v1.md', taskType: 'synthesis_stock_research' },
  investment_thesis: { path: 'prompts/investmentThesis.v1.md', taskType: 'synthesis_stock_research' },
  watchlist_review: { path: 'prompts/watchlistReview.v1.md', taskType: 'synthesis_portfolio' },
  mutual_fund_analysis: { path: 'prompts/mutualFundAnalysis.v1.md', taskType: 'synthesis_portfolio' },
  risk_analysis: { path: 'prompts/riskAnalysis.v1.md', taskType: 'synthesis_portfolio' },
  portfolio_optimization: { path: 'prompts/portfolioOptimization.v1.md', taskType: 'synthesis_portfolio' },
  screener: { path: 'prompts/screener.v1.md', taskType: 'synthesis_general' },
};

async function resolveActiveRow(capability: Capability): Promise<{ path: string; taskType: string }> {
  const cached = rowCache.get(capability);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    if (cached.row) return { path: cached.row.template_path, taskType: cached.row.task_type };
    return STATIC_TEMPLATE_PATH[capability];
  }

  try {
    const { data } = await supabase
      .from('assistant_prompt_versions')
      .select('template_path, task_type, version')
      .eq('capability', capability)
      .eq('status', 'active')
      .maybeSingle();

    rowCache.set(capability, { row: data || null, loadedAt: Date.now() });
    if (data) return { path: data.template_path, taskType: data.task_type };
  } catch {
    rowCache.set(capability, { row: null, loadedAt: Date.now() });
  }

  return STATIC_TEMPLATE_PATH[capability];
}

function readTemplateFile(templatePath: string): string {
  const cached = fileCache.get(templatePath);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.content;

  const absolute = path.join(process.cwd(), templatePath);
  const content = fs.readFileSync(absolute, 'utf-8');
  fileCache.set(templatePath, { content, loadedAt: Date.now() });
  return content;
}

export class PromptLoader {
  static async loadActive(capability: Capability): Promise<{ template: string; taskType: string; templatePath: string }> {
    const { path: templatePath, taskType } = await resolveActiveRow(capability);
    const template = readTemplateFile(templatePath);
    return { template, taskType, templatePath };
  }
}
