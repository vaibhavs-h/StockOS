/**
 * Date and timezone helper utilities for StockOS.
 */

export const getISTTimestamp = () => {
  const now = new Date();
  const offset = 5.5 * 60 * 60 * 1000; // IST is UTC + 5:30
  const istTime = new Date(now.getTime() + offset);
  return istTime.toISOString().replace('Z', '+05:30');
};

export const getNormalizedNoonTimestamp = (dateInput?: Date) => {
  const date = dateInput || new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const dateStr = formatter.format(date); // YYYY-MM-DD
  return `${dateStr}T12:00:00.000Z`; // Noon UTC on that calendar day
};
