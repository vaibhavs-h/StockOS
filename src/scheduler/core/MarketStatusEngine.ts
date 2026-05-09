import { MarketRegion, MarketSession } from './types';

export class MarketStatusEngine {
  
  /**
   * Returns the current session for a given region.
   * Handles weekends and exact minute bounds.
   * Uses DST-aware IANA timezone translations.
   */
  static getCurrentSession(region: MarketRegion): MarketSession {
    const now = new Date();
    
    // YYYY-MM-DD formatter for holiday checks
    const getFormattedDate = (date: Date) => {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    };

    if (region === MarketRegion.IN) {
      // IST is UTC+5:30. No DST.
      const istTimeString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const istTime = new Date(istTimeString);
      const todayStr = getFormattedDate(istTime);
      
      const day = istTime.getDay();
      if (day === 0 || day === 6) return MarketSession.CLOSED; // Weekend
      
      // Known Indian Market Holidays (2026/2027 placeholders)
      const indianHolidays = ['2026-01-26', '2026-08-15', '2026-10-02', '2026-11-08']; // Example: Republic Day, Independence Day, Gandhi Jayanti, Diwali
      if (indianHolidays.includes(todayStr)) return MarketSession.CLOSED;
      
      const hours = istTime.getHours();
      const minutes = istTime.getMinutes();
      const totalMinutes = hours * 60 + minutes;
      
      // Premarket: 9:00 AM (540) to 9:15 AM (555)
      // Regular: 9:15 AM (555) to 3:30 PM (930)
      if (totalMinutes >= 540 && totalMinutes < 555) return MarketSession.PREMARKET;
      if (totalMinutes >= 555 && totalMinutes < 930) return MarketSession.REGULAR;
      
      return MarketSession.CLOSED;
    } 
    
    if (region === MarketRegion.US) {
      // US Eastern Time (EST/EDT) automatically handled by IANA timezone
      const estTimeString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
      const estTime = new Date(estTimeString);
      const todayStr = getFormattedDate(estTime);
      
      const day = estTime.getDay();
      if (day === 0 || day === 6) return MarketSession.CLOSED;
      
      // Known US Market Holidays
      const usHolidays = ['2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'];
      if (usHolidays.includes(todayStr)) return MarketSession.CLOSED;
      
      const isEarlyClose = ['2026-11-27', '2026-12-24'].includes(todayStr); // Day after Thanksgiving, Christmas Eve

      const hours = estTime.getHours();
      const minutes = estTime.getMinutes();
      const totalMinutes = hours * 60 + minutes;
      
      // Premarket: 4:00 AM (240) - 9:30 AM (570)
      // Regular: 9:30 AM (570) - 4:00 PM (960) [Or 1:00 PM (780) on early close]
      // After-Hours: 4:00 PM (960) - 8:00 PM (1200)
      
      const regularClose = isEarlyClose ? 780 : 960;
      
      if (totalMinutes >= 240 && totalMinutes < 570) return MarketSession.PREMARKET;
      if (totalMinutes >= 570 && totalMinutes < regularClose) return MarketSession.REGULAR;
      if (totalMinutes >= regularClose && totalMinutes <= 1200) return MarketSession.AFTER_HOURS;
      
      return MarketSession.CLOSED;
    }
    
    // For future expansion: CRYPTO region operates 24/7
    // if (region === MarketRegion.CRYPTO) return MarketSession.REGULAR;
    
    return MarketSession.CLOSED;
  }

  static isMarketOpen(region: MarketRegion): boolean {
    return this.getCurrentSession(region) === MarketSession.REGULAR;
  }

  static isPremarket(region: MarketRegion): boolean {
    return this.getCurrentSession(region) === MarketSession.PREMARKET;
  }

  static isAfterHours(region: MarketRegion): boolean {
    return this.getCurrentSession(region) === MarketSession.AFTER_HOURS;
  }

  static isClosed(region: MarketRegion): boolean {
    return this.getCurrentSession(region) === MarketSession.CLOSED;
  }
}
