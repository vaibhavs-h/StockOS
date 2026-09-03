import { BaseJob } from '../core/BaseJob';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';
import axios from 'axios';

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

const parseAmfiDate = (dateStr: string): string | null => {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const day = parts[0].padStart(2, '0');
  const monthName = parts[1];
  const year = parts[2];
  const month = MONTH_MAP[monthName];
  if (!month) return null;
  return `${year}-${month}-${day}`;
};

/**
 * MutualFundSyncJob: Daily Net Asset Value (NAV) Ingestion Engine.
 * Downloads AMFI's complete daily current NAV file, parses metadata statefully, 
 * maps details to the active mutual funds universe, and updates mutual_funds_master.
 */
export class MutualFundSyncJob extends BaseJob<string[]> {
  public readonly id = 'MutualFundSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_4_DAILY,
    symbols: [],
    region: MarketRegion.GLOBAL,
    priority: QueuePriority.WATCHLIST,
    bullMqQueueName: 'q-mutual-funds-sync',
    retryCount: 0,
    maxRetries: 1
  };

  private logBoth(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
    if (type === 'error') {
      console.error(message);
    } else if (type === 'warn') {
      console.warn(message);
    } else {
      console.log(message);
    }
    this.log(message, type);
  }

  /**
   * Main processor. Receives an optional list of scheme codes to target.
   * If no list is passed, it syncs all currently active mutual funds.
   */
  protected async process(targetSchemeCodes?: string[]): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    let activeSchemes = new Set<string>();

    // 1. Identify active scheme universe
    if (targetSchemeCodes && targetSchemeCodes.length > 0) {
      activeSchemes = new Set(targetSchemeCodes);
    } else {
      const { data: dbActive, error } = await supabase
        .from('active_mutual_funds')
        .select('scheme_code')
        .eq('sync_enabled', true);

      if (error) {
        this.logBoth(`[MF-SYNC] Failed to fetch active registry symbols: ${error.message}`, 'error');
        throw error;
      }

      if (!dbActive || dbActive.length === 0) {
        this.logBoth('[MF-SYNC] Active mutual funds registry is empty. Sync aborted.', 'warn');
        return 0;
      }

      activeSchemes = new Set(dbActive.map(d => d.scheme_code));
    }

    this.logBoth(`[MF-SYNC] Initiating official AMFI live NAV download for ${activeSchemes.size} active funds...`, 'info');

    // 2. Fetch the entire NAVAll.txt from AMFI
    let responseText = '';
    try {
      const resp = await axios.get('https://portal.amfiindia.com/spages/NAVAll.txt', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 30000,
        responseType: 'text'
      });
      responseText = resp.data || '';
    } catch (err: any) {
      this.logBoth(`[MF-SYNC] Failed to download AMFI NAV text file: ${err.message}`, 'error');
      throw err;
    }

    if (!responseText) {
      this.logBoth('[MF-SYNC] Received empty response from AMFI portal.', 'error');
      throw new Error('Empty response from AMFI');
    }

    // 3. Stateful line-by-line parsing of the AMFI flat file
    const lines = responseText.split(/\r?\n/);
    const parsedRecords = new Map<string, any>();

    let currentAmc = 'Unknown AMC';
    let currentCategory = 'Other';
    let currentSubCategory = 'Other';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Category match: e.g. "Open Ended Schemes(Debt Scheme - Banking and PSU Fund)"
      const categoryMatch = trimmed.match(/^([^(]+)\(([^)]+)\)$/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim();
        currentSubCategory = categoryMatch[2].trim();
        continue;
      }

      // AMC match: lines containing "Mutual Fund" and no semicolons
      if (!trimmed.includes(';') && trimmed.toLowerCase().includes('mutual fund')) {
        currentAmc = trimmed;
        continue;
      }

      // Scheme details parser
      if (trimmed.includes(';')) {
        const parts = trimmed.split(';');
        if (parts.length >= 6) {
          const schemeCodeStr = parts[0].trim();
          if (activeSchemes.has(schemeCodeStr)) {
            // NAV and date are always the last two fields; ISIN pair is always fields 1-2.
            // Scheme name is everything in between — AMFI has, at times, split the name into
            // extra ';'-delimited sub-fields (e.g. "Fund;Plan;Option" instead of one combined
            // "Fund - Plan - Option" string), which shifts the total field count above 6.
            const isin = parts[1].trim();
            const isinReinvest = parts[2].trim();
            const navStr = parts[parts.length - 2].trim();
            const dateStr = parts[parts.length - 1].trim();
            const name = parts.slice(3, parts.length - 2).map(p => p.trim()).join(' - ');

            const currentPrice = parseFloat(navStr);
            if (isNaN(currentPrice) || currentPrice <= 0) continue;

            const navDate = parseAmfiDate(dateStr);

            parsedRecords.set(schemeCodeStr, {
              scheme_code: schemeCodeStr,
              current_price: currentPrice,
              nav_date: navDate,
              name,
              amc_name: currentAmc,
              category: currentCategory,
              sub_category: currentSubCategory,
              isin: isin && isin !== '-' ? isin : null,
              isin_reinvest: isinReinvest && isinReinvest !== '-' ? isinReinvest : null,
              updated_at: new Date().toISOString()
            });
          }
        }
      }
    }

    this.logBoth(`[MF-SYNC] Parsed ${parsedRecords.size} active funds details from AMFI.`, 'success');

    if (parsedRecords.size === 0) {
      this.logBoth('[MF-SYNC] No active schemes could be found in the current AMFI master text file.', 'warn');
      return 0;
    }

    // 4. Resolve Yahoo symbols and compute EOD price fluctuations
    // We fetch the current master states first to calculate prev_close & day_change
    const activeKeys = Array.from(parsedRecords.keys());
    const { data: dbMaster } = await supabase
      .from('mutual_funds_master')
      .select('scheme_code, symbol, current_price, prev_close, risk_level, logo_url, category, sub_category, isin, isin_reinvest')
      .in('scheme_code', activeKeys);

    const dbMap = new Map<string, any>();
    dbMaster?.forEach(d => dbMap.set(d.scheme_code, d));

    const finalRecords = [];
    for (const [code, record] of Array.from(parsedRecords.entries())) {
      const existing = dbMap.get(code);

      // Baselines
      let prevClose = record.current_price;
      let symbol = existing?.symbol || null;
      let riskLevel = existing?.risk_level || 'Moderate';
      let logoUrl = existing?.logo_url || null;

      // Fingerprint risk categories from sub-category keywords safely
      const subCat = (record.sub_category || existing?.sub_category || '').toLowerCase();
      if (subCat.includes('small cap') || subCat.includes('mid cap')) {
        riskLevel = 'Very High';
      } else if (subCat.includes('liquid') || subCat.includes('overnight')) {
        riskLevel = 'Low';
      }

      if (existing && Number(existing.current_price) > 0) {
        if (Number(record.current_price) === Number(existing.current_price)) {
          prevClose = Number(existing.prev_close) || Number(existing.current_price);
        } else {
          prevClose = Number(existing.current_price);
        }
      }

      const dayChange = record.current_price - prevClose;
      const dayChangePct = prevClose > 0 ? (dayChange / prevClose) * 100 : 0.00;

      finalRecords.push({
        ...record,
        symbol,
        risk_level: riskLevel,
        logo_url: logoUrl,
        prev_close: prevClose,
        day_change: dayChange,
        day_change_percentage: dayChangePct,
        isin: existing?.isin || record.isin || null,
        isin_reinvest: existing?.isin_reinvest || record.isin_reinvest || null
      });
    }

    // 5. Atomic Bulk Upsert Master Records
    // Chunking to prevent any batch limit issues
    const chunkSize = 200;
    for (let i = 0; i < finalRecords.length; i += chunkSize) {
      const chunk = finalRecords.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('mutual_funds_master')
        .upsert(chunk, { onConflict: 'scheme_code' });

      if (error) {
        this.logBoth(`[MF-SYNC] Master Bulk Ingestion Failed for chunk starting at ${i}: ${error.message}`, 'error');
        throw error;
      }
    }

    this.logBoth(`[MF-SYNC] Master DB successfully updated with EOD NAV valuations.`, 'success');
    return finalRecords.length;
  }
}
