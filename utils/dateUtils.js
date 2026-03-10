/**
 * Get current date in PST (YYYY-MM-DD)
 */
export const getPSTDate = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
};

/**
 * Get yesterday's date in PST (YYYY-MM-DD)
 */
export const getPSTYesterday = () => {
  const today = getPSTDate();
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/**
 * Return true if dateStr is today or yesterday in PST (for cash drop submit validation).
 * Used when no admin settings are available (fallback).
 */
export const isAllowedCashDropDate = (dateStr) => {
  if (!dateStr) return false;
  const today = getPSTDate();
  const yesterday = getPSTYesterday();
  return dateStr === today || dateStr === yesterday;
};

/**
 * Check if a date is allowed for cash drop given admin settings.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} today - YYYY-MM-DD (PST today)
 * @param {string} dateRange - 'last_2_days' | 'all_previous'
 * @param {boolean} onlyBeforeBankDrop - if true, date is disallowed when bank drop is already done for that day
 * @param {boolean} isBankDropDone - whether bank drop has been done for that date
 */
export const isAllowedCashDropDateWithSettings = (dateStr, today, dateRange, onlyBeforeBankDrop, isBankDropDone) => {
  if (!dateStr || !today) return false;
  if (dateStr > today) return false; // no future dates
  if (dateRange === 'last_2_days') {
    const yesterday = getPSTYesterday();
    if (dateStr !== today && dateStr !== yesterday) return false;
  }
  // dateRange === 'all_previous' allows any date <= today
  if (onlyBeforeBankDrop && isBankDropDone) return false;
  return true;
};

/**
 * Get current date and time in PST timezone
 * Returns datetime string in YYYY-MM-DD HH:mm:ss format
 * Handles DST automatically (PST/PDT)
 */
export const getPSTDateTime = () => {
  const now = new Date();
  
  // Use Intl.DateTimeFormat to get PST datetime components (handles DST automatically)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  const second = parts.find(p => p.type === 'second').value;
  
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};
