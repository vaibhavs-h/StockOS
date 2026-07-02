import { BaseJob } from '../core/BaseJob';
import { BatchAggregationService } from '../core/BatchAggregationService';
import { SupabaseProvider } from '../providers/SupabaseProvider';
import { syncCoordinator } from '../core/SyncCoordinator';
import { syncOrchestrator } from '../core/orchestrator';
import { PortfolioRevaluationJob } from './PortfolioRevaluationJob';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../core/types';

export class DailyMorningPriceSyncJob extends BaseJob {
  public readonly id = 'DailyMorningPriceSyncJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_4_DAILY,
    symbols: [],
    region: MarketRegion.IN,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-maintenance',
    retryCount: 0,
    maxRetries: 2
  };

  protected async process(): Promise<number> {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌤️  [DAILY-PRICE-SYNC] Starting Scheduled Morning Price Refresh...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const supabase = SupabaseProvider.getClient();

    // 1. Fetch total counts first to calculate batches
    const [
      { count: inCount },
      { count: usCount }
    ] = await Promise.all([
      supabase.from('market_assets').select('symbol', { count: 'exact', head: true }).not('symbol', 'ilike', '^%'),
      supabase.from('us_market_assets').select('symbol', { count: 'exact', head: true }).not('symbol', 'ilike', '^%')
    ]);

    const totalIN = inCount || 0;
    const totalUS = usCount || 0;

    // 2. Build the concurrent range batch promises list to bypass PostgREST 1000 row limits
    const inBatches = Math.ceil(totalIN / 1000);
    const usBatches = Math.ceil(totalUS / 1000);

    const inPromises = Array.from({ length: inBatches }, (_, i) =>
      supabase.from('market_assets')
        .select('symbol')
        .not('symbol', 'ilike', '^%')
        .range(i * 1000, (i + 1) * 1000 - 1)
    );

    const usPromises = Array.from({ length: usBatches }, (_, i) =>
      supabase.from('us_market_assets')
        .select('symbol')
        .not('symbol', 'ilike', '^%')
        .range(i * 1000, (i + 1) * 1000 - 1)
    );

    // 3. Fetch all symbols in parallel batches
    const [inResults, usResults] = await Promise.all([
      Promise.all(inPromises),
      Promise.all(usPromises)
    ]);

    const inData: any[] = [];
    inResults.forEach(res => {
      if (res.data) inData.push(...res.data);
      if (res.error) console.error(`❌ [DAILY-PRICE-SYNC] Indian batch query failed:`, res.error.message);
    });

    const usData: any[] = [];
    usResults.forEach(res => {
      if (res.data) usData.push(...res.data);
      if (res.error) console.error(`❌ [DAILY-PRICE-SYNC] US batch query failed:`, res.error.message);
    });

    const isIndex = (symbol: string) => 
      !symbol ||
      symbol.startsWith('^') || 
      ['DJI', 'SPX', 'IXIC', 'GSPC', 'NSEI', 'BSESN', 'NSEBANK', 'BANKNIFTY', 'NIFTY', 'SENSEX'].includes(symbol.toUpperCase().trim());

    const inSymbols = inData
      .map(item => item.symbol)
      .filter(symbol => symbol && !isIndex(symbol));

    const usSymbols = usData
      .map(item => item.symbol)
      .filter(symbol => symbol && !isIndex(symbol));

    console.log(`🔍 [DAILY-PRICE-SYNC] Database Scan: Found ${inSymbols.length} Indian stocks & ${usSymbols.length} US stocks to sync.`);

    let updatedCount = 0;

    // 3. Batch Sync Indian Stocks
    if (inSymbols.length > 0) {
      console.log(`⚡ [DAILY-PRICE-SYNC] Syncing Indian market prices (batches of 50)...`);
      try {
        await BatchAggregationService.fetchQuotesInBatches(inSymbols, 'IN');
        const flushed = await syncCoordinator.flushDirtySnapshotsForRegion('IN');
        console.log(`💾 [DAILY-PRICE-SYNC] Flushed ${flushed} Indian stock price updates to Supabase.`);
        updatedCount += flushed;
      } catch (err: any) {
        console.error(`❌ [DAILY-PRICE-SYNC] Indian batch sync failed:`, err.message);
      }
    }

    // 4. Batch Sync US Stocks
    if (usSymbols.length > 0) {
      console.log(`⚡ [DAILY-PRICE-SYNC] Syncing US market prices (batches of 50)...`);
      try {
        await BatchAggregationService.fetchQuotesInBatches(usSymbols, 'US');
        const flushed = await syncCoordinator.flushDirtySnapshotsForRegion('US');
        console.log(`💾 [DAILY-PRICE-SYNC] Flushed ${flushed} US stock price updates to Supabase.`);
        updatedCount += flushed;
      } catch (err: any) {
        console.error(`❌ [DAILY-PRICE-SYNC] US batch sync failed:`, err.message);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ [DAILY-PRICE-SYNC] Price Sync Complete. Total Updated: ${updatedCount} assets.`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 5. Trigger portfolio revaluation to ensure valuations align with new prices
    syncOrchestrator.dispatch(new PortfolioRevaluationJob());

    return updatedCount;
  }
}
