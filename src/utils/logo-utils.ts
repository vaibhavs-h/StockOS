export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    let cleanUrl = url.trim().toLowerCase();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    const parsed = new URL(cleanUrl);
    return parsed.hostname.replace('www.', '');
  } catch (e) {
    return null;
  }
}

export const POPULAR_SYMBOL_DOMAINS: Record<string, string> = {
  // Indian Giants
  'RELIANCE.NS': 'relianceindustries.com',
  'TCS.NS': 'tcs.com',
  'HDFCBANK.NS': 'hdfcbank.com',
  'HDFCBANK.BO': 'hdfcbank.com',
  'INFY.NS': 'infosys.com',
  'ICICIBANK.NS': 'icicibank.com',
  'HINDUNILVR.NS': 'hul.co.in',
  'ITC.NS': 'itcportal.com',
  'SBIN.NS': 'sbi.co.in',
  'BHARTIARTL.NS': 'airtel.in',
  'LTIM.NS': 'ltimindtree.com',
  'LT.NS': 'larsentoubro.com',

  // Kotak
  'KOTAKBANK.NS': 'kotak.com',
  'KOTAKBANK.BO': 'kotak.com',
  
  // Axis
  'AXISBANK.NS': 'axisbank.com',
  'AXISBANK.BO': 'axisbank.com',

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
  'ASIACAP.NS': 'asiacapital.in',

  // US Giants
  'AAPL': 'apple.com',
  'MSFT': 'microsoft.com',
  'GOOGL': 'google.com',
  'GOOG': 'google.com',
  'AMZN': 'amazon.com',
  'META': 'meta.com',
  'TSLA': 'tesla.com',
  'NVDA': 'nvidia.com',
  'NFLX': 'netflix.com'
};

export function resolveLogoFromWebsite(website: string | null | undefined, symbol: string): string | null {
  const upperSymbol = symbol.toUpperCase();
  
  // 1. Static Dictionary match
  if (POPULAR_SYMBOL_DOMAINS[upperSymbol]) {
    return `https://logo.allinvestview.com/${POPULAR_SYMBOL_DOMAINS[upperSymbol]}`;
  }

  // 2. Extract domain from website
  const domain = extractDomain(website);
  if (domain) {
    return `https://logo.allinvestview.com/${domain}`;
  }

  return null;
}

export function getAssetColors(symbol: string): { bg: string; border: string; text: string; glow: string } {
  const cleanSymbol = symbol.replace('.NS', '').replace('.BO', '').toUpperCase();
  
  // Deterministic HSL generator based on symbol characters
  let hash = 0;
  for (let i = 0; i < cleanSymbol.length; i++) {
    hash = cleanSymbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash % 360);
  const saturation = 45 + Math.abs(hash % 20); // 45-65%
  const lightness = 12 + Math.abs(hash % 8);   // 12-20% (dark premium neon theme)

  return {
    bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    border: `hsla(${hue}, ${saturation}%, ${lightness + 12}%, 0.4)`,
    text: `hsl(${hue}, ${saturation + 20}%, 85%)`,
    glow: `hsla(${hue}, ${saturation + 10}%, 50%, 0.15)`
  };
}
