/**
 * Utility to handle dates in Jakarta/Indonesia (WIB) format in the backend
 */

export const parseLocalDate = (dateStr: string, isEnd: boolean = false): Date => {
  if (!dateStr || dateStr.trim() === '') {
     // Default to TODAY in Jakarta
     const jakartaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
     const d = new Date(`${jakartaToday}T00:00:00+07:00`);
     if (isEnd) d.setHours(23, 59, 59, 999);
     return d;
  }
  
  // If it's already a full ISO string with timezone, just parse it
  if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+'))) {
    return new Date(dateStr);
  }

  // Otherwise, assume it's YYYY-MM-DD from Jakarta frontend
  const time = isEnd ? '23:59:59+07:00' : '00:00:00+07:00';
  return new Date(`${dateStr}T${time}`);
};

/**
 * Returns current Jakarta date as YYYY-MM-DD
 */
export const getJakartaDateString = (date: Date = new Date()): string => {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
};

/**
 * Returns current Jakarta date for reference numbers (YYYYMMDD)
 */
export const getJakartaDateRef = (date: Date = new Date()): string => {
  return getJakartaDateString(date).replace(/-/g, '');
};

/**
 * Returns current Jakarta time formatted (HH:mm:ss)
 */
export const getJakartaTimeString = (date: Date = new Date()): string => {
  return date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta' });
};
/**
 * Returns day name in Indonesian for Jakarta time (e.g., 'Senin', 'Selasa')
 */
export const getJakartaDayName = (date: Date = new Date()): string => {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(date);
};
