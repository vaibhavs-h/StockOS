import { BaseJob } from '../../core/BaseJob';
import { SupabaseProvider } from '../../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../../core/types';
import axios from 'axios';

const MFAPI_BASE = 'https://api.mfapi.in/mf';

/**
 * MFMasterSeedJob: Full Indian Mutual Fund Universe Ingestion Engine.
 *
 * Data source: api.mfapi.in — community-maintained AMFI mirror, JSON format.
 *
 * Phase 1: Fetch the complete scheme list (~37,000+ schemes) from /mf
 * Phase 2: In parallel batches, fetch individual scheme details (/mf/{code}/latest)
 *          to get fund_house, category, NAV, date, ISIN.
 * Phase 3: Bulk upsert all records into mutual_funds_master in 300-row chunks.
 *
 * Typical run time: ~15-25 minutes for full universe.
 */
export class MFMasterSeedJob extends BaseJob<void> {
  public readonly id = 'MFMasterSeedJob';
  private force: boolean;

  constructor(force = false) {
    super();
    this.force = force;
  }

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_4_DAILY,
    symbols: [],
    region: MarketRegion.GLOBAL,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-mf-seed',
    retryCount: 0,
    maxRetries: 1
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();

    // ─── Phase 1: Download full scheme list ───────────────────────────────────
    this.log('Phase 1: Fetching complete scheme list from mfapi.in...');
    
    let schemeList: Array<{
      schemeCode: number;
      schemeName: string;
      isinGrowth: string | null;
      isinDivReinvestment: string | null;
    }>;

    try {
      const resp = await axios.get(MFAPI_BASE, { timeout: 60000 });
      schemeList = resp.data;
    } catch (err: any) {
      throw new Error(`[MF-SEED] Failed to fetch scheme list: ${err.message}`);
    }

    this.log(`Retrieved ${schemeList.length} schemes from mfapi.in.`);

    // ─── Phase 1.5: Filter out schemes that already have ISINs in the DB ──────
    if (!this.force) {
      this.log('Checking database for already seeded schemes...');
      const { data: existingData, error: dbError } = await supabase
        .from('mutual_funds_master')
        .select('scheme_code')
        .not('isin', 'is', null);

      if (!dbError && existingData) {
        const existingCodes = new Set(existingData.map(d => String(d.scheme_code)));
        const originalCount = schemeList.length;
        schemeList = schemeList.filter(s => !existingCodes.has(String(s.schemeCode)));
        this.log(`Filtered out ${originalCount - schemeList.length} schemes already in DB with ISINs.`);
      }
    }

    if (schemeList.length === 0) {
      this.log('No new schemes to seed. Universe is up to date.');
      return 0;
    }

    // ─── Phase 2: Fetch individual NAV + metadata in parallel batches ─────────
    this.log(`Phase 2: Fetching details for ${schemeList.length} schemes in parallel batches...`);

    const CONCURRENT = 30;      // Slightly increased concurrency
    const DELAY_BETWEEN = 200;  // ms between batches

    const finalRecords: any[] = [];
    let fetched = 0;
    let failed = 0;

    for (let i = 0; i < schemeList.length; i += CONCURRENT) {
      const batch = schemeList.slice(i, i + CONCURRENT);

      const batchResults = await Promise.allSettled(
        batch.map(scheme => this.fetchSchemeDetail(scheme))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          finalRecords.push(result.value);
          fetched++;
        } else {
          failed++;
        }
      }

      // Progress log every 1000 schemes
      if (fetched % 1000 < CONCURRENT && fetched > 0) {
        this.log(`Progress: ${fetched} fetched, ${failed} failed, ${Math.max(0, schemeList.length - i - CONCURRENT)} remaining...`);
      }

      // Polite rate limiting
      await new Promise(r => setTimeout(r, DELAY_BETWEEN));
    }

    this.log(`Phase 2 complete: ${fetched} records ready, ${failed} skipped.`);

    if (finalRecords.length === 0) {
      this.log('No records could be fetched from mfapi.in in this run.', 'warn');
      return 0;
    }

    // ─── Phase 3: Bulk upsert in 300-row chunks ───────────────────────────────
    this.log('Phase 3: Bulk upserting to mutual_funds_master...');

    const CHUNK_SIZE = 300;
    let upserted = 0;

    for (let i = 0; i < finalRecords.length; i += CHUNK_SIZE) {
      const chunk = finalRecords.slice(i, i + CHUNK_SIZE);

      const { error } = await supabase
        .from('mutual_funds_master')
        .upsert(chunk, { onConflict: 'scheme_code' });

      if (error) {
        this.log(`Upsert chunk ${i}–${i + CHUNK_SIZE} failed: ${error.message}`, 'error');
        // Don't throw — continue with remaining chunks
        continue;
      }

      upserted += chunk.length;

      if (upserted % 3000 === 0 && upserted > 0) {
        this.log(`Upserted ${upserted}/${finalRecords.length}...`);
      }
    }

    this.log(`✅ COMPLETE: ${upserted} mutual funds updated/seeded into mutual_funds_master.`, 'success');

    // Automatically trigger enrichment after a full seed
    try {
      const { syncOrchestrator } = await import('../../core/orchestrator');
      const { MFYahooEnrichJob } = await import('./MFYahooEnrichJob');
      syncOrchestrator.dispatch(new MFYahooEnrichJob(500, true));
      this.log('Auto-dispatched MFYahooEnrichJob for symbol matching.', 'info');
    } catch (e) {
      this.log('Failed to auto-dispatch enrichment job.', 'warn');
    }

    return upserted;
  }

  /**
   * Fetches scheme metadata + latest NAV from mfapi.in/mf/{schemeCode}/latest
   * Returns a record ready for mutual_funds_master upsert.
   */
  private async fetchSchemeDetail(scheme: {
    schemeCode: number;
    schemeName: string;
    isinGrowth: string | null;
    isinDivReinvestment: string | null;
  }): Promise<any | null> {
    try {
      // /latest returns only the most recent NAV record (this fn only ever reads data.data[0] anyway) —
      // the bare /mf/{code} endpoint returns the FULL historical NAV series (often 10+ years of daily
      // records, ~130KB/scheme vs ~400 bytes here) which was the dominant cause of the Render bandwidth
      // overage: ~76% of schemes never get a non-null isin and so are never skipped by the Phase 1.5
      // filter, meaning they were re-downloaded in full on every weekly run.
      const resp = await axios.get(`${MFAPI_BASE}/${scheme.schemeCode}/latest`, {
        timeout: 15000
      });

      const data = resp.data;
      if (!data || data.status !== 'SUCCESS') return null;

      const meta = data.meta || {};
      const latestNav = data.data?.[0];

      if (!latestNav) return null;

      const currentPrice = parseFloat(latestNav.nav);
      if (isNaN(currentPrice) || currentPrice <= 0) return null;

      // Parse NAV date: mfapi returns "DD-MM-YYYY"
      let navDate: string | null = null;
      try {
        const [day, month, year] = latestNav.date.split('-');
        navDate = `${year}-${month}-${day}`; // convert to YYYY-MM-DD
      } catch {}

      // Categorise from scheme_category string
      const rawCategory = meta.scheme_category || '';
      const { category, subCategory } = this.parseCategory(rawCategory);

      // Risk classification
      const riskLevel = this.classifyRisk(subCategory);

      return {
        scheme_code:           String(scheme.schemeCode),
        isin:                  scheme.isinGrowth     || meta.isin_growth            || null,
        isin_reinvest:         scheme.isinDivReinvestment || meta.isin_div_reinvestment || null,
        name:                  meta.scheme_name       || scheme.schemeName,
        amc_name:              meta.fund_house        || 'Unknown AMC',
        category,
        sub_category:          subCategory,
        current_price:         currentPrice,
        prev_close:            currentPrice,  // baseline; nightly sync updates this
        day_change:            0,
        day_change_percentage: 0,
        nav_date:              navDate,
        risk_level:            riskLevel,
        symbol:                null,          // populated by MFYahooEnrichJob
        logo_url:              null,
        returns_1y:            null,
        returns_3y:            null,
        returns_5y:            null,
        expense_ratio:         null,
        aum:                   null,
        updated_at:            new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  /**
   * Parses mfapi category string like "Equity Scheme - Flexi Cap Fund"
   * into { category: "Equity Scheme", subCategory: "Flexi Cap Fund" }
   */
  private parseCategory(raw: string): { category: string; subCategory: string } {
    if (!raw) return { category: 'Other', subCategory: 'Other' };

    const parts = raw.split(' - ');
    const category = parts[0]?.trim() || 'Other';
    const subCategory = parts.slice(1).join(' - ').trim() || 'Other';
    return { category, subCategory };
  }

  /**
   * Risk classification from sub-category keywords.
   */
  private classifyRisk(subCat: string): string {
    const s = subCat.toLowerCase();
    if (s.includes('small cap') || s.includes('micro cap')) return 'Very High';
    if (s.includes('mid cap'))                               return 'High';
    if (s.includes('multi cap') || s.includes('flexi cap') || s.includes('large & mid cap')) return 'Moderately High';
    if (s.includes('large cap'))                             return 'Moderately High';
    if (s.includes('elss'))                                  return 'Very High';
    if (s.includes('sectoral') || s.includes('thematic'))   return 'Very High';
    if (s.includes('hybrid') || s.includes('balanced') || s.includes('aggressive')) return 'Moderate';
    if (s.includes('arbitrage'))                             return 'Low';
    if (s.includes('liquid') || s.includes('overnight') || s.includes('money market')) return 'Low';
    if (s.includes('gilt') || s.includes('g-sec'))          return 'Low to Moderate';
    if (s.includes('debt') || s.includes('bond') || s.includes('income') || s.includes('banking & psu')) return 'Low to Moderate';
    if (s.includes('fund of fund') || s.includes('international') || s.includes('global')) return 'High';
    return 'Moderate';
  }
}
