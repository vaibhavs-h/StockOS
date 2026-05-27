import { supabase } from '../lib/supabase';
import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';

export interface ParsedMFHolding {
  isin: string;
  schemeName: string;
  folio: string;
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  investedValue: number;
  marketValue: number;
  navDate?: string;
}

export class CASImportService {
  /**
   * Main Ingestion Workflow for CAS statement PDFs.
   * Decrypts, parses holdings, resolves symbols, updates master & active sync registry, 
   * upserts holdings, and creates session logs in Supabase.
   */
  public static async importCAS(pdfBuffer: Buffer, password: string, userId: string, portfolioName: string = 'Unified CAS Folio'): Promise<any> {
    const session = {
      user_id: userId,
      source: 'UNKNOWN',
      statement_period: 'Unknown Period',
      uploaded_file_url: null,
      parsing_status: 'PENDING',
      imported_funds_count: 0,
      error_message: null
    };

    let sessionRecord: any = null;
    let portfolioId: string | null = null;

    try {
      // 1. Initialise Session Audit Log
      const { data: sData, error: sError } = await supabase
        .from('portfolio_import_sessions')
        .insert([session])
        .select();

      if (sError) throw sError;
      sessionRecord = sData[0];

      // 2. Decrypt & Extract Text using pdf-parse
      let text = '';
      try {
        const parser = new PDFParse({ data: pdfBuffer, password: password });
        const pdfData = await parser.getText();
        text = pdfData.text;
      } catch (pdfErr: any) {
        const msg = pdfErr.message || '';
        if (msg.includes('password') || msg.includes('Incorrect') || msg.includes('failed to decrypt') || pdfErr.name === 'PasswordException' || pdfErr.message === 'Incorrect password') {
          throw new Error('DECRYPTION_FAILED: Invalid or incorrect password provided for PDF statement.');
        }
        throw new Error(`PDF Extraction Failure: ${pdfErr.message}`);
      }

      if (!text) {
        throw new Error('PDF Ingestion Failure: Extracted text is empty or corrupted.');
      }

      // 3. Detect Statement Source (CAMS vs KFintech)
      const lines = text.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);
      let source = 'CAMS';
      if (text.toLowerCase().includes('kfintech') || text.toLowerCase().includes('kfin technologies')) {
        source = 'KFINTECH';
      }

      // 4. Extract Statement Date Period (e.g. "As on 30-Apr-2026")
      let statementPeriod = 'As on ' + new Date().toISOString().split('T')[0];
      for (const line of lines) {
        const dateMatch = line.match(/(?:as on|period ending|date:?\s*)(\d{2}[-\/\s][a-zA-Z]{3,}[-\/\s]\d{4}|\d{2}[-\/\s]\d{2}[-\/\s]\d{4})/i);
        if (dateMatch) {
          statementPeriod = `As on ${dateMatch[1].trim()}`;
          break;
        }
      }

      // 5. Stateful Parse of Mutual Fund Holdings
      const parsedHoldings: ParsedMFHolding[] = [];

      // Regexes matching CAS schema
      const isinRowRegex = /([\d,]+\.\d{3,4})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,]+\.\d{2,4})\s+(CAMS|KFINTECH|KFIN|KARVY)\s+(INF[A-Z0-9]{9})\s+([\d,]+\.\d{2,3})?/i;
      const folioStartRegex = /^\s*([0-9\/]+)\s+([0-9,]+\.\d{2})/i;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Match ISIN row which holds the core figures
        const rowMatch = line.match(isinRowRegex);
        if (rowMatch) {
          const quantity = parseFloat(rowMatch[1].replace(/,/g, ''));
          const navDate = rowMatch[2];
          const nav = parseFloat(rowMatch[3].replace(/,/g, ''));
          const registrar = rowMatch[4];
          const isin = rowMatch[5];
          const investedValue = rowMatch[6] ? parseFloat(rowMatch[6].replace(/,/g, '')) : 0;

          // Backwards scan to find folio and scheme name
          let currentFolio = 'Unknown Folio';
          let marketValue = 0;
          let schemeNameParts: string[] = [];
          let folioLineIndex = -1;

          for (let j = i - 1; j >= 0; j--) {
            const prevLine = lines[j];
            const folioMatch = prevLine.match(folioStartRegex);
            if (folioMatch) {
              currentFolio = folioMatch[1].trim();
              marketValue = parseFloat(folioMatch[2].replace(/,/g, ''));

              const matchStr = folioMatch[0];
              const startIndex = prevLine.indexOf(matchStr) + matchStr.length;
              const remainingText = prevLine.slice(startIndex).trim();
              if (remainingText) {
                schemeNameParts.push(remainingText);
              }
              folioLineIndex = j;
              break;
            }
          }

          if (folioLineIndex !== -1) {
            // Collect intermediate lines for the scheme name
            for (let j = folioLineIndex + 1; j < i; j++) {
              schemeNameParts.push(lines[j]);
            }
          }

          const schemeName = schemeNameParts.join(' ').replace(/\s+/g, ' ').trim();

          if (quantity > 0) {
            const finalInvestedVal = investedValue > 0 ? investedValue : marketValue; // fallback to market if invested cost missing
            parsedHoldings.push({
              isin,
              schemeName: schemeName || 'Unknown Fund',
              folio: currentFolio,
              quantity,
              averagePrice: quantity > 0 ? (finalInvestedVal / quantity) : 0,
              lastPrice: nav,
              investedValue: finalInvestedVal,
              marketValue: marketValue > 0 ? marketValue : quantity * nav,
              navDate: navDate
            });
          }
        }
      }

      console.log(`[CAS-PARSER] Source: ${source} | Period: ${statementPeriod} | Holdings Parsed: ${parsedHoldings.length}`);

      if (parsedHoldings.length === 0) {
        throw new Error('NO_HOLDINGS_FOUND: The parser could not extract any mutual fund holdings with valid units/quantities.');
      }

      // Group and consolidate duplicate holdings (same folio + isin)
      const mergedHoldingsMap = new Map<string, ParsedMFHolding>();
      for (const h of parsedHoldings) {
        const key = `${h.folio.trim()}_${h.isin.trim().toUpperCase()}`;
        if (mergedHoldingsMap.has(key)) {
          const existing = mergedHoldingsMap.get(key)!;
          const newQty = existing.quantity + h.quantity;
          const newInvested = existing.investedValue + h.investedValue;
          const newMarket = existing.marketValue + h.marketValue;
          
          mergedHoldingsMap.set(key, {
            ...existing,
            quantity: newQty,
            investedValue: newInvested,
            marketValue: newMarket,
            averagePrice: newQty > 0 ? (newInvested / newQty) : 0,
            lastPrice: h.lastPrice || existing.lastPrice
          });
        } else {
          mergedHoldingsMap.set(key, h);
        }
      }

      const uniqueParsedHoldings = Array.from(mergedHoldingsMap.values());

      // 5.5 Register/Create a new portfolio in user_portfolios of type 'MF'
      const { data: portfolioData, error: portfolioError } = await supabase
        .from('user_portfolios')
        .insert({
          user_id: userId,
          name: portfolioName,
          broker_name: 'CAS',
          is_primary: false,
          type: 'MF'
        })
        .select()
        .single();

      if (portfolioError) throw portfolioError;
      portfolioId = portfolioData.id;

      // 6. DB Reconciliation and Symbol Mapping Heuristics
      // Resolve ISINs against existing mutual_funds_master
      const isinList = uniqueParsedHoldings.map(h => h.isin);
      const { data: dbMaster } = await supabase
        .from('mutual_funds_master')
        .select('scheme_code, isin, symbol, risk_level, logo_url, current_price, prev_close')
        .in('isin', isinList);

      const dbMap = new Map<string, any>();
      dbMaster?.forEach(d => dbMap.set(d.isin.trim().toUpperCase(), d));

      const finalHoldings = [];
      const newActiveSchemes = [];
      const nowTs = new Date().toISOString();

      // Extrapolate date format YYYY-MM-DD in Asia/Kolkata timezone
      const formatDateKolkata = (d: Date): string => {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(d);
      };

      let statementDateStr = formatDateKolkata(new Date());
      try {
        const cleanDate = statementPeriod.replace('As on', '').trim();
        const parsedDate = new Date(cleanDate);
        if (!isNaN(parsedDate.getTime())) {
          statementDateStr = formatDateKolkata(parsedDate);
        }
      } catch {}

      // High-fidelity fallback/override based on holdings-level NAV date:
      let parsedNavDateStr: string | null = null;
      for (const h of uniqueParsedHoldings) {
        if (h.navDate) {
          const d = new Date(h.navDate);
          if (!isNaN(d.getTime())) {
            parsedNavDateStr = formatDateKolkata(d);
            break;
          }
        }
      }
      if (parsedNavDateStr) {
        statementDateStr = parsedNavDateStr;
        console.log(`[CAS-PARSER] Overriding statement date with high-fidelity holdings-level NAV date: ${statementDateStr}`);
      }

      for (const parsed of uniqueParsedHoldings) {
        const cleanIsin = parsed.isin.trim().toUpperCase();
        let existingMaster = dbMap.get(cleanIsin);
        let schemeCode = existingMaster?.scheme_code;

        // Dynamic seeding if ISIN is not in database master yet
        if (!schemeCode) {
          // Generate a safe deterministic scheme code (prefixed with "SEED_" + hash)
          const hash = crypto.createHash('md5').update(cleanIsin).digest('hex').slice(0, 8);
          schemeCode = `SEED_${hash}`;

          const seedRecord = {
            scheme_code: schemeCode,
            isin: cleanIsin,
            symbol: null,
            name: parsed.schemeName,
            amc_name: parsed.schemeName.split(' ')[0] || 'Direct AMC',
            category: 'Equity', // Default baseline category
            sub_category: 'Flexi Cap', // Default baseline sub-category
            current_price: parsed.lastPrice,
            prev_close: parsed.lastPrice,
            day_change: 0.00,
            day_change_percentage: 0.00,
            returns_1y: 0.00,
            risk_level: 'Moderate',
            logo_url: null,
            created_at: nowTs,
            updated_at: nowTs
          };

          // Ingest new baseline fund master record
          const { error: seedErr } = await supabase
            .from('mutual_funds_master')
            .upsert([seedRecord], { onConflict: 'scheme_code' });

          if (seedErr) {
            console.error(`[CAS-PARSER] Seeding failed for ${cleanIsin}:`, seedErr.message);
          }
        }

        // Generate deterministic holding ID
        const holdingHash = crypto.createHash('md5').update(`${userId}-${portfolioId}-${parsed.folio}-${schemeCode}`).digest('hex');
        const deterministicId = `${holdingHash.slice(0, 8)}-${holdingHash.slice(8, 12)}-${holdingHash.slice(12, 16)}-${holdingHash.slice(16, 20)}-${holdingHash.slice(20)}`;

        const p_l = parsed.marketValue - parsed.investedValue;
        const p_l_percentage = parsed.investedValue > 0 ? (p_l / parsed.investedValue) * 100 : 0.00;

        const currentPrice = existingMaster ? (Number(existingMaster.current_price) || parsed.lastPrice) : parsed.lastPrice;
        const prevClose = existingMaster ? (Number(existingMaster.prev_close) || currentPrice) : currentPrice;
        const dayChange = (currentPrice - prevClose) * parsed.quantity;
        const dayChangePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0.00;

        finalHoldings.push({
          id: deterministicId,
          user_id: userId,
          portfolio_id: portfolioId,
          scheme_code: schemeCode,
          folio_number: parsed.folio,
          quantity: parsed.quantity,
          average_price: parsed.averagePrice,
          last_price: parsed.lastPrice,
          invested_value: parsed.investedValue,
          market_value: parsed.marketValue,
          p_l: p_l,
          p_l_percentage: p_l_percentage,
          day_change: dayChange,
          day_change_percentage: dayChangePct,
          last_statement_date: statementDateStr,
          updated_at: nowTs
        });

        newActiveSchemes.push(schemeCode);
      }

      // 7. Atomic Database Transaction: Clean old holdings & Insert fresh ones
      // Clean only holdings for the current portfolio_id
      await supabase
        .from('user_mutual_fund_holdings')
        .delete()
        .eq('user_id', userId)
        .eq('portfolio_id', portfolioId);

      const chunk = 100;
      for (let i = 0; i < finalHoldings.length; i += chunk) {
        const { error: upsertErr } = await supabase
          .from('user_mutual_fund_holdings')
          .upsert(finalHoldings.slice(i, i + chunk), { onConflict: 'user_id,folio_number,scheme_code' });

        if (upsertErr) throw upsertErr;
      }

      // 8. Register schemes in Active Sync Registry
      const { MFActiveRegistryService } = require('../scheduler/core/MFActiveRegistryService');
      await MFActiveRegistryService.persistActiveRegistry(newActiveSchemes);

      // 8.5. Calculate portfolio valuation totals and record history snapshots
      let totalInvestment = 0;
      let totalMarketValue = 0;
      for (const h of finalHoldings) {
        totalInvestment += Number(h.invested_value) || 0;
        totalMarketValue += Number(h.market_value) || 0;
      }
      const totalPnL = totalMarketValue - totalInvestment;
      const totalPnLPct = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0.00;

      const { getNormalizedNoonTimestamp } = require('../lib/date');
      const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      // Record baseline history snapshot for statement NAV date
      const statementTimestamp = getNormalizedNoonTimestamp(new Date(statementDateStr));
      const { error: statementHistErr } = await supabase
        .from('mutual_fund_portfolio_history')
        .upsert({
          user_id: userId,
          portfolio_id: portfolioId,
          timestamp: statementTimestamp,
          total_investment: totalInvestment,
          total_market_value: totalMarketValue,
          total_p_l: totalPnL,
          p_l_percentage: totalPnLPct
        }, { onConflict: 'user_id,portfolio_id,timestamp' });

      if (statementHistErr) {
        console.error(`[CAS-IMPORT] Failed to record statement history snapshot:`, statementHistErr.message);
      }

      // If statement is from the previous day (or older), seed today's placeholder snapshot as well
      if (statementDateStr < todayStr) {
        const todayTimestamp = getNormalizedNoonTimestamp(new Date());
        const { error: todayHistErr } = await supabase
          .from('mutual_fund_portfolio_history')
          .upsert({
            user_id: userId,
            portfolio_id: portfolioId,
            timestamp: todayTimestamp,
            total_investment: totalInvestment,
            total_market_value: totalMarketValue,
            total_p_l: totalPnL,
            p_l_percentage: totalPnLPct
          }, { onConflict: 'user_id,portfolio_id,timestamp' });

        if (todayHistErr) {
          console.error(`[CAS-IMPORT] Failed to record today's placeholder history snapshot:`, todayHistErr.message);
        }
      }

      // 9. Update Session audit log to COMPLETED
      if (sessionRecord) {
        await supabase
          .from('portfolio_import_sessions')
          .update({
            source,
            statement_period: statementPeriod,
            parsing_status: 'COMPLETED',
            imported_funds_count: finalHoldings.length
          })
          .eq('id', sessionRecord.id);
      }

      return {
        success: true,
        source,
        statementPeriod,
        count: finalHoldings.length
      };

    } catch (err: any) {
      console.error('[CAS-IMPORT] Import workflow crashed:', err.message || err);

      // Rollback created portfolio if it was registered but ingestion crashed afterward
      if (portfolioId) {
        console.log(`[CAS-IMPORT] Rolling back created portfolio ${portfolioId} to prevent orphans...`);
        try {
          await supabase
            .from('user_portfolios')
            .delete()
            .eq('id', portfolioId);
        } catch (dbErr: any) {
          console.error('[CAS-IMPORT] Failed to delete orphaned portfolio:', dbErr.message);
        }
      }

      // Update session log to FAILED
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
