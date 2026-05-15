import { MarketAsset } from '../scheduler/core/types';
import universesData from './generated/universes.json';

/**
 * Standardizes symbols globally for canonical STORAGE and DB MATCHING.
 * Keeps structural suffixes (.NS, ^, =X, -USD) completely intact.
 */
export const normalizeStorageSymbol = (symbol: string): string => {
  if (!symbol) return '';
  return symbol.toUpperCase().trim();
};

/**
 * Standardizes symbols specifically for UI display (aesthetic mapping).
 * Strips .NS, ^, etc., so RELIANCE.NS displays as RELIANCE.
 */
export const normalizeDisplaySymbol = (symbol: string): string => {
  if (!symbol) return '';
  let display = symbol.toUpperCase().trim();
  display = display.replace('.NS', ''); // Remove Indian Exchange suffix
  display = display.replace('.BO', ''); // Remove BSE Exchange suffix
  display = display.replace('^', '');   // Remove Yahoo Index prefix
  display = display.replace('=X', '');  // Remove Yahoo Forex suffix
  display = display.replace('-USD', '');// Remove Crypto suffix
  return display;
};

/**
 * Standardizes symbols for URL routing.
 * Removes symbols that break URLs like ^, but keeps them unique.
 */
export const normalizeRouteSymbol = (symbol: string): string => {
  if (!symbol) return '';
  return symbol.toUpperCase().replace('^', '').trim();
};

export class SymbolUniverseManager {
  private static cachedUsEquities: ReadonlyArray<MarketAsset> | null = null;
  private static cachedIndianEquities: ReadonlyArray<MarketAsset> | null = null;
  private static cachedIndices: ReadonlyArray<MarketAsset> | null = null;

  private static loadUniverses() {
    return (universesData as any) || { us: [], india: [], indices: [] };
  }

  static getUniqueUsEquities(): ReadonlyArray<MarketAsset> {
    if (this.cachedUsEquities) return this.cachedUsEquities;

    const data = this.loadUniverses();
    const map = new Map<string, MarketAsset>();
    
    (data.us || []).forEach((asset: MarketAsset) => {
      const norm = normalizeStorageSymbol(asset.s);
      const existing = map.get(norm);
      if (existing) {
        existing.isSP500 = existing.isSP500 || asset.isSP500;
        existing.isNASDAQ100 = existing.isNASDAQ100 || asset.isNASDAQ100;
        existing.isDOW30 = existing.isDOW30 || asset.isDOW30;
        if (asset.indexMemberships) {
           existing.indexMemberships = Array.from(new Set([...(existing.indexMemberships || []), ...asset.indexMemberships]));
        }
      } else {
        map.set(norm, { ...asset });
      }
    });

    this.cachedUsEquities = Object.freeze(Array.from(map.values()).map(a => Object.freeze(a)));
    return this.cachedUsEquities || [];
  }

  static getUniqueIndianEquities(): ReadonlyArray<MarketAsset> {
    if (this.cachedIndianEquities) return this.cachedIndianEquities;

    const data = this.loadUniverses();
    const map = new Map<string, MarketAsset>();
    
    (data.india || []).forEach((asset: MarketAsset) => {
      const norm = normalizeStorageSymbol(asset.s);
      const existing = map.get(norm);
      if (existing) {
        existing.isNIFTY50 = existing.isNIFTY50 || asset.isNIFTY50;
        existing.isNIFTYTOTAL = existing.isNIFTYTOTAL || asset.isNIFTYTOTAL;
        if (asset.indexMemberships) {
           existing.indexMemberships = Array.from(new Set([...(existing.indexMemberships || []), ...asset.indexMemberships]));
        }
      } else {
        map.set(norm, { ...asset });
      }
    });

    this.cachedIndianEquities = Object.freeze(Array.from(map.values()).map(a => Object.freeze(a)));
    return this.cachedIndianEquities || [];
  }

  static getGlobalIndices(): ReadonlyArray<MarketAsset> {
    if (this.cachedIndices) return this.cachedIndices;
    const data = this.loadUniverses();
    this.cachedIndices = Object.freeze((data.indices || []).map((a: MarketAsset) => Object.freeze(a)));
    return this.cachedIndices || [];
  }

  // --- O(1) Memory-Optimized Helper Methods ---

  static getAssetsByIndex(indexName: string): ReadonlyArray<MarketAsset> {
    const us = this.getUniqueUsEquities().filter(a => a.indexMemberships?.includes(indexName));
    const ind = this.getUniqueIndianEquities().filter(a => a.indexMemberships?.includes(indexName));
    return Object.freeze([...us, ...ind]);
  }

  static getSP500Assets(): ReadonlyArray<MarketAsset> {
    return Object.freeze(this.getUniqueUsEquities().filter(a => a.isSP500));
  }

  static getNiftyTotalAssets(): ReadonlyArray<MarketAsset> {
    return Object.freeze(this.getUniqueIndianEquities().filter(a => a.isNIFTYTOTAL));
  }

  static resolveSymbol(s: string, region: 'IN' | 'US'): string {
    let upper = s.toUpperCase().trim();
    if (region === 'US') return upper;
    if (upper.includes('.') || upper.startsWith('^')) return upper;

    // 0. Manual Portfolio Overrides (High-Fidelity Mappings)
    const overrides: Record<string, string> = {
      'DELTACORPLIMITED': 'DELTACORP.NS',
      'RAJESHEXPORTSLTD': 'RAJESHEXPO.NS',
      'PRINCEPIPESFITTINGSLTD': 'PRINCEPIPE.NS',
      'KWALITYWALLSINDIAL': 'KWIL.NS',
      'UTKARSHSMALLFINBANKL': 'UTKARSHBNK.NS',
      'AXISBANK': 'AXISBANK.NS',
      'HDFCLIFE': 'HDFCLIFE.NS',
      'WIPRO': 'WIPRO.NS'
    };
    if (overrides[upper]) return overrides[upper];

    const inAssets = this.getUniqueIndianEquities();
    
    // 1. Direct Universe Match (Standard)
    const match = inAssets.find((a: any) => a.s.startsWith(upper) || upper.startsWith(a.s.split('.')[0]));
    if (match) return match.s;

    // 2. Suffix Stripping for Indian Broker Tickers (e.g. DELTACORPLIMITED -> DELTACORP)
    const suffixes = ['LIMITED', 'LTD', 'INDIA', ' PLC', ' CORP', ' INC']; // Added space for CORP to be safe
    let stripped = upper;
    for (const suffix of suffixes) {
      if (stripped.endsWith(suffix) && stripped.length > suffix.length) {
        stripped = stripped.substring(0, stripped.length - suffix.length);
      }
    }

    // 3. Re-check Universe with stripped version
    const strippedMatch = inAssets.find((a: any) => a.s.startsWith(stripped) || stripped.startsWith(a.s.split('.')[0]));
    if (strippedMatch) return strippedMatch.s;

    // 4. Default fallback: .NS on stripped version
    return `${stripped}.NS`;
  }
}

export const getAssetRoute = (symbol: string) => {
  const storageNorm = normalizeStorageSymbol(symbol);
  const routeNorm = normalizeRouteSymbol(storageNorm);
  
  const isUs = SymbolUniverseManager.getUniqueUsEquities().some(d => normalizeStorageSymbol(d.s) === storageNorm);
  const indexAsset = SymbolUniverseManager.getGlobalIndices().find(d => normalizeStorageSymbol(d.s) === storageNorm);
  
  if (indexAsset) {
    return indexAsset.region === 'US' ? `/us-stocks/${routeNorm}` : `/stocks/${routeNorm}`;
  }

  return isUs ? `/us-stocks/${routeNorm}` : `/stocks/${routeNorm}`;
};

export const getMarketStatus = (market: 'IN' | 'US') => {
  const now = new Date();
  
  if (market === 'IN') {
    const day = now.getDay();
    if (day === 0 || day === 6) return 'CLOSED';
    
    const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    if (totalMinutes >= 555 && totalMinutes <= 930) return 'OPEN';
    return 'CLOSED';
  } else {
    const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = estTime.getDay();
    if (day === 0 || day === 6) return 'CLOSED';
    
    const hours = estTime.getHours();
    const minutes = estTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    
    if (totalMinutes >= 570 && totalMinutes < 960) return 'OPEN';
    if (totalMinutes >= 240 && totalMinutes < 570) return 'PRE';
    if (totalMinutes >= 960 && totalMinutes <= 1200) return 'AFTER';
    return 'CLOSED';
  }
};
