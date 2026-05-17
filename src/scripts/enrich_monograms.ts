import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { supabase } from '../services/DatabaseClient';

const OVERRIDES: Record<string, string> = {
  // Kotak
  'KOTAKBANK.NS': 'kotak.com',
  'KOTAKBANK.BO': 'kotak.com',
  
  // Axis
  'AXISBANK.NS': 'axisbank.com',
  'AXISBANK.BO': 'axisbank.com',

  // HDFC Bank
  'HDFCBANK.NS': 'hdfcbank.com',
  'HDFCBANK.BO': 'hdfcbank.com',
  
  // Tata Capital & Motors & Power & Consumer
  'TATACAP.NS': 'tatacapital.com',
  'TATACAP.BO': 'tatacapital.com',
  'TMPV.BO': 'tatamotors.com',
  'TMPV.NS': 'tatamotors.com',
  'TATAMOTORS.NS': 'tatamotors.com',
  'TATAMOTORS.BO': 'tatamotors.com',
  'TATASTEEL.NS': 'tatasteel.com',
  'TATASTEEL.BO': 'tatasteel.com',
  'TATAPOWER.NS': 'tatapower.com',
  'TATAPOWER.BO': 'tatapower.com',
  'TATACONSUM.NS': 'tataconsumer.com',
  'TATACONSUM.BO': 'tataconsumer.com',

  // RVNL
  'RVNL.NS': 'rvnl.org',
  'RVNL.BO': 'rvnl.org',

  // Adani Group
  'ADANIPOWER.NS': 'adani.com',
  'ADANIPOWER.BO': 'adani.com',
  'ADANIENT.NS': 'adani.com',
  'ADANIENT.BO': 'adani.com',
  'ADANIPORTS.NS': 'adani.com',
  'ADANIPORTS.BO': 'adani.com',
  'ADANIGREEN.NS': 'adani.com',
  'ADANIGREEN.BO': 'adani.com',
  'ATGL.NS': 'adani.com',
  'ATGL.BO': 'adani.com',
  'AWL.NS': 'adani.com',
  'AWL.BO': 'adani.com',

  // Mahindra
  'M&MFIN.NS': 'mahindra.com',
  'M&MFIN.BO': 'mahindra.com',
  'M&M.NS': 'mahindra.com',
  'M&M.BO': 'mahindra.com',
  'MAHEPC.NS': 'mahindra.com',
  'MAHEPC.BO': 'mahindra.com',

  // NMDC
  'NMDC.NS': 'nmdcindia.com',
  'NMDC.BO': 'nmdcindia.com',
  'NSLNISP.BO': 'nmdcindia.com',
  'NSLNISP.NS': 'nmdcindia.com',

  // Asia Capital
  'ASIACAP.BO': 'asiacapital.in',
  'ASIACAP.NS': 'asiacapital.in'
};

function extractDomain(url: string | null): string {
  if (!url) return '';
  try {
    const cleanUrl = url.trim().toLowerCase();
    const parsed = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`);
    let hostname = parsed.hostname.replace('www.', '');
    
    // Auto-clean broken .bank.in domains
    if (hostname.endsWith('.bank.in')) {
      const prefix = hostname.replace('.bank.in', '');
      if (prefix === 'kotak') return 'kotak.com';
      if (prefix === 'axis') return 'axisbank.com';
      return `${prefix}bank.com`;
    }

    const parts = hostname.split('.');
    if (parts.length > 2) {
      const lastTwo = parts.slice(-2).join('.');
      const isSecondLevelDomain = ['co.in', 'org.in', 'net.in', 'ac.in', 'gov.in', 'co.uk', 'co.jp', 'co.us'].includes(lastTwo);
      if (isSecondLevelDomain && parts.length >= 3) {
        return parts.slice(-3).join('.');
      }
      return lastTwo;
    }
    return hostname;
  } catch {
    return '';
  }
}

async function enrichMonograms() {
  console.log("🚀 Starting Automatic High-Fidelity Monogram Fallback Upgrade Engine...");

  // 1. Scan public folder for monogram fallbacks
  const inDir = path.join(process.cwd(), 'public', 'stock-icons', 'in');
  const usDir = path.join(process.cwd(), 'public', 'stock-icons', 'us');

  const inFiles = fs.readdirSync(inDir).filter(f => f.endsWith('.svg'));
  const usFiles = fs.readdirSync(usDir).filter(f => f.endsWith('.svg'));

  const monogramInFiles = new Set<string>();
  const monogramUsFiles = new Set<string>();

  for (const f of inFiles) {
    const content = fs.readFileSync(path.join(inDir, f), 'utf8');
    if (content.includes('<text')) {
      monogramInFiles.add(f);
    }
  }
  for (const f of usFiles) {
    const content = fs.readFileSync(path.join(usDir, f), 'utf8');
    if (content.includes('<text')) {
      monogramUsFiles.add(f);
    }
  }

  console.log(`Found ${monogramInFiles.size} Indian monograms and ${monogramUsFiles.size} US monograms on disk.`);

  // 2. Fetch all market assets from database sequentially with range pagination
  let inAssets: any[] = [];
  let from = 0;
  let to = 999;
  let hasMore = true;

  console.log("Fetching all Indian assets from DB with websites (paginated)...");
  while (hasMore) {
    const { data, error } = await supabase
      .from('market_assets')
      .select('symbol, website')
      .not('website', 'is', null)
      .range(from, to);

    if (error) {
      console.error("Error fetching paginated Indian assets:", error);
      return;
    }

    if (data && data.length > 0) {
      inAssets = inAssets.concat(data);
      from += 1000;
      to += 1000;
    } else {
      hasMore = false;
    }
  }

  let usAssets: any[] = [];
  from = 0;
  to = 999;
  hasMore = true;

  console.log("Fetching all US assets from DB with websites (paginated)...");
  while (hasMore) {
    const { data, error } = await supabase
      .from('us_market_assets')
      .select('symbol, website')
      .not('website', 'is', null)
      .range(from, to);

    if (error) {
      console.error("Error fetching paginated US assets:", error);
      return;
    }

    if (data && data.length > 0) {
      usAssets = usAssets.concat(data);
      from += 1000;
      to += 1000;
    } else {
      hasMore = false;
    }
  }

  const inAssetsToUpgrade = inAssets.filter(a => {
    const cleanSymbol = a.symbol.replace('.NS', '').replace('.BO', '').toLowerCase();
    return monogramInFiles.has(`${cleanSymbol}.svg`);
  });

  const usAssetsToUpgrade = usAssets.filter(a => {
    const cleanSymbol = a.symbol.toLowerCase();
    return monogramUsFiles.has(`${cleanSymbol}.svg`);
  });

  console.log(`Matching database assets: ${inAssetsToUpgrade.length} Indian, ${usAssetsToUpgrade.length} US.`);

  let upgradedCount = 0;

  async function processAsset(symbol: string, website: string, market: 'in' | 'us') {
    const upperSymbol = symbol.toUpperCase();
    const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '').toLowerCase();
    const savePath = path.join(process.cwd(), 'public', 'stock-icons', market, `${cleanSymbol}.svg`);

    let domain = '';
    if (OVERRIDES[upperSymbol]) {
      domain = OVERRIDES[upperSymbol];
    } else {
      domain = extractDomain(website);
    }

    if (!domain) return;

    try {
      let buffer: Buffer;
      let mimeType: string = 'image/png';

      // Attempt Google S2 first because standard S2 works best for typical corporate websites
      try {
        const primaryUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
        const response = await axios.get(primaryUrl, {
          responseType: 'arraybuffer',
          timeout: 6000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        buffer = Buffer.from(response.data);
        mimeType = (response.headers['content-type'] as string) || 'image/png';

        // Skip default/fallback/generic pixels
        if (buffer.length < 500) {
          throw new Error("S2 returned generic fallback icon.");
        }
      } catch (err) {
        // Attempt secondary cdn.tickerlogos.com
        const secondaryUrl = `https://cdn.tickerlogos.com/${domain}`;
        const response = await axios.get(secondaryUrl, {
          responseType: 'arraybuffer',
          timeout: 6000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        buffer = Buffer.from(response.data);
        mimeType = (response.headers['content-type'] as string) || 'image/png';
      }

      const base64 = buffer.toString('base64');

      // Create a gorgeous full-scale rounded SVG wrapper
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100%" height="100%">
  <clipPath id="logo-clip">
    <rect width="120" height="120" rx="26"/>
  </clipPath>
  <g clip-path="url(#logo-clip)">
    <image href="data:${mimeType};base64,${base64}" x="0" y="0" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>
  </g>
</svg>`;

      fs.writeFileSync(savePath, svgContent);
      console.log(`✅ UPGRADED: ${symbol} using domain "${domain}" (Size: ${buffer.length} bytes)`);
      upgradedCount++;
    } catch (e: any) {
      // Keep existing monogram on error
    }
  }

  console.log("Upgrading Indian monograms sequentially...");
  for (const a of inAssetsToUpgrade) {
    await processAsset(a.symbol, a.website, 'in');
    await new Promise(resolve => setTimeout(resolve, 75));
  }

  console.log("Upgrading US monograms sequentially...");
  for (const a of usAssetsToUpgrade) {
    await processAsset(a.symbol, a.website, 'us');
    await new Promise(resolve => setTimeout(resolve, 75));
  }

  // Update final mapping.json index
  console.log("Refreshing mapping.json index...");
  const mapping: Record<string, boolean> = {};
  
  const allInFiles = fs.readdirSync(inDir).filter(f => f.endsWith('.svg'));
  const allUsFiles = fs.readdirSync(usDir).filter(f => f.endsWith('.svg'));
  
  for (const f of allInFiles) {
    const clean = f.replace('.svg', '');
    mapping[clean] = true;
  }
  for (const f of allUsFiles) {
    const clean = f.replace('.svg', '');
    mapping[clean] = true;
  }
  
  const mappingPath = path.join(process.cwd(), 'public', 'stock-icons', 'mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));

  console.log(`\n🎉 SUCCESS! Automatically upgraded ${upgradedCount} monogram fallbacks to premium high-fidelity brand logos!`);
}

enrichMonograms().catch(console.error);
