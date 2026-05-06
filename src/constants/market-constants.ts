export const DOW_30 = [
  { s: 'AAPL', n: 'Apple Inc.' },
  { s: 'MSFT', n: 'Microsoft Corp.' },
  { s: 'CRM', n: 'Salesforce Inc.' },
  { s: 'AMZN', n: 'Amazon.com Inc.' },
  { s: 'NVDA', n: 'NVIDIA Corp.' },
  { s: 'META', n: 'Meta Platforms Inc.' },
  { s: 'BRK-B', n: 'Berkshire Hathaway Inc.' },
  { s: 'UNH', n: 'UnitedHealth Group' },
  { s: 'JNJ', n: 'Johnson & Johnson' },
  { s: 'JPM', n: 'JPMorgan Chase & Co.' },
  { s: 'V', n: 'Visa Inc.' },
  { s: 'PG', n: 'Procter & Gamble' },
  { s: 'HD', n: 'Home Depot Inc.' },
  { s: 'CVX', n: 'Chevron Corp.' },
  { s: 'KO', n: 'Coca-Cola Co.' },
  { s: 'MRK', n: 'Merck & Co.' },
  { s: 'PEP', n: 'PepsiCo Inc.' },
  { s: 'BAC', n: 'Bank of America' },
  { s: 'COST', n: 'Costco Wholesale' },
  { s: 'WMT', n: 'Walmart Inc.' },
  { s: 'ADBE', n: 'Adobe Inc.' },
  { s: 'CSCO', n: 'Cisco Systems' },
  { s: 'ACN', n: 'Accenture plc' },
  { s: 'TMO', n: 'Thermo Fisher' },
  { s: 'LIN', n: 'Linde plc' },
  { s: 'AVGO', n: 'Broadcom Inc.' },
  { s: 'DIS', n: 'Walt Disney Co.' },
  { s: 'INTC', n: 'Intel Corp.' },
  { s: 'BA', n: 'Boeing Co.' },
  { s: 'CAT', n: 'Caterpillar Inc.' },
  { s: 'IBM', n: 'IBM Corp.' },
  { s: 'MCD', n: 'McDonald\'s Corp.' },
  { s: 'MMM', n: '3M Company' },
  { s: 'NKE', n: 'Nike Inc.' },
  { s: 'TRV', n: 'Travelers Companies' },
  { s: 'VZ', n: 'Verizon Communications' },
  { s: 'HON', n: 'Honeywell International' },
  { s: 'AMGN', n: 'Amgen Inc.' },
  { s: 'GS', n: 'Goldman Sachs Group' },
  { s: 'AXP', n: 'American Express' }
];

export const INDIAN_ASSETS = [
  // Indices
  { s: '^NSEI', n: 'NIFTY 50', t: 'INDEX' },
  { s: '^BSESN', n: 'SENSEX', t: 'INDEX' },
  { s: '^NSEBANK', n: 'BANK NIFTY', t: 'INDEX' },
  { s: '^CNXIT', n: 'NIFTY IT', t: 'INDEX' },
  { s: '^CNXAUTO', n: 'NIFTY AUTO', t: 'INDEX' },
  { s: '^CNXMETAL', n: 'NIFTY METAL', t: 'INDEX' },
  { s: '^CNXPHARMA', n: 'NIFTY PHARMA', t: 'INDEX' },
  { s: '^CNXFMCG', n: 'NIFTY FMCG', t: 'INDEX' },
  { s: '^CNXREALTY', n: 'NIFTY REALTY', t: 'INDEX' },
  { s: '^CNXINFRA', n: 'NIFTY INFRA', t: 'INDEX' },
  { s: '^CNXENERGY', n: 'NIFTY ENERGY', t: 'INDEX' },

  // Nifty 50 Constituents
  { s: 'RELIANCE.NS', n: 'Reliance Industries', t: 'STOCK' },
  { s: 'TCS.NS', n: 'Tata Consultancy Services', t: 'STOCK' },
  { s: 'HDFCBANK.NS', n: 'HDFC Bank', t: 'STOCK' },
  { s: 'INFY.NS', n: 'Infosys', t: 'STOCK' },
  { s: 'ICICIBANK.NS', n: 'ICICI Bank', t: 'STOCK' },
  { s: 'HINDUNILVR.NS', n: 'Hindustan Unilever', t: 'STOCK' },
  { s: 'ITC.NS', n: 'ITC Limited', t: 'STOCK' },
  { s: 'SBIN.NS', n: 'State Bank of India', t: 'STOCK' },
  { s: 'BHARTIARTL.NS', n: 'Bharti Airtel', t: 'STOCK' },
  { s: 'KOTAKBANK.NS', n: 'Kotak Mahindra Bank', t: 'STOCK' },
  { s: 'LT.NS', n: 'Larsen & Toubro', t: 'STOCK' },
  { s: 'AXISBANK.NS', n: 'Axis Bank', t: 'STOCK' },
  { s: 'BAJFINANCE.NS', n: 'Bajaj Finance', t: 'STOCK' },
  { s: 'ASIANPAINT.NS', n: 'Asian Paints', t: 'STOCK' },
  { s: 'MARUTI.NS', n: 'Maruti Suzuki', t: 'STOCK' },
  { s: 'TITAN.NS', n: 'Titan Company', t: 'STOCK' },
  { s: 'ADANIENT.NS', n: 'Adani Enterprises', t: 'STOCK' },
  { s: 'SUNPHARMA.NS', n: 'Sun Pharmaceutical', t: 'STOCK' },
  { s: 'ULTRACEMCO.NS', n: 'UltraTech Cement', t: 'STOCK' },
  { s: 'WIPRO.NS', n: 'Wipro', t: 'STOCK' },
  { s: 'M&M.NS', n: 'Mahindra & Mahindra', t: 'STOCK' },
  { s: 'NTPC.NS', n: 'NTPC Limited', t: 'STOCK' },
  { s: 'POWERGRID.NS', n: 'Power Grid Corporation', t: 'STOCK' },
  { s: 'INDUSINDBK.NS', n: 'IndusInd Bank', t: 'STOCK' },
  { s: 'NESTLEIND.NS', n: 'Nestle India', t: 'STOCK' },
  { s: 'ADANIPORTS.NS', n: 'Adani Ports', t: 'STOCK' },
  { s: 'BAJAJ-AUTO.NS', n: 'Bajaj Auto', t: 'STOCK' },
  { s: 'TATASTEEL.NS', n: 'Tata Steel', t: 'STOCK' },
  { s: 'ONGC.NS', n: 'Oil & Natural Gas Corp', t: 'STOCK' },
  { s: 'JSWSTEEL.NS', n: 'JSW Steel', t: 'STOCK' },
  { s: 'TATAMOTORS.NS', n: 'Tata Motors', t: 'STOCK' },
  { s: 'GRASIM.NS', n: 'Grasim Industries', t: 'STOCK' },
  { s: 'TECHM.NS', n: 'Tech Mahindra', t: 'STOCK' },
  { s: 'HCLTECH.NS', n: 'HCL Technologies', t: 'STOCK' },
  { s: 'HDFCLIFE.NS', n: 'HDFC Life', t: 'STOCK' },
  { s: 'SBILIFE.NS', n: 'SBI Life Insurance', t: 'STOCK' },
  { s: 'BRITANNIA.NS', n: 'Britannia Industries', t: 'STOCK' },
  { s: 'EICHERMOT.NS', n: 'Eicher Motors', t: 'STOCK' },
  { s: 'COALINDIA.NS', n: 'Coal India', t: 'STOCK' },
  { s: 'CIPLA.NS', n: 'Cipla', t: 'STOCK' },
  { s: 'DIVISLAB.NS', n: 'Divi\'s Laboratories', t: 'STOCK' },
  { s: 'APOLLOHOSP.NS', n: 'Apollo Hospitals', t: 'STOCK' },
  { s: 'HEROMOTOCO.NS', n: 'Hero MotoCorp', t: 'STOCK' },
  { s: 'DRREDDY.NS', n: 'Dr. Reddy\'s Laboratories', t: 'STOCK' },
  { s: 'BPCL.NS', n: 'Bharat Petroleum', t: 'STOCK' },
  { s: 'LTIM.NS', n: 'LTIMindtree', t: 'STOCK' }
];

export const getAssetRoute = (symbol: string) => {
  const s = symbol.toUpperCase().replace('.NS', '').replace('^', '');
  const isUs = DOW_30.some(d => d.s === s);
  return isUs ? `/us-stocks/${s}` : `/stocks/${s}`;
};

export const getMarketStatus = (market: 'IN' | 'US') => {
  const now = new Date();
  
  if (market === 'IN') {
    const day = now.getDay();
    if (day === 0 || day === 6) return 'CLOSED';
    
    // IST is UTC+5:30.
    const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    // 9:15 AM (555) to 3:30 PM (930)
    if (totalMinutes >= 555 && totalMinutes <= 930) return 'OPEN';
    return 'CLOSED';
  } else {
    // US Market (EST) - Simplified for brevity in constants
    const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = estTime.getDay();
    if (day === 0 || day === 6) return 'CLOSED';
    
    const hours = estTime.getHours();
    const minutes = estTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    // 4:00 AM (240) - 9:30 AM (570) : PRE
    // 9:30 AM (570) - 4:00 PM (960) : OPEN
    // 4:00 PM (960) - 8:00 PM (1200) : AFTER
    
    if (totalMinutes >= 570 && totalMinutes < 960) return 'OPEN';
    if (totalMinutes >= 240 && totalMinutes < 570) return 'PRE';
    if (totalMinutes >= 960 && totalMinutes <= 1200) return 'AFTER';
    return 'CLOSED';
  }
};
