import { BaseJob } from '../../core/BaseJob';
import { YahooProvider } from '../../providers/YahooProvider';
import { SupabaseProvider } from '../../providers/SupabaseProvider';
import { JobMetadata, RefreshTier, MarketRegion, QueuePriority } from '../../core/types';

/**
 * IndianMasterSeedJob: The Discovery Engine.
 * Fetches basic metadata (Name, Sector, Industry) for ALL Indian symbols
 * to ensure they are searchable in the terminal.
 */
export class IndianMasterSeedJob extends BaseJob {
  public readonly id = 'IndianMasterSeedJob';

  public readonly metadata: JobMetadata = {
    id: this.id,
    tier: RefreshTier.TIER_3_EXTENDED,
    symbols: [], // Populated dynamically
    region: MarketRegion.IN,
    priority: QueuePriority.DEFAULT,
    bullMqQueueName: 'q-seeding',
    retryCount: 0,
    maxRetries: 1
  };

  protected async process(): Promise<number> {
    const supabase = SupabaseProvider.getClient();
    
    // 1. Identify unseeded assets
    const { data: unseeded, error } = await supabase
      .from('market_assets')
      .select('symbol')
      .eq('is_seeded', false)
      .limit(200); // Process in manageable chunks

    if (error || !unseeded || unseeded.length === 0) return 0;

    const symbols = unseeded.map(a => a.symbol);
    console.log(`[SEEDER] 🌱 Processing ${symbols.length} unseeded Indian assets...`);

    let count = 0;
    for (const symbol of symbols) {
      try {
        // Fetch lightweight summary module
        const data = await YahooProvider.fetchQuoteSummary(symbol, ['price', 'summaryProfile'], 'IN');
        
        if (data) {
          const update = {
            name: data.price?.shortName || data.price?.longName,
            sector: data.summaryProfile?.sector,
            industry: data.summaryProfile?.industry,
            is_seeded: true,
            updated_at: new Date().toISOString()
          };

          await supabase.from('market_assets').update(update).eq('symbol', symbol);
          count++;
        }
      } catch (e: any) {
        console.error(`[SEEDER] ❌ Failed to seed ${symbol}:`, e.message);
      }
    }

    return count;
  }
}
