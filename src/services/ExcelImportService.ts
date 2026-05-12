import * as XLSX from 'xlsx';
import { supabase } from '../server'; 
import { getISTTimestamp } from '../server';
import crypto from 'crypto';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new (YahooFinance as any)();

export class ExcelImportService {
  /**
   * Parses the Groww Holdings Statement Excel and syncs holdings + history
   */
  public static async importGrowwOrders(buffer: Buffer, portfolioId: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // 1. Find the header row (looking for "Stock Name" and "ISIN")
    const headerRowIndex = rawData.findIndex(row => 
      Array.isArray(row) && row.includes('Stock Name') && row.includes('ISIN')
    );
    if (headerRowIndex === -1) throw new Error("Could not find valid Holdings Statement headers in Excel.");

    const headers = rawData[headerRowIndex];
    const rows = rawData.slice(headerRowIndex + 1);

    // 2. Map data into internal format
    const holdingsData = rows.map(row => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => {
        obj[h] = row[i];
      });
      return obj;
    }).filter(h => h['Stock Name'] && h.ISIN && h.Quantity > 0);

    // 3. Resolve ISINs with limited concurrency to prevent timeouts/rate-limits
    const resolvedHoldings = [];
    console.log(`[EXCEL-IMPORT] Resolving symbols for ${holdingsData.length} holdings...`);
    
    for (const data of holdingsData) {
      let symbol = data['Stock Name'].replace(/[^a-zA-Z0-9]/g, ''); // Fallback symbol
      
      try {
        // Optimization: Check if we can skip Yahoo search for common ISINs
        const result = await yahooFinance.search(data.ISIN) as any;
        if (result && result.quotes && result.quotes.length > 0) {
          let yahooSymbol = result.quotes[0].symbol;
          symbol = yahooSymbol.split('.')[0];
        }
      } catch (err) {
        console.warn(`[EXCEL-IMPORT] Failed to resolve ISIN ${data.ISIN}:`, err);
      }

      resolvedHoldings.push({
        ...data,
        trading_symbol: symbol
      });

      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    let totalInvestment = 0;
    let totalExcelMkt = 0;
    let totalLiveMkt = 0;

    // 4. Fetch latest market assets for immediate revaluation
    const { data: dbAssets } = await supabase
      .from('market_assets')
      .select('symbol, current_price, day_change, day_change_percentage');
    const marketMap = new Map((dbAssets || []).map(a => [a.symbol.trim().toUpperCase(), a]));
    
    // 5. Map to final Holdings structure
    const finalHoldings = resolvedHoldings.map((data) => {
      const symbol = data.trading_symbol;
      const qty = Number(data.Quantity);
      const avgPrice = Number(data['Average buy price']);
      const investedValue = Number(data['Buy value']);
      const closingPrice = Number(data['Closing price'] || avgPrice);
      const closingValue = Number(data['Closing value'] || investedValue);
      const unrealisedPL = Number(data['Unrealised P&L'] || 0);

      const ticker = symbol.toUpperCase();
      const asset = marketMap.get(ticker) || marketMap.get(`${ticker}.NS`);

      // Use LIVE price if available, otherwise fallback to Excel's closing price
      const livePrice = asset ? Number(asset.current_price) : closingPrice;
      const revaluedMarketValue = qty * livePrice;
      const revaluedPL = revaluedMarketValue - investedValue;
      const dayChange = asset ? (Number(asset.day_change) * qty) : 0;
      const dayChangePct = asset ? Number(asset.day_change_percentage) : 0;
      
      totalInvestment += investedValue;
      totalExcelMkt += closingValue;
      totalLiveMkt += revaluedMarketValue;

      const hash = crypto.createHash('md5').update(`${portfolioId}-${symbol}`).digest('hex');
      const deterministicId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
      
      return {
        id: deterministicId,
        user_id: portfolioId,
        broker_name: 'GROWW',
        trading_symbol: symbol,
        quantity: qty,
        average_price: avgPrice,
        last_price: livePrice,
        invested_value: investedValue,
        market_value: revaluedMarketValue,
        p_l: revaluedPL,
        p_l_percentage: investedValue > 0 ? (revaluedPL / investedValue) * 100 : 0,
        day_change: dayChange,
        day_change_percentage: dayChangePct,
        updated_at: getISTTimestamp()
      };
    });

    // 6. Database Commit
    console.log(`[EXCEL-IMPORT] Purging current holdings for backfill...`);
    await supabase.from('holdings').delete().eq('user_id', portfolioId).eq('broker_name', 'GROWW');
    
    console.log(`[EXCEL-IMPORT] Inserting ${finalHoldings.length} holdings from snapshot...`);
    await supabase.from('holdings').upsert(finalHoldings);

    // Record snapshots
    const istTimestamp = getISTTimestamp();
    const logicalDay = istTimestamp.split('T')[0];
    
    // Calculate Yesterday for a cleaner graph (assuming the Excel Closing data is from yesterday)
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayDateStr = yesterday.toISOString().split('T')[0];
    const yesterdayTimestamp = `${yesterdayDateStr}T15:30:00+05:30`;

    console.log(`[EXCEL-IMPORT] Cleaning up history snapshots for yesterday and today...`);
    await supabase
      .from('portfolio_history')
      .delete()
      .eq('user_id', portfolioId)
      .gte('timestamp', `${yesterdayDateStr}T00:00:00+05:30`);

    const snapshots = [
      {
        user_id: portfolioId,
        timestamp: yesterdayTimestamp,
        total_investment: totalInvestment,
        total_market_value: totalExcelMkt,
        total_p_l: totalExcelMkt - totalInvestment,
        p_l_percentage: totalInvestment > 0 ? ((totalExcelMkt - totalInvestment) / totalInvestment) * 100 : 0,
        broker_name: 'GROWW'
      },
      {
        user_id: portfolioId,
        timestamp: istTimestamp,
        total_investment: totalInvestment,
        total_market_value: totalLiveMkt,
        total_p_l: totalLiveMkt - totalInvestment,
        p_l_percentage: totalInvestment > 0 ? ((totalLiveMkt - totalInvestment) / totalInvestment) * 100 : 0,
        broker_name: 'GROWW'
      }
    ];

    console.log(`[EXCEL-IMPORT] Backfilling dual history snapshots...`);
    await supabase.from('portfolio_history').insert(snapshots);

    return {
      count: finalHoldings.length,
      symbols: finalHoldings.map(h => h.trading_symbol)
    };
  }
}
