import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { getISTTimestamp, getNormalizedNoonTimestamp } from '../server';
import crypto from 'crypto';

export class ExcelImportService {
  private static marketCache: { data: any, timestamp: number } | null = null;
  private static CACHE_DURATION = 60 * 1000;

  public static async importGrowwOrders(buffer: Buffer, pId: string, uId: string) {
    const session = {
      user_id: uId,
      source: 'GROWW',
      statement_period: 'Pending Extraction',
      uploaded_file_url: null,
      parsing_status: 'PENDING',
      imported_funds_count: 0,
      error_message: null
    };

    let sessionRecord: any = null;

    try {
      // 1. Initialise Session Audit Log
      const { data: sData, error: sError } = await supabase
        .from('portfolio_import_sessions')
        .insert([session])
        .select();

      if (!sError && sData && sData.length > 0) {
        sessionRecord = sData[0];
      }

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      // 1. DATE EXTRACTION: Find the "As on" date from the header rows (usually line 4)
      let statementDateStr = "";
      for (let i = 0; i < 10; i++) {
        const rowStr = JSON.stringify(rawData[i] || "");
        const dateMatch = rowStr.match(/as on (\d{2}-\d{2}-\d{4})/i);
        if (dateMatch) {
          statementDateStr = dateMatch[1];
          break;
        }
      }

      // Default to yesterday if no date found
      let statementDateTs: string;
      if (statementDateStr) {
        const [dd, mm, yyyy] = statementDateStr.split('-');
        statementDateTs = `${yyyy}-${mm}-${dd}T12:00:00.000Z`;
      } else {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istYesterday = new Date(now.getTime() + istOffset - 24 * 60 * 60 * 1000);
        statementDateTs = getNormalizedNoonTimestamp(istYesterday);
      }

      const headerRowIndex = rawData.findIndex(row =>
        Array.isArray(row) && row.includes('Stock Name') && row.includes('ISIN')
      );

      if (headerRowIndex === -1) {
        throw new Error("Invalid Format: Could not find 'Stock Name' or 'ISIN' headers.");
      }

      const headers = rawData[headerRowIndex];
      const rows = rawData.slice(headerRowIndex + 1);
      
      const holdingsData = rows.map(row => {
        const obj: any = {};
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i];
        });
        return obj;
      }).filter(h => h['Stock Name'] && h.ISIN && h.Quantity > 0);

      let allMarketAssets: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('market_assets')
          .select('symbol, name, isin, current_price, day_change, day_change_percentage')
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        allMarketAssets = allMarketAssets.concat(data);
        from += 1000;
      }

      const isinMap = new Map();
      const nameMap = new Map();
      const marketMap = new Map();
      allMarketAssets.forEach((a: any) => {
        const cleanSymbol = a.symbol.trim().toUpperCase();
        if (a.isin) isinMap.set(a.isin.trim().toUpperCase(), cleanSymbol);
        
        if (a.name) {
          const cleanName = a.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          if (cleanSymbol.endsWith('.NS') || !nameMap.has(cleanName)) {
            nameMap.set(cleanName, cleanSymbol);
          }
        }
        marketMap.set(cleanSymbol, a);
      });


      let totalInvestment = 0;
      let totalExcelMkt = 0;
      let totalLiveMkt = 0;

      const finalHoldings = holdingsData.map((data) => {
        const isin = data.ISIN;
        const cleanExcelName = data['Stock Name'].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        
        // Dynamic resolution: Match by ISIN first, then fallback to Alphanumeric Name matching
        let matchedSymbol = isinMap.get(isin?.trim().toUpperCase()) || nameMap.get(cleanExcelName);
        
        let symbol: string;
        if (matchedSymbol) {
          if (!matchedSymbol.includes('.')) {
            symbol = `${matchedSymbol}.NS`;
          } else {
            symbol = matchedSymbol;
          }
        } else {
          // Fallback: Cleaned name + .NS
          let rawSymbol = cleanExcelName;
          if (rawSymbol.includes('.')) rawSymbol = rawSymbol.split('.')[0];
          symbol = `${rawSymbol}.NS`;
        }
        
        const asset = marketMap.get(symbol);

        const qty = Number(data.Quantity) || 0;
        const avgPrice = Number(data['Average buy price']) || 0;
        const investedValue = Number(data['Buy value']) || (qty * avgPrice);
        const closingPrice = Number(data['Closing price'] || avgPrice) || 0;

        // BRIDGING LOGIC: If the statement is old, use market_assets day_change to calculate "Today"
        const livePrice = asset ? Number(asset.current_price) : closingPrice;
        const revaluedMarketValue = qty * livePrice;
        
        const unitDayChange = (asset && asset.day_change !== undefined) ? Number(asset.day_change) : (livePrice - closingPrice);
        
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
          day_change: unitDayChange * qty,
          day_change_percentage: asset ? (Number(asset.day_change_percentage) || 0) : ((unitDayChange / (livePrice - unitDayChange)) * 100),
          updated_at: getISTTimestamp()
        };
      });

      await supabase.from('holdings').delete().eq('portfolio_id', pId);
      const chunkSize = 200;
      for (let i = 0; i < finalHoldings.length; i += chunkSize) {
        await supabase.from('holdings').upsert(finalHoldings.slice(i, i + chunkSize));
      }

      const normalizedTodayTs = getNormalizedNoonTimestamp();

      const snapshots = [
        {
          user_id: uId,
          portfolio_id: pId,
          timestamp: statementDateTs,
          total_investment: totalInvestment,
          total_market_value: totalExcelMkt,
          total_p_l: totalExcelMkt - totalInvestment,
          p_l_percentage: totalInvestment > 0 ? ((totalExcelMkt - totalInvestment) / totalInvestment) * 100 : 0,
          broker_name: 'GROWW'
        },
        {
          user_id: uId,
          portfolio_id: pId,
          timestamp: normalizedTodayTs,
          total_investment: totalInvestment,
          total_market_value: totalLiveMkt,
          total_p_l: totalLiveMkt - totalInvestment,
          p_l_percentage: totalInvestment > 0 ? ((totalLiveMkt - totalInvestment) / totalInvestment) * 100 : 0,
          broker_name: 'GROWW'
        }
      ];

      await supabase.from('portfolio_history').upsert(snapshots, { onConflict: 'portfolio_id,timestamp' });

      // Update session log to COMPLETED
      if (sessionRecord) {
        await supabase
          .from('portfolio_import_sessions')
          .update({
            statement_period: statementDateStr ? `As on ${statementDateStr}` : 'As on Today',
            parsing_status: 'COMPLETED',
            imported_funds_count: finalHoldings.length
          })
          .eq('id', sessionRecord.id);
      }

      return { count: finalHoldings.length };
    } catch (err: any) {
      console.error('[GROWW-IMPORT] Ingestion workflow crashed:', err.message || err);

      if (sessionRecord) {
        await supabase
          .from('portfolio_import_sessions')
          .update({
            parsing_status: 'FAILED',
            error_message: err.message || 'Unknown parsing exception'
          })
          .eq('id', sessionRecord.id);
      }
      throw err;
    }
  }

  public static async importZerodhaCSV(buffer: Buffer, pId: string, uId: string) {
    const session = {
      user_id: uId,
      source: 'ZERODHA',
      statement_period: 'As on Today',
      uploaded_file_url: null,
      parsing_status: 'PENDING',
      imported_funds_count: 0,
      error_message: null
    };

    let sessionRecord: any = null;

    try {
      // 1. Initialise Session Audit Log
      const { data: sData, error: sError } = await supabase
        .from('portfolio_import_sessions')
        .insert([session])
        .select();

      if (!sError && sData && sData.length > 0) {
        sessionRecord = sData[0];
      }

      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const headers = rawData[0];
      const requiredColumns = ['Instrument', 'Qty.', 'Avg. cost', 'Invested', 'LTP', 'Day chg.'];
      const missingColumns = requiredColumns.filter(col => !headers.includes(col));

      if (missingColumns.length > 0) {
        throw new Error(`Invalid File: Missing columns: ${missingColumns.join(', ')}`);
      }

      const rows = rawData.slice(1);
      const holdingsData = rows.map(row => {
        const obj: any = {};
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i];
        });
        return obj;
      }).filter(h => h['Instrument'] && Number(h['Qty.']) > 0);

      let allMarketAssets: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('market_assets')
          .select('symbol, current_price, prev_close, day_change, day_change_percentage')
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        allMarketAssets = allMarketAssets.concat(data);
        from += 1000;
      }

      const marketMap = new Map();
      allMarketAssets.forEach((a: any) => {
        marketMap.set(a.symbol.trim().toUpperCase(), a);
      });


      let totalInvestment = 0;
      let totalYesterdayMkt = 0;
      let totalCurrentMkt = 0;

      const finalHoldings = holdingsData.map((data) => {
        const rawSymbol = data['Instrument'].trim().toUpperCase();
        const ltp = Number(data['LTP']) || 0;
        const dayChgPct = Number(data['Day chg.']) || 0;

        // PREV CLOSE FINGERPRINTING: The most accurate way to detect exchange
        // Zerodha calculates Day Chg based on the Prev Close of the specific exchange
        const impliedPrevClose = dayChgPct !== 0 ? ltp / (1 + (dayChgPct / 100)) : ltp;
        
        const nsAsset = marketMap.get(`${rawSymbol}.NS`);
        const boAsset = marketMap.get(`${rawSymbol}.BO`);

        // Default to NSE
        let symbol = `${rawSymbol}.NS`;
        let asset = nsAsset;

        if (nsAsset && boAsset) {

          const nsLtpMatch = Math.abs(Number(nsAsset.current_price) - ltp) < 0.01;
          const boLtpMatch = Math.abs(Number(boAsset.current_price) - ltp) < 0.01;

          if (boLtpMatch && !nsLtpMatch) {
            symbol = `${rawSymbol}.BO`;
            asset = boAsset;
          } else if (nsLtpMatch && !boLtpMatch) {
            symbol = `${rawSymbol}.NS`;
            asset = nsAsset;
          } else {
            // If both match or neither matches exactly, use the Prev Close Fingerprint
            const nsDiff = Math.abs(Number(nsAsset.prev_close) - impliedPrevClose);
            const boDiff = Math.abs(Number(boAsset.prev_close) - impliedPrevClose);
            
            if (boDiff < nsDiff) {
              symbol = `${rawSymbol}.BO`;
              asset = boAsset;
            }
          }
        }



        const qty = Number(data['Qty.']) || 0;
        const avgPrice = Number(data['Avg. cost']) || 0;
        const investedValue = Number(data['Invested']) || (qty * avgPrice);
        
        const yesterdayHoldingValue = qty * impliedPrevClose;

        const currentPrice = (asset && asset.current_price) ? Number(asset.current_price) : ltp;
        const marketValue = qty * currentPrice;
        
        totalInvestment += investedValue;
        totalYesterdayMkt += yesterdayHoldingValue;
        totalCurrentMkt += marketValue;

        const hash = crypto.createHash('md5').update(`${pId}-${symbol}`).digest('hex');
        const deterministicId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;

        const currentDayChg = (currentPrice - impliedPrevClose) * qty;
        const currentDayChgPct = impliedPrevClose > 0 ? ((currentPrice - impliedPrevClose) / impliedPrevClose) * 100 : 0;


        return {
          id: deterministicId,
          user_id: uId,
          portfolio_id: pId,
          broker_name: 'ZERODHA',
          trading_symbol: symbol,

          quantity: qty,
          average_price: avgPrice,
          last_price: currentPrice,
          invested_value: investedValue,
          market_value: marketValue,
          p_l: marketValue - investedValue,
          p_l_percentage: investedValue > 0 ? ((marketValue - investedValue) / investedValue) * 100 : 0,
          day_change: currentDayChg,
          day_change_percentage: currentDayChgPct,
          updated_at: new Date().toISOString()
        };
      });

      await supabase.from('holdings').delete().eq('portfolio_id', pId);
      const chunkSize = 200;
      for (let i = 0; i < finalHoldings.length; i += chunkSize) {
        await supabase.from('holdings').upsert(finalHoldings.slice(i, i + chunkSize));
      }

      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffset);
      const istYesterday = new Date(istNow.getTime() - 24 * 60 * 60 * 1000);
      
      const tsYesterday = getNormalizedNoonTimestamp(istYesterday);
      const tsToday = getNormalizedNoonTimestamp(istNow);


      const snapshots = [
        {
          user_id: uId,
          portfolio_id: pId,
          timestamp: tsYesterday,
          total_investment: totalInvestment,
          total_market_value: totalYesterdayMkt,
          total_p_l: totalYesterdayMkt - totalInvestment,
          p_l_percentage: totalInvestment > 0 ? ((totalYesterdayMkt - totalInvestment) / totalInvestment) * 100 : 0,
          broker_name: 'ZERODHA'
        },
        {
          user_id: uId,
          portfolio_id: pId,
          timestamp: tsToday,
          total_investment: totalInvestment,
          total_market_value: totalCurrentMkt,
          total_p_l: totalCurrentMkt - totalInvestment,
          p_l_percentage: totalInvestment > 0 ? ((totalCurrentMkt - totalInvestment) / totalInvestment) * 100 : 0,
          broker_name: 'ZERODHA'
        }
      ];

      await supabase.from('portfolio_history').upsert(snapshots, { onConflict: 'portfolio_id,timestamp' });

      // Update session log to COMPLETED
      if (sessionRecord) {
        const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        await supabase
          .from('portfolio_import_sessions')
          .update({
            statement_period: `As on ${todayStr}`,
            parsing_status: 'COMPLETED',
            imported_funds_count: finalHoldings.length
          })
          .eq('id', sessionRecord.id);
      }

      return { count: finalHoldings.length };
    } catch (err: any) {
      console.error('[ZERODHA-IMPORT] Ingestion workflow crashed:', err.message || err);

      if (sessionRecord) {
        await supabase
          .from('portfolio_import_sessions')
          .update({
            parsing_status: 'FAILED',
            error_message: err.message || 'Unknown parsing exception'
          })
          .eq('id', sessionRecord.id);
      }
      throw err;
    }
  }
}
