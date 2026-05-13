import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { getISTTimestamp } from '../server';
import crypto from 'crypto';

export class ExcelImportService {
  private static marketCache: { data: any, timestamp: number } | null = null;
  private static CACHE_DURATION = 60 * 1000;

  public static async importGrowwOrders(buffer: Buffer, pId: string, uId: string) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const headerRowIndex = rawData.findIndex(row =>
      Array.isArray(row) && row.includes('Stock Name') && row.includes('ISIN')
    );

    if (headerRowIndex === -1) {
      throw new Error("Invalid Format: Could not find 'Stock Name' or 'ISIN' headers. Please ensure you are uploading the official Groww Stocks Holdings Statement.");
    }

    const headers = rawData[headerRowIndex];
    const requiredColumns = ['Stock Name', 'ISIN', 'Quantity', 'Average buy price', 'Buy value'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));

    if (missingColumns.length > 0) {
      throw new Error(`Invalid File: The uploaded statement is missing required columns: ${missingColumns.join(', ')}. Please use the correct Groww Excel export.`);
    }

    const rows = rawData.slice(headerRowIndex + 1);
    if (rows.length === 0) {
      throw new Error("Invalid File: The statement contains no holding records.");
    }

    const holdingsData = rows.map(row => {
      const obj: any = {};
      headers.forEach((h: string, i: number) => {
        obj[h] = row[i];
      });
      return obj;
    }).filter(h => h['Stock Name'] && h.ISIN && h.Quantity > 0);

    const nowTime = Date.now();
    let marketMaster;

    if (this.marketCache && (nowTime - this.marketCache.timestamp < this.CACHE_DURATION)) {
      marketMaster = this.marketCache.data;
    } else {
      const { data } = await supabase.from('market_assets').select('symbol, isin, current_price, day_change, day_change_percentage');
      marketMaster = data;
      this.marketCache = { data, timestamp: nowTime };
    }
    
    const isinMap = new Map();
    const marketMap = new Map();
    (marketMaster || []).forEach((a: any) => {
      const cleanSymbol = a.symbol.trim().toUpperCase();
      if (a.isin) isinMap.set(a.isin, cleanSymbol);
      marketMap.set(cleanSymbol, a);
    });

    let totalInvestment = 0;
    let totalExcelMkt = 0;
    let totalLiveMkt = 0;

    const finalHoldings = holdingsData.map((data) => {
      const isin = data.ISIN;
      const symbol = isinMap.get(isin) || data['Stock Name'].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const ticker = symbol.toUpperCase();
      const asset = marketMap.get(ticker) || marketMap.get(`${ticker}.NS`);

      const qty = Number(data.Quantity) || 0;
      const avgPrice = Number(data['Average buy price']) || 0;
      const investedValue = Number(data['Buy value']) || 0;
      const closingPrice = Number(data['Closing price'] || avgPrice) || 0;

      const livePrice = asset ? Number(asset.current_price) : closingPrice;
      const revaluedMarketValue = qty * livePrice;
      
      totalInvestment += investedValue;
      totalExcelMkt += (qty * closingPrice);
      totalLiveMkt += revaluedMarketValue;

      const hash = crypto.createHash('md5').update(`${pId}-${symbol}`).digest('hex');
      const deterministicId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;

      return {
        id: deterministicId,
        user_id: uId,
        portfolio_id: pId,
        broker_name: 'GROWW',
        trading_symbol: symbol,
        quantity: qty,
        average_price: avgPrice,
        last_price: livePrice,
        invested_value: investedValue,
        market_value: revaluedMarketValue,
        p_l: revaluedMarketValue - investedValue,
        p_l_percentage: investedValue > 0 ? ((revaluedMarketValue - investedValue) / investedValue) * 100 : 0,
        day_change: asset ? (Number(asset.day_change) * qty) : 0,
        day_change_percentage: asset ? (Number(asset.day_change_percentage) || 0) : 0,
        updated_at: getISTTimestamp()
      };
    });

    await supabase.from('holdings').delete().eq('portfolio_id', pId);
    const chunkSize = 200;
    for (let i = 0; i < finalHoldings.length; i += chunkSize) {
      await supabase.from('holdings').upsert(finalHoldings.slice(i, i + chunkSize));
    }

    // AUTHENTIC SNAPSHOTS ONLY
    // AUTHENTIC SNAPSHOTS ONLY - Generate IST-aware timestamps
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    
    // Yesterday IST
    const istYesterday = new Date(istNow.getTime() - 24 * 60 * 60 * 1000);
    const yyyy = istYesterday.getUTCFullYear();
    const mm = String(istYesterday.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(istYesterday.getUTCDate()).padStart(2, '0');
    const tsYesterday = `${yyyy}-${mm}-${dd}T15:30:00+05:30`;
    
    const tsToday = getISTTimestamp();

    const snapshots = [
      {
        user_id: uId,
        portfolio_id: pId,
        timestamp: tsYesterday,
        total_investment: totalInvestment,
        total_market_value: totalExcelMkt,
        total_p_l: totalExcelMkt - totalInvestment,
        p_l_percentage: totalInvestment > 0 ? ((totalExcelMkt - totalInvestment) / totalInvestment) * 100 : 0,
        broker_name: 'GROWW'
      },
      {
        user_id: uId,
        portfolio_id: pId,
        timestamp: tsToday,
        total_investment: totalInvestment,
        total_market_value: totalLiveMkt,
        total_p_l: totalLiveMkt - totalInvestment,
        p_l_percentage: totalInvestment > 0 ? ((totalLiveMkt - totalInvestment) / totalInvestment) * 100 : 0,
        broker_name: 'GROWW'
      }
    ];

    // Append only - do not delete history!
    console.log(`[EXCEL-IMPORT] 📈 Generating historical snapshots:`, { tsYesterday, tsToday });
    
    // Safety check: Don't insert if exact timestamp exists for this portfolio
    const { data: existing } = await supabase.from('portfolio_history')
      .select('timestamp')
      .eq('portfolio_id', pId)
      .in('timestamp', [tsYesterday, tsToday]);

    const existingTs = new Set(existing?.map(e => e.timestamp) || []);
    const newSnapshots = snapshots.filter(s => !existingTs.has(s.timestamp));

    if (newSnapshots.length > 0) {
      const { error: historyError } = await supabase.from('portfolio_history').insert(newSnapshots);
      if (historyError) {
        console.error("[EXCEL-IMPORT] ❌ Failed to save history snapshots:", historyError.message);
      } else {
        console.log(`[EXCEL-IMPORT] ✅ Successfully saved ${newSnapshots.length} new historical snapshots for portfolio ${pId}.`);
      }
    } else {
      console.log(`[EXCEL-IMPORT] ℹ️ Snapshots for these timestamps already exist for portfolio ${pId}, skipping duplicates.`);
    }

    return { count: finalHoldings.length };
  }
}
