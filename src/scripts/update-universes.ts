import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { MarketAsset, AssetType, MarketRegion } from '../scheduler/core/types';

const OUTPUT_PATH = path.resolve(process.cwd(), 'src/constants/generated/universes.json');
const NSE_LOCAL_PATH = path.resolve(process.cwd(), 'data/symbols/nse_symbols.csv');
const BSE_LOCAL_PATH = path.resolve(process.cwd(), 'data/symbols/bse_symbols.csv');

// Reusable normalization
const normalizeStorageSymbol = (symbol: string): string => {
  if (!symbol) return '';
  return symbol.toUpperCase().trim();
};

const extractWikipediaTable = (html: string, tableIndex: number = 0, symbolCol: number = 0, nameCol: number = 1): Array<{s: string, n: string}> => {
  const assets: Array<{s: string, n: string}> = [];
  const tables = html.match(/<table class="wikitable[^>]*>[\s\S]*?<\/table>/g);
  if (!tables || tables.length <= tableIndex) return assets;
  
  const rows = tables[tableIndex].match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
  if (!rows) return assets;

  for (let i = 1; i < rows.length; i++) { // Skip header
    const cols = rows[i].match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/g);
    if (cols && cols.length > Math.max(symbolCol, nameCol)) {
      const rawSymbol = cols[symbolCol].replace(/<[^>]*>/g, '').trim();
      const rawName = cols[nameCol].replace(/<[^>]*>/g, '').trim();
      if (rawSymbol && rawName) {
        assets.push({ s: rawSymbol, n: rawName });
      }
    }
  }
  return assets;
};

async function fetchUSUniverses() {
  const headers = { 'User-Agent': 'StockOS-Bot/1.0 (https://stockos.example.com; admin@example.com)' };
  
  console.log('[US] Fetching S&P 500...');
  const sp500Html = (await axios.get('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', { headers })).data;
  const sp500 = extractWikipediaTable(sp500Html, 0, 0, 1).map(a => ({ ...a, s: a.s.replace('.', '-') }));

  console.log('[US] Fetching NASDAQ-100...');
  const nasdaqHtml = (await axios.get('https://en.wikipedia.org/wiki/Nasdaq-100', { headers })).data;
  const nasdaq100 = extractWikipediaTable(nasdaqHtml, 4, 1, 0).map(a => ({ ...a, s: a.s.length > 5 ? a.n : a.s.replace('.', '-') }));

  console.log('[US] Fetching Dow Jones 30...');
  const dowHtml = (await axios.get('https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average', { headers })).data;
  const dow30 = extractWikipediaTable(dowHtml, 1, 1, 0).map(a => ({ ...a, s: a.s.replace('.', '-') }));

  const mergedMap = new Map<string, MarketAsset>();

  const processList = (list: any[], flags: { sp500?: boolean, nasdaq?: boolean, dow?: boolean }) => {
    list.forEach(item => {
      const norm = normalizeStorageSymbol(item.s);
      if (!norm) return;
      const existing = mergedMap.get(norm);
      if (existing) {
        if (flags.sp500) existing.isSP500 = true;
        if (flags.nasdaq) existing.isNASDAQ100 = true;
        if (flags.dow) existing.isDOW30 = true;
        existing.indexMemberships = existing.indexMemberships || [];
        if (flags.sp500) existing.indexMemberships.push('SP500');
        if (flags.nasdaq) existing.indexMemberships.push('NASDAQ100');
        if (flags.dow) existing.indexMemberships.push('DOW30');
        existing.indexMemberships = Array.from(new Set(existing.indexMemberships));
      } else {
        const memberships = [];
        if (flags.sp500) memberships.push('SP500');
        if (flags.nasdaq) memberships.push('NASDAQ100');
        if (flags.dow) memberships.push('DOW30');
        
        mergedMap.set(norm, {
          s: norm,
          n: item.n,
          assetType: AssetType.STOCK,
          region: MarketRegion.US,
          currency: 'USD',
          indexMemberships: memberships,
          isSP500: flags.sp500 || false,
          isNASDAQ100: flags.nasdaq || false,
          isDOW30: flags.dow || false
        });
      }
    });
  };

  processList(sp500, { sp500: true });
  processList(nasdaq100, { nasdaq: true });
  processList(dow30, { dow: true });

  return Array.from(mergedMap.values());
}

async function fetchIndianUniverses() {
  const headers = { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br'
  };

  console.log('[IN] Fetching NIFTY 50...');
  const niftyHtml = (await axios.get('https://en.wikipedia.org/wiki/NIFTY_50', { headers })).data;
  const nifty50 = extractWikipediaTable(niftyHtml, 1, 1, 0).map(a => ({ ...a, s: a.s.length > 15 ? a.n : a.s }));

  console.log('[IN] Fetching NIFTY Total Market (CSV)...');
  const nseCsv = (await axios.get('https://archives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv', { headers })).data;
  
  // Parse CSV
  const lines = nseCsv.split('\n');
  const totalMarket = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 3) {
      const name = cols[0].trim();
      const symbol = cols[2].trim();
      if (symbol && name && symbol !== 'Symbol') {
        totalMarket.push({ s: symbol, n: name });
      }
    }
  }

  const mergedMap = new Map<string, MarketAsset>();

  const processList = (list: any[], flags: { nifty50?: boolean, total?: boolean }, exchange: 'NSE' | 'BSE' = 'NSE') => {
    const suffix = exchange === 'NSE' ? '.NS' : '.BO';
    
    list.forEach(item => {
      let rawSymbol = item.s.toUpperCase().trim();
      // Remove any existing suffixes to prevent double suffixing
      rawSymbol = rawSymbol.replace('.NS', '').replace('.BO', '');
      
      const symbolWithSuffix = `${rawSymbol}${suffix}`;
      const storageKey = normalizeStorageSymbol(symbolWithSuffix);
      if (!storageKey) return;

      const existing = mergedMap.get(storageKey);


      if (existing) {
        if (flags.nifty50) existing.isNIFTY50 = true;
        if (flags.total) existing.isNIFTYTOTAL = true;
        existing.indexMemberships = existing.indexMemberships || [];
        if (flags.nifty50) existing.indexMemberships.push('NIFTY50');
        if (flags.total) existing.indexMemberships.push('NIFTY_TOTAL_MARKET');
        existing.indexMemberships = Array.from(new Set(existing.indexMemberships));
      } else {
        const memberships = [];
        if (flags.nifty50) memberships.push('NIFTY50');
        if (flags.total) memberships.push('NIFTY_TOTAL_MARKET');
        
        mergedMap.set(storageKey, {
          s: storageKey,
          n: item.n,
          assetType: AssetType.STOCK,
          region: MarketRegion.IN,
          currency: 'INR',
          exchange: exchange,
          indexMemberships: memberships,
          isNIFTY50: flags.nifty50 || false,
          isNIFTYTOTAL: flags.total || false
        });
      }
    });
  };

  // Process total market for BOTH NSE and BSE to ensure full coverage
  processList(totalMarket, { total: true }, 'NSE');
  processList(totalMarket, { total: true }, 'BSE');
  
  // Process Nifty 50 for BOTH to merge in flags
  processList(nifty50, { nifty50: true, total: true }, 'NSE');
  processList(nifty50, { nifty50: true, total: true }, 'BSE');

  // 3. SUPPLEMENT WITH LOCAL SYMBOL LISTS (FOR FULL 5000+ COVERAGE)
  
  // A. NSE Symbols (Local)
  if (fs.existsSync(NSE_LOCAL_PATH)) {
    console.log('[IN] Merging local NSE symbol list...');
    const nseLocalCsv = fs.readFileSync(NSE_LOCAL_PATH, 'utf-8');
    const nseLines = nseLocalCsv.split('\n');
    const localNseAssets = [];
    for (let i = 1; i < nseLines.length; i++) {
      const cols = nseLines[i].split(',');
      if (cols.length >= 2) {
        const symbol = cols[0].trim();
        const name = cols[1].trim();
        if (symbol && name && symbol !== 'SYMBOL') {
          localNseAssets.push({ s: symbol, n: name });
        }
      }
    }
    processList(localNseAssets, {}, 'NSE');
  }

  // B. BSE Symbols (Local UUID File)
  if (fs.existsSync(BSE_LOCAL_PATH)) {
    console.log('[IN] Merging local BSE symbol list...');
    const bseLocalCsv = fs.readFileSync(BSE_LOCAL_PATH, 'utf-8');
    const bseLines = bseLocalCsv.split('\n');
    const localBseAssets = [];
    for (let i = 1; i < bseLines.length; i++) {
      const cols = bseLines[i].split(',');
      if (cols.length >= 3) {
        const name = cols[1].trim();
        const symbol = cols[2].trim();
        if (symbol && name && symbol !== 'Security Id') {
          localBseAssets.push({ s: symbol, n: name });
        }
      }
    }
    processList(localBseAssets, {}, 'BSE');
  }

  return Array.from(mergedMap.values());
}

async function generateUniverses() {
  console.log('--- STARTING UNIVERSE GENERATION ---');
  
  const usEquities = await fetchUSUniverses();
  const indianEquities = await fetchIndianUniverses();
  
  const globalIndices: MarketAsset[] = [
    { s: '^NSEI', n: 'NIFTY 50', assetType: AssetType.INDEX, region: MarketRegion.IN, indexMemberships: [] },
    { s: '^BSESN', n: 'SENSEX', assetType: AssetType.INDEX, region: MarketRegion.IN, indexMemberships: [] },
    { s: '^NSEBANK', n: 'NIFTY BANK', assetType: AssetType.INDEX, region: MarketRegion.IN, indexMemberships: [] },
    { s: '^CNXIT', n: 'NIFTY IT', assetType: AssetType.INDEX, region: MarketRegion.IN, indexMemberships: [] },
    { s: '^DJI', n: 'DOW JONES', assetType: AssetType.INDEX, region: MarketRegion.US, indexMemberships: [] },
    { s: '^GSPC', n: 'S&P 500', assetType: AssetType.INDEX, region: MarketRegion.US, indexMemberships: [] },
    { s: '^IXIC', n: 'NASDAQ 100', assetType: AssetType.INDEX, region: MarketRegion.US, indexMemberships: [] },
    { s: '^RUT', n: 'Russell 2000', assetType: AssetType.INDEX, region: MarketRegion.US, indexMemberships: [] },
    { s: '^VIX', n: 'CBOE Volatility Index', assetType: AssetType.INDEX, region: MarketRegion.US, indexMemberships: [] }
  ];

  const payload = {
    us: usEquities,
    india: indianEquities,
    indices: globalIndices
  };

  // Validation Engine
  const validationReport = {
    uniqueUSEquities: usEquities.length,
    uniqueIndianEquities: indianEquities.length,
    globalIndices: globalIndices.length,
    duplicateCountRemoved: 0,
    invalidSymbols: [] as string[],
    missingMetadata: [] as string[],
    malformedTickers: [] as string[],
    universeBreakdown: {
      SP500: usEquities.filter(a => a.isSP500).length,
      NASDAQ100: usEquities.filter(a => a.isNASDAQ100).length,
      DOW30: usEquities.filter(a => a.isDOW30).length,
      NIFTY50: indianEquities.filter(a => a.isNIFTY50).length,
      NIFTYTOTAL: indianEquities.filter(a => a.isNIFTYTOTAL).length
    }
  };

  const allAssets = [...usEquities, ...indianEquities, ...globalIndices];
  const uniqueKeys = new Set<string>();

  const validatedUs = [];
  const validatedIndia = [];
  const validatedIndices = [];

  for (const asset of allAssets) {
    if (!asset.s || asset.s.trim() === '') {
      validationReport.invalidSymbols.push(asset.s || 'EMPTY');
      continue;
    }
    
    // Check missing metadata
    if (!asset.assetType || !asset.region) {
      validationReport.missingMetadata.push(asset.s);
    }

    // Check malformed tickers (e.g. random commas or spaces)
    if (asset.s.includes(',') || asset.s.includes(' ')) {
      validationReport.malformedTickers.push(asset.s);
      continue;
    }

    if (uniqueKeys.has(asset.s)) {
      validationReport.duplicateCountRemoved++;
    } else {
      uniqueKeys.add(asset.s);
      if (asset.region === MarketRegion.US && asset.assetType === AssetType.STOCK) validatedUs.push(asset);
      else if (asset.region === MarketRegion.IN && asset.assetType === AssetType.STOCK) validatedIndia.push(asset);
      else if (asset.assetType === AssetType.INDEX) validatedIndices.push(asset);
    }
  }

  const finalPayload = {
    us: validatedUs,
    india: validatedIndia,
    indices: validatedIndices
  };

  // Ensure directory exists
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalPayload, null, 2));

  console.log(`\n--- VALIDATION REPORT ---`);
  console.log(JSON.stringify(validationReport, null, 2));
  
  console.log(`\n--- UNIVERSE GENERATION COMPLETE ---`);
  console.log(`File saved to: ${OUTPUT_PATH}`);
}

generateUniverses().catch(console.error);
