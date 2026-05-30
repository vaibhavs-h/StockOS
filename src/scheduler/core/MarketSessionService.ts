/**
 * MarketSessionService: Detects active trading windows for IN/US markets.
 * Used by SyncCoordinator for adaptive cadence and survival mode.
 */
export class MarketSessionService {

  /**
   * Checks if the Indian Market (NSE/BSE) is currently open.
   * Trading Hours: 9:15 AM - 3:30 PM IST (Mon-Fri)
   */
  public static isIndianMarketOpen(): boolean {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);

    const day = istTime.getUTCDay();
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Weekends check
    if (day === 0 || day === 6) return false;

    // 9:15 AM (555 mins) to 3:35 PM (935 mins) - Extended by 5m to process final EOD revals cleanly
    return totalMinutes >= 555 && totalMinutes <= 935;
  }

  /**
   * Checks if the US Market (NYSE/NASDAQ) is currently open.
   * Trading Hours: 9:30 AM - 4:00 PM EST (Mon-Fri)
   */
  public static isUsMarketOpen(): boolean {
    const now = new Date();
    // Simplified EST check (not accounting for DST jitter here, but close enough for pacing)
    const estOffset = -5 * 60 * 60 * 1000;
    const estTime = new Date(now.getTime() + estOffset);

    const day = estTime.getUTCDay();
    const hours = estTime.getUTCHours();
    const minutes = estTime.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    if (day === 0 || day === 6) return false;

    // 9:30 AM (570 mins) to 4:00 PM (960 mins)
    return totalMinutes >= 570 && totalMinutes <= 960;
  }

  public static getSessionStatus(region: 'IN' | 'US'): 'OPEN' | 'CLOSED' {
    const isOpen = region === 'IN' ? this.isIndianMarketOpen() : this.isUsMarketOpen();
    return isOpen ? 'OPEN' : 'CLOSED';
  }
}
